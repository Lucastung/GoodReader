import type { OutlineNode } from "./schemas.ts";

/** 編輯器用的扁平列：level 0..2 */
export type OutlineRow = { text: string; level: number };

export const MAX_LEVEL = 2;

/** 修正層級：第一列必為 0，每列最多比上一列深一層 */
export function normalizeRows(rows: OutlineRow[]): OutlineRow[] {
  let prev = -1;
  return rows.map((r) => {
    const level = Math.max(0, Math.min(r.level, prev + 1, MAX_LEVEL));
    prev = level;
    return { ...r, level };
  });
}

/** 扁平列 → 樹（忽略空白列；空白列底下的子項會掛到前一個非空節點） */
export function rowsToTree(rows: OutlineRow[]): OutlineNode[] {
  const clean = normalizeRows(rows.filter((r) => r.text.trim()).map((r) => ({ ...r, text: r.text.trim() })));
  const root: OutlineNode[] = [];
  const stack: { level: number; node: OutlineNode }[] = [];
  for (const r of clean) {
    const node: OutlineNode = { text: r.text, children: [] };
    while (stack.length && stack[stack.length - 1].level >= r.level) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children!.push(node);
    else root.push(node);
    stack.push({ level: r.level, node });
  }
  return root;
}

export function treeToRows(nodes: OutlineNode[], level = 0): OutlineRow[] {
  return nodes.flatMap((n) => [{ text: n.text, level }, ...treeToRows(n.children ?? [], level + 1)]);
}

/** 第 i 列連同底下細項的範圍 [i, end) */
export function blockEnd(rows: OutlineRow[], i: number): number {
  let j = i + 1;
  while (j < rows.length && rows[j].level > rows[i].level) j++;
  return j;
}

/** 整塊（第 i 列＋細項）的層級一起加減 d，再修正層級 */
export function shiftBlock(rows: OutlineRow[], i: number, d: number): OutlineRow[] {
  const end = blockEnd(rows, i);
  return normalizeRows(rows.map((r, j) => (j >= i && j < end ? { ...r, level: r.level + d } : r)));
}

/**
 * 把從 i 開始的整塊往上（dir=-1）或往下（dir=1）移一格，回傳新陣列與整塊的新起點。
 * 往上：跳過上一列；往下：跳過下一列。層級交給 normalizeRows 修正。
 */
export function moveBlock(rows: OutlineRow[], i: number, dir: -1 | 1): { rows: OutlineRow[]; index: number } {
  const end = blockEnd(rows, i);
  if (dir === -1 && i === 0) return { rows, index: i };
  if (dir === 1 && end >= rows.length) return { rows, index: i };
  const block = rows.slice(i, end);
  const rest = [...rows.slice(0, i), ...rows.slice(end)];
  const at = dir === -1 ? i - 1 : i + 1;
  rest.splice(at, 0, ...block);
  return { rows: normalizeRows(rest), index: at };
}
