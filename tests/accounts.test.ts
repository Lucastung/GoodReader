// 好好讀書接 lucasact 帳號服務：登入 cookie → 使用者、個人設定、扣點與退回。accounts 用假的 RPC 代替。
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeD1 } from "./d1-shim.ts";
import { currentUser, loginUrl, logoutUrl, safeNext } from "../lib/auth.ts";
import { GRADE_COST, refundGrade, spendForGrade } from "../lib/tokens.ts";

type Call = [string, ...unknown[]];

function fakeAccounts(opts: { unlimited?: boolean; balance?: number } = {}) {
  const calls: Call[] = [];
  let bal = opts.balance ?? 100;
  const user = (id: string, name: string): AccountsUser => ({
    id, name, avatar: "https://x/a.png", pen_name: "", bio: "", level: opts.unlimited ? "admin" : "general",
    level_label: "", transfer_code: "ABCD-EFGH", verified_age: null,
  });
  const idem = new Map<string, string>();
  const rpc = {
    async sessionUser(token: string | null | undefined) {
      calls.push(["sessionUser", token]);
      return token === "good" ? user("u1", "小明") : token === "good2" ? user("u1", "小明改名") : null;
    },
    async user(id: string) { return user(id, "小明"); },
    async balance() {
      return { monthly: bal, bought: 0, total: bal, allowance: 100, unlimited: !!opts.unlimited };
    },
    async spend(userId: string, amount: number, e: { idemKey?: string }) {
      calls.push(["spend", userId, amount, e]);
      if (opts.unlimited) return { ok: true as const, balance: 0, ledgerId: "", replay: false };
      if (e.idemKey && idem.has(e.idemKey)) return { ok: true as const, balance: bal, ledgerId: idem.get(e.idemKey)!, replay: true };
      if (bal < amount) return { ok: false as const, balance: bal, reason: "no" };
      bal -= amount;
      const id = `L${calls.length}`;
      if (e.idemKey) idem.set(e.idemKey, id);
      return { ok: true as const, balance: bal, ledgerId: id, replay: false };
    },
    async refund(userId: string, ledgerId: string) {
      calls.push(["refund", userId, ledgerId]);
      bal += GRADE_COST;
      return bal;
    },
    async ledger() { return []; },
    async adminCredit() { return 0; },
  } satisfies AccountsRpc;
  return { rpc, calls };
}

const req = (cookie?: string) => new Request("https://goodreader.lucasact.com/api/auth/me", { headers: cookie ? { cookie } : {} });

test("沒有登入 cookie、cookie 無效：不是登入狀態", async () => {
  const { rpc, calls } = fakeAccounts();
  const env = { DB: makeD1(), ACCOUNTS: rpc } as unknown as CloudflareEnv;
  assert.equal(await currentUser(req(), env), null);
  assert.equal(calls.length, 0); // 沒有 cookie 不必問 accounts
  assert.equal(await currentUser(req("lx_session=bad"), env), null);
});

test("第一次進來建立個人設定；名字跟著 accounts 更新；年級等設定保留", async () => {
  const { rpc } = fakeAccounts();
  const db = makeD1();
  const env = { DB: db, ACCOUNTS: rpc } as unknown as CloudflareEnv;
  const u = await currentUser(req("other=1; lx_session=good"), env);
  assert.equal(u?.id, "u1");
  assert.equal(u?.nickname, "小明");
  assert.equal(u?.tokens, 100);
  assert.equal(u?.unlimited, false);
  await db.prepare("UPDATE users SET grade_level = 's1' WHERE id = 'u1'").run();
  const u2 = await currentUser(req("lx_session=good2"), env);
  assert.equal(u2?.nickname, "小明改名");
  assert.equal(u2?.gradeLevel, "s1");
  const row = await db.prepare("SELECT name FROM users WHERE id = 'u1'").first<{ name: string }>();
  assert.equal(row?.name, "小明改名");
});

test("在好好讀書停用的人不是登入狀態", async () => {
  const { rpc } = fakeAccounts();
  const db = makeD1();
  const env = { DB: db, ACCOUNTS: rpc } as unknown as CloudflareEnv;
  await currentUser(req("lx_session=good"), env);
  await db.prepare("UPDATE users SET disabled = 1 WHERE id = 'u1'").run();
  assert.equal(await currentUser(req("lx_session=good"), env), null);
});

test("扣點帶 app 與冪等鍵；同一個鍵只扣一次；失敗退回", async () => {
  const { rpc, calls } = fakeAccounts({ balance: 3 });
  const env = { DB: makeD1(), ACCOUNTS: rpc } as unknown as CloudflareEnv;
  const a = await spendForGrade(env, "u1", { ref: "s1", idemKey: "quiz:s1", note: "桃花源記" });
  const b = await spendForGrade(env, "u1", { ref: "s1", idemKey: "quiz:s1", note: "桃花源記" });
  assert.ok(a.ok && b.ok);
  assert.equal(a.ok && a.balance, 1);
  const [, , amount, entry] = calls.find((c) => c[0] === "spend")!;
  assert.equal(amount, GRADE_COST);
  assert.deepEqual(entry, { app: "goodreader", ref: "s1", idemKey: "quiz:s1", note: "桃花源記" });
  const c = await spendForGrade(env, "u1", { ref: "s2", idemKey: "quiz:s2", note: "x" });
  assert.equal(c.ok, false);
  assert.match(!c.ok ? c.message : "", /Token 不足/);
  if (a.ok) assert.equal(await refundGrade(env, "u1", a.ledgerId, "評分失敗"), 3);
});

test("管理員不扣，也不用退", async () => {
  const { rpc, calls } = fakeAccounts({ unlimited: true });
  const env = { DB: makeD1(), ACCOUNTS: rpc } as unknown as CloudflareEnv;
  const u = await currentUser(req("lx_session=good"), env);
  assert.equal(u?.unlimited, true);
  const r = await spendForGrade(env, "u1", { ref: "s", idemKey: "grade:a", note: "" });
  assert.ok(r.ok);
  assert.equal(await refundGrade(env, "u1", r.ok ? r.ledgerId : "x", ""), null);
  assert.equal(calls.filter((c) => c[0] === "refund").length, 0);
});

test("登入、登出網址：回到好好讀書站內，不能被帶去外站", () => {
  const env = { ACCOUNTS_URL: "https://accounts.lucasact.com", PUBLIC_URL: "https://goodreader.lucasact.com" } as CloudflareEnv;
  assert.equal(
    loginUrl(env, "google", "/me"),
    "https://accounts.lucasact.com/auth/google?next=" + encodeURIComponent("https://goodreader.lucasact.com/me"),
  );
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.match(loginUrl(env, "google", "//evil.com"), /next=https%3A%2F%2Fgoodreader\.lucasact\.com%2F$/);
  assert.equal(logoutUrl(env), "https://accounts.lucasact.com/logout?next=" + encodeURIComponent("https://goodreader.lucasact.com/"));
});
