// wrangler.jsonc 裡的 bindings/vars 型別在 worker-configuration.d.ts（`npm run cf-typegen` 產生）。
// 這裡補上以 `wrangler secret put` 設定的 secrets。
interface CloudflareEnv {
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
