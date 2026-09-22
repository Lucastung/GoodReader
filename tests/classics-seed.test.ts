// 內建經典的種子：data/classics.json 改成和匯入相同的格式（附要點底稿與閱讀測驗），
// 由 scripts/build-seed.mjs 產生 0002（文章）與 0011（要點／題目／備註）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { makeD1 } from "./d1-shim.ts";
import { getKeypoints } from "../lib/db.ts";
import { getQuiz, saveQuiz } from "../lib/quiz.ts";
import { KeypointsSchema, QuizSchema } from "../lib/schemas.ts";

const classics = JSON.parse(readFileSync(new URL("../data/classics.json", import.meta.url), "utf8")) as {
  id: string;
  paragraphs: string[];
  keypoints: unknown;
  quiz: unknown;
}[];

test("classics.json 每篇都附要點底稿與 5 題閱讀測驗，段落編號都指得到", () => {
  for (const a of classics) {
    const kp = KeypointsSchema.parse(a.keypoints);
    const quiz = QuizSchema.parse(a.quiz);
    const ok = (ref: string) => /^P\d+$/.test(ref) && Number(ref.slice(1)) <= a.paragraphs.length;
    for (const k of kp.keyPoints) for (const p of k.paragraphs) assert.ok(ok(p), `${a.id} ${k.id} 指到 ${p}`);
    for (const q of quiz.questions) if (q.paragraph) assert.ok(ok(q.paragraph), `${a.id} 題目指到 ${q.paragraph}`);
    // 正解不要全擠在同一個位置
    assert.ok(new Set(quiz.questions.map((q) => q.answer)).size >= 3, `${a.id} 正解位置太集中`);
  }
});

test("新資料庫套完 migration：經典都有系列、要點、題目，來源記成 import", async () => {
  const db = makeD1();
  for (const a of classics) {
    const row = await db
      .prepare(
        `SELECT a.series, a.notes, k.model AS kp_model, z.model AS quiz_model, z.edited_by
         FROM articles a LEFT JOIN article_keypoints k ON k.article_id = a.id LEFT JOIN article_quizzes z ON z.article_id = a.id
         WHERE a.id = ?`,
      )
      .bind(a.id)
      .first<Record<string, string | null>>();
    assert.ok(row, `${a.id} 不在資料庫`);
    assert.equal(row.series, "經典");
    assert.ok(row.notes);
    assert.equal(row.kp_model, "import");
    assert.equal(row.quiz_model, "import");
    assert.equal(row.edited_by, null);
    assert.deepEqual(await getKeypoints(db, a.id), a.keypoints);
    assert.equal((await getQuiz(db, a.id))?.quiz.questions.length, 5);
  }
});

test("在已有資料的資料庫重套 0011：老師改過的題目保留，AI 原稿與要點快取被換掉", async () => {
  const raw = new DatabaseSync(":memory:");
  const dir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const seed = files.find((f) => f.includes("seed_classics_quiz"))!;
  for (const f of files.filter((f) => f < seed)) raw.exec(readFileSync(new URL(f, dir), "utf8"));

  // 模擬正式站：兩篇已經有 LLM 產生的題目，其中一篇老師改過；一篇有舊的要點快取；一篇經典被刪掉
  const q = { questions: Array.from({ length: 5 }, (_, i) => ({ q: `舊題目${i + 1}`, options: ["甲", "乙", "丙", "丁"], answer: 0, explanation: "舊" })) };
  const ins = raw.prepare("INSERT INTO article_quizzes (article_id, model, data_json, edited_by) VALUES (?, ?, ?, ?)");
  ins.run("taohuayuan-ji", "deepseek", JSON.stringify(q), null);
  ins.run("ailian-shuo", "deepseek", JSON.stringify(q), "teacher@school.tw");
  raw.prepare("INSERT INTO article_keypoints (article_id, model, data_json) VALUES (?, ?, ?)").run("congcong", "deepseek", "{}");
  raw.prepare("UPDATE articles SET notes = '老師的備註' WHERE id = 'shi-shuo'").run();
  raw.prepare("DELETE FROM articles WHERE id = 'luo-huasheng'").run();

  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec(readFileSync(new URL(seed, dir), "utf8"));

  const quiz = (id: string) => raw.prepare("SELECT model, data_json, edited_by FROM article_quizzes WHERE article_id = ?").get(id) as Record<string, string>;
  assert.equal(quiz("taohuayuan-ji").model, "import");
  assert.equal(quiz("ailian-shuo").model, "deepseek");
  assert.equal(quiz("ailian-shuo").edited_by, "teacher@school.tw");
  assert.match(quiz("ailian-shuo").data_json, /舊題目1/);
  const kp = raw.prepare("SELECT model FROM article_keypoints WHERE article_id = 'congcong'").get() as { model: string };
  assert.equal(kp.model, "import");
  const notes = raw.prepare("SELECT notes FROM articles WHERE id = 'shi-shuo'").get() as { notes: string };
  assert.equal(notes.notes, "老師的備註");
  assert.equal(quiz("luo-huasheng"), undefined);
});

test("saveQuiz 仍可覆蓋種子題目（後台編輯不受影響）", async () => {
  const db = makeD1();
  const cur = (await getQuiz(db, "shi-shuo"))!;
  await saveQuiz(db, "shi-shuo", "import", cur.quiz, "teacher@school.tw");
  const row = await db.prepare("SELECT edited_by FROM article_quizzes WHERE article_id = 'shi-shuo'").first<{ edited_by: string }>();
  assert.equal(row?.edited_by, "teacher@school.tw");
});
