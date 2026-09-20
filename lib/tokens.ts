// Token：由 lucasact 帳號服務管（全站共用的錢包：每月發放＋購買）。好好讀書每次評分扣 20（10 點 ＝ NT$1）；評分失敗退回。
// 扣點都帶冪等鍵：網路重試或同時送出兩次，也只會扣一次。

export const GRADE_COST = 20;
export const APP = "goodreader";

export type SpendOk = { ok: true; balance: number; ledgerId: string };
export type SpendFail = { ok: false; balance: number; message: string };

/**
 * 扣一次評分的 Token。
 * idemKey：同一個鍵只扣一次（進階用 `grade:<attemptId>`，閱讀測驗用 `quiz:<sessionId>`）。
 * 管理員不扣（ledgerId 是空字串，也不用退）。
 */
export async function spendForGrade(
  env: CloudflareEnv,
  userId: string,
  e: { ref: string; idemKey: string; note: string },
): Promise<SpendOk | SpendFail> {
  const r = await env.ACCOUNTS.spend(userId, GRADE_COST, { app: APP, ref: e.ref, idemKey: e.idemKey, note: e.note });
  if (!r.ok) return { ok: false, balance: r.balance, message: `Token 不足：每次評分需要 ${GRADE_COST} 個 Token，剩 ${r.balance}` };
  return { ok: true, balance: r.balance, ledgerId: r.ledgerId };
}

/** 退回一筆扣點（評分失敗）；同一筆只會退一次。回傳新餘額；沒扣到（管理員）就回 null */
export async function refundGrade(env: CloudflareEnv, userId: string, ledgerId: string, note: string): Promise<number | null> {
  if (!ledgerId) return null;
  return env.ACCOUNTS.refund(userId, ledgerId, note);
}

export async function tokenInfo(env: CloudflareEnv, userId: string) {
  const [balance, history] = await Promise.all([env.ACCOUNTS.balance(userId), env.ACCOUNTS.ledger(userId, 50)]);
  return { balance, history };
}
