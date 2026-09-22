// 由 data/classics.json 產生內建經典的 D1 種子 migration。改了文章後重跑：node scripts/build-seed.mjs
//
// 產生兩個檔案：
// - 0002_seed_classics.sql：文章本身。只能用 0001 就有的欄位（series 在 0009、notes 在 0005 才加），
//   否則新建的資料庫照順序套 migration 時會失敗。
// - 0011_seed_classics_quiz.sql：要點底稿、閱讀測驗、審稿備註（這些表／欄位在 0002 之後才有）。
//   題目只覆蓋「AI 原稿」（edited_by IS NULL），老師在後台改過的題目不會被蓋掉。
// 系列「經典」由 0010_classics_series.sql 補上；classics.json 若新增文章，記得把 id 也加進那裡。
import { readFileSync, writeFileSync } from "node:fs";

const items = JSON.parse(readFileSync(new URL("../data/classics.json", import.meta.url), "utf8"));
const q = (s) => (s == null ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);
const countHan = (s) => (s.match(/\p{Script=Han}/gu) || []).length;
/** 和後台匯入一樣，把附帶的要點／題目記成 "import"，和站上 LLM 產生的區分開 */
const MODEL = "import";

let sql = "-- 自動產生：node scripts/build-seed.mjs（內建經典文學，公有領域）\n";
for (const a of items) {
  const paragraphs = a.paragraphs.map((text, i) => ({ id: `P${i + 1}`, text }));
  const chars = a.paragraphs.reduce((n, p) => n + countHan(p), 0);
  sql += `INSERT OR REPLACE INTO articles (id, source_id, url, title, author, era, genre, difficulty, paragraphs_json, char_count, license) VALUES (${[
    q(a.id), "NULL", "NULL", q(a.title), q(a.author), q(a.era), q(a.genre), a.difficulty,
    q(JSON.stringify(paragraphs)), chars, q(a.license ?? "public-domain"),
  ].join(", ")});\n`;
}
writeFileSync(new URL("../migrations/0002_seed_classics.sql", import.meta.url), sql);

let extra = `-- 自動產生：node scripts/build-seed.mjs（內建經典的要點底稿、閱讀測驗、審稿備註）
-- 只寫入還存在的文章（後台刪掉的經典不會被 foreign key 卡住）。
-- 要點底稿直接取代站上 LLM 產生的快取；題目只取代 AI 原稿，老師改過的（edited_by 有值）保留。
`;
for (const a of items) {
  const exists = `WHERE EXISTS (SELECT 1 FROM articles WHERE id = ${q(a.id)})`;
  extra += `\n-- ${a.title}\n`;
  if (a.notes) extra += `UPDATE articles SET notes = ${q(a.notes)} WHERE id = ${q(a.id)} AND notes IS NULL;\n`;
  if (a.keypoints)
    extra += `INSERT INTO article_keypoints (article_id, model, data_json) SELECT ${q(a.id)}, ${q(MODEL)}, ${q(JSON.stringify(a.keypoints))} ${exists}
  ON CONFLICT(article_id) DO UPDATE SET model = excluded.model, data_json = excluded.data_json, created_at = datetime('now');\n`;
  if (a.quiz)
    extra += `INSERT INTO article_quizzes (article_id, model, data_json) SELECT ${q(a.id)}, ${q(MODEL)}, ${q(JSON.stringify(a.quiz))} ${exists}
  ON CONFLICT(article_id) DO UPDATE SET model = excluded.model, data_json = excluded.data_json, updated_at = datetime('now')
  WHERE article_quizzes.edited_by IS NULL;\n`;
}
writeFileSync(new URL("../migrations/0011_seed_classics_quiz.sql", import.meta.url), extra);

console.log(`wrote ${items.length} articles`);
for (const a of items)
  console.log(a.title, a.paragraphs.reduce((n, p) => n + countHan(p), 0), a.keypoints ? "要點✓" : "要點✗", a.quiz ? "題目✓" : "題目✗");
