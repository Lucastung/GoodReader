// wrangler.jsonc 裡的 bindings/vars 型別在 worker-configuration.d.ts（`npm run cf-typegen` 產生）。
// 這裡補上以 `wrangler secret put` 設定的 secrets，以及 lucasact 帳號服務的 RPC 型別。

/** lucasact 帳號服務回傳的使用者（accounts 的 publicUser） */
interface AccountsUser {
  id: string;
  name: string;
  avatar: string;
  pen_name: string;
  bio: string;
  level: "general" | "vip" | "svip" | "admin";
  level_label: string;
  transfer_code: string;
  /** 認證過的年齡；沒認證是 null */
  verified_age: number | null;
}

interface AccountsBalance {
  monthly: number;
  bought: number;
  total: number;
  allowance: number;
  /** 管理員：不扣也不發 */
  unlimited: boolean;
}

type AccountsSpendResult =
  | { ok: true; balance: number; ledgerId: string; replay: boolean }
  | { ok: false; balance: number; reason: string };

interface AccountsLedgerEntry {
  id: string;
  kind: string;
  label: string;
  monthly: number;
  bought: number;
  delta: number;
  balance_after: number;
  app: string;
  ref: string;
  note: string;
  created_at: string;
}

/** accounts Worker 的 AccountsService（Service Binding RPC） */
interface AccountsRpc {
  sessionUser(token: string | null | undefined): Promise<AccountsUser | null>;
  user(id: string): Promise<AccountsUser | null>;
  balance(userId: string): Promise<AccountsBalance>;
  spend(userId: string, amount: number, entry: { app?: string; ref?: string; idemKey?: string; note?: string }): Promise<AccountsSpendResult>;
  refund(userId: string, ledgerId: string, note?: string): Promise<number>;
  ledger(userId: string, limit?: number): Promise<AccountsLedgerEntry[]>;
  adminCredit(userId: string, amount: number, app: string, note: string, by: string): Promise<number>;
}

interface CloudflareEnv {
  /** lucasact 帳號服務 */
  ACCOUNTS: AccountsRpc;
  /** 帳號服務的對外網址（登入、登出、帳號頁的連結用），例如 https://accounts.lucasact.com */
  ACCOUNTS_URL?: string;
  /** 好好讀書自己的對外網址（登入後回來的地方），例如 https://goodreader.lucasact.com */
  PUBLIC_URL?: string;
  /** DeepInfra API 金鑰 */
  DEEPINFRA_API_KEY?: string;
  /** 選用：設了就要輸入通行碼才能使用，避免 demo 被濫用 */
  DEMO_ACCESS_CODE?: string;
  /** 選用：管理端 API（收集器試抓）用 */
  ADMIN_TOKEN?: string;
  /** 後台：Cloudflare Zero Trust 團隊網域，例如 myteam 或 myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** 後台：Access 應用程式的 Application Audience (AUD) Tag */
  ACCESS_AUD?: string;
  /** 後台：永遠是管理者的 email（逗號分隔） */
  ADMIN_EMAILS?: string;
  /** 本機開發用：在 localhost 直接以此 email 進後台（只寫在 .dev.vars） */
  ADMIN_DEV_EMAIL?: string;
}
