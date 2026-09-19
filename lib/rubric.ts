import type { Criterion, Grade, Level, LlmGrade } from "./schemas.ts";

export const CRITERION_LABEL: Record<Criterion, string> = {
  outline_coverage: "大綱－要點涵蓋",
  outline_structure: "大綱－結構層次",
  summary_gist: "摘要－主旨掌握",
  summary_fidelity: "摘要－忠實度",
  summary_concision: "摘要－精簡與轉述",
};

/** 依年級的配分（國中 55:45、高中 40:60） */
export const WEIGHTS: Record<Grade, Record<Criterion, number>> = {
  junior: {
    outline_coverage: 30,
    outline_structure: 25,
    summary_gist: 18,
    summary_fidelity: 17,
    summary_concision: 10,
  },
  senior: {
    outline_coverage: 22,
    outline_structure: 18,
    summary_gist: 22,
    summary_fidelity: 20,
    summary_concision: 18,
  },
};

/** 等級換算比例：模型只選等級，分數由程式算 */
export const LEVEL_RATIO: Record<Level, number> = { 優: 1, 良: 0.8, 尚可: 0.6, 待加強: 0.3 };

/** 給模型看的等級錨點描述 */
export const RUBRIC_ANCHORS: Record<Criterion, Record<Level, string>> = {
  outline_coverage: {
    優: "核心要點全部列出，次要要點多數列出",
    良: "核心要點大多列出，漏一項或次要要點較少",
    尚可: "只抓到約一半核心要點",
    待加強: "核心要點大多遺漏，或大綱與文章內容無關",
  },
  outline_structure: {
    優: "順序符合文章脈絡，上下層主從分明，能對應文體結構（如起承轉合、論點論據）",
    良: "順序大致正確，層次略有混亂",
    尚可: "只是平鋪條列，看不出主從或順序錯亂",
    待加強: "結構與文章邏輯明顯不符",
  },
  summary_gist: {
    優: "一讀就知道文章中心思想，且點出作者的態度或用意",
    良: "有掌握主旨，但不夠明確或略偏",
    尚可: "只重述情節或內容，未點出主旨",
    待加強: "主旨錯誤或未觸及",
  },
  summary_fidelity: {
    優: "無曲解、無捏造，未把自己的觀點當作者觀點",
    良: "有一處小的不精確",
    尚可: "有明顯誤解一處，或多處不精確",
    待加強: "多處誤解或捏造內容",
  },
  summary_concision: {
    優: "用自己的話精簡轉述，不堆細節，字數合理",
    良: "大致精簡，偶有冗詞或照抄短句",
    尚可: "細節過多或大量照抄原文句子",
    待加強: "幾乎照抄原文，或過短無法構成摘要",
  },
};

export type ScoreItem = {
  criterion: Criterion;
  label: string;
  level: Level;
  score: number;
  max: number;
  reason: string;
};

export type ComputeOptions = {
  /** 摘要照抄原文的比例（0..1，見 textcheck.copyRatio） */
  copyRatio: number;
};

export const COPY_THRESHOLD = 0.6;

export function computeScores(llm: LlmGrade, grade: Grade, opts: ComputeOptions) {
  const weights = WEIGHTS[grade];
  const byCriterion = new Map(llm.scores.map((s) => [s.criterion, s]));
  const items: ScoreItem[] = (Object.keys(weights) as Criterion[]).map((criterion) => {
    const s = byCriterion.get(criterion);
    let level: Level = s?.level ?? "待加強";
    let reason = s?.reason ?? "（模型未提供）";
    if (criterion === "summary_concision" && opts.copyRatio > COPY_THRESHOLD) {
      level = "待加強";
      reason = "摘要大部分照抄原文（在原句增減幾個字也算），視為照抄。" + reason;
    }
    const max = weights[criterion];
    return {
      criterion,
      label: CRITERION_LABEL[criterion],
      level,
      score: Math.round(max * LEVEL_RATIO[level]),
      max,
      reason,
    };
  });
  const total = items.reduce((n, i) => n + i.score, 0);
  return { items, total };
}
