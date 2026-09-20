#!/usr/bin/env node
// 從維基文庫收集公有領域篇目 → data/collected/wikisource-<日期>.json（格式同後台「JSON 匯入」）
// 篇目清單：data/wikisource-list.json
// 用法：node scripts/collect-wikisource.mjs            全部
//       node scripts/collect-wikisource.mjs --only a,b 只抓指定 id
// 原文只寫進檔案，終端機只印篇名、字數與警告。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseHTML } from "linkedom";

const API = "https://zh.wikisource.org/w/api.php";
const UA = "GoodReaderCollector/0.1 (+https://goodreader.gkb4u.com)";
const MAX_PARAGRAPHS = 40; // 與 lib/schemas.ts ArticleInput 一致

export const countHan = (s) => (s.match(/\p{Script=Han}/gu) || []).length;

// 常見簡體專用字：出現就提醒（維基文庫少數現代文本是簡體）
const SIMPLIFIED = new Set("这们说为个时来国学会对发过还没见长门问间听书东马鸟鱼汉军边远进连选让认记话语读写师杀战历岁观爱欢买卖钱车轻与乐从众亲兴华应无乡复头变厂广业专两严丝义乌习亿执扩扬报拥择护挂挥损换据掷摆灵热烦烛闲阳阴陆队际险随难顾须预领风飞饭馆驾驴骂鸡龙".split(""));

// 維基文庫常用的舊字形／異體字 → 臺灣教育部標準字（課本用字）
export const VARIANTS = {
  爲: "為", 説: "說", 眞: "真", 衆: "眾", 羣: "群", 敎: "教", 淸: "清", 靑: "青", 卽: "即", 旣: "既",
  槪: "概", 吿: "告", 峯: "峰", 鷄: "雞", 裏: "裡", 綫: "線", 竝: "並", 夀: "壽", 兎: "兔", 絶: "絕",
  䇿: "策", 冲: "沖", 喫: "吃", 牀: "床", 麤: "粗", 着: "著", 麽: "麼",
};
/** 換成標準字，回傳換了幾個字 */
export function normalizeVariants(text) {
  let n = 0;
  const out = text.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, (c) => {
    const r = VARIANTS[c];
    if (r && r !== c) { n++; return r; }
    return c;
  });
  return { text: out, replaced: n };
}

const DROP_SELECTORS = [
  "style", "script", "sup", ".reference", ".references", ".mw-references-wrap", "ol.references",
  ".noprint", ".ws-noexport", ".ws-header", "#headerContainer", ".header_notes", ".headertemplate",
  ".navbox", ".toc", "#toc", ".mw-editsection", ".licenseContainer", ".licenseBanner", ".catlinks",
  ".mbox", ".ambox", ".hatnote", ".dablink", ".mw-empty-elt", "h1", "h2", "h3", "h4", "h5", "h6",
];
const TAIL_HEADINGS = /注釋|註釋|注解|註解|參考|参考|校勘|附錄|附录|譯文|译文|白話|白话|作者|版本|題解|题解/;

/**
 * 不是正文的段落：
 * - 模板殘留，例如「<作者:歐陽修<古文觀止」
 * - 整段包在括號裡的評語、出處、寫作日期註記，例如「（陳某曰：……）」「（一九一九年三月。）」
 */
export function isJunk(text) {
  if (/^[<＜]/.test(text)) return true;
  if (/^（[^（）]*）$/.test(text) || /^\([^()]*\)$/.test(text)) return true;
  return false;
}

