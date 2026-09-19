"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GradeResult } from "@/lib/grader";
import { blockEnd, moveBlock, normalizeRows, shiftBlock, type OutlineRow } from "@/lib/outline";
import type { OutlineNode } from "@/lib/schemas";
import { COPY_LEVEL_TEXT } from "@/lib/textcheck";
import { MicButton } from "./speech";

export type AttemptResult = Omit<GradeResult, "copyRatio"> & { attemptId: string; readSeconds: number; tokens?: number };

export const LEVEL_CLASS: Record<string, string> = { 優: "lv-a", 良: "lv-b", 尚可: "lv-c", 待加強: "lv-d" };

const DRAG_TIP_KEY = "rd.outlineDragTip";
/** 往左右拖多少像素算一層 */
const LEVEL_STEP = 28;

type Drag = {
  pointerId: number;
  index: number; // 被拖的列目前在第幾列
  startX: number;
  startY: number;
  baseLevel: number; // 開始左右拖時的層級
  applied: number; // 已套用的層級變化
  axis: "x" | "y" | null;
};

export function OutlineEditor({ rows, onChange }: { rows: OutlineRow[]; onChange: (r: OutlineRow[]) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const rowEls = useRef<(HTMLDivElement | null)[]>([]);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if (focusIdx != null) refs.current[focusIdx]?.focus();
  }, [focusIdx, rows.length]);

  useEffect(() => {
    try {
      setShowTip(localStorage.getItem(DRAG_TIP_KEY) !== "1");
    } catch {
      setShowTip(true);
    }
  }, []);
  const hideTip = () => {
    setShowTip(false);
    try {
      localStorage.setItem(DRAG_TIP_KEY, "1");
    } catch {
      /* 無痕模式忽略 */
    }
  };

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dictBase = useRef(new Map<number, string>());

  const update = (next: OutlineRow[]) => onChange(normalizeRows(next));
  /** 聽寫：暫時結果即時顯示，最終結果接在原本文字後面 */
  const dictate = (i: number, text: string, final: boolean) => {
    const cur = rowsRef.current;
    if (!cur[i]) return;
    if (!dictBase.current.has(i)) dictBase.current.set(i, cur[i].text);
    const base = dictBase.current.get(i)!;
    update(cur.map((r, j) => (j === i ? { ...r, text: base + text } : r)));
    if (final) dictBase.current.delete(i);
  };
  const setText = (i: number, text: string) => update(rows.map((r, j) => (j === i ? { ...r, text } : r)));
  const shift = (i: number, d: number) => onChange(shiftBlock(rowsRef.current, i, d));
  const move = (i: number, dir: -1 | 1) => {
    const r = moveBlock(rowsRef.current, i, dir);
    onChange(r.rows);
    return r.index;
  };
  const insertAfter = (i: number) => {
    const next = [...rows];
    next.splice(i + 1, 0, { text: "", level: rows[i]?.level ?? 0 });
    update(next);
    setFocusIdx(i + 1);
  };
  const remove = (i: number) => {
    if (rows.length === 1) return update([{ text: "", level: 0 }]);
    update(rows.filter((_, j) => j !== i));
    setFocusIdx(Math.max(0, i - 1));
  };

  // ---- 拖拉圓點：左右＝調整層級，上下＝調整順序 ----
  const onPointerDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      pointerId: e.pointerId,
      index: i,
      startX: e.clientX,
      startY: e.clientY,
      baseLevel: rowsRef.current[i].level,
      applied: 0,
      axis: null,
    };
    setDragIdx(i);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") d.baseLevel = rowsRef.current[d.index].level;
    }
    if (d.axis === "x") {
      const want = Math.round(dx / LEVEL_STEP);
      if (want !== d.applied) {
        const next = shiftBlock(rowsRef.current, d.index, want - d.applied);
        d.applied = next[d.index].level - d.baseLevel;
        rowsRef.current = next;
        onChange(next);
      }
    } else {
      // 手指越過上一列／下一列的中線就換位置
      let idx = d.index;
      for (let guard = 0; guard < 50; guard++) {
        const cur = rowsRef.current;
        const above = rowEls.current[idx - 1]?.getBoundingClientRect();
        const endIdx = blockEnd(cur, idx);
        const below = rowEls.current[endIdx]?.getBoundingClientRect();
        let dir: -1 | 1 | 0 = 0;
        if (above && idx > 0 && e.clientY < above.top + above.height / 2) dir = -1;
        else if (below && endIdx < cur.length && e.clientY > below.top + below.height / 2) dir = 1;
        if (!dir) break;
        const r = moveBlock(cur, idx, dir);
        if (r.index === idx) break;
        rowsRef.current = r.rows;
        idx = r.index;
      }
      if (idx !== d.index) {
        d.index = idx;
        setDragIdx(idx);
        onChange(rowsRef.current);
      }
    }
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (d.axis) hideTip(); // 會拖了就不用再提示
    else refs.current[d.index]?.focus(); // 只是點一下：把游標移到那一條
    drag.current = null;
    setDragIdx(null);
  };

  /** 圓點也能用鍵盤：← → 調層級、↑ ↓ 調順序 */
  const onHandleKey = (i: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key;
    if (k === "ArrowRight" || k === "ArrowLeft") {
      e.preventDefault();
      shift(i, k === "ArrowRight" ? 1 : -1);
    } else if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const to = move(i, k === "ArrowUp" ? -1 : 1);
      requestAnimationFrame(() => rowEls.current[to]?.querySelector<HTMLButtonElement>(".handle")?.focus());
    }
  };

  return (
    <div className="outline">
      {showTip && (
        <p className="drag-tip">
          <span>
            按住左邊的 <b>●</b> 往右拉，變成上一條的細項；往左拉退回。上下拉可以調整順序。
          </span>
          <button type="button" className="linkish" onClick={hideTip}>
            知道了
          </button>
        </p>
      )}
      {rows.map((r, i) => (
        <div
          key={i}
          ref={(el) => {
            rowEls.current[i] = el;
          }}
          className={`outline-row${dragIdx === i ? " dragging" : ""}`}
          style={{ paddingLeft: `${r.level * 1.5}rem` }}
        >
          <button
            type="button"
            className="handle"
            aria-label={`第 ${i + 1} 條，第 ${r.level + 1} 層。拖曳或用方向鍵調整層級與順序`}
            title="按住拖曳：左右調層級、上下調順序"
            onPointerDown={onPointerDown(i)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onHandleKey(i)}
          >
            {["●", "○", "▪"][r.level]}
          </button>
          <input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={r.text}
            onChange={(e) => setText(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; // 注音輸入選字時不處理
              if (e.key === "Enter") {
                e.preventDefault();
                insertAfter(i);
              } else if (e.key === "Tab") {
                e.preventDefault();
                shift(i, e.shiftKey ? -1 : 1);
              } else if (e.key === "Backspace" && r.text === "" && rows.length > 1) {
                e.preventDefault();
                remove(i);
              }
            }}
            placeholder={i === 0 ? "例：第一段：漁人發現桃花林" : ""}
            aria-label={`大綱第 ${i + 1} 條`}
          />
          <div className="row-tools">
            <MicButton onText={(t, f) => dictate(i, t, f)} label={`語音輸入第 ${i + 1} 條`} />
            <button type="button" onClick={() => remove(i)} aria-label="刪除">
              ×
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => insertAfter(rows.length - 1)}>
        ＋ 新增一條
      </button>
    </div>
  );
}

export function ResultView({
  result,
  history,
  onJump,
  onNext,
  grade,
  spot,
  nextLabel = "換一篇",
  forceShowRef,
}: {
  result: AttemptResult;
  history: number[];
  onJump: (pid?: string | null) => void;
  onNext: () => void;
  grade: "junior" | "senior";
  /** 導覽模式：要強調的區塊 */
  spot?: string | null;
  nextLabel?: string;
  forceShowRef?: boolean;
}) {
  const [showRefState, setShowRef] = useState(false);
  const showRef = forceShowRef || showRefState;
  const sp = (k: string) => (spot === k ? " spot" : "");
  const outlineMax = useMemo(
    () => result.items.filter((i) => i.criterion.startsWith("outline")).reduce((n, i) => n + i.max, 0),
    [result.items],
  );

  return (
    <section id="result" className="result card">
      <div className={"score-head" + sp("total")} data-tour="total">
        <div className="total">
          <span className="num">{result.total}</span>
          <span className="of">/ 100</span>
        </div>
        <div className="muted small">
          {grade === "junior" ? "國中" : "高中"}配分：大綱 {outlineMax}、摘要 {100 - outlineMax}
          {history.length > 1 && <div>本篇歷次：{history.join(" → ")}</div>}
          <div className={result.copyLevel === "high" ? "error" : ""}>{COPY_LEVEL_TEXT[result.copyLevel]}</div>
        </div>
      </div>

      <ul className={"criteria" + sp("criteria")} data-tour="criteria">
        {result.items.map((it) => (
          <li key={it.criterion}>
            <div className="crit-head">
              <span>{it.label}</span>
              <span className={`level ${LEVEL_CLASS[it.level]}`}>{it.level}</span>
              <span className="pts">
                {it.score}/{it.max}
              </span>
            </div>
            <div className="bar">
              <div style={{ width: `${(it.score / it.max) * 100}%` }} />
            </div>
            <p>{it.reason}</p>
          </li>
        ))}
      </ul>

      {result.strengths.length > 0 && (
        <div className={"block" + sp("strengths")} data-tour="strengths">
          <h3>做得好的地方</h3>
          <ul className="plain">
            {result.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {result.keyPointsMissed.length > 0 && (
        <div className={"block" + sp("missed")} data-tour="missed">
          <h3>可能漏掉的重點</h3>
          <ul className="plain">
            {result.keyPointsMissed.map((m, i) => (
              <li key={i}>
                {m.hint}
                {m.paragraph && (
                  <button className="link" onClick={() => onJump(m.paragraph)}>
                    看 {m.paragraph}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.errors.length > 0 && (
        <div className={"block" + sp("errors")} data-tour="errors">
          <h3>和原文不符的地方</h3>
          <ul className="plain">
            {result.errors.map((e, i) => (
              <li key={i}>
                「{e.quote}」— {e.issue}
                {e.paragraph && (
                  <button className="link" onClick={() => onJump(e.paragraph)}>
                    看 {e.paragraph}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className={"next-step" + sp("next")} data-tour="next">下一步：{result.nextStep}</p>

      <div className={"block" + sp("reference")} data-tour="reference">
      <button className="ghost" onClick={() => setShowRef((v) => !v)}>
        {showRef ? "收起參考答案" : "看參考答案"}
      </button>
      {showRef && (
        <div className="reference">
          <p>
            <b>中心思想：</b>
            {result.reference.centralIdea}
          </p>
          <p>
            <b>結構：</b>
            {result.reference.structure}
          </p>
          {result.reference.vernacular && (
            <p>
              <b>白話大意：</b>
              {result.reference.vernacular}
            </p>
          )}
          <b>參考大綱：</b>
          <OutlineTree nodes={result.reference.outline} />
        </div>
      )}
      </div>

      <div className="actions">
        <button className="primary" onClick={onNext}>
          {nextLabel}
        </button>
      </div>
      <p className="muted small">
        評分模型：{result.model}・評分標準版本 {result.rubricVersion}
      </p>
    </section>
  );
}

export function OutlineTree({ nodes }: { nodes: OutlineNode[] }) {
  return (
    <ul className="tree">
      {nodes.map((n, i) => (
        <li key={i}>
          {n.text}
          {n.children && n.children.length > 0 && <OutlineTree nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}
