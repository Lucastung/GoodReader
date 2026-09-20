import { test } from "node:test";
import assert from "node:assert/strict";
import { makeD1 } from "./d1-shim.ts";
import { articleBests, createSession, getSession, getStats, saveAttemptAndGrade } from "../lib/db.ts";
import { listUsers, userDetail } from "../lib/admin-db.ts";
import { mockQuiz, quizAttemptFor, quizDoneArticleIds, resultFromRow, saveQuizAttempt, scoreQuiz } from "../lib/quiz.ts";

async function setup() {
  const db = makeD1();
  await db
    .prepare("INSERT INTO users (id, nickname, nickname_key, pin_hash, pin_salt) VALUES ('u1', '小明', '小明', 'x', 'y')")
    .run();
  return db;
}

test("migration：舊的 open 練習轉成 advanced，新欄位存在", async () => {
  const db = await setup();
  await db.prepare("INSERT INTO sessions (id, client_id, article_id, grade) VALUES ('old', 'u1', 'taohuayuan-ji', 'junior')").run();
  const s = await getSession(db, "old");
  assert.equal(s?.mode, "advanced"); // 預設值 'open' 讀出來視為進階
  assert.equal(s?.quiz_json, null);
});

test("閱讀測驗：每篇只能作答一次，積分與進階分開累計", async () => {
  const db = await setup();
  const article = { id: "taohuayuan-ji", title: "桃花源記", paragraphs: [{ id: "P1", text: "晉太元中" }] };
  const quiz = mockQuiz(article);

  // 基礎：作答一次，答對 3 題
  await createSession(db, { id: "s1", clientId: "u1", articleId: article.id, grade: "junior", mode: "basic", quizJson: JSON.stringify(quiz) });
  const answers = quiz.questions.map((q, i) => (i < 3 ? q.answer : (q.answer + 1) % 4));
  const result = scoreQuiz(quiz, answers);
  const base = { clientId: "u1", articleId: article.id, quiz, answers, result, readSeconds: 60 };
  assert.equal(await saveQuizAttempt(db, { ...base, id: "q1", sessionId: "s1" }), true);

  // 同一篇再交一次（另一個 session）→ 擋下
  await createSession(db, { id: "s2", clientId: "u1", articleId: article.id, grade: "junior", mode: "basic", quizJson: JSON.stringify(quiz) });
  assert.equal(await saveQuizAttempt(db, { ...base, id: "q2", sessionId: "s2" }), false);

  const row = await quizAttemptFor(db, "u1", article.id);
  assert.equal(row?.session_id, "s1");
  assert.equal(resultFromRow(row!).score, 15);
  assert.deepEqual(await quizDoneArticleIds(db, "u1"), [article.id]);

  // 進階：同一篇另外做，兩次取最高 80
  await createSession(db, { id: "s3", clientId: "u1", articleId: article.id, grade: "junior", mode: "advanced" });
  for (const [id, total] of [["a1", 60], ["a2", 80]] as const) {
    await saveAttemptAndGrade(
      db,
      { id, sessionId: "s3", outlineJson: "[]", summary: "摘要", readSeconds: 1 },
      { id: `g-${id}`, model: "m", rubricVersion: "v", total, resultJson: "{}", latencyMs: 1, tokensIn: 1, tokensOut: 1 },
    );
  }

  const stats = await getStats(db, "u1");
  assert.equal(stats.totalPoints, 95); // 15 + 80
  assert.equal(stats.completed, 2);
  const d = 2; // 桃花源記難度 2
  assert.deepEqual(stats.byDifficultyBasic.find((x) => x.difficulty === d), { difficulty: d, count: 1, avg: 15 });
  assert.deepEqual(stats.byDifficulty.find((x) => x.difficulty === d), { difficulty: d, count: 1, avg: 80 });

  assert.deepEqual(await articleBests(db, "u1"), { [article.id]: { basic: 15, advanced: 80 } });

  const users = await listUsers(db, "", 10, 0);
  assert.equal(users.users[0].points, 95);
  assert.equal(users.users[0].done, 2);

  const detail = await userDetail(db, "u1");
  const byId = Object.fromEntries((detail!.sessions as { id: string; mode: string; best: number | null }[]).map((s) => [s.id, s]));
  assert.equal(byId.s1.mode, "basic");
  assert.equal(byId.s1.best, 15);
  assert.equal(byId.s3.mode, "advanced");
  assert.equal(byId.s3.best, 80);
});
