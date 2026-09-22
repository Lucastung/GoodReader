import { GENRES } from "./schemas.ts";

/** 篩選選單的「全部」選項 */
export const ALL = "全部";

/**
 * 首頁的篩選選單一律由目前的文章算出來，不要另外寫死一份清單。
 * （寫死過一次：學生端少了說明文與議論文，那些文章就篩不到。）
 */
export const genreOptions = (articles: { genre: string }[]) => [
  ALL,
  // 照 GENRES 的順序，不照出現順序，選單才不會每次載入都跳動
  ...GENRES.filter((g) => articles.some((a) => a.genre === g)),
];

export const seriesOptions = (articles: { series?: string | null }[]) => [
  ALL,
  ...[...new Set(articles.map((a) => a.series).filter((s): s is string => !!s))].sort(),
];

/** 選單上已經沒有的值（例如那個系列的文章全下架了）就退回「全部」 */
export const keepValid = (value: string, options: string[]) => (options.includes(value) ? value : ALL);
