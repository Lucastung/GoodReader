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
