// 學生帳號：暱稱＋PIN。PIN 以 PBKDF2-SHA256 雜湊保存；登入狀態用 HttpOnly cookie。
import { z } from "zod";

export const SESSION_COOKIE = "gr_session";
export const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 20_000; // PIN 只有 4–6 位數，真正的防線是下面的錯誤次數鎖定
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

export const NicknameSchema = z
  .string()
  .trim()
  .min(2, "暱稱至少 2 個字")
  .max(20, "暱稱最多 20 個字")
  .regex(/^[\p{L}\p{N}_\- ]+$/u, "暱稱只能用文字、數字、底線或連字號");
export const PinSchema = z.string().regex(/^\d{4,6}$/, "PIN 要是 4–6 位數字");

export type User = { id: string; nickname: string; hasParentPin: boolean };

export const nicknameKey = (n: string) => n.trim().toLowerCase().replace(/\s+/g, " ");

const enc = new TextEncoder();
const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)!.map((h) => parseInt(h, 16)));

function randomHex(bytes: number) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hashPin(pin: string, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return { hash: toHex(bits), salt: saltHex };
}

/** 固定時間比較，避免從回應時間猜出雜湊 */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, hash: string, salt: string) {
  const h = await hashPin(pin, salt);
  return safeEqual(h.hash, hash);
}

async function sha256(s: string) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

// ---------- 錯誤次數鎖定 ----------

export async function isLocked(db: D1Database, key: string) {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM auth_failures WHERE key = ? AND created_at > datetime('now', ?)`)
    .bind(key, `-${LOCK_MINUTES} minutes`)
    .first<{ n: number }>();
  return (r?.n ?? 0) >= MAX_FAILURES;
}

export async function recordFailure(db: D1Database, key: string) {
  await db.batch([
    db.prepare("INSERT INTO auth_failures (key) VALUES (?)").bind(key),
    db.prepare("DELETE FROM auth_failures WHERE created_at < datetime('now', '-1 day')"),
  ]);
}

export async function clearFailures(db: D1Database, key: string) {
  await db.prepare("DELETE FROM auth_failures WHERE key = ?").bind(key).run();
}

// ---------- 帳號 ----------

type UserRow = {
  id: string;
  nickname: string;
  pin_hash: string;
  pin_salt: string;
  parent_pin_hash: string | null;
  parent_pin_salt: string | null;
  disabled?: number;
};

const toUser = (r: UserRow): User => ({ id: r.id, nickname: r.nickname, hasParentPin: !!r.parent_pin_hash });

export async function findUserByNickname(db: D1Database, nickname: string) {
  return db
    .prepare("SELECT id, nickname, pin_hash, pin_salt, parent_pin_hash, parent_pin_salt, disabled FROM users WHERE nickname_key = ?")
    .bind(nicknameKey(nickname))
    .first<UserRow>();
}

export async function getUserRow(db: D1Database, id: string) {
  return db
    .prepare("SELECT id, nickname, pin_hash, pin_salt, parent_pin_hash, parent_pin_salt, disabled FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
}

export async function createUser(db: D1Database, nickname: string, pin: string): Promise<User> {
  const id = crypto.randomUUID();
  const { hash, salt } = await hashPin(pin);
  await db
    .prepare("INSERT INTO users (id, nickname, nickname_key, pin_hash, pin_salt) VALUES (?, ?, ?, ?, ?)")
    .bind(id, nickname.trim(), nicknameKey(nickname), hash, salt)
    .run();
  return { id, nickname: nickname.trim(), hasParentPin: false };
}

export async function setParentPin(db: D1Database, userId: string, pin: string) {
  const { hash, salt } = await hashPin(pin);
  await db
    .prepare("UPDATE users SET parent_pin_hash = ?, parent_pin_salt = ? WHERE id = ? AND parent_pin_hash IS NULL")
    .bind(hash, salt, userId)
    .run();
}

/** 把這台瀏覽器之前的匿名紀錄併入帳號（只併還沒歸屬任何帳號的匿名 ID） */
export async function claimAnonymous(db: D1Database, anonId: string | undefined, userId: string) {
  if (!anonId || anonId.length < 8 || anonId.length > 64 || anonId === userId) return;
  // 匿名 ID 若其實是某個帳號的 id，絕不能併（否則可以偷別人的紀錄）
  const owner = await db.prepare("SELECT 1 FROM users WHERE id = ?").bind(anonId).first();
  if (owner) return;
  await db.batch([
    db.prepare("UPDATE sessions SET client_id = ? WHERE client_id = ?").bind(userId, anonId),
    db.prepare("UPDATE redemptions SET client_id = ? WHERE client_id = ?").bind(userId, anonId),
  ]);
}

// ---------- 登入狀態 ----------

export async function startSession(db: D1Database, userId: string) {
  const token = randomHex(32);
  await db
    .prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))")
    .bind(await sha256(token), userId, `+${SESSION_DAYS} days`)
    .run();
  return token;
}

function readCookie(req: Request, name: string) {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function currentUser(req: Request, db: D1Database): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await db
    .prepare(
      `SELECT u.id, u.nickname, u.pin_hash, u.pin_salt, u.parent_pin_hash, u.parent_pin_salt
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.disabled = 0`,
    )
    .bind(await sha256(token))
    .first<UserRow>();
  return r ? toUser(r) : null;
}

export async function endSession(req: Request, db: D1Database) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await sha256(token)).run();
}

export { toUser };
