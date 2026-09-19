# GoodReader｜好好讀書：中文閱讀理解練習

學生讀一篇經典文章 → 寫大綱與摘要 → DeepSeek（經 DeepInfra）對照原文評分並給回饋。

- 前端與 API：Next.js 16（App Router），用 `@opennextjs/cloudflare` 部署到 Cloudflare Workers
- 資料庫：Cloudflare D1（內建 9 篇公有領域經典文章）
- 評分：DeepInfra 的 OpenAI 相容 API，預設模型 `deepseek-ai/DeepSeek-V4-Flash`
- 白名單收集器：程式已寫好（`lib/collector.ts`），白名單還沒放來源，只開放管理端「試抓」API
- 互動示範：`/demo`（頁首 DEMO 鈕），用〈桃花源記〉引導走完開文章、列大綱、寫摘要、看評分，不呼叫 API

## 部署到 Cloudflare

需要：Node.js 20+、Cloudflare 帳號、DeepInfra API 金鑰。

```bash
npm install
npx wrangler login

# 1. 建立 D1，把輸出的 database_id 貼到 wrangler.jsonc
npx wrangler d1 create goodreader-db

# 2. 建資料表並匯入經典文章
npm run db:migrate:remote

# 3. 部署
npm run deploy

# 4. 設定金鑰（設定後立即生效）
npx wrangler secret put DEEPINFRA_API_KEY
# 選用：設通行碼，避免網址外流後被別人拿來用
npx wrangler secret put DEMO_ACCESS_CODE
# 選用：管理端試抓 API 用
npx wrangler secret put ADMIN_TOKEN
```

部署完 wrangler 會印出 `https://goodreader.<你的子網域>.workers.dev`。要掛自己的網域，在 Cloudflare 後台 Workers → goodreader → Settings → Domains & Routes 加上即可。

打包後的程式約 1.2 MiB（gzip），Free 方案的大小限制放得下；之後接上收集器（Readability 解析較耗 CPU）建議改用 Workers Paid。

## GitHub 連動發佈（Cloudflare Workers Builds）

推到 `main` 就自動建置、跑 D1 migration、部署。

1. 先在 Cloudflare 建好 D1（dashboard 的 Storage & Databases → D1，或 `npx wrangler d1 create goodreader-db`），把 database_id 填進 `wrangler.jsonc` 並 commit。
2. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Import a repository** → 選這個 repo。
3. 設定：
   - Project name / Worker 名稱：`goodreader`（必須和 `wrangler.jsonc` 的 `name` 一致）
   - Build command：`npm run build:cf`
   - Deploy command：`npm run deploy:ci`（先套用 D1 migration 再部署）
   - Production branch：`main`
4. **Save and Deploy**。第一次部署後，到 Worker → Settings → Variables and Secrets 加上 `DEEPINFRA_API_KEY`（類型選 Secret），選用的 `DEMO_ACCESS_CODE` 也在這裡設。

之後每次 push 到 `main` 都會自動部署；其他分支可在 Builds 設定裡開啟預覽版本。

## 本機開發

```bash
cp .dev.vars.example .dev.vars   # 填入 DEEPINFRA_API_KEY；或設 LLM_MOCK=1 不打 API
npm run db:migrate:local
npm run preview                   # 用 workerd 跑，最接近正式環境（http://localhost:8787）
# 或 npm run dev                  # Next.js 開發模式，改程式即時更新
npm test                          # 評分邏輯、大綱轉換、收集器抽取的單元測試
```

`LLM_MOCK=1` 會用假資料回應，可在沒有金鑰時測整個流程與畫面。

## 設定

| 變數 | 位置 | 說明 |
| --- | --- | --- |
| `GRADER_MODEL` | wrangler.jsonc vars | 評分模型，預設 `deepseek-ai/DeepSeek-V4-Flash`；想要更準可改 `deepseek-ai/DeepSeek-V4-Pro`（較貴） |
| `KEYPOINT_MODEL` | wrangler.jsonc vars | 產生要點底稿的模型（每篇只跑一次後快取） |
| `RUBRIC_VERSION` | wrangler.jsonc vars | 改評分標準時一併改版號，方便日後比較 |
| `LLM_BASE_URL` | wrangler.jsonc vars | 預設 DeepInfra；換成其他 OpenAI 相容服務也可以 |
| `DEEPINFRA_API_KEY` | secret | 必填 |
| `DEMO_ACCESS_CODE` | secret | 選用，設了就要輸入通行碼 |
| `ADMIN_TOKEN` | secret | 選用，`POST /api/admin/collector-test` 用 |

