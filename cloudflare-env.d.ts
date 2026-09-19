// wrangler.jsonc 裡的 bindings/vars 型別在 worker-configuration.d.ts（`npm run cf-typegen` 產生）。
// 這裡補上以 `wrangler secret put` 設定的 secrets。
interface CloudflareEnv {
  /** DeepInfra API 金鑰 */
  DEEPINFRA_API_KEY?: string;
  /** 選用：設了就要輸入通行碼才能使用，避免 demo 被濫用 */
  DEMO_ACCESS_CODE?: string;
  /** 選用：管理端 API（收集器試抓）用 */
  ADMIN_TOKEN?: string;
}
