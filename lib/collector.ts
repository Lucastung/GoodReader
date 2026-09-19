// 白名單文章收集器（demo 階段白名單為空，只提供管理端「試抓」API 驗證規則用）
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Paragraph } from "./schemas.ts";
import { countHan } from "./textcheck.ts";

export type SourceConfig = {
  domain: string; // 例：example.org（含子網域）
  contentSelector?: string; // 有就用，沒有走 Readability
  removeSelectors?: string[];
  charset?: "auto" | "big5" | "gbk" | "utf-8";
};

export const MAX_BYTES = 1_000_000; // 1 MB
const UA = "ReadingDemoBot/0.1 (+https://github.com/; contact: admin@example.com)";

export function hostAllowed(url: URL, domain: string): boolean {
  const h = url.hostname.toLowerCase();
  const d = domain.toLowerCase().replace(/^\./, "");
  return url.protocol === "https:" && (h === d || h.endsWith("." + d));
}

/** 依白名單抓頁面：每次轉址都重新檢查網域；wrangler 的 global_fetch_strictly_public 另外擋內網 */
export async function fetchWhitelisted(rawUrl: string, cfg: SourceConfig): Promise<string> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    if (!hostAllowed(url, cfg.domain)) throw new Error(`網址不在白名單：${url.hostname}`);
    const res = await fetch(url.toString(), {
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error("轉址缺少 Location");
      url = new URL(loc, url);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await readLimited(res, MAX_BYTES);
    return decode(buf, cfg.charset ?? "auto", res.headers.get("content-type") ?? "");
  }
  throw new Error("轉址次數過多");
}

async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("頁面超過 1 MB 上限");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

function decode(buf: Uint8Array, charset: string, contentType: string): string {
  let cs = charset;
  if (cs === "auto") {
    const m = contentType.match(/charset=([\w-]+)/i);
    const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
    const meta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i);
    cs = (m?.[1] || meta?.[1] || "utf-8").toLowerCase();
  }
  try {
    return new TextDecoder(cs).decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf); // 不支援的編碼退回 UTF-8
  }
}

export type Extracted = { title: string; author: string | null; paragraphs: Paragraph[]; charCount: number };

export function extractArticle(html: string, cfg: SourceConfig, pageUrl: string): Extracted {
  const { document } = parseHTML(html);
  for (const sel of cfg.removeSelectors ?? []) document.querySelectorAll(sel).forEach((el) => el.remove());

  let title = document.querySelector("title")?.textContent?.trim() ?? "";
  let author: string | null = null;
  let root: Element | null = null;

  if (cfg.contentSelector) {
    root = document.querySelector(cfg.contentSelector);
  }
  if (!root) {
    // Readability 需要 documentURI，linkedom 沒有，手動補
    Object.defineProperty(document, "documentURI", { value: pageUrl, configurable: true });
    const parsed = new Readability(document as unknown as Document).parse();
    if (!parsed?.content) throw new Error("抽不到正文");
    title = parsed.title || title;
    author = parsed.byline || null;
    root = parseHTML(`<html><body>${parsed.content}</body></html>`).document.body;
  }

  const texts = [...root!.querySelectorAll("p")]
    .map((p) => (p.textContent ?? "").replace(/\s+/g, "").trim())
    .filter((t) => countHan(t) >= 8);
  const paragraphs = texts.map((text, i) => ({ id: `P${i + 1}`, text }));
  return { title, author, paragraphs, charCount: paragraphs.reduce((n, p) => n + countHan(p.text), 0) };
}

export type QualityResult = { ok: boolean; problems: string[] };

/** 品質關卡：字數 300–3000、中文比例 ≥ 70%、段落 ≥ 3 */
export function qualityCheck(e: Extracted): QualityResult {
  const problems: string[] = [];
  const all = e.paragraphs.map((p) => p.text).join("");
  const ratio = all.length ? countHan(all) / all.length : 0;
  if (e.charCount < 300 || e.charCount > 3000) problems.push(`字數 ${e.charCount} 不在 300–3000`);
  if (ratio < 0.7) problems.push(`中文比例 ${Math.round(ratio * 100)}% < 70%`);
  if (e.paragraphs.length < 3) problems.push(`段落數 ${e.paragraphs.length} < 3`);
  return { ok: problems.length === 0, problems };
}
