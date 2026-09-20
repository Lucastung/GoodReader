import { getKeypoints, logUsage, saveKeypoints, type Article } from "./db";
import { chatJson, type LlmConfig, type LlmUsage } from "./llm";
import { mockGrade, mockKeypoints } from "./mock";
import { gradingPrompt, keypointsPrompt, quizPrompt } from "./prompts";
import { getQuiz, mockQuiz, saveQuiz, shuffleQuiz } from "./quiz";
import { computeScores, type ScoreItem } from "./rubric";
import { KeypointsSchema, LlmGradeSchema, QuizSchema, type Grade, type Keypoints, type OutlineNode, type Quiz } from "./schemas";
import { copyLevel, copyRatio as computeCopyRatio, countOutlineItems, outlineToText, type CopyLevel } from "./textcheck";

export function llmConfig(env: CloudflareEnv): LlmConfig {
  return {
    baseUrl: env.LLM_BASE_URL || "https://api.deepinfra.com/v1/openai",
    apiKey: env.DEEPINFRA_API_KEY,
    mock: env.LLM_MOCK === "1",
  };
}

/** 取得（或第一次產生並快取）文章的要點底稿；force = 後台要求重算 */
export async function ensureKeypoints(env: CloudflareEnv, article: Article, force = false): Promise<Keypoints> {
  const cached = force ? null : await getKeypoints(env.DB, article.id);
  if (cached) return cached;
  const cfg = llmConfig(env);
  let kp: Keypoints;
  let model = env.KEYPOINT_MODEL;
  if (cfg.mock) {
    kp = mockKeypoints(article.paragraphs);
    model = "mock";
  } else {
    const r = await chatJson(cfg, env.KEYPOINT_MODEL, keypointsPrompt(article), KeypointsSchema, {
      maxTokens: 3000,
    });
    kp = r.data;
    await logUsage(env.DB, { kind: "keypoints", model, articleId: article.id, ...r.usage });
  }
  await saveKeypoints(env.DB, article.id, model, kp);
  return kp;
}

/**
 * 取得（或第一次產生並快取）文章的閱讀測驗題目；force = 後台要求重新出題。
 * 非 force 時用「沒有才寫入」，兩個學生同時開同一篇也只會留下一份題目。
 */
export async function ensureQuiz(env: CloudflareEnv, article: Article, force = false): Promise<Quiz> {
  if (!force) {
    const cached = await getQuiz(env.DB, article.id);
    if (cached) return cached.quiz;
  }
  const cfg = llmConfig(env);
  let quiz: Quiz;
  let model = env.KEYPOINT_MODEL;
  if (cfg.mock) {
    quiz = mockQuiz(article);
    model = "mock";
  } else {
    const r = await chatJson(cfg, env.KEYPOINT_MODEL, quizPrompt(article), QuizSchema, { maxTokens: 3000, temperature: 0.3 });
    quiz = shuffleQuiz(r.data);
    await logUsage(env.DB, { kind: "quiz", model, articleId: article.id, ...r.usage });
  }
  if (force) {
    await saveQuiz(env.DB, article.id, model, quiz);
    return quiz;
  }
  await env.DB
    .prepare("INSERT INTO article_quizzes (article_id, model, data_json) VALUES (?, ?, ?) ON CONFLICT(article_id) DO NOTHING")
    .bind(article.id, model, JSON.stringify(quiz))
    .run();
  return (await getQuiz(env.DB, article.id))?.quiz ?? quiz;
}

export type GradeResult = {
  total: number;
  items: ScoreItem[];
  /** 內部用（存資料庫、給模型參考）；回給學生前會拿掉 */
  copyRatio: number;
  copyLevel: CopyLevel;
  keyPoints: Keypoints["keyPoints"];
  keyPointsHit: string[];
  keyPointsMissed: { id: string; text?: string; paragraph?: string | null; hint: string }[];
  errors: { quote: string; issue: string; paragraph?: string | null }[];
  strengths: string[];
  nextStep: string;
  reference: { centralIdea: string; structure: string; vernacular?: string | null; outline: OutlineNode[] };
  model: string;
  rubricVersion: string;
  usage: LlmUsage;
};

export async function gradeAttempt(
  env: CloudflareEnv,
  article: Article,
  grade: Grade,
  outline: OutlineNode[],
  summary: string,
): Promise<GradeResult> {
  const kp = await ensureKeypoints(env, article);
  const fullText = article.paragraphs.map((p) => p.text).join("");
  const copyRatio = computeCopyRatio(summary, fullText);
  const cfg = llmConfig(env);

  let llm;
  let usage: LlmUsage = { tokensIn: 0, tokensOut: 0, latencyMs: 0 };
  let model = env.GRADER_MODEL;
  if (cfg.mock) {
    llm = mockGrade(kp, countOutlineItems(outline));
    model = "mock";
  } else {
    const prompt = gradingPrompt(article, kp, grade, {
      outlineText: outlineToText(outline),
      summary,
      copyRatio,
    });
    const r = await chatJson(cfg, env.GRADER_MODEL, prompt, LlmGradeSchema, { maxTokens: 2500 });
    llm = r.data;
    usage = r.usage;
  }

  const { items, total } = computeScores(llm, grade, { copyRatio });
  const kpText = new Map(kp.keyPoints.map((k) => [k.id, k.text]));
  return {
    total,
    items,
    copyRatio,
    copyLevel: copyLevel(copyRatio),
    keyPoints: kp.keyPoints,
    keyPointsHit: llm.keyPointsHit,
    // 「漏掉的要點」只給提示，要點原文在前端點「看參考答案」才顯示
    keyPointsMissed: llm.keyPointsMissed.map((m) => ({ ...m, text: kpText.get(m.id) })),
    errors: llm.errors,
    strengths: llm.strengths,
    nextStep: llm.nextStep,
    reference: {
      centralIdea: kp.centralIdea,
      structure: kp.structure,
      vernacular: kp.vernacular,
      outline: kp.referenceOutline,
    },
    model,
    rubricVersion: env.RUBRIC_VERSION,
    usage,
  };
}
