"use client";

// 瀏覽器內建語音：朗讀（speechSynthesis）與聽寫（SpeechRecognition）。不呼叫任何付費服務。
import { useCallback, useEffect, useRef, useState } from "react";
import type { Paragraph } from "@/lib/schemas";

// ---------- 朗讀 ----------

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const score = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace("_", "-");
    if (l === "zh-tw" || l.startsWith("zh-hant")) return 3;
    if (l === "zh-hk") return 2;
    if (l.startsWith("zh") || l.startsWith("cmn")) return 1;
    return 0;
  };
  return voices.filter((v) => score(v) > 0).sort((a, b) => score(b) - score(a) || Number(b.localService) - Number(a.localService))[0] ?? null;
}

/** 把段落切成較短的句子，避免部分瀏覽器朗讀長句會中斷 */
function chunk(text: string): string[] {
  const parts = text.match(/[^。！？；]+[。！？；」』]*|[^。！？；]+$/g) ?? [text];
  const out: string[] = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > 80 && buf) {
      out.push(buf);
      buf = p;
    } else buf += p;
  }
  if (buf) out.push(buf);
  return out;
}

export type ReadState = "idle" | "playing" | "paused";

const NOTICE_KEY = "rd.ttsNoticeSeen";
function noticeSeen() {
  try {
    return localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}
function markNoticeSeen() {
  try {
    localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    /* 無痕模式等情況忽略，下次會再提醒一次 */
  }
}

export function useReadAloud(paragraphs: Paragraph[], title?: string) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ReadState>("idle");
  const [current, setCurrent] = useState<string | null>(null);
  const [rate, setRate] = useState(1);
  /** 第一次朗讀前先顯示提醒；值為要開始的段落（"" 代表從頭） */
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (!ok) return;
    window.speechSynthesis.getVoices(); // 觸發語音清單載入
    return () => window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    runId.current++;
    window.speechSynthesis.cancel();
    setState("idle");
    setCurrent(null);
  }, []);

  const start = useCallback(
    (fromId?: string) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const myRun = ++runId.current;
      const voice = pickVoice();
      const start = Math.max(0, fromId ? paragraphs.findIndex((p) => p.id === fromId) : 0);
      const queue: { pid: string | null; text: string }[] = [];
      if (title && start === 0) queue.push({ pid: null, text: title });
      for (const p of paragraphs.slice(start)) for (const t of chunk(p.text)) queue.push({ pid: p.id, text: t });

      let i = 0;
      const next = () => {
        if (runId.current !== myRun) return;
        if (i >= queue.length) {
          setState("idle");
          setCurrent(null);
          return;
        }
        const item = queue[i++];
        const u = new SpeechSynthesisUtterance(item.text);
        u.lang = voice?.lang ?? "zh-TW";
        if (voice) u.voice = voice;
        u.rate = rate;
        u.onstart = () => runId.current === myRun && setCurrent(item.pid);
        u.onend = next;
        u.onerror = (e) => {
          if (e.error !== "interrupted" && e.error !== "canceled") next();
        };
        synth.speak(u);
      };
      setState("playing");
      next();
    },
    [paragraphs, title, rate],
  );

  /** 對外的「開始朗讀」：第一次會先顯示讀音提醒 */
  const play = useCallback(
    (fromId?: string) => {
      if (!noticeSeen()) {
        setPendingNotice(fromId ?? "");
        return;
      }
      start(fromId);
    },
    [start],
  );

  const acceptNotice = useCallback(() => {
    markNoticeSeen();
    const from = pendingNotice;
    setPendingNotice(null);
    start(from || undefined);
  }, [pendingNotice, start]);

  const dismissNotice = useCallback(() => setPendingNotice(null), []);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState("paused");
  }, []);
  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState("playing");
  }, []);

  return {
    supported,
    state,
    current,
    rate,
    setRate,
    play,
    pause,
    resume,
    stop,
    showNotice: pendingNotice !== null,
    acceptNotice,
    dismissNotice,
  };
}

