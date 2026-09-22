"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { GENRES } from "@/lib/schemas";
import { fmtDate } from "../AdminShell";
import { ORIGIN_LABEL, STATUS_LABEL } from "./labels";

type Row = {
  id: string;
  title: string;
  author: string;
  genre: string;
  series: string | null;
  difficulty: number;
  char_count: number;
  status: "draft" | "approved" | "archived";
  origin: string;
  license: string;
  updated_at: string | null;
  created_at: string;
  reviewed_by: string | null;
  sessions: number;
  avg_best: number | null;
};


type Data = { articles: Row[]; counts: Record<string, number>; series: string[] };

export default function TextsPage() {
  const [status, setStatus] = useState<string>("draft");
  const [genre, setGenre] = useState("");
  const [series, setSeries] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [panel, setPanel] = useState<"none" | "generate" | "import">("none");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(() => {
    const p = new URLSearchParams({ status, genre, series, q });
    api<Data>(`/api/admin/articles?${p}`)
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e) => setErr(e.message));
  }, [status, genre, series, q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const c = data?.counts ?? {};
  return (
    <>
      <div className="toolbar">
        <div className="tabs" role="tablist">
          {(["draft", "approved", "archived", ""] as const).map((s) => (
            <button key={s || "all"} className={status === s ? "on" : ""} onClick={() => setStatus(s)}>
              {s ? STATUS_LABEL[s] : "全部"}{" "}
              <span className="muted small">
                {s ? (c[s] ?? 0) : Object.values(c).reduce((a, b) => a + b, 0)}
              </span>
            </button>
          ))}
        </div>
        <select value={genre} onChange={(e) => setGenre(e.target.value)} aria-label="文體">
          <option value="">全部文體</option>
          {GENRES.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        {!!data?.series.length && (
          <select value={series} onChange={(e) => setSeries(e.target.value)} aria-label="系列">
            <option value="">全部系列</option>
            {data.series.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        )}
        <input type="search" placeholder="搜尋標題或作者" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <button className="btn" onClick={() => setPanel(panel === "generate" ? "none" : "generate")}>
          ✨ AI 撰寫
        </button>
        <button className="btn" onClick={() => setPanel(panel === "import" ? "none" : "import")}>
          匯入 JSON
        </button>
        <Link className="primary sm" href="/admin/texts/new" style={{ textDecoration: "none" }}>
          ＋ 新增
        </Link>
      </div>

      {panel === "generate" && (
        <GeneratePanel
          onDone={(ids) => {
            setPanel("none");
            if (ids.length === 1) router.push(`/admin/texts/${ids[0]}`);
            else {
              setStatus("draft");
              load();
            }
          }}
        />
      )}
      {panel === "import" && (
        <ImportPanel
          onDone={() => {
            setStatus("draft");
            load();
          }}
        />
      )}
      {err && <p className="error">{err}</p>}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>標題</th>
              <th>作者</th>
              <th>文體</th>
              <th>系列</th>
              <th className="num">難度</th>
              <th className="num">字數</th>
              <th>狀態</th>
              <th>來源</th>
              <th className="num">練習學生數</th>
              <th className="num">平均最高分</th>
              <th>更新</th>
            </tr>
          </thead>
          <tbody>
            {data?.articles.map((a) => (
              <tr key={a.id} className="click" onClick={() => router.push(`/admin/texts/${a.id}`)}>
                <td className="wrap">
                  <Link href={`/admin/texts/${a.id}`}>{a.title}</Link>
                </td>
                <td>{a.author}</td>
                <td>{a.genre}</td>
                <td>{a.series ?? "—"}</td>
                <td className="num">{a.difficulty}</td>
                <td className="num">{a.char_count}</td>
                <td>
                  <span className={`badge ${a.status}`}>{STATUS_LABEL[a.status]}</span>
                </td>
                <td>{ORIGIN_LABEL[a.origin] ?? a.origin}</td>
                <td className="num">{a.sessions}</td>
                <td className="num">{a.avg_best == null ? "—" : Math.round(a.avg_best)}</td>
                <td>{fmtDate(a.updated_at ?? a.created_at)}</td>
              </tr>
            ))}
            {data && !data.articles.length && (
              <tr>
                <td colSpan={11} className="muted">
                  {status === "draft" ? "沒有待審的文章。可以用「AI 撰寫」或「匯入 JSON」加一些。" : "沒有符合的文章"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="small muted">只有「已上架」的文章會出現在學生端。學生做過的文章不能刪除，只能下架。</p>
    </>
  );
}

function GeneratePanel({ onDone }: { onDone: (ids: string[]) => void }) {
  const [genre, setGenre] = useState("記敘文");
  const [difficulty, setDifficulty] = useState(2);
  const [length, setLength] = useState(600);
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ created: { id: string }[] }>("/api/admin/articles/generate", {
        method: "POST",
        body: JSON.stringify({ genre, difficulty, length, topic: topic || undefined, notes: notes || undefined, count }),
      });
      onDone(r.created.map((c) => c.id));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h3>AI 撰寫範文</h3>
      <p className="small muted">
        由 DeepSeek 寫原創文章，存成「待審」草稿。文言文不開放 AI 撰寫，請用匯入古文。產生後請務必審稿：事實、用字、價值觀、難度是否合適。
      </p>
      <div className="form-grid">
        <label className="field">
          <span>文體</span>
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            {["記敘文", "散文", "議論文", "說明文"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>難度</span>
          <select value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                {d}（{["國一", "國二", "國三／高一", "高二", "高三"][d - 1]}）
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>字數</span>
          <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
            {[300, 450, 600, 800, 1000, 1300].map((n) => (
              <option key={n} value={n}>
                約 {n} 字
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>篇數</span>
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            {[1, 2, 3].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="field full">
          <span>主題（選填）</span>
          <input value={topic} maxLength={100} placeholder="例如：第一次搭夜車去外婆家、手機該不該帶進教室、珊瑚白化" onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label className="field full">
          <span>其他要求（選填）</span>
          <input value={notes} maxLength={300} placeholder="例如：結尾要有轉折、用總分總結構、至少舉兩個例子" onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button className="primary sm" disabled={busy} onClick={go}>
          {busy ? "撰寫中…（約 20–60 秒）" : "開始撰寫"}
        </button>
        {err && <span className="error small">{err}</span>}
      </div>
    </div>
  );
}

const IMPORT_EXAMPLE = `[
  {
    "title": "陋室銘",
    "author": "劉禹錫",
    "era": "唐",
    "genre": "文言文",
    "series": "古文選讀",
    "difficulty": 1,
    "license": "public-domain",
    "paragraphs": ["山不在高，有仙則名。……"],
    "keypoints": { "...": "選填，附上就不用再請 AI 產生" },
    "quiz": { "questions": ["...選填，5 題四選一"] }
  }
]`;

const IMPORT_BATCH = 100; // 與 /api/admin/articles/import 上限一致

/** 接受 JSON 陣列或 { articles: [...] } */
function toList(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const a = (body as { articles?: unknown } | null)?.articles;
  return Array.isArray(a) ? a : null;
}

function ImportPanel({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function loadFiles(list: FileList | null) {
    if (!list?.length) return;
    setMsg(null);
    const merged: unknown[] = [];
    const names: string[] = [];
    for (const f of Array.from(list)) {
      if (!/\.json$/i.test(f.name)) {
        setMsg({ ok: false, text: `${f.name} 不是 .json 檔` });
        return;
      }
      let items: unknown[] | null = null;
      try {
        items = toList(JSON.parse(await f.text()));
      } catch {
        /* 下面統一報錯 */
      }
      if (!items) {
        setMsg({ ok: false, text: `${f.name} 不是有效的 JSON 陣列` });
        return;
      }
      merged.push(...items);
      names.push(`${f.name}（${items.length} 篇）`);
    }
    setFiles(names);
    setText(JSON.stringify(merged, null, 2));
  }

  async function go() {
    let list: unknown[] | null = null;
    try {
      list = toList(JSON.parse(text));
    } catch {
      /* 下面統一報錯 */
    }
    if (!list) {
      setMsg({ ok: false, text: "JSON 格式錯誤，請檢查逗號與引號（需要是陣列）" });
      return;
    }
    if (!list.length) {
      setMsg({ ok: false, text: "沒有文章可匯入" });
      return;
    }
    setBusy(true);
    setMsg(null);
    let created = 0;
    const skipped: string[] = [];
    try {
      // 超過 100 篇自動分批送出
      for (let start = 0; start < list.length; start += IMPORT_BATCH) {
        const r = await api<{ created: string[]; skipped: { index: number; title?: string; reason: string }[] }>(
          "/api/admin/articles/import",
          { method: "POST", body: JSON.stringify(list.slice(start, start + IMPORT_BATCH)) },
        );
        created += r.created.length;
        skipped.push(...r.skipped.map((s) => `#${start + s.index + 1} ${s.title ?? ""} ${s.reason}`));
      }
      setMsg({
        ok: !skipped.length,
        text: `匯入 ${created} 篇（草稿）` + (skipped.length ? `；略過 ${skipped.length} 篇：` + skipped.join("；") : ""),
      });
    } catch (e) {
      setMsg({ ok: false, text: `${created ? `已匯入 ${created} 篇後中斷：` : ""}${(e as Error).message}` });
    } finally {
      setBusy(false);
      if (created) onDone();
    }
  }

  return (
    <div
      className="panel"
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        loadFiles(e.dataTransfer.files);
      }}
      style={drag ? { outline: "2px dashed var(--accent)", outlineOffset: -4 } : undefined}
    >
      <h3>批次匯入</h3>
      <p className="small muted">
        上傳 .json 檔（可多選，或直接拖進這個框），或貼上 JSON 陣列（格式同 data/classics.json）。全部存成待審草稿，超過 100 篇會自動分批；id 重複的會略過。每個元素一段文字；genre 可用：{GENRES.join("、")}；license
        可用：public-domain、cc-by、cc-by-sa、ai-generated、authorized、original。series（系列，例如「釣魚」）選填；另可附 keypoints（要點底稿）與 quiz（5 題四選一），附了就不必再請 AI 產生。
      </p>
      <div className="toolbar" style={{ marginBottom: 8 }}>
        <label className="btn sm" style={{ cursor: "pointer" }}>
          選擇檔案…
          <input
            type="file"
            accept=".json,application/json"
            multiple
            hidden
            onChange={(e) => {
              loadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && <span className="small muted">已載入：{files.join("、")}</span>}
      </div>
      <textarea
        rows={10}
        value={text}
        placeholder={IMPORT_EXAMPLE}
        onChange={(e) => {
          setText(e.target.value);
          setFiles([]);
        }}
        style={{ fontFamily: "monospace", fontSize: "0.85rem" }}
      />
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="primary sm" disabled={busy || !text.trim()} onClick={go}>
          {busy ? "匯入中…" : "匯入"}
        </button>
        {msg && <span className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
