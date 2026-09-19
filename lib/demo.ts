// 互動示範用的固定資料（不呼叫 API、不寫資料庫）
import classics from "@/data/classics.json";
import type { Keypoints, LlmGrade, Paragraph } from "./schemas";
import type { OutlineRow } from "./outline";

const raw = (classics as { id: string; title: string; author: string; era: string; genre: string; difficulty: number; paragraphs: string[] }[]).find(
  (a) => a.id === "taohuayuan-ji",
)!;

export const DEMO_ARTICLE = {
  id: raw.id,
  title: raw.title,
  author: raw.author,
  era: raw.era,
  genre: raw.genre,
  difficulty: raw.difficulty,
  paragraphs: raw.paragraphs.map((text, i) => ({ id: `P${i + 1}`, text })) as Paragraph[],
  charCount: raw.paragraphs.reduce((n, p) => n + (p.match(/\p{Script=Han}/gu) || []).length, 0),
  url: null,
  license: "public-domain",
};

/** 「幫我加下一條」依序填入的範例大綱 */
export const DEMO_OUTLINE: OutlineRow[] = [
  { text: "發現桃花林（P1）", level: 0 },
  { text: "漁人沿溪而行，遇見一大片桃花林", level: 1 },
  { text: "進入桃花源（P2–P3）", level: 0 },
  { text: "田地房屋整齊，人人安樂", level: 1 },
  { text: "村民熱情款待漁人", level: 1 },
  { text: "村民祖先為躲避秦朝戰亂而來", level: 1 },
  { text: "離開後再也找不到（P4）", level: 0 },
];

/** 「幫我寫一段」的範例摘要：刻意留一句照抄、一處與原文不符，讓評分畫面有東西可看 */
export const DEMO_SUMMARY =
  "一個漁夫沿著溪走，看到芳草鮮美，落英繽紛的桃花林，進入一個與世隔絕的村子，村民熱情招待他。他回去後帶太守一起去找，卻再也找不到路。";

/** 「示範照抄」：直接貼原文第一段 */
export const DEMO_COPIED_SUMMARY = raw.paragraphs[0];

export const DEMO_KEYPOINTS: Keypoints = {
  centralIdea: "作者透過漁人誤入桃花源的故事，描繪一個沒有戰亂、人人安居樂業的理想社會，寄託對美好世界的嚮往。",
  structure: "記敘文，依時間順序：發現桃花林（P1）→ 進入桃花源與見聞（P2–P3）→ 離開後再尋不得（P4–P5）。",
  vernacular:
    "東晉時一位武陵漁夫沿溪捕魚，意外遇到一片桃花林，穿過山洞後來到一個與世隔絕的村落。那裡田地整齊、人人和樂，村民的祖先為了躲避秦朝戰亂而來，從此不再與外界往來。村民熱情款待漁夫，並請他不要對外人提起。漁夫離開時沿路做了記號，回去報告太守，太守派人跟他去找，卻迷了路。後來隱士劉子驥想去尋訪，也沒能成行，從此再也沒有人去找了。",
  keyPoints: [
    { id: "KP1", text: "漁人偶然發現美麗的桃花林", importance: "核心", paragraphs: ["P1"] },
    { id: "KP2", text: "桃花源裡生活安樂、景象和平", importance: "核心", paragraphs: ["P2"] },
    { id: "KP3", text: "村民為避秦亂而來，與外界隔絕，不知朝代更替", importance: "核心", paragraphs: ["P3"] },
    { id: "KP4", text: "漁人離開後，太守派人循記號尋找卻迷路", importance: "核心", paragraphs: ["P4"] },
    { id: "KP5", text: "劉子驥想去尋訪未果，桃花源從此無人再問", importance: "次要", paragraphs: ["P5"] },
  ],
  referenceOutline: [
    { text: "發現：漁人沿溪誤入桃花林（P1）", children: [] },
    {
      text: "見聞：桃花源的生活（P2–P3）",
      children: [
        { text: "景象：土地平曠、屋舍儼然、人人怡然自樂", children: [] },
        { text: "來歷：祖先避秦亂而來，與外界隔絕", children: [] },
        { text: "款待：村民熱情招待，囑咐不要外傳", children: [] },
      ],
    },
    {
      text: "結局：再也找不到（P4–P5）",
      children: [
        { text: "太守派人循記號尋找，迷路", children: [] },
        { text: "劉子驥欲往未果，後無問津者", children: [] },
      ],
    },
  ],
};

export const DEMO_LLM_GRADE: LlmGrade = {
  scores: [
    {
      criterion: "outline_coverage",
      level: "良",
      reason: "列出了發現桃花林、進入桃花源、村民款待、離開後找不到等核心情節；最後劉子驥尋訪未果這一段沒有寫到。",
    },
    {
      criterion: "outline_structure",
      level: "優",
      reason: "依事件先後排列，並把「村民款待」「村民來歷」放在「進入桃花源」底下，主從清楚。",
    },
    {
      criterion: "summary_gist",
      level: "尚可",
      reason: "有交代故事經過，但沒有說出作者想藉桃花源表達的理想社會，主旨還差一步。",
    },
    {
      criterion: "summary_fidelity",
      level: "良",
      reason: "大致正確，但「帶太守一起去找」和原文不同：原文是太守派人跟著漁人去。",
    },
    {
      criterion: "summary_concision",
      level: "良",
      reason: "多數用自己的話，長度剛好；「芳草鮮美，落英繽紛」直接照抄原文，可以改成白話。",
    },
  ],
  keyPointsHit: ["KP1", "KP2", "KP3", "KP4"],
  keyPointsMissed: [
    {
      id: "KP5",
      paragraph: "P5",
      hint: "最後一段還有一個人也想去找桃花源，他是誰？結果如何？這段讓桃花源更顯得可望而不可及。",
    },
  ],
  errors: [{ quote: "帶太守一起去找", issue: "原文是太守「遣人隨其往」，太守本人沒有去。", paragraph: "P4" }],
  strengths: ["大綱依時間順序排列，上下層主從清楚", "摘要一段話就交代完整個故事，長度合適"],
  nextStep: "寫摘要前先問自己：作者想藉這個故事說什麼？把答案寫進摘要的第一句。",
};
