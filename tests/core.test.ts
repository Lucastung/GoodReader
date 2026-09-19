import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeScores, WEIGHTS } from "../lib/rubric.ts";
import { copyRatio, copyLevel, precheck, countHan, suggestedSummaryRange } from "../lib/textcheck.ts";
import { rowsToTree, normalizeRows, treeToRows } from "../lib/outline.ts";
import { extractJson } from "../lib/llm.ts";
import { LlmGradeSchema, KeypointsSchema } from "../lib/schemas.ts";
import { extractArticle, qualityCheck, hostAllowed } from "../lib/collector.ts";
import { mockGrade, mockKeypoints } from "../lib/mock.ts";

const classics = JSON.parse(readFileSync(new URL("../data/classics.json", import.meta.url), "utf8"));
const taohua = classics.find((a: { id: string }) => a.id === "taohuayuan-ji");
const taohuaText = taohua.paragraphs.join("");

test("每個年級配分總和為 100，且國中大綱 55、高中大綱 40", () => {
  for (const g of ["junior", "senior"] as const) {
    const w = WEIGHTS[g];
    assert.equal(Object.values(w).reduce((a, b) => a + b, 0), 100);
  }
  assert.equal(WEIGHTS.junior.outline_coverage + WEIGHTS.junior.outline_structure, 55);
  assert.equal(WEIGHTS.senior.outline_coverage + WEIGHTS.senior.outline_structure, 40);
});

const allExcellent = LlmGradeSchema.parse({
  scores: ["outline_coverage", "outline_structure", "summary_gist", "summary_fidelity", "summary_concision"].map(
    (c) => ({ criterion: c, level: "優", reason: "好" }),
  ),
  nextStep: "繼續保持",
});

test("全部「優」= 100 分；照抄時精簡項強制降為待加強", () => {
  assert.equal(computeScores(allExcellent, "junior", { copyRatio: 0.1 }).total, 100);
  const copied = computeScores(allExcellent, "senior", { copyRatio: 0.8 });
  const c = copied.items.find((i) => i.criterion === "summary_concision")!;
  assert.equal(c.level, "待加強");
  assert.equal(c.score, Math.round(18 * 0.3));
  assert.equal(copied.total, 100 - 18 + 5);
});

test("照抄偵測：原文接近 1，自己的話接近 0", () => {
  const copied = "晉太元中，武陵人捕魚為業。緣溪行，忘路之遠近。忽逢桃花林";
  const own = "一個漁夫意外走進與世隔絕的村莊，村民熱情招待，但他出來後再也找不到路。";
  assert.ok(copyRatio(copied, taohuaText) > 0.9);
  assert.ok(copyRatio(own, taohuaText) < 0.1);
  assert.equal(copyLevel(copyRatio(own, taohuaText)), "low");
});

test("照抄偵測：在原句增字、刪字、換字仍抓得到", () => {
  const src = [...taohuaText.replace(/[^\p{Script=Han}]/gu, "").slice(0, 90)];
  const insert = (k: number) => src.map((c, i) => ((i + 1) % k === 0 ? c + "了" : c)).join("");
  const remove = (k: number) => src.filter((_, i) => (i + 1) % k !== 0).join("");
  const swap = (k: number) => src.map((c, i) => ((i + 1) % k === 0 ? "的" : c)).join("");
  for (const [name, text] of [
    ["每 4 字插 1 字", insert(4)],
    ["每 2 字插 1 字", insert(2)],
    ["每 5 字刪 1 字", remove(5)],
    ["每 3 字刪 1 字", remove(3)],
    ["每 4 字換 1 字", swap(4)],
  ] as const) {
    assert.ok(copyRatio(text, taohuaText) > 0.9, name);
    assert.equal(copyLevel(copyRatio(text, taohuaText)), "high", name);
  }
});

test("照抄偵測：好好改寫的摘要不會誤判", () => {
  const good =
    "東晉時一個武陵漁夫順著溪水划船，意外發現一片桃花林和一座山洞。穿過山洞，他看見一個和平富足的村落，村民的祖先為了躲避秦朝戰亂搬來這裡，從此和外界隔絕。漁夫受到熱情款待，離開時沿路做了記號，但太守派人去找卻迷了路。作者藉此寄託對理想社會的嚮往。";
  assert.ok(copyRatio(good, taohuaText) < 0.15);
  // 只引用一小句原文：算「部分」而不是「照抄」
  const partly = "一個漁夫沿著溪走，看到芳草鮮美，落英繽紛的桃花林，進入一個與世隔絕的村子，村民熱情招待他。他回去後帶太守一起去找，卻再也找不到路。";
  assert.notEqual(copyLevel(copyRatio(partly, taohuaText)), "high");
});

