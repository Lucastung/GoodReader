# GoodReader｜好好讀書：中文閱讀理解練習

學生讀一篇經典文章 → 寫大綱與摘要 → DeepSeek（經 DeepInfra）對照原文評分並給回饋。

- 前端與 API：Next.js 16（App Router），用 `@opennextjs/cloudflare` 部署到 Cloudflare Workers
- 資料庫：Cloudflare D1（內建 9 篇公有領域經典文章）
- 評分：DeepInfra 的 OpenAI 相容 API，預設模型 `deepseek-ai/DeepSeek-V4-Flash`
- 白名單收集器：程式已寫好（`lib/collector.ts`），白名單還沒放來源，只開放管理端「試抓」API
- 朗讀與聽寫：文章可「朗讀全文」（瀏覽器內建語音，可選速度、點段落編號從該段讀起）；大綱每一條與摘要都有 🎤 聽寫按鈕（Web Speech API，瀏覽器不支援時自動隱藏）
- 互動示範：`/demo`（頁首 DEMO 鈕），用〈桃花源記〉引導走完開文章、列大綱、寫摘要、看評分，不呼叫 API
- 後台：`/admin`（Cloudflare Access 保護），帳戶管理、範文資料庫（AI 撰寫、匯入、審稿上架）、使用與成本統計

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
# 選用：後台 API 的指令列金鑰（curl 用）
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

登入要靠 accounts：本機另開一個視窗在 `lucasact-accounts` 跑 `npm run dev`（wrangler 會把兩個 Worker 接起來），並把兩邊的 `PUBLIC_URL` / `ACCOUNTS_URL` 改成 localhost。

## 設定

| 變數 | 位置 | 說明 |
| --- | --- | --- |
| `GRADER_MODEL` | wrangler.jsonc vars | 評分模型，預設 `deepseek-ai/DeepSeek-V4-Flash`；想要更準可改 `deepseek-ai/DeepSeek-V4-Pro`（較貴） |
| `KEYPOINT_MODEL` | wrangler.jsonc vars | 產生要點底稿的模型（每篇只跑一次後快取） |
| `RUBRIC_VERSION` | wrangler.jsonc vars | 改評分標準時一併改版號，方便日後比較 |
| `LLM_BASE_URL` | wrangler.jsonc vars | 預設 DeepInfra；換成其他 OpenAI 相容服務也可以 |
| `DEEPINFRA_API_KEY` | secret | 必填 |
| `DEMO_ACCESS_CODE` | secret | 選用，設了就要輸入通行碼 |
| `ADMIN_TOKEN` | secret | 選用，用 `Authorization: Bearer …` 從指令列呼叫後台 API（視為管理者；自訂網域有 Access 擋著，指令列請打 `*.workers.dev` 網址） |
| `ACCESS_TEAM_DOMAIN` | secret | 後台：Zero Trust 團隊網域，例如 `myteam.cloudflareaccess.com` |
| `ACCESS_AUD` | secret | 後台：Access 應用程式的 Application Audience (AUD) Tag |
| `ADMIN_EMAILS` | secret | 後台：永遠是管理者的 email，逗號分隔 |
| `ADMIN_DEV_EMAIL` | .dev.vars | 本機開發用，只在 localhost 生效 |

換模型後，已快取的要點底稿不會自動重算；要重算可執行：
`npx wrangler d1 execute goodreader-db --remote --command "DELETE FROM article_keypoints"`

## 練習模式：基礎與進階

| | 基礎（預設國中） | 進階（預設高中） |
|---|---|---|
| 作答 | 讀文章 → 5 題四選一閱讀測驗 | 讀文章 → 大綱 → 摘要 |
| 計分 | 一題 5 分，滿分 25 | AI 依五分項評等級，滿分 100 |
| 次數 | 每篇只能作答一次，交卷後看答案與解析 | 可重做，積分取最高分 |
| Token | 交卷扣 2 | 每次評分扣 2 |

