import type { OutlineNode } from "./schemas.ts";

/** 只留漢字（去標點、空白、英數），用於字數與重疊率計算 */
export function hanOnly(s: string): string {
  return (s.match(/\p{Script=Han}/gu) || []).join("");
}

export function countHan(s: string): number {
  return hanOnly(s).length;
}

// ---------- 照抄偵測 ----------
// 舊做法是比對 5 個字的片段，只要每隔幾個字插入或刪掉一個字就能躲過。
// 現在改用「局部序列比對」（Smith-Waterman）：允許少量插字、刪字、換字，
// 找出摘要裡跟原文某一段幾乎一樣的區塊，算這些區塊占摘要多少比例。

const MATCH = 2; // 同一個字
const MISMATCH = -2; // 換了一個字
const GAP = -1; // 多一個字或少一個字
/** 一段比對要至少這麼多分才算照抄（約 5 個以上相同的字連在一起） */
const MIN_SCORE = 10;
/** 太長就截斷，避免耗太多運算時間 */
const MAX_SUMMARY = 600;
const MAX_ARTICLE = 6000;

/**
 * 摘要中「照抄原文」的比例（0..1）。
 * 在原句中插字、刪字、換字仍會被抓到；自己改寫的句子接近 0。
 */
export function copyRatio(summary: string, article: string): number {
  const s = [...hanOnly(summary)].slice(0, MAX_SUMMARY);
  const a = [...hanOnly(article)].slice(0, MAX_ARTICLE);
  const n = s.length;
  const m = a.length;
  if (n < 5 || m < 5) return 0;

  const W = m + 1;
  const H = new Int16Array((n + 1) * W);
  const rowBest = new Int16Array(n + 1);
  const rowBestJ = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    const si = s[i - 1];
    const up = (i - 1) * W;
    const cur = i * W;
    let best = 0;
    let bj = 0;
    for (let j = 1; j <= m; j++) {
      const d = H[up + j - 1] + (si === a[j - 1] ? MATCH : MISMATCH);
      const u = H[up + j] + GAP;
      const l = H[cur + j - 1] + GAP;
      let h = d > u ? d : u;
      if (l > h) h = l;
      if (h < 0) h = 0;
      H[cur + j] = h;
      if (h > best) {
        best = h;
        bj = j;
      }
    }
    rowBest[i] = best;
    rowBestJ[i] = bj;
  }

  // 從分數最高的比對開始往回追，把對到的摘要字標記起來
  const covered = new Uint8Array(n + 1);
  const rows = Array.from({ length: n }, (_, k) => k + 1).sort((x, y) => rowBest[y] - rowBest[x]);
  for (const r of rows) {
    if (rowBest[r] < MIN_SCORE) break;
    if (covered[r]) continue;
    let i = r;
    let j = rowBestJ[r];
    while (i > 0 && j > 0) {
      const h = H[i * W + j];
      if (h === 0) break;
      if (h === H[(i - 1) * W + j - 1] + (s[i - 1] === a[j - 1] ? MATCH : MISMATCH)) {
        covered[i] = 1;
        i--;
        j--;
      } else if (h === H[(i - 1) * W + j] + GAP) {
        covered[i] = 1;
        i--;
      } else j--;
    }
  }
  let c = 0;
  for (let i = 1; i <= n; i++) c += covered[i];
  return c / n;
}

export type CopyLevel = "low" | "some" | "high";
/** 給學生看的只有粗分三級，不顯示精確百分比（避免一個字一個字試） */
export function copyLevel(ratio: number, threshold = 0.6): CopyLevel {
  return ratio > threshold ? "high" : ratio >= 0.25 ? "some" : "low";
}
export const COPY_LEVEL_TEXT: Record<CopyLevel, string> = {
  low: "摘要大多是自己的話",
  some: "摘要有部分句子和原文幾乎一樣，試著改用自己的話",
  high: "摘要大部分照抄原文，「精簡與轉述」算待加強",
};

export function countOutlineItems(nodes: OutlineNode[]): number {
  return nodes.reduce((n, x) => n + 1 + countOutlineItems(x.children ?? []), 0);
}

export function outlineDepth(nodes: OutlineNode[]): number {
  if (!nodes.length) return 0;
  return 1 + Math.max(...nodes.map((x) => outlineDepth(x.children ?? [])));
}

/** 把大綱樹轉成縮排文字（給 LLM 看） */
export function outlineToText(nodes: OutlineNode[], depth = 0): string {
  return nodes
    .map((n) => "  ".repeat(depth) + "- " + n.text + "\n" + outlineToText(n.children ?? [], depth + 1))
    .join("");
}

export type PrecheckResult = { ok: true } | { ok: false; message: string };

export const MIN_OUTLINE_ITEMS = 3;
export const MIN_SUMMARY_CHARS = 30;

/** 不呼叫模型前的基本檢查 */
export function precheck(outline: OutlineNode[], summary: string): PrecheckResult {
  if (countOutlineItems(outline) < MIN_OUTLINE_ITEMS)
    return { ok: false, message: `大綱至少要有 ${MIN_OUTLINE_ITEMS} 條。` };
  if (outlineDepth(outline) > 3) return { ok: false, message: "大綱最多 3 層。" };
  if (countHan(summary) < MIN_SUMMARY_CHARS)
    return { ok: false, message: `摘要至少要 ${MIN_SUMMARY_CHARS} 個字。` };
  return { ok: true };
}

/** 建議摘要字數：原文 10–20%，上限 300 字，下限 30 字 */
export function suggestedSummaryRange(articleChars: number): [number, number] {
  const lo = Math.max(MIN_SUMMARY_CHARS, Math.round(articleChars * 0.1));
  const hi = Math.min(300, Math.max(lo + 30, Math.round(articleChars * 0.2)));
  return [lo, hi];
}
