// 首頁篩選選單：選項一律由現有文章算出來，不寫死清單。
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL, genreOptions, keepValid, seriesOptions } from "../lib/options.ts";
import { GENRES } from "../lib/schemas.ts";

const a = (genre: string, series: string | null = null) => ({ genre, series });

test("文體選項只列出真的有文章的文體", () => {
  assert.deepEqual(genreOptions([a("說明文"), a("記敘文"), a("說明文")]), [ALL, "記敘文", "說明文"]);
  assert.deepEqual(genreOptions([]), [ALL]); // 沒文章就只剩「全部」，選單會整個藏起來
});

test("說明文與議論文不會再被漏掉（之前寫死清單造成學生篩不到）", () => {
  const opts = genreOptions(GENRES.map((g) => a(g)));
  for (const g of GENRES) assert.ok(opts.includes(g), `選項少了 ${g}`);
  assert.deepEqual(opts, [ALL, ...GENRES]); // 照 GENRES 的順序，選單不會每次載入都跳動
});

test("系列選項去重、排序，沒有系列的文章不佔位", () => {
  assert.deepEqual(seriesOptions([a("說明文", "釣魚"), a("記敘文", null), a("說明文", "釣魚"), a("散文", "廚藝")]), [
    ALL,
    "廚藝",
    "釣魚",
  ]);
});

test("選項裡已經沒有的值退回「全部」", () => {
  const opts = [ALL, "釣魚"];
  assert.equal(keepValid("釣魚", opts), "釣魚");
  assert.equal(keepValid("廚藝", opts), ALL); // 那個系列的文章全下架了
});
