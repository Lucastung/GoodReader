"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import { GENRES, LICENSES } from "@/lib/schemas";
import { fmtTime, useAdmin } from "../../AdminShell";
import { LICENSE_LABEL, ORIGIN_LABEL, STATUS_LABEL } from "../labels";
import { QuizPanel, type QuizInfo } from "./QuizPanel";

type Form = {
  title: string;
  author: string;
  era: string;
  genre: string;
  series: string;
  difficulty: number;
  license: string;
  url: string;
  notes: string;
  body: string; // 段落以空行分隔
};
type Meta = {
  status: keyof typeof STATUS_LABEL;
  origin: string;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
type Keypoints = {
  centralIdea: string;
  structure: string;
  vernacular?: string | null;
  keyPoints: { id: string; text: string; importance: string; paragraphs: string[] }[];
  referenceOutline: { text: string; children?: { text: string; children?: unknown[] }[] }[];
};

const EMPTY: Form = { title: "", author: "", era: "", genre: "記敘文", series: "", difficulty: 2, license: "original", url: "", notes: "", body: "" };
const splitBody = (b: string) =>
  b
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, "").trim())
    .filter(Boolean);
const countHan = (s: string) => (s.match(/\p{Script=Han}/gu) || []).length;

export default function TextEditor() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const me = useAdmin();
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [sessions, setSessions] = useState(0);
  const [kp, setKp] = useState<{ model: string; createdAt?: string; data: Keypoints } | null>(null);
  const [quiz, setQuiz] = useState<{ info: QuizInfo; attempts: { count: number; avgCorrect: number | null } }>({
    info: null,
    attempts: { count: 0, avgCorrect: null },
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loaded, setLoaded] = useState(isNew);
  /** 已經用過的系列，給輸入框當建議清單，避免同一個系列打出兩種寫法 */
  const [seriesOptions, setSeriesOptions] = useState<string[]>([]);

  useEffect(() => {
    api<{ series: string[] }>("/api/admin/articles?status=")
      .then((d) => setSeriesOptions(d.series ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const d = await api<{
        article: Meta & { title: string; author: string; era: string | null; genre: string; series: string | null; difficulty: number; license: string; url: string | null; notes: string | null; paragraphs: string[] };
        keypoints: { model: string; createdAt: string; data: Keypoints } | null;
        quiz: QuizInfo;
        quizAttempts: { count: number; avgCorrect: number | null };
        sessions: number;
      }>(`/api/admin/articles/${id}`);
      const a = d.article;
      const f: Form = {
        title: a.title,
        author: a.author,
        era: a.era ?? "",
        genre: a.genre,
        series: a.series ?? "",
        difficulty: a.difficulty,
        license: a.license,
        url: a.url ?? "",
        notes: a.notes ?? "",
        body: a.paragraphs.join("\n\n"),
      };
      setForm(f);
      setSaved(f);
      setMeta(a);
      setKp(d.keypoints);
      setQuiz({ info: d.quiz, attempts: d.quizAttempts });
      setSessions(d.sessions);
      setLoaded(true);
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  }, [id, isNew]);
  useEffect(() => {
    load();
  }, [load]);

  const paragraphs = useMemo(() => splitBody(form.body), [form.body]);
  const chars = paragraphs.reduce((n, p) => n + countHan(p), 0);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function run(label: string, fn: () => Promise<string | void>) {
    setBusy(label);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const payload = () =>
    JSON.stringify({
      title: form.title,
      author: form.author,
      era: form.era || null,
      genre: form.genre,
      series: form.series.trim() || null,
      difficulty: form.difficulty,
      license: form.license,
      url: form.url || null,
      notes: form.notes || null,
      paragraphs,
    });

  const save = () =>
    run("save", async () => {
      if (isNew) {
        const r = await api<{ id: string }>("/api/admin/articles", { method: "POST", body: payload() });
        router.replace(`/admin/texts/${r.id}`);
        return;
      }
      const r = await api<{ textChanged: boolean }>(`/api/admin/articles/${id}`, { method: "PUT", body: payload() });
      await load();
      return r.textChanged ? "已儲存。正文有改，要點底稿與閱讀測驗題目已清除，請重新產生檢查。" : "已儲存";
    });

  const setStatus = (status: string, text: string) =>
    run(status, async () => {
      if (dirty) throw new Error("有未儲存的修改，請先儲存");
      await api(`/api/admin/articles/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
      await load();
      return text;
    });

  const genKp = () =>
    run("kp", async () => {
      if (dirty) throw new Error("有未儲存的修改，請先儲存");
      const r = await api<{ keypoints: Keypoints }>(`/api/admin/articles/${id}/keypoints`, { method: "POST" });
      setKp({ model: "剛產生", data: r.keypoints });
      return "要點底稿已產生";
    });

  const del = () =>
    run("del", async () => {
      if (!window.confirm(`確定刪除「${saved.title}」？刪除後無法復原。`)) return;
      await api(`/api/admin/articles/${id}`, { method: "DELETE" });
      router.replace("/admin/texts");
    });

  if (!loaded) return msg ? <p className="error">{msg.text}</p> : <p className="muted">載入中…</p>;

  return (
    <>
      <div className="toolbar">
        <Link href="/admin/texts">← 範文列表</Link>
        {meta && (
          <>
            <span className={`badge ${meta.status}`}>{STATUS_LABEL[meta.status]}</span>
            <span className="small muted">
              {ORIGIN_LABEL[meta.origin] ?? meta.origin}・建立 {fmtTime(meta.created_at)}
              {meta.created_by ? `（${meta.created_by}）` : ""}
              {meta.reviewed_at ? `・上架審核 ${meta.reviewed_by}，${fmtTime(meta.reviewed_at)}` : ""}・練習 {sessions} 次
            </span>
          </>
        )}
        <span className="spacer" />
        {meta?.status !== "approved" && !isNew && (
          <button className="btn ok" disabled={!!busy} onClick={() => setStatus("approved", "已上架，學生現在看得到這篇")}>
            ✓ 審核通過並上架
          </button>
        )}
        {meta?.status === "approved" && (
          <button className="btn" disabled={!!busy} onClick={() => setStatus("archived", "已下架")}>
            下架
          </button>
        )}
        {meta?.status === "archived" && (
          <button className="btn" disabled={!!busy} onClick={() => setStatus("draft", "已退回待審")}>
            退回待審
          </button>
        )}
        {me.role === "admin" && !isNew && sessions === 0 && (
          <button className="btn danger" disabled={!!busy} onClick={del}>
            刪除
          </button>
        )}
      </div>
      {msg && <p className={`msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>}

      <div className="two">
        <div className="panel">
          <h3>{isNew ? "新增範文" : "編輯"}</h3>
          <div className="form-grid">
            <label className="field full">
              <span>標題</span>
              <input value={form.title} maxLength={60} onChange={(e) => set("title", e.target.value)} />
            </label>
            <label className="field">
              <span>作者</span>
              <input value={form.author} maxLength={40} onChange={(e) => set("author", e.target.value)} />
            </label>
            <label className="field">
              <span>時代</span>
              <input value={form.era} maxLength={20} placeholder="例如：唐、現代" onChange={(e) => set("era", e.target.value)} />
            </label>
            <label className="field">
              <span>文體</span>
              <select value={form.genre} onChange={(e) => set("genre", e.target.value)}>
                {GENRES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>系列</span>
              <input
                value={form.series}
                maxLength={30}
                list="series-list"
                placeholder="例如：釣魚（可留空）"
                onChange={(e) => set("series", e.target.value)}
              />
              <datalist id="series-list">
                {seriesOptions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>難度（國中 1–3、高中 3–5）</span>
              <select value={form.difficulty} onChange={(e) => set("difficulty", Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>授權</span>
              <select value={form.license} onChange={(e) => set("license", e.target.value)}>
                {LICENSES.map((l) => (
                  <option key={l} value={l}>
                    {LICENSE_LABEL[l] ?? l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>出處網址（選填）</span>
              <input value={form.url} maxLength={500} onChange={(e) => set("url", e.target.value)} />
            </label>
            <label className="field full">
              <span>
                正文（段落之間空一行）・{paragraphs.length} 段・{chars} 字
              </span>
              <textarea rows={16} value={form.body} onChange={(e) => set("body", e.target.value)} style={{ fontFamily: "var(--serif)", lineHeight: 1.8 }} />
            </label>
            <label className="field full">
              <span>審稿備註（學生看不到）</span>
              <textarea rows={3} value={form.notes} maxLength={2000} onChange={(e) => set("notes", e.target.value)} />
            </label>
          </div>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="primary sm" disabled={!!busy || (!dirty && !isNew)} onClick={save}>
              {busy === "save" ? "儲存中…" : isNew ? "建立草稿" : "儲存"}
            </button>
            {dirty && !isNew && (
              <button className="btn" onClick={() => setForm(saved)}>
                放棄修改
              </button>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <h3>學生看到的樣子</h3>
            <div className="reader-preview">
              <h2 style={{ marginTop: 0 }}>{form.title || "（標題）"}</h2>
              <p className="small muted" style={{ fontFamily: "var(--sans)" }}>
                {[form.era, form.author].filter(Boolean).join("・")}
              </p>
              {paragraphs.map((p, i) => (
                <p key={i}>
                  <span className="pid">P{i + 1}</span>
                  {p}
                </p>
              ))}
            </div>
          </div>

          {!isNew && (
            <div className="panel">
              <h3>要點底稿（評分依據）</h3>
              <p className="small muted">
                評分時 AI 會拿這份底稿對照學生的大綱與摘要。上架前請確認中心思想與要點正確；不對就修改正文或重新產生。
              </p>
              {kp ? (
                <>
                  <p>
                    <b>中心思想：</b>
                    {kp.data.centralIdea}
                  </p>
                  <p>
                    <b>結構：</b>
                    {kp.data.structure}
                  </p>
                  {kp.data.vernacular && (
                    <p>
                      <b>白話大意：</b>
                      {kp.data.vernacular}
                    </p>
                  )}
                  <ol className="kp-list">
                    {kp.data.keyPoints.map((k) => (
                      <li key={k.id}>
                        {k.text} <span className="small muted">（{k.importance}・{k.paragraphs.join("、")}）</span>
                      </li>
                    ))}
                  </ol>
                  <p className="small muted">
                    模型：{kp.model}
                    {kp.createdAt ? `・${fmtTime(kp.createdAt)}` : ""}
                  </p>
                </>
              ) : (
                <p className="muted small">還沒產生。學生第一次練習時也會自動產生。</p>
              )}
              <button className="btn" disabled={!!busy} onClick={genKp}>
                {busy === "kp" ? "產生中…（約 10–30 秒）" : kp ? "重新產生" : "產生要點底稿"}
              </button>
            </div>
          )}

          {!isNew && <QuizPanel articleId={id} initial={quiz.info} attempts={quiz.attempts} dirty={dirty} />}
        </div>
      </div>
    </>
  );
}
