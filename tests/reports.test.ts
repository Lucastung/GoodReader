// 文章檢舉，以及審核上架後跳到下一篇待審
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeD1 } from "./d1-shim.ts";
import { REPORTS_PER_DAY, ReportInput, createReport, handleReport, listReports } from "../lib/reports.ts";
import { insertArticle, nextDraftId } from "../lib/admin-db.ts";

const input = (over: Record<string, unknown> = {}) => ReportInput.parse({ kind: "content", message: "第二段有錯字", ...over });

test("回報的格式檢查：類型、段落編號、說明字數", () => {
  assert.equal(ReportInput.safeParse({ kind: "spam", message: "五個字以上" }).success, false);
  assert.equal(ReportInput.safeParse({ kind: "content", message: "短" }).success, false);
  assert.equal(ReportInput.safeParse({ kind: "content", paragraph: "第3段", message: "五個字以上" }).success, false);
  assert.equal(ReportInput.safeParse({ kind: "copyright", paragraph: "P3", message: "這篇好像有版權" }).success, true);
});

test("回報會存下來，後台列得出來；文章或段落不存在就擋掉", async () => {
  const db = makeD1();
  const r = await createReport(db, "u1", "taohuayuan-ji", input({ paragraph: "P2" }));
  assert.ok(r.ok);
  assert.deepEqual(await createReport(db, "u1", "no-such", input()), { ok: false, status: 404, error: "找不到這篇文章" });
  const bad = await createReport(db, "u1", "ailian-shuo", input({ paragraph: "P9" })); // 愛蓮說只有 2 段
  assert.equal(bad.ok, false);

  const { reports, counts } = await listReports(db, { status: "open" });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].article_title, "桃花源記");
  assert.equal(reports[0].paragraph, "P2");
  assert.equal(counts.open, 1);
});

test("同一人同一篇同一類，還沒處理前不能重複回報；換類型可以；處理完可以再報", async () => {
  const db = makeD1();
  assert.ok((await createReport(db, "u1", "shi-shuo", input())).ok);
  const dup = await createReport(db, "u1", "shi-shuo", input({ message: "還是有錯字喔" }));
  assert.equal(dup.ok || dup.status, 409);
  assert.ok((await createReport(db, "u1", "shi-shuo", input({ kind: "copyright", message: "版權有疑慮" }))).ok);
  assert.ok((await createReport(db, "u2", "shi-shuo", input())).ok); // 別人可以
  const first = (await listReports(db, { articleId: "shi-shuo", kind: "content" })).reports.find((x) => x.user_id === "u1")!;
  assert.ok(await handleReport(db, first.id, "resolved", "t@school.tw", "已修正"));
  assert.ok((await createReport(db, "u1", "shi-shuo", input())).ok);
});

test("每人 24 小時最多回報 REPORTS_PER_DAY 則", async () => {
  const db = makeD1();
  for (let i = 0; i < REPORTS_PER_DAY; i++) {
    await db
      .prepare("INSERT INTO article_reports (id, article_id, user_id, kind, message) VALUES (?, 'congcong', 'u1', 'content', 'x')")
      .bind(`r${i}`)
      .run();
    await db.prepare("UPDATE article_reports SET status = 'resolved' WHERE id = ?").bind(`r${i}`).run();
  }
  const r = await createReport(db, "u1", "congcong", input());
  assert.equal(r.ok || r.status, 429);
  assert.ok((await createReport(db, "u2", "congcong", input())).ok);
});

test("處理檢舉：已處理記下處理者與說明；改回未處理會清掉", async () => {
  const db = makeD1();
  const r = await createReport(db, "u1", "luo-huasheng", input());
  assert.ok(r.ok);
  assert.ok(await handleReport(db, r.id, "dismissed", "t@school.tw", "  不是錯字，是古字 "));
  let row = (await listReports(db, {})).reports[0];
  assert.equal(row.status, "dismissed");
  assert.equal(row.handled_by, "t@school.tw");
  assert.equal(row.handle_note, "不是錯字，是古字");
  assert.ok(row.handled_at);
  assert.ok(await handleReport(db, r.id, "open", "t@school.tw"));
  row = (await listReports(db, {})).reports[0];
  assert.equal(row.status, "open");
  assert.equal(row.handled_by, null);
  assert.equal(row.handled_at, null);
  assert.equal(await handleReport(db, "nope", "resolved", "t@school.tw"), false);
});

test("上架後的下一篇待審：照難度、標題排序，跳過剛審完的", async () => {
  const db = makeD1();
  assert.equal(await nextDraftId(db, "x"), null); // 內建經典都已上架
  const mk = (id: string, title: string, difficulty: number) =>
    insertArticle(
      db,
      { id, title, author: "測試", genre: "說明文", difficulty, license: "original", paragraphs: ["一段文字一段文字。"] },
      { origin: "manual", createdBy: "t@e.st" },
    );
  await mk("d-b", "乙", 2);
  await mk("d-a", "甲", 3);
  await mk("d-c", "丙", 1);
  assert.equal(await nextDraftId(db, "d-b"), "d-c");
  assert.equal(await nextDraftId(db, "d-c"), "d-b");
  await db.prepare("UPDATE articles SET status = 'approved' WHERE id IN ('d-b', 'd-c')").run();
  assert.equal(await nextDraftId(db, "d-c"), "d-a");
  assert.equal(await nextDraftId(db, "d-a"), null);
});
