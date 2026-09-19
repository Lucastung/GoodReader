// 由 data/classics.json 產生 D1 種子 migration。改了文章後重跑：node scripts/build-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";

const items = JSON.parse(readFileSync(new URL("../data/classics.json", import.meta.url), "utf8"));
const q = (s) => (s == null ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);
const countHan = (s) => (s.match(/\p{Script=Han}/gu) || []).length;

let sql = "-- 自動產生：node scripts/build-seed.mjs（內建經典文學，公有領域）\n";
for (const a of items) {
  const paragraphs = a.paragraphs.map((text, i) => ({ id: `P${i + 1}`, text }));
  const chars = a.paragraphs.reduce((n, p) => n + countHan(p), 0);
  sql += `INSERT OR REPLACE INTO articles (id, source_id, url, title, author, era, genre, difficulty, paragraphs_json, char_count, license) VALUES (${[
    q(a.id), "NULL", "NULL", q(a.title), q(a.author), q(a.era), q(a.genre), a.difficulty,
    q(JSON.stringify(paragraphs)), chars, q("public-domain"),
  ].join(", ")});\n`;
}
writeFileSync(new URL("../migrations/0002_seed_classics.sql", import.meta.url), sql);
console.log(`wrote ${items.length} articles`);
for (const a of items) console.log(a.title, a.paragraphs.reduce((n, p) => n + countHan(p), 0));