test("前檢查：大綱太少或摘要太短會退回", () => {
  const outline = [{ text: "甲" }, { text: "乙" }, { text: "丙" }];
  const longSummary = "一個漁夫意外走進與世隔絕的村莊，村民熱情招待，但他出來後再也找不到路，後人也沒有再找到。";
  assert.equal(precheck(outline.slice(0, 2), longSummary).ok, false);
  assert.equal(precheck(outline, "太短").ok, false);
  assert.equal(precheck(outline, longSummary).ok, true);
  assert.ok(countHan(longSummary) >= 30);
  const [lo, hi] = suggestedSummaryRange(320);
  assert.ok(lo >= 30 && hi > lo && hi <= 300);
});

test("大綱編輯列 ↔ 樹", () => {
  const rows = [
    { text: "發現桃花林", level: 0 },
    { text: "夾岸數百步", level: 2 }, // 跳層會被修正成 1
    { text: "", level: 0 }, // 空列忽略
    { text: "進入桃花源", level: 0 },
    { text: "村民款待", level: 1 },
  ];
  assert.deepEqual(normalizeRows(rows).map((r) => r.level), [0, 1, 0, 0, 1]);
  const tree = rowsToTree(rows);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].children![0].text, "夾岸數百步");
  assert.deepEqual(treeToRows(tree).map((r) => r.text), ["發現桃花林", "夾岸數百步", "進入桃花源", "村民款待"]);
});

test("extractJson 能處理思考區塊與 ```json 圍欄", () => {
  const raw = '<think>先想一下</think>\n```json\n{"a": 1, "b": "{x}"}\n```';
  assert.deepEqual(extractJson(raw), { a: 1, b: "{x}" });
  assert.throws(() => extractJson("沒有 JSON"));
});

test("模擬模式的輸出通過 schema 驗證", () => {
  const paragraphs = taohua.paragraphs.map((text: string, i: number) => ({ id: `P${i + 1}`, text }));
  const kp = KeypointsSchema.parse(mockKeypoints(paragraphs));
  const g = LlmGradeSchema.parse(mockGrade(kp, 4));
  assert.equal(g.scores.length, 5);
});

test("收集器：白名單網域判斷與正文抽取", () => {
  assert.ok(hostAllowed(new URL("https://zh.example.org/a"), "example.org"));
  assert.ok(!hostAllowed(new URL("https://example.org.evil.com/a"), "example.org"));
  assert.ok(!hostAllowed(new URL("http://example.org/a"), "example.org"));

  const body = taohua.paragraphs.map((p: string) => `<p>${p}</p>`).join("\n");
  const html = `<html><head><title>桃花源記 - 範例站</title></head><body>
    <nav><p>首頁｜文章列表｜關於我們這個網站的導覽列</p></nav>
    <div id="content">${body}<div class="ref"><p>註釋：這是一段應該被移除的註腳文字內容</p></div></div>
    <footer><p>版權所有，這是頁尾的一段文字內容</p></footer></body></html>`;
  const cfg = { domain: "example.org", contentSelector: "#content", removeSelectors: [".ref"] };
  const e = extractArticle(html, cfg, "https://example.org/taohua");
  assert.equal(e.paragraphs.length, 5);
  assert.equal(e.paragraphs[0].id, "P1");
  assert.ok(!e.paragraphs.some((p) => p.text.includes("註釋")));
  assert.ok(qualityCheck(e).ok);

  // 沒有 selector 時走 Readability
  const e2 = extractArticle(html, { domain: "example.org" }, "https://example.org/taohua");
  assert.ok(e2.paragraphs.length >= 5, `readability 抽到 ${e2.paragraphs.length} 段`);
});

import { blockEnd, moveBlock, shiftBlock } from "../lib/outline.ts";

test("大綱拖拉：整塊縮排、整塊上下移", () => {
  const rows = [
    { text: "A", level: 0 },
    { text: "A1", level: 1 },
    { text: "B", level: 0 },
    { text: "B1", level: 1 },
    { text: "C", level: 0 },
  ];
  assert.equal(blockEnd(rows, 0), 2);
  assert.equal(blockEnd(rows, 4), 5);
  // B 連同 B1 變成 A 的細項
  assert.deepEqual(shiftBlock(rows, 2, 1).map((r) => r.level), [0, 1, 1, 2, 0]);
  // 第一列不能縮排
  assert.deepEqual(shiftBlock(rows, 0, 1).map((r) => r.level), [0, 1, 0, 1, 0]);
  // B 整塊往上移到 A 前面
  const up = moveBlock(rows, 2, -1);
  assert.equal(up.index, 1);
  assert.deepEqual(up.rows.map((r) => r.text), ["A", "B", "B1", "A1", "C"]);
  // A 整塊往下移一格（跳過 B）
  const down = moveBlock(rows, 0, 1);
  assert.deepEqual(down.rows.map((r) => r.text), ["B", "A", "A1", "B1", "C"]);
  // 邊界不動
  assert.equal(moveBlock(rows, 0, -1).index, 0);
  assert.equal(moveBlock(rows, 4, 1).index, 4);
});
