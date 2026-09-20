// 帳號：登入與 Token 都由 lucasact 帳號服務（accounts.lucasact.com）管。
//   登入 cookie lx_session 設在 .lucasact.com，瀏覽器會一起送來；這裡把它交給 accounts（Service Binding RPC）換成使用者。
//   好好讀書自己只存個人設定（年級、自我介紹、自己上傳的頭像），第一次進來時建立。
import { z } from "zod";

/** accounts 的登入 cookie（HttpOnly，Domain=.lucasact.com） */
export const LOGIN_COOKIE = "lx_session";

/** 年級：國一～高三 */
export const GRADE_LEVELS = ["j1", "j2", "j3", "s1", "s2", "s3"] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];
export const GRADE_LEVEL_LABEL: Record<GradeLevel, string> = { j1: "國一", j2: "國二", j3: "國三", s1: "高一", s2: "高二", s3: "高三" };
export const GradeLevelSchema = z.enum(GRADE_LEVELS);
export const BioSchema = z.string().trim().max(60, "自我介紹最多 60 字");

export type User = {
  id: string;
  /** 顯示名稱（accounts 的；在 lucasact.com 的帳號頁改） */
  nickname: string;
  /** Google／Facebook 頭像網址；自己在好好讀書上傳了頭像時用 avatarVersion */
  avatarUrl: string;
  gradeLevel: GradeLevel | null;
  bio: string | null;
  /** 0 = 沒有上傳頭像；大於 0 時頭像網址加 ?v= 這個數字 */
  avatarVersion: number;
  /** 目前的 Token 總數（每月發放＋購買） */
  tokens: number;
  /** 管理員：不扣 Token */
  unlimited: boolean;
  level: AccountsUser["level"];
  verifiedAge: number | null;
};

type ProfileRow = { grade_level: GradeLevel | null; bio: string | null; avatar_version: number; disabled: number };

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** 第一次進來建立個人設定；之後每次更新名字、頭像網址、最後使用時間 */
export async function upsertProfile(db: D1Database, a: AccountsUser): Promise<ProfileRow> {
  const r = await db
    .prepare(
      `INSERT INTO users (id, name, avatar_url) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar_url = excluded.avatar_url, last_seen_at = datetime('now')
       RETURNING grade_level, bio, avatar_version, disabled`,
    )
    .bind(a.id, a.name, a.avatar)
    .first<ProfileRow>();
  return r!;
}

export function toUser(a: AccountsUser, p: ProfileRow, b: AccountsBalance): User {
  return {
    id: a.id,
    nickname: a.name,
    avatarUrl: a.avatar,
    gradeLevel: p.grade_level ?? null,
    bio: p.bio ?? null,
    avatarVersion: p.avatar_version ?? 0,
    tokens: b.unlimited ? 0 : b.total,
    unlimited: b.unlimited,
    level: a.level,
    verifiedAge: a.verified_age,
  };
}

/** 目前登入的使用者；沒登入、登入過期、在 accounts 或好好讀書被停用都回 null */
export async function currentUser(req: Request, env: CloudflareEnv): Promise<User | null> {
  const token = readCookie(req, LOGIN_COOKIE);
  if (!token) return null;
  const a = await env.ACCOUNTS.sessionUser(token);
  if (!a) return null;
  const [p, b] = await Promise.all([upsertProfile(env.DB, a), env.ACCOUNTS.balance(a.id)]);
  if (p.disabled) return null;
  return toUser(a, p, b);
}

/** 只接受好好讀書站內的相對路徑，免得被拿來當跳到外站的跳板 */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");

const base = (u: string | undefined, fallback: string) => (u || fallback).replace(/\/+$/, "");

/** 登入：直接到 accounts 開始 Google 登入，登入完回到好好讀書的 next */
export function loginUrl(env: CloudflareEnv, provider: "google" | "facebook", next = "/") {
  const back = `${base(env.PUBLIC_URL, "https://goodreader.lucasact.com")}${safeNext(next)}`;
  return `${base(env.ACCOUNTS_URL, "https://accounts.lucasact.com")}/auth/${provider}?next=${encodeURIComponent(back)}`;
}

export function logoutUrl(env: CloudflareEnv) {
  const back = `${base(env.PUBLIC_URL, "https://goodreader.lucasact.com")}/`;
  return `${base(env.ACCOUNTS_URL, "https://accounts.lucasact.com")}/logout?next=${encodeURIComponent(back)}`;
}
