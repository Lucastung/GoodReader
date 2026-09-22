"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { REPORT_KINDS, REPORT_KIND_LABEL, type ReportKind } from "@/lib/reports";

const HINT: Record<ReportKind, string> = {
  content: "例如：P3 第二句有錯字、第 2 題的答案不對、解析跟原文不符……",
  copyright: "例如：這篇是某某出版社的作品，出處在……（有網址更好）",
};

/** 文章下方的「回報問題」：內容錯誤、版權問題，送到後台「檢舉」頁 */
export function ReportButton({ articleId, paragraphIds }: { articleId: string; paragraphIds: string[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ReportKind>("content");
  const [paragraph, setParagraph] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/articles/${articleId}/reports`, {
        method: "POST",
        body: JSON.stringify({ kind, paragraph: paragraph || null, message }),
      });
      setDone(true);
      setMessage("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <p className="report-done">
        已送出，謝謝你！老師會盡快查看。
        <button type="button" className="link" onClick={() => { setDone(false); setOpen(false); }}>
          關閉
        </button>
      </p>
    );

  if (!open)
    return (
      <button type="button" className="link report-toggle" onClick={() => setOpen(true)}>
        ⚑ 回報問題
      </button>
    );

  return (
    <div className="report-box">
      <div className="report-head">
        <b>回報這篇文章的問題</b>
        <button type="button" className="link" onClick={() => setOpen(false)}>
          取消
        </button>
      </div>
      <div className="seg" role="radiogroup" aria-label="問題類型">
        {REPORT_KINDS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
            {REPORT_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <label className="report-field">
        <span>在哪一段（選填）</span>
        <select value={paragraph} onChange={(e) => setParagraph(e.target.value)}>
          <option value="">不確定／整篇</option>
          {paragraphIds.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <textarea rows={3} maxLength={500} value={message} placeholder={HINT[kind]} onChange={(e) => setMessage(e.target.value)} aria-label="問題說明" />
      {err && <p className="error small">{err}</p>}
      <button type="button" className="primary small-btn" disabled={busy || message.trim().length < 5} onClick={send}>
        {busy ? "送出中…" : "送出"}
      </button>
    </div>
  );
}
