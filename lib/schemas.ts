import { z } from "zod";

export const GRADES = ["junior", "senior"] as const;
export type Grade = (typeof GRADES)[number];

/** 練習模式：基礎＝閱讀測驗（預設國中）；進階＝大綱＋摘要（預設高中） */
export const MODES = ["basic", "advanced"] as const;
export type Mode = (typeof MODES)[number];

export const GENRES = ["文言文", "散文", "記敘文", "議論文", "說明文"] as const;

export const LEVELS = ["優", "良", "尚可", "待加強"] as const;
export type Level = (typeof LEVELS)[number];

export const CRITERIA = [
  "outline_coverage",
  "outline_structure",
  "summary_gist",
  "summary_fidelity",
  "summary_concision",
] as const;
export type Criterion = (typeof CRITERIA)[number];

/** 大綱節點：最多 3 層 */
export type OutlineNode = { text: string; children?: OutlineNode[] };
export const OutlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    text: z.string().trim().min(1).max(200),
    children: z.array(OutlineNodeSchema).max(20).optional(),
  }),
);
export const OutlineSchema = z.array(OutlineNodeSchema).min(1).max(30);

export type Paragraph = { id: string; text: string };

// ---- API 輸入 ----
export const StartSessionInput = z.object({
  grade: z.enum(GRADES),
  mode: z.enum(MODES).default("advanced"),
  genre: z.enum(GENRES).optional(),
  series: z.string().trim().max(30).optional(),
  articleId: z.string().max(64).optional(),
});

export const SubmitAttemptInput = z.object({
  outline: OutlineSchema,
  summary: z.string().trim().max(1200),
});

/** 閱讀測驗交卷：每題選的選項索引 */
export const SubmitQuizInput = z.object({
  answers: z.array(z.number().int().min(0).max(3)).length(5),
});

// ---- 閱讀測驗題目（LLM 輸出，也是後台編輯的格式） ----
export const QUIZ_SIZE = 5;
export const QUIZ_POINTS_EACH = 5;
export const QUIZ_SKILLS = ["擷取訊息", "推論分析", "詮釋整合", "比較評估"] as const;

export const QuizQuestionSchema = z
  .object({
    q: z.string().trim().min(4, "題幹太短").max(300),
    options: z.array(z.string().trim().min(1, "選項不可空白").max(120)).length(4, "要有 4 個選項"),
    answer: z.number().int().min(0).max(3),
    explanation: z.string().trim().min(1, "請寫解析").max(400),
    paragraph: z.string().max(10).nullable().optional(),
    skill: z.enum(QUIZ_SKILLS).nullable().optional().catch(null),
  })
  .refine((x) => new Set(x.options).size === 4, { message: "4 個選項不可重複" });
export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

export const QuizSchema = z.object({ questions: z.array(QuizQuestionSchema).length(QUIZ_SIZE, `要剛好 ${QUIZ_SIZE} 題`) });
export type Quiz = z.infer<typeof QuizSchema>;

// ---- LLM 輸出：要點底稿 ----
export const KeypointsSchema = z.object({
  centralIdea: z.string().min(1),
  structure: z.string().min(1),
  vernacular: z.string().optional().nullable(),
  keyPoints: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        importance: z.enum(["核心", "次要"]),
        paragraphs: z.array(z.string()).default([]),
      }),
    )
    .min(2)
    .max(12),
  referenceOutline: OutlineSchema,
});
export type Keypoints = z.infer<typeof KeypointsSchema>;

// ---- LLM 輸出：評分 ----
export const LlmGradeSchema = z.object({
  scores: z
    .array(
      z.object({
        criterion: z.enum(CRITERIA),
        level: z.enum(LEVELS),
        reason: z.string(),
      }),
    )
    .length(5),
  keyPointsHit: z.array(z.string()).default([]),
  keyPointsMissed: z
    .array(z.object({ id: z.string(), paragraph: z.string().optional().nullable(), hint: z.string() }))
    .default([]),
  errors: z
    .array(z.object({ quote: z.string(), issue: z.string(), paragraph: z.string().optional().nullable() }))
    .default([]),
  strengths: z.array(z.string()).default([]),
  nextStep: z.string(),
});
export type LlmGrade = z.infer<typeof LlmGradeSchema>;

// ---- LLM 輸出：AI 範文 ----
export const GeneratedArticleSchema = z.object({
  title: z.string().trim().min(1).max(60),
  paragraphs: z.array(z.string().trim().min(1)).min(2).max(12),
  centralIdea: z.string().optional().nullable(),
});

// ---- 後台：文章編輯 ----
export const ARTICLE_STATUSES = ["draft", "approved", "archived"] as const;
export const ARTICLE_ORIGINS = ["classic", "ai", "import", "manual"] as const;
export const LICENSES = ["public-domain", "cc-by", "cc-by-sa", "ai-generated", "authorized", "original"] as const;

export const ArticleInput = z.object({
  title: z.string().trim().min(1, "請填標題").max(60),
  author: z.string().trim().min(1, "請填作者").max(40),
  era: z.string().trim().max(20).nullable().optional(),
  genre: z.enum(GENRES),
  /** 主題系列，例如「釣魚」；讀者可以挑系列來讀 */
  series: z.string().trim().max(30).nullable().optional(),
  difficulty: z.number().int().min(1).max(5),
  paragraphs: z.array(z.string().trim().min(1)).min(1, "至少一段").max(40),
  url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  license: z.enum(LICENSES),
  notes: z.string().max(2000).nullable().optional(),
});
export type ArticleInputT = z.infer<typeof ArticleInput>;
