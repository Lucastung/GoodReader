import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mockQuiz, publicQuestions, scoreQuiz, shuffleQuiz } from "../lib/quiz.ts";
import { QuizSchema, SubmitQuizInput, StartSessionInput } from "../lib/schemas.ts";
import { quizPrompt } from "../lib/prompts.ts";

const classics = JSON.parse(readFileSync(new URL("../data/classics.json", import.meta.url), "utf8"));
const raw = classics[0];
const article = { ...raw, paragraphs: raw.paragraphs.map((text: string, i: number) => ({ id: `P${i + 1}`, text })) };

const q = (answer: number, n = 0) => ({
  q: `第${n}題：下列何者正確？`,
  options: [`甲${n}`, `乙${n}`, `丙${n}`, `丁${n}`],
  answer,
  explanation: "因為原文這樣寫。",
  paragraph: "P1",
  skill: "擷取訊息",
});

test("題目格式：剛好 5 題、4 個不重複選項", () => {
  assert.ok(QuizSchema.safeParse({ questions: [0, 1, 2, 3, 0].map((a, i) => q(a, i)) }).success);
  assert.ok(!QuizSchema.safeParse({ questions: [0, 1, 2, 3].map((a, i) => q(a, i)) }).success, "4 題不行");
  const dup = { ...q(0), options: ["同", "同", "丙", "丁"] };
  assert.ok(!QuizSchema.safeParse({ questions: [dup, q(1, 1), q(2, 2), q(3, 3), q(0, 4)] }).success, "選項重複不行");
  // 模型給了不在清單內的能力標籤：不擋，改成 null
  const odd = QuizSchema.parse({ questions: [{ ...q(0), skill: "亂寫" }, q(1, 1), q(2, 2), q(3, 3), q(0, 4)] });
  assert.equal(odd.questions[0].skill, null);
});

test("計分：一題 5 分，滿分 25", () => {
  const quiz = QuizSchema.parse({ questions: [0, 1, 2, 3, 0].map((a, i) => q(a, i)) });
  const all = scoreQuiz(quiz, [0, 1, 2, 3, 0]);
  assert.equal(all.score, 25);
  assert.equal(all.max, 25);
  const some = scoreQuiz(quiz, [0, 0, 2, 0, 1]);
  assert.equal(some.correct, 2);
  assert.equal(some.score, 10);
  assert.deepEqual(some.items.map((x) => x.correct), [true, false, true, false, false]);
});

test("打亂選項後，正確答案文字不變", () => {
  const quiz = QuizSchema.parse({ questions: [0, 0, 0, 0, 0].map((a, i) => q(a, i)) });
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = shuffleQuiz(quiz, rand);
  s.questions.forEach((x, i) => {
    assert.equal(x.options[x.answer], quiz.questions[i].options[0]);
    assert.deepEqual([...x.options].sort(), [...quiz.questions[i].options].sort());
  });
  assert.ok(new Set(s.questions.map((x) => x.answer)).size > 1, "答案位置不該全部一樣");
  assert.ok(QuizSchema.safeParse(s).success);
});

test("給學生的題目不含答案與解析", () => {
  const pub = publicQuestions(mockQuiz(article));
  assert.equal(pub.length, 5);
  for (const x of pub) {
    assert.deepEqual(Object.keys(x).sort(), ["options", "q"]);
  }
});

test("交卷輸入：5 題都要作答、選項 0–3", () => {
  assert.ok(SubmitQuizInput.safeParse({ answers: [0, 1, 2, 3, 0] }).success);
  assert.ok(!SubmitQuizInput.safeParse({ answers: [0, 1, 2, 3] }).success);
  assert.ok(!SubmitQuizInput.safeParse({ answers: [0, 1, 2, 3, 4] }).success);
});

test("開始練習：mode 預設進階（舊版前端相容）", () => {
  assert.equal(StartSessionInput.parse({ grade: "junior" }).mode, "advanced");
  assert.equal(StartSessionInput.parse({ grade: "junior", mode: "basic" }).mode, "basic");
});

test("出題 prompt 帶入全文與段落編號，文言文加註規則", () => {
  const p = quizPrompt(article);
  assert.ok(p.user.includes("[P1]"));
  assert.ok(p.user.includes("5 題"));
  assert.equal(article.genre === "文言文", p.user.includes("這是文言文"));
});
