export const STATUS_LABEL = { draft: "待審", approved: "已上架", archived: "已下架" } as const;
export const ORIGIN_LABEL: Record<string, string> = { classic: "內建經典", ai: "AI 撰寫", import: "匯入", manual: "手動" };
export const LICENSE_LABEL: Record<string, string> = {
  "public-domain": "公有領域",
  "cc-by": "CC BY",
  "cc-by-sa": "CC BY-SA",
  "ai-generated": "AI 生成",
  authorized: "已取得授權",
  original: "自行創作",
};
