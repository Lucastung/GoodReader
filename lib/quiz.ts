// 基礎模式：閱讀測驗（每篇 5 題四選一，一題 5 分；題目每篇出一次並快取）
import type { Article } from "./db.ts";
import { QUIZ_POINTS_EACH, QuizSchema, type Quiz, type QuizQuestion } from "./schemas.ts";

/** 給學生作答用：拿掉答案與解析 */
export type PublicQuestion = Pick<QuizQuestion, "q" | "options">;
export const publicQuestions = (quiz: Quiz): PublicQuestion[] => quiz.questions.map(({ q, options }) => ({ q, options }));

/** 交卷後的每題結果 */
export type QuizItemResult = QuizQuestion & { chosen: number; correct: boolean };
export type QuizResult = { items: QuizItemResult[]; correct: number; score: number; max: number };

export function scoreQuiz(quiz: Quiz, answers: number[]): QuizResult {
  const items = quiz.questions.map((q, i) => ({ ...q, chosen: answers[i], correct: answers[i] === q.answer }));
  const correct = items.filter((x) => x.correct).length;
  return { items, correct, score: correct * QUIZ_POINTS_EACH, max: quiz.questions.length * QUIZ_POINTS_EACH };
}

/**
 * 打亂每題選項順序，避免模型習慣把答案放在同一個位置。
 * rand 可注入（測試用）；會盡量讓 5 題的答案位置不要全部一樣。
 */
export function shuffleQuiz(quiz: Quiz, rand: () => number = Math.random): Quiz {
  const questions = quiz.questions.map((q) => {
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, options: order.map((k) => q.options[k]), answer: order.indexOf(q.answer) };
  });
  return { questions };
}

/** LLM_MOCK=1 時的假題目 */
export function mockQuiz(article: Pick<Article, "paragraphs" | "title">): Quiz {
  const ps = article.paragraphs;
  return QuizSchema.parse({
    questions: Array.from({ length: 5 }, (_, i) => {
      const p = ps[Math.min(i, ps.length - 1)];
      return {
        q: `（模擬）第 ${i + 1} 題：根據 ${p?.id ?? "原文"}，下列敘述何者正確？`,
        options: ["（模擬）選項甲", "（模擬）選項乙", "（模擬）選項丙", "（模擬）選項丁"],
        answer: i % 4,
        explanation: `（模擬）解析：回去看 ${p?.id ?? "原文"}。`,
        paragraph: p?.id ?? null,
        skill: i === 4 ? "詮釋整合" : "擷取訊息",
      };
    }),
  });
}

// ---------- 資料庫 ----------

export async function getQuiz(db: D1Database, articleId: string) {
  const r = await db
    .prepare("SELECT model, data_json, edited_by, created_at, updated_at FROM article_quizzes WHERE article_id = ?")
    .bind(articleId)
    .first<{ model: string; data_json: string; edited_by: string | null; created_at: string; updated_at: string }>();
  if (!r) return null;
  return { model: r.model, editedBy: r.edited_by, createdAt: r.created_at, updatedAt: r.updated_at, quiz: JSON.parse(r.data_json) as Quiz };
}

export async function saveQuiz(db: D1Database, articleId: string, model: string, quiz: Quiz, editedBy: string | null = null) {
  await db
    .prepare(
      `INSERT INTO article_quizzes (article_id, model, data_json, edited_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(article_id) DO UPDATE SET model = excluded.model, data_json = excluded.data_json,
         edited_by = excluded.edited_by, updated_at = datetime('now')`,
    )
    .bind(articleId, model, JSON.stringify(quiz), editedBy)
    .run();
}

export type QuizAttemptRow = {
  id: string;
  session_id: string;
  questions_json: string;
  answers_json: string;
  correct: number;
  score: number;
  read_seconds: number | null;
  submitted_at: string;
};

export async function quizAttemptBySession(db: D1Database, sessionId: string) {
  return db.prepare("SELECT * FROM quiz_attempts WHERE session_id = ?").bind(sessionId).first<QuizAttemptRow>();
}

export async function quizAttemptFor(db: D1Database, clientId: string, articleId: string) {
  return db
    .prepare("SELECT * FROM quiz_attempts WHERE client_id = ? AND article_id = ?")
    .bind(clientId, articleId)
    .first<QuizAttemptRow>();
}

/** 已作答過的文章 id（隨機抽題時排除） */
export async function quizDoneArticleIds(db: D1Database, clientId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT article_id FROM quiz_attempts WHERE client_id = ?")
    .bind(clientId)
    .all<{ article_id: string }>();
  return results.map((r) => r.article_id);
}

/** 存作答；同一篇已作答過（UNIQUE 衝突）回傳 false */
export async function saveQuizAttempt(
  db: D1Database,
  a: { id: string; sessionId: string; clientId: string; articleId: string; quiz: Quiz; answers: number[]; result: QuizResult; readSeconds: number },
): Promise<boolean> {
  const r = await db
    .prepare(
      `INSERT INTO quiz_attempts (id, session_id, client_id, article_id, questions_json, answers_json, correct, score, read_seconds)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
    )
    .bind(a.id, a.sessionId, a.clientId, a.articleId, JSON.stringify(a.quiz), JSON.stringify(a.answers), a.result.correct, a.result.score, a.readSeconds)
    .run();
  return (r.meta.changes ?? 0) > 0;
}

/** 從作答紀錄還原結果（練習頁重新整理、回來看解析用） */
export function resultFromRow(row: QuizAttemptRow): QuizResult {
  return scoreQuiz(JSON.parse(row.questions_json) as Quiz, JSON.parse(row.answers_json) as number[]);
}
