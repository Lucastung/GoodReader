// Token：註冊送 100，每次評分扣 2；評分失敗退回。之後線上購買也記在同一本帳。

export const SIGNUP_BONUS = 100;
export const GRADE_COST = 2;

export type TokenReason = "signup" | "grade" | "refund" | "admin" | "purchase";

export const REASON_LABEL: Record<TokenReason, string> = {
  signup: "註冊禮",
  grade: "評分",
  refund: "評分失敗退回",
  admin: "管理者調整",
  purchase: "購買",
};

type Entry = { reason: TokenReason; ref?: string | null; note?: string | null; createdBy?: string | null };

/**
 * 增加 Token（amount > 0），回傳新餘額。
 * 在同一個 batch（同一個交易）裡更新餘額並寫帳本。
 */
export async function creditTokens(db: D1Database, userId: string, amount: number, e: Entry): Promise<number> {
  if (!(amount > 0)) throw new Error("amount must be positive");
  const [, ins] = await db.batch([
    db.prepare("UPDATE users SET token_balance = token_balance + ? WHERE id = ?").bind(amount, userId),
    db
      .prepare(
        `INSERT INTO token_ledger (id, user_id, delta, balance_after, reason, ref, note, created_by)
         SELECT ?, id, ?, token_balance, ?, ?, ?, ? FROM users WHERE id = ?
         RETURNING balance_after`,
      )
      .bind(crypto.randomUUID(), amount, e.reason, e.ref ?? null, e.note ?? null, e.createdBy ?? null, userId),
  ]);
  const row = ins.results[0] as { balance_after: number } | undefined;
  if (!row) throw new Error("找不到帳號");
  return row.balance_after;
}

/**
 * 扣 Token（amount > 0）。餘額不足時不扣，回傳 null；成功回傳新餘額。
 * 用「WHERE token_balance >= ?」的條件更新避免同時送出兩次時扣成負數；
 * 帳本只在真的扣到時才寫（changes() = 1）。
 */
export async function spendTokens(db: D1Database, userId: string, amount: number, e: Entry): Promise<number | null> {
  if (!(amount > 0)) throw new Error("amount must be positive");
  const [, ins] = await db.batch([
    db.prepare("UPDATE users SET token_balance = token_balance - ? WHERE id = ? AND token_balance >= ?").bind(amount, userId, amount),
    db
      .prepare(
        `INSERT INTO token_ledger (id, user_id, delta, balance_after, reason, ref, note, created_by)
         SELECT ?, id, ?, token_balance, ?, ?, ?, ? FROM users WHERE id = ? AND changes() = 1
         RETURNING balance_after`,
      )
      .bind(crypto.randomUUID(), -amount, e.reason, e.ref ?? null, e.note ?? null, e.createdBy ?? null, userId),
  ]);
  const row = ins.results[0] as { balance_after: number } | undefined;
  return row ? row.balance_after : null;
}

export async function tokenBalance(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare("SELECT token_balance FROM users WHERE id = ?").bind(userId).first<{ token_balance: number }>();
  return r?.token_balance ?? 0;
}

export async function tokenHistory(db: D1Database, userId: string, limit = 50) {
  const { results } = await db
    .prepare(
      `SELECT id, delta, balance_after, reason, ref, note, created_by, created_at
       FROM token_ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{ id: string; delta: number; balance_after: number; reason: TokenReason; ref: string | null; note: string | null; created_by: string | null; created_at: string }>();
  return results;
}