/** 把維基文庫 parse API 回傳的 HTML 轉成段落陣列 */
export function extractParagraphs(html) {
  const { document } = parseHTML(`<html><body><div id="root">${html}</div></body></html>`);
  const root = document.getElementById("root");

  // 1. 碰到「注釋／譯文…」之類的標題，連同後面全部丟掉
  for (const h of [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]) {
    if (!h.isConnected || !TAIL_HEADINGS.test(h.textContent ?? "")) continue;
    let top = h;
    while (top.parentElement && top.parentElement !== root && !top.parentElement.matches(".mw-parser-output")) top = top.parentElement;
    let n = top.nextSibling;
    while (n) { const next = n.nextSibling; n.remove(); n = next; }
    top.remove();
  }
  // 2. 表格：字少的（頁首資訊框、導覽）拿掉，字多的可能是排版表格，保留
  for (const t of [...root.querySelectorAll("table")]) if (t.isConnected && countHan(t.textContent ?? "") < 200) t.remove();
  for (const sel of DROP_SELECTORS) root.querySelectorAll(sel).forEach((el) => el.remove());

  // 3. 取段落：p、dd、詩體 div.poem（以換行分句）
  const BLOCK = "p, dd, div.poem";
  const out = [];
  for (const el of root.querySelectorAll(BLOCK)) {
    if (el.parentElement?.closest(BLOCK)) continue; // 巢狀的只算外層
    const pieces = el.matches("div.poem")
      ? el.innerHTML.split(/<br\s*\/?>|\n/i).map((s) => parseHTML(`<div id="x">${s}</div>`).document.getElementById("x")?.textContent ?? "")
      : [el.textContent ?? ""];
    for (const raw of pieces) {
      const text = raw.replace(/\[\d+\]|\[註?\s*\d+\]/g, "").replace(/\s+/g, "").trim();
      if (countHan(text) >= 4 && !isJunk(text)) out.push(text);
    }
  }
  return out;
}

/** 段落超過上限時，反覆把「合起來最短」的相鄰兩段合併 */
export function mergeParagraphs(paras, max = MAX_PARAGRAPHS) {
  const p = [...paras];
  while (p.length > max) {
    let best = 0;
    for (let i = 1; i < p.length - 1; i++) if (p[i].length + p[i + 1].length < p[best].length + p[best + 1].length) best = i;
    p.splice(best, 2, p[best] + p[best + 1]);
  }
  return p;
}

/** 品質檢查：只回傳數字與警告，不含原文 */
export function inspect(paras) {
  const all = paras.join("");
  const han = countHan(all);
  const punct = (all.match(/[，。；：？！、「」『』]/g) || []).length;
  const simp = [...new Set([...all].filter((c) => SIMPLIFIED.has(c)))];
  const warnings = [];
  if (han < 80) warnings.push(`字數過少（${han}），可能抓錯頁`);
  if (han > 5000) warnings.push(`字數過多（${han}），可能抓到整本／合集`);
  if (han > 0 && punct / han < 0.04) warnings.push("標點很少，可能是無標點版本");
  if (simp.length >= 3) warnings.push(`疑似簡體（${simp.slice(0, 8).join("")}）`);
  return { charCount: han, paragraphs: paras.length, warnings };
}

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`;
  for (let i = 0; ; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Api-User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      const j = await res.json();
      if (j.error?.code === "maxlag" && i < 3) { await sleep(5000); continue; }
      if (j.error) throw new Error(`${j.error.code}: ${j.error.info}`);
      return j;
    }
    if ((res.status === 429 || res.status >= 500) && i < 3) { await sleep(2000 * (i + 1)); continue; }
    throw new Error(`HTTP ${res.status}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 查頁面：回傳正式標題，或 missing / 消歧義（附候選頁名） */
async function resolve(title) {
  const j = await api({ action: "query", titles: title, redirects: "1", prop: "pageprops" });
  const page = j.query?.pages?.[0];
  if (!page || page.missing || page.invalid) return { status: "missing" };
  if (page.pageprops && "disambiguation" in page.pageprops) {
    const l = await api({ action: "parse", page: page.title, prop: "links" });
    const links = (l.parse?.links ?? []).filter((x) => x.ns === 0 && x.exists).map((x) => x.title);
    return { status: "disambig", title: page.title, links };
  }
  return { status: "ok", title: page.title };
}

async function fetchArticle(title) {
  const j = await api({ action: "parse", page: title, prop: "text", disableeditsection: "1", disablelimitreport: "1" });
  return j.parse.text;
}