/** 閱讀區上方的朗讀控制列 */
export function ReadAloudBar({ ctl }: { ctl: ReturnType<typeof useReadAloud> }) {
  if (!ctl.supported) return null;
  return (
    <>
    {ctl.showNotice && (
      <div className="tts-notice" role="alertdialog" aria-labelledby="tts-notice-title">
        <p id="tts-notice-title">
          <b>朗讀使用手機或電腦內建的語音功能</b>
        </p>
        <p className="small">
          內建語音不是專為國文設計，某些字（特別是文言文的破音字、古音）讀音可能有錯，請以課本或字典為準。
        </p>
        <div className="tts-notice-actions">
          <button className="primary small-btn" onClick={ctl.acceptNotice}>
            知道了，開始朗讀
          </button>
          <button className="ghost small-btn" onClick={ctl.dismissNotice}>
            先不要
          </button>
        </div>
      </div>
    )}
    <div className="read-aloud" role="group" aria-label="朗讀全文">
      {ctl.state === "idle" && (
        <button className="primary small-btn" onClick={() => ctl.play()}>
          🔊 朗讀全文
        </button>
      )}
      {ctl.state === "playing" && (
        <button className="primary small-btn" onClick={ctl.pause}>
          ⏸ 暫停
        </button>
      )}
      {ctl.state === "paused" && (
        <button className="primary small-btn" onClick={ctl.resume}>
          ▶ 繼續
        </button>
      )}
      {ctl.state !== "idle" && (
        <button className="ghost small-btn" onClick={ctl.stop}>
          ■ 停止
        </button>
      )}
      <select
        value={ctl.rate}
        onChange={(e) => {
          ctl.setRate(Number(e.target.value));
          if (ctl.state !== "idle") ctl.stop();
        }}
        aria-label="朗讀速度"
      >
        <option value={0.75}>慢速</option>
        <option value={1}>正常</option>
        <option value={1.25}>快速</option>
      </select>
      <span className="muted small">點段落編號可從那段開始讀</span>
    </div>
    </>
  );
}

// ---------- 聽寫 ----------

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictationSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(!!getRecognitionCtor()), []);
  return ok;
}

let active: Recognition | null = null; // 同一時間只開一支麥克風

/**
 * 聽寫按鈕：按下開始收音，說完自動停止，辨識結果交給 onText（附加到原本內容後面）。
 * 瀏覽器不支援時不顯示。
 */
export function MicButton({
  onText,
  label = "語音輸入",
  className = "",
}: {
  onText: (text: string, final: boolean) => void;
  label?: string;
  className?: string;
}) {
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.abort(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    active?.abort();
    const Ctor = getRecognitionCtor()!;
    const r = new Ctor();
    r.lang = "zh-TW";
    r.interimResults = true;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        if (e.results[i].isFinal) final = true;
      }
      onText(text, final);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setErr("請允許使用麥克風");
      else if (e.error === "no-speech") setErr("沒有聽到聲音");
      else if (e.error !== "aborted") setErr("語音辨識失敗");
    };
    r.onend = () => {
      setListening(false);
      if (active === r) active = null;
    };
    rec.current = r;
    active = r;
    setErr(null);
    setListening(true);
    r.start();
  }

  return (
    <button
      type="button"
      className={`mic ${listening ? "on" : ""} ${className}`}
      onClick={toggle}
      aria-label={listening ? "停止語音輸入" : label}
      aria-pressed={listening}
      title={err ?? (listening ? "正在聽…再按一次停止" : label)}
    >
      {listening ? "●" : "🎤"}
    </button>
  );
}

/**
 * 把聽寫結果接到既有文字：暫時結果即時顯示，最終結果固定下來。
 * get() 取目前的文字（用 ref，避免拿到舊值），set() 寫回。
 */
export function useDictationTarget(get: () => string, set: (v: string) => void) {
  const base = useRef<string | null>(null);
  return (text: string, final: boolean) => {
    if (base.current === null) base.current = get();
    set(base.current + text);
    if (final) base.current = null;
  };
}
