#!/usr/bin/env node
/**
 * 用後台匯入用的 zod schema 實際驗證一份 JSON，匯入前先在本機檢查。
 * 用法：node scripts/check-import-json.mjs data/articles-fishing-30.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { z } = require("zod");

// lib/schemas.ts 是 TS，這裡即時轉成 JS 再載入，避免另外建置
const src = fs.readFileSync(new URL("../lib/schemas.ts", import.meta.url), "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const tmp = new URL("../node_modules/.cache/goodreader-schemas.mjs", import.meta.url);
fs.mkdirSync(new URL(".", tmp), { recursive: true });
fs.writeFileSync(tmp, js.replace(/from "zod"/, `from ${JSON.stringify(pathToFileURL(require.resolve("zod")).href)}`));
const { ArticleInput, KeypointsSchema, QuizSchema } = await import(tmp.href);

const Item = ArticleInput.extend({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/, "id 只能用小寫英數與連字號").optional(),
  license: ArticleInput.shape.license.default("public-domain"),
  keypoints: KeypointsSchema.optional(),
  quiz: QuizSchema.optional(),
});

const file = process.argv[2];
if (!file) {
  console.error("用法：node scripts/check-import-json.mjs <檔案.json>");
  process.exit(2);
}
const body = JSON.parse(fs.readFileSync(file, "utf8"));
const list = Array.isArray(body) ? body : body.articles;
if (!Array.isArray(list)) {
  console.error("不是 JSON 陣列，也沒有 articles 欄位");
  process.exit(1);
}

const han = (s) => (s.match(/\p{Script=Han}/gu) || []).length;
const errs = [];
const ids = new Set();
for (const [i, raw] of list.entries()) {
  const p = Item.safeParse(raw);
  if (!p.success) {
    for (const iss of p.error.issues) errs.push(`#${i + 1} ${raw?.title ?? ""} → ${iss.path.join(".")}: ${iss.message}`);
    continue;
  }
  const a = p.data;
  if (a.id) {
    if (ids.has(a.id)) errs.push(`#${i + 1} ${a.title} → id 重複：${a.id}`);
    ids.add(a.id);
  }
  const maxP = a.paragraphs.filter((t) => t.trim()).length;
  const ok = (ref) => /^P(\d+)$/.test(ref) && Number(ref.slice(1)) >= 1 && Number(ref.slice(1)) <= maxP;
  for (const k of a.keypoints?.keyPoints ?? [])
    for (const ref of k.paragraphs) if (!ok(ref)) errs.push(`#${i + 1} ${a.title} → keypoints.${k.id} 指到不存在的段落 ${ref}`);
  for (const [qi, q] of (a.quiz?.questions ?? []).entries()) {
    if (q.paragraph && !ok(q.paragraph)) errs.push(`#${i + 1} ${a.title} → 第 ${qi + 1} 題 paragraph ${q.paragraph} 不存在`);
    if (!q.options[q.answer]) errs.push(`#${i + 1} ${a.title} → 第 ${qi + 1} 題 answer 超出選項範圍`);
  }
  const chars = a.paragraphs.reduce((n, t) => n + han(t), 0);
  if (chars > 2400) errs.push(`#${i + 1} ${a.title} → ${chars} 字，超過 2400`);
}

const stat = (fn) => {
  const m = {};
  for (const a of list) m[fn(a)] = (m[fn(a)] || 0) + 1;
  return m;
};
console.log(`共 ${list.length} 篇`);
console.log("難度", stat((a) => a.difficulty));
console.log("文體", stat((a) => a.genre));
console.log("系列", stat((a) => a.series ?? "（無）"));
console.log("附要點底稿", list.filter((a) => a.keypoints).length, "／附閱讀測驗", list.filter((a) => a.quiz).length);
if (errs.length) {
  console.error(`\n✗ ${errs.length} 個問題：`);
  for (const e of errs) console.error("  -", e);
  process.exit(1);
}
console.log("\n✓ 全部通過，可以匯入");
