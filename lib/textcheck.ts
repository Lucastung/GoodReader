import type { OutlineNode } from "./schemas.ts";

/** 只留漢字（去標點、空白、英數），用於字數與重疊率計算 */
export function hanOnly(s: string): string {
  return (s.match(/\p{Script=Han}/gu) || []).join("");
}

export function countHan(s: string): number {
  return hanOnly(s).length;
}

/**
 * 摘要中有多少比例的「字元 n-gram」出現在原文裡。
 * 0 = 完全自己的話，1 = 全部可在原文找到。
 */
export function ngramCopyRatio(summary: string, article: string, n = 5): number {
  const s = hanOnly(summary);
  const a = hanOnly(article);
  if (s.length < n) return 0;
  const grams = new Set<string>();
  for (let i = 0; i + n <= a.length; i++) grams.add(a.slice(i, i + n));
  let hit = 0;
  let total = 0;
  for (let i = 0; i + n <= s.length; i++) {
    total++;
    if (grams.has(s.slice(i, i + n))) hit++;
  }
  return total === 0 ? 0 : hit / total;
}

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