async function main() {
  const here = (p) => new URL(`../${p}`, import.meta.url);
  const cfg = JSON.parse(readFileSync(here("data/wikisource-list.json"), "utf8"));
  const list = cfg.items;
  const maxChars = cfg.maxChars ?? 800; // 超過就不收（只算漢字）
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
  const existing = new Set(JSON.parse(readFileSync(here("data/classics.json"), "utf8")).map((a) => a.id));
  const today = new Date().toISOString().slice(0, 10);

  const articles = [];
  const report = [];
  for (const item of list) {
    if (only && !only.has(item.id)) continue;
    if (existing.has(item.id)) { report.push({ id: item.id, status: "略過（已在 classics.json）" }); continue; }
    const tried = [];
    let done = false;
    for (const t of item.titles) {
      try {
        const r = await resolve(t);
        await sleep(300);
        if (r.status === "missing") { tried.push(`${t}：找不到`); continue; }
        if (r.status === "disambig") { tried.push(`${t}：消歧義頁 → ${r.links.slice(0, 12).join("、")}`); continue; }
        const raw = extractParagraphs(await fetchArticle(r.title));
        await sleep(300);
        let replaced = 0;
        const normalized = raw.map((p) => { const r = normalizeVariants(p); replaced += r.replaced; return r.text; });
        const paragraphs = mergeParagraphs(normalized);
        const info = inspect(paragraphs);
        if (replaced) info.warnings.push(`異體字改標準字 ${replaced} 處`);
        if (raw.length > paragraphs.length) info.warnings.push(`段落 ${raw.length} → 合併為 ${paragraphs.length}`);
        if (!paragraphs.length) { tried.push(`${t}（${r.title}）：抽不到正文`); continue; }
        if (info.charCount > maxChars) {
          report.push({ id: item.id, status: `不收（${r.title}，${info.charCount} 字，超過 ${maxChars} 字）` });
          done = true;
          break;
        }
        const url = `https://zh.wikisource.org/wiki/${encodeURIComponent(r.title.replaceAll(" ", "_"))}`;
        articles.push({
          id: item.id,
          title: item.titles[0].replace(/\s*[（(].*[)）]\s*$/, ""),
          author: item.author,
          era: item.era,
          genre: item.genre,
          difficulty: item.difficulty,
          paragraphs,
          url,
          license: "public-domain",
          notes: `來源：維基文庫「${r.title}」，${today} 取得。請對照權威版本（課本／國文學會版本）校對後再上架。${info.warnings.length ? `\n自動檢查：${info.warnings.join("；")}` : ""}`,
        });
        report.push({ id: item.id, status: "OK", page: r.title, ...info });
        done = true;
        break;
      } catch (e) {
        tried.push(`${t}：錯誤 ${e.message}`);
      }
    }
    if (!done) report.push({ id: item.id, status: "失敗", tried });
  }

  mkdirSync(here("data/collected"), { recursive: true });
  // --only 另存一個檔，不覆蓋整批的結果
  const outFile = `data/collected/wikisource-${today}${only ? "-" + [...only].join("_").slice(0, 60) : ""}.json`;
  writeFileSync(here(outFile), JSON.stringify(articles, null, 2) + "\n");
  const lines = report.map((r) =>
    r.status === "OK"
      ? `✔ ${r.id}｜${r.page}｜${r.charCount} 字｜${r.paragraphs} 段${r.warnings.length ? `｜⚠ ${r.warnings.join("；")}` : ""}`
      : r.status === "失敗" ? `✘ ${r.id}\n    ${r.tried.join("\n    ")}` : `－ ${r.id}｜${r.status}`,
  );
  const summary = `維基文庫收集 ${today}：成功 ${articles.length}／${report.length}（上限 ${maxChars} 字）\n輸出：${outFile}\n\n${lines.join("\n")}\n`;
  writeFileSync(here(outFile.replace(/\.json$/, "-report.txt")), summary);
  console.log(summary);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