換模型後，已快取的要點底稿不會自動重算；要重算可執行：
`npx wrangler d1 execute goodreader-db --remote --command "DELETE FROM article_keypoints"`

## 評分怎麼算

1. 學生開始閱讀時，背景先請模型產生該篇的「要點底稿」（中心思想、結構、要點、參考大綱；文言文附白話大意），存進 D1。
2. 送出時先做程式檢查：大綱至少 3 條、摘要至少 30 字，並計算摘要與原文的 5 字重疊率。
3. 模型對五個分項各選一個等級（優／良／尚可／待加強），**分數由程式依年級換算**：

| 分項 | 國中 | 高中 |
| --- | --- | --- |
| 大綱－要點涵蓋 | 30 | 22 |
| 大綱－結構層次 | 25 | 18 |
| 摘要－主旨掌握 | 18 | 22 |
| 摘要－忠實度 | 17 | 20 |
| 摘要－精簡與轉述 | 10 | 18 |

等級換算：優 100%、良 80%、尚可 60%、待加強 30%。重疊率超過 60% 時「精簡與轉述」強制為待加強。文言文要求用白話寫。

規則在 `lib/rubric.ts`，提示詞在 `lib/prompts.ts`。

## 新增文章

編輯 `data/classics.json`，然後：

```bash
node scripts/build-seed.mjs        # 重新產生 migrations/0002_seed_classics.sql
npx wrangler d1 execute goodreader-db --remote --file migrations/0002_seed_classics.sql
```

> 內建文章是手動輸入的，正式使用前請與權威版本校對一次。

## 目錄

```
app/                     頁面與 API 路由
  page.tsx               首頁：學習概況（完成篇數、各難度平均、積分與扣除）、選文章
  demo/page.tsx          互動示範
  practice/[id]/page.tsx 閱讀、大綱編輯器、摘要、評分結果
  api/sessions/…         抽文、取回練習、送出評分
  login/page.tsx         登入／建立帳號
  api/auth/…             註冊、登入、登出、目前使用者
  api/me/…               學習概況、積分扣除
  api/admin/…            試抓白名單網址、重設 PIN
lib/
  grader.ts  prompts.ts  llm.ts   評分流程、提示詞、DeepInfra 呼叫
  rubric.ts  textcheck.ts         配分、抄錄偵測、前檢查
  collector.ts                    白名單收集器
  db.ts                           D1 存取
  auth.ts                         帳號、PIN 雜湊、登入狀態、錯誤鎖定
migrations/                       D1 schema 與經典文章種子資料
data/classics.json                內建文章原始資料
```

## 帳號與積分

- 學生用「暱稱＋PIN（4–6 位數字）」建立帳號；積分綁帳號，換裝置登入都看得到。第一次登入時，這台瀏覽器先前的匿名練習紀錄會併入帳號。
- PIN 以 PBKDF2-SHA256（加 salt）雜湊保存；登入狀態是 30 天的 HttpOnly cookie（資料庫只存 token 的 SHA-256）。
- 同一暱稱 15 分鐘內 PIN 錯 5 次會暫停登入；家長 PIN 也一樣。
- 每次練習取最高分計入積分（重交不會重複加分）；剩餘積分 = 總積分 − 已扣除。
- 「扣除」需要家長 PIN：帳號第一次扣除時由家長設定（不能和學生 PIN 相同），之後每次扣除都要輸入。
- 忘記 PIN（需先設定 `ADMIN_TOKEN` secret）：

```bash
# 重設學生 PIN（同時登出所有裝置）
curl -X POST https://goodreader.gkb4u.com/api/admin/reset-pin \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"nickname":"小明","pin":"1234"}'
# 清除家長 PIN（下次扣除時重新設定）
curl ... -d '{"nickname":"小明","clearParentPin":true}'
```

## Demo 還沒做的

- 家長／教師端介面（目前重設 PIN 只能用管理端 API）
- 白名單來源、R2 快照、每日清理排程
- 教師端（第二階段）