- 首頁切換「基礎／進階」；沒切換過時依個人資料年級預設（國中→基礎、高中→進階）。抽文章的難度範圍與進階配分仍依年級。
- 題目每篇出一次並快取（`article_quizzes`），學生開始練習時把當下題目存進 session，老師中途改題不影響作答中的學生；作答紀錄（`quiz_attempts`）也存題目快照。
- 題目由 LLM 產生後程式會打亂選項順序；後台文章頁可「產生題目／修改題目／重新出題」，改正文會清掉題目。
- 總積分 = 各篇進階最高分 + 各篇閱讀測驗分數；首頁長條圖依目前模式顯示。

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

用後台「範文」頁：AI 撰寫、手動新增、或貼 JSON 批次匯入（格式同 `data/classics.json`）。新文章都是「待審」，審稿老師檢查過按「審核通過並上架」後學生才看得到。

> 內建文章是手動輸入的，正式使用前請與權威版本校對一次（後台可直接修改）。

### 從維基文庫收集公有領域範文

1. 篇目清單在 `data/wikisource-list.json`（id、候選頁名、作者、朝代、文體、難度），可自行增刪。
2. 在 Finder 雙擊 `scripts/collect-wikisource.command`（或 `node scripts/collect-wikisource.mjs [--only id1,id2]`）。
3. 結果寫到 `data/collected/wikisource-<日期>.json`，報告在同名 `-report.txt`：列出成功篇目的字數、段落數、警告（疑似簡體、標點過少、字數異常），以及找不到或遇到消歧義頁的篇目與候選頁名。
4. 到後台「範文 → 匯入 JSON」按「選擇檔案…」上傳（或拖進框裡、或貼上內容），全部進待審草稿；對照課本等權威版本校對後再上架。

只收作者過世超過 50 年（台灣著作權法）的作品；超過 `maxChars`（目前 2400 字，只算漢字）的篇目不收。

## 後台（/admin）

| 頁面 | 誰能用 | 功能 |
| --- | --- | --- |
| 使用與成本 | 管理者 | 每日評分次數、活躍學生、新帳號、各模型 tokens 與估算成本、每次評分成本、月成本推估、模型單價設定 |
| 帳戶 | 管理者 | 搜尋學生、看練習與扣除紀錄、Token 餘額與明細、加減 Token、移除頭像、在好好讀書停用／啟用 |
| 範文 | 管理者、審稿老師 | 列表（待審／上架／下架）、AI 撰寫、手動新增、JSON 匯入、編輯、預覽、產生要點底稿檢查、上架／下架 |
| 權限 | 管理者 | 加入審稿老師或其他管理者、操作紀錄 |

- 只有「已上架」的文章會出現在學生端；學生做過的文章不能刪，只能下架。
- 改了正文會自動清掉要點底稿，下次評分重算。
- 成本以後台設定的單價估算（預設 DeepInfra 2026-09 公告價：V4-Flash 輸入 $0.09／輸出 $0.18，V4-Pro $1.30／$2.60，每百萬 tokens），實際以 DeepInfra 帳單為準。

### 設定 Cloudflare Access（後台登入）

後台用 Cloudflare Access 寄 email 一次性驗證碼登入，程式不存任何後台密碼。

1. Cloudflare dashboard → **Zero Trust**（第一次會請你取團隊名稱、選 Free 方案）。
2. **Settings → Authentication → Login methods**：確認有 **One-time PIN**。
3. **Access → Applications → Add an application → Self-hosted**：
   - Application name：`GoodReader 後台`
   - Destinations：`goodreader.lucasact.com` 路徑 `admin`，再加一筆路徑 `api/admin`（兩個都要）
   - Session duration：24 hours
4. Policy：Action **Allow**，Include → **Emails**，填入管理者與審稿老師的 email。
5. 存檔後在應用程式的 **Overview** 複製 **Application Audience (AUD) Tag**。
6. Workers & Pages → goodreader → **Settings → Variables and Secrets**，新增三個 **Secret**：
   - `ACCESS_TEAM_DOMAIN`：`<團隊名稱>.cloudflareaccess.com`
   - `ACCESS_AUD`：上一步的 AUD Tag
   - `ADMIN_EMAILS`：你的 email（逗號分隔可放多個）
7. 開 `https://goodreader.lucasact.com/admin`，輸入 email、收驗證碼登入。

之後要加審稿老師：Access policy 加上老師的 email，再到後台「權限」頁把他設成審稿老師（兩道鎖：Access 管能不能登入，後台名單管能做什麼）。

