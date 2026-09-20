"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { AdminOnly } from "../AdminShell";

type Day = { day: string; grades: number; otherCalls: number; tokensIn: number; tokensOut: number; cost: number; active: number; signups: number };
type Model = { kind: string; model: string; calls: number; tokensIn: number; tokensOut: number; cost: number; avgLatencyMs: number | null; priced: boolean };
type Stats = {
  days: number;
  daily: Day[];
  models: Model[];
  summary: { grades: number; totalCost: number; costPerGrade: number | null; monthlyProjection: number };
  totals: { users: number; disabled: number; grades: number; approved: number; drafts: number };
  topUsers: { nickname: string; n: number }[];
  topArticles: { title: string; n: number }[];
  prices: Record<string, { in: number; out: number }>;
};

const KIND: Record<string, string> = { grade: "評分", keypoints: "要點底稿", generate: "AI 撰寫範文", quiz: "閱讀測驗出題" };
const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const int = (n: number) => n.toLocaleString("en-US");

export default function StatsPage() {
  return (
    <AdminOnly>
      <StatsView />
    </AdminOnly>
  );
}

function StatsView() {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<"grades" | "active" | "cost" | "signups">("grades");

  const load = useCallback(() => {
    api<Stats>(`/api/admin/stats?days=${days}`)
      .then(setS)
      .catch((e) => setErr(e.message));
  }, [days]);
  useEffect(() => {
    load();
  }, [load]);

  if (err) return <p className="error">{err}</p>;
  if (!s) return <p className="muted">載入中…</p>;

  const values = s.daily.map((d) => d[metric]);
  const max = Math.max(...values, metric === "cost" ? 0.0001 : 1);
  const unpriced = s.models.filter((m) => !m.priced && m.model !== "mock");

  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? "on" : ""} onClick={() => setDays(d)}>
              近 {d} 天
            </button>
          ))}
        </div>
        <span className="small muted">日期以台灣時間分日；成本是依下方單價估算，實際以 DeepInfra 帳單為準。</span>
      </div>

      <div className="cards">
        <div className="kpi">
          <span>評分次數</span>
          <b>{int(s.summary.grades)}</b>
        </div>
        <div className="kpi">
          <span>模型成本（估）</span>
          <b>{usd(s.summary.totalCost)}</b>
        </div>
        <div className="kpi">
          <span>每次評分成本</span>
          <b>{s.summary.costPerGrade == null ? "—" : usd(s.summary.costPerGrade)}</b>
        </div>
        <div className="kpi">
          <span>照這個速度，每月約</span>
          <b>{usd(s.summary.monthlyProjection)}</b>
        </div>
        <div className="kpi">
          <span>學生帳號</span>
          <b>{int(s.totals.users)}</b>
          {s.totals.disabled ? <span>（停用 {s.totals.disabled}）</span> : null}
        </div>
        <div className="kpi">
          <span>上架／待審範文</span>
          <b>
            {s.totals.approved}／{s.totals.drafts}
          </b>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <div className="tabs">
            {(
              [
                ["grades", "每日評分"],
                ["active", "每日活躍學生"],
                ["signups", "新帳號"],
                ["cost", "每日成本"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={metric === k ? "on" : ""} onClick={() => setMetric(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="bars" role="img" aria-label="每日趨勢">
          {s.daily.map((d) => {
            const v = d[metric];
            return (
              <div
                key={d.day}
                className={`bar ${v ? "" : "zero"}`}
                style={{ height: `${(v / max) * 100}%` }}
                title={`${d.day}：${metric === "cost" ? usd(v) : v}`}
              />
            );
          })}
        </div>
        <div className="bars-x">
          <span>{s.daily[0]?.day}</span>
          <span>最高 {metric === "cost" ? usd(max) : max}</span>
          <span>{s.daily.at(-1)?.day}</span>
        </div>
      </div>

      <div className="panel">
        <h3>模型用量</h3>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>用途</th>
                <th>模型</th>
                <th className="num">次數</th>
                <th className="num">輸入 tokens</th>
                <th className="num">輸出 tokens</th>
                <th className="num">平均回應</th>
                <th className="num">成本（估）</th>
              </tr>
            </thead>
            <tbody>
              {s.models.map((m) => (
                <tr key={m.kind + m.model}>
                  <td>{KIND[m.kind] ?? m.kind}</td>
                  <td>{m.model}</td>
                  <td className="num">{int(m.calls)}</td>
                  <td className="num">{int(m.tokensIn)}</td>
                  <td className="num">{int(m.tokensOut)}</td>
                  <td className="num">{m.avgLatencyMs == null ? "—" : `${(m.avgLatencyMs / 1000).toFixed(1)} 秒`}</td>
                  <td className="num">{m.priced ? usd(m.cost) : <span className="muted">未設單價</span>}</td>
                </tr>
              ))}
              {!s.models.length && (
                <tr>
                  <td colSpan={7} className="muted">
                    這段期間沒有模型呼叫
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="small muted">「要點底稿」與「AI 撰寫範文」從這次更新之後才開始記錄；之前只有評分有紀錄。</p>
      </div>

      <div className="two">
        <div className="panel">
          <h3>最常練習的學生</h3>
          <Ranking rows={s.topUsers.map((r) => [r.nickname, r.n])} unit="次" />
        </div>
        <div className="panel">
          <h3>最常被練習的文章</h3>
          <Ranking rows={s.topArticles.map((r) => [r.title, r.n])} unit="次" />
        </div>
      </div>

      <PriceEditor prices={s.prices} extra={unpriced.map((m) => m.model)} onSaved={load} />
    </>
  );
}

function Ranking({ rows, unit }: { rows: [string, number][]; unit: string }) {
  if (!rows.length) return <p className="muted small">沒有資料</p>;
  return (
    <ol className="kp-list">
      {rows.map(([name, n]) => (
        <li key={name}>
          {name} <span className="muted small">{n} {unit}</span>
        </li>
      ))}
    </ol>
  );
}

function PriceEditor({ prices, extra, onSaved }: { prices: Stats["prices"]; extra: string[]; onSaved: () => void }) {
  const init = () => {
    const rows = Object.entries(prices).map(([model, p]) => ({ model, in: String(p.in), out: String(p.out) }));
    for (const m of extra) if (!prices[m]) rows.push({ model: m, in: "", out: "" });
    return rows;
  };
  const [rows, setRows] = useState(init);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setRows(init()), [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    const out: Record<string, { in: number; out: number }> = {};
    for (const r of rows) {
      if (!r.model.trim()) continue;
      const i = Number(r.in);
      const o = Number(r.out);
      if (r.in === "" || r.out === "" || !Number.isFinite(i) || !Number.isFinite(o)) {
        setMsg({ ok: false, text: `${r.model} 的單價要填數字` });
        return;
      }
      out[r.model.trim()] = { in: i, out: o };
    }
    try {
      await api("/api/admin/stats", { method: "PUT", body: JSON.stringify(out) });
      setMsg({ ok: true, text: "單價已更新，成本已重算" });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }

  const upd = (i: number, k: "model" | "in" | "out", v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <div className="panel">
      <h3>模型單價（美元／百萬 tokens）</h3>
      <p className="small muted">預設值是 2026 年 9 月 DeepInfra 標準方案的公告價。價格調整時在這裡改，所有成本會用新單價重算。</p>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>模型</th>
              <th className="num">輸入</th>
              <th className="num">輸出</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input value={r.model} onChange={(e) => upd(i, "model", e.target.value)} />
                </td>
                <td className="num">
                  <input style={{ width: "7em" }} inputMode="decimal" value={r.in} onChange={(e) => upd(i, "in", e.target.value)} />
                </td>
                <td className="num">
                  <input style={{ width: "7em" }} inputMode="decimal" value={r.out} onChange={(e) => upd(i, "out", e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn" onClick={() => setRows([...rows, { model: "", in: "", out: "" }])}>
          ＋ 加一個模型
        </button>
        <button className="primary sm" onClick={save}>
          儲存單價
        </button>
        {msg && <span className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
