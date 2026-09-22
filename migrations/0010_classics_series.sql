-- 內建經典補上系列。0002_seed_classics.sql 已經在既有資料庫套用過，改它不會重跑，
-- 所以這裡補一次；只補還沒有系列的，避免蓋掉後台手動改過的值。
UPDATE articles SET series = '經典', updated_at = datetime('now')
WHERE series IS NULL AND id IN ('taohuayuan-ji', 'ailian-shuo', 'zuiweng-ting-ji', 'yueyang-lou-ji', 'shi-shuo', 'chu-shi-biao', 'qian-chibi-fu', 'congcong', 'luo-huasheng');