`*.workers.dev` 網址沒有經過 Access，後台 API 會一律拒絕，不會外洩。

## 目錄

```
app/                     頁面與 API 路由
  page.tsx               首頁：學習概況（完成篇數、各難度平均、積分與扣除）、選文章
  demo/page.tsx          互動示範
  practice/[id]/page.tsx 閱讀、大綱編輯器、摘要、評分結果
  api/sessions/…         抽文、取回練習、送出評分
  login/page.tsx         登入／建立帳號
  api/auth/me            目前使用者與登入／登出網址（登入在 accounts.lucasact.com）
  api/me/…               學習概況、積分扣除
  admin/…                後台頁面（使用與成本、帳戶、範文、權限）
  api/admin/…            後台 API（Cloudflare Access 驗證）
lib/
  grader.ts  prompts.ts  llm.ts   評分流程、提示詞、DeepInfra 呼叫
  rubric.ts  textcheck.ts         配分、抄錄偵測、前檢查
  collector.ts                    白名單收集器
  db.ts                           D1 存取
  auth.ts  tokens.ts               接 lucasact 帳號服務：登入 cookie → 使用者、扣點與退回
  admin.ts  admin-db.ts           後台身分（Access JWT）、後台查詢
migrations/                       D1 schema 與經典文章種子資料
data/classics.json                內建文章原始資料（與後台匯入同格式，含要點底稿與閱讀測驗；改完跑 node scripts/build-seed.mjs）
```

## 帳號與積分

- 帳號由 **lucasact 帳號服務**（`accounts.lucasact.com`，repo `Lucastung/Lucastung-lucasact-accounts`）管：用 Google（之後加 Facebook）登入，不分家長與學生。好好讀書、FreeScript、FishOn、lucasact.com 共用同一個帳號與 Token 錢包。
- 好好讀書可以單獨登入：`/login` 的按鈕直接連到 `accounts.lucasact.com/auth/google?next=<好好讀書的網址>`，登完回來，不經過 lucasact.com 的畫面。
- 登入 cookie `lx_session` 設在 `.lucasact.com`（HttpOnly）；好好讀書把它交給 accounts 的 RPC（Service Binding `ACCOUNTS`，不經過公網）換成使用者，見 `lib/auth.ts`。在 lucasact.com 登入過，進好好讀書就已經是登入狀態；登出也是全站一起登出。
- 每篇文章只計分一次，取這篇所有練習中的最高分（重做同一篇不會重複加分，進步時只補差額）；評過的文章在清單上標「✓ 已評 N 分」。剩餘積分 = 總積分 − 已扣除。「扣除」直接扣，不需要密碼。
- 整個帳號的停用在 accounts；後台「帳戶」頁的停用只影響好好讀書。

## 個人資料與 Token

- 名稱、頭像預設用 Google 帳號的；名稱在 lucasact.com 改。好好讀書自己存年級（國一～高三）、一句自我介紹、自己上傳的頭像（`users` 表，id 就是 accounts 的使用者 id，第一次進來時建立）。
- 頭像只能自己上傳（不開放 AI 生成）。瀏覽器先裁成 256×256 並重新編碼（去掉 EXIF／拍照定位），上限 80 KB，存在 D1 的 `avatars` 表。頭像不公開，只有本人和管理者看得到；管理者可在後台移除不當頭像。
- Token 是全站共用的錢包（accounts 管）：每月依等級發放（台北時間換月歸零重發）＋購買、轉贈收到的（不過期）。每次送出評分扣 2（重交也扣），評分失敗自動退回；餘額不足不能開始練習或送出。管理員不扣。
- 扣點都帶冪等鍵：進階是 `grade:<attemptId>`、閱讀測驗是 `quiz:<sessionId>`，網路重試或同時交兩次卷也只扣一次。見 `lib/tokens.ts`。
- 明細在 `/me`，包含在其他應用用掉的。加值、轉贈在 lucasact.com。
- 管理者可在後台「帳戶」頁手動加減 Token（要寫原因，會記下是誰調整的）；扣只能扣購買來的部分。

## Demo 還沒做的

- 付費機制（綠界 ECPay 點數包）
- 白名單來源、R2 快照、每日清理排程
- 教師端（第二階段）
