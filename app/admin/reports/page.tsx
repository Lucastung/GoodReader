"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { REPORT_KINDS, REPORT_KIND_LABEL, REPORT_STATUSES, REPORT_STATUS_LABEL, type ReportRow, type ReportStatus } from "@/lib/reports";
import { fmtTime } from "../AdminShell";
import { STATUS_LABEL } from "../texts/labels";

type Data = { reports: ReportRow[]; counts: Record<string, number> };

export default function ReportsPage() {
  const [status, setStatus] = useState<string>("open");
  const [kind, setKind] = useState("");
  const [article, setArticle] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // 從範文編輯頁點進來會帶 ?article=
  useEffect(() => {
    setArticle(new URLSearchParams(window.location.search).get("article") ?? "");
  }, []);

  const load = useCallback(() => {
    const p = new URLSearchParams({ status, kind, article });
    api<Data>(`/api/admin/reports?${p}`)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e) => setErr(e.message));
  }, [status, kind, article]);
  useEffect(() => {
    load();
  }, [load]);

  const c = data?.counts ?? {};
  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {([...REPORT_STATUSES, ""] as const).map((s) => (
            <button key={s || "all"} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {s ? REPORT_STATUS_LABEL[s] : "全部"}{" "}
              <span className="muted small">{s ? (c[s] ?? 0) : Object.values(c).reduce((a, b) => a + b, 0)}</span>
            </button>
          ))}
        </div>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="類型">
          <option value="">全部類型</option>
          {REPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {REPORT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        {article && (
          <span className="small">
            只看這篇{data?.reports[0]?.article_title ? `「${data.reports[0].article_title}」` : ""}
            <button className="link" onClick={() => setArticle("")}>
              看全部
            </button>
          </span>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      <div className="report-list">
        {data?.reports.map((r) => (
          <ReportItem key={r.id} r={r} onChanged={load} onFilter={() => setArticle(r.article_id)} />
        ))}
        {data && !data.reports.length && <p className="muted">{status === "open" ? "沒有未處理的檢舉。" : "沒有符合的檢舉。"}</p>}
      </div>
      <p className="small muted">
        學生在練習頁文章下方按「回報問題」送來的。內容錯誤請到範文頁修改（正文改了會清掉要點與題目，要重新產生）；版權有疑慮請先下架再查證。
      </p>
    </>
  );
}

function ReportItem({ r, onChanged, onFilter }: { r: ReportRow; onChanged: () => void; onFilter: () => void }) {
  const [note, setNote] = useState(r.handle_note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function set(status: ReportStatus) {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/admin/reports/${r.id}`, { method: "POST", body: JSON.stringify({ status, note: note || null }) });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className={`panel report-item ${r.status}`}>
      <div className="toolbar">
        <span className={`badge ${r.kind === "copyright" ? "off" : "draft"}`}>{REPORT_KIND_LABEL[r.kind]}</span>
        {r.article_title ? (
          <Link href={`/admin/texts/${r.article_id}`}>
            <b>{r.article_title}</b>
          </Link>
        ) : (
          <span className="muted">（文章已刪除）</span>
        )}
        {r.article_status && r.article_status !== "approved" && (
          <span className={`badge ${r.article_status}`}>{STATUS_LABEL[r.article_status as keyof typeof STATUS_LABEL] ?? r.article_status}</span>
        )}
        {r.paragraph && <span className="small">・{r.paragraph}</span>}
        <button className="link small" onClick={onFilter}>
          這篇的所有檢舉
        </button>
        <span className="spacer" />
        <span className="small muted">
          {r.user_name || r.user_id.slice(0, 8)}・{fmtTime(r.created_at)}
        </span>
      </div>
      <p className="report-msg">{r.message}</p>
      {r.status === "open" ? (
        <div className="toolbar">
          <input value={note} maxLength={500} placeholder="處理說明（選填，學生看不到）" onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <button className="btn ok" disabled={busy} onClick={() => set("resolved")}>
            ✓ 已處理
          </button>
          <button className="btn" disabled={busy} onClick={() => set("dismissed")}>
            不處理
          </button>
        </div>
      ) : (
        <div className="toolbar small muted">
          <span>
            {REPORT_STATUS_LABEL[r.status]}・{r.handled_by}・{fmtTime(r.handled_at)}
            {r.handle_note ? `：${r.handle_note}` : ""}
          </span>
          <span className="spacer" />
          <button className="link small" disabled={busy} onClick={() => set("open")}>
            改回未處理
          </button>
        </div>
      )}
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
