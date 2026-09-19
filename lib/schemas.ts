import { z } from "zod";

export const GRADES = ["junior", "senior"] as const;
export type Grade = (typeof GRADES)[number];

export const GENRES = ["文言文", "散文", "記敘文", "議論文", "說明文"] as const;

export const LEVELS = ["優", "良", "尚可", "待加強"] as const;
export type Level = (typeof LEVELS)[number];

export const CRITERIA = [
  "outline_coverage",
  "outline_structure",
  "summary_gist",
  "summary_fidelity",
  "summary_concision",
] as const;
export type Criterion = (typeof CRITERIA)[number];

/** 大綱節點：最多 3 層 */
export type OutlineNode = { text: string; children?: OutlineNode[] };
export const OutlineNodeSchema: z.ZodType<OutlineNode> = z.lazy(() =>
  z.object({
    text: z.string().trim().min(1).max(200),
    children: z.array(OutlineNodeSchema).max(20).optional(),
  }),
);
export const OutlineSchema = z.array(OutlineNodeSchema).min(1).max(30);

export type Paragraph = { id: string; text: string };

// ---- API 輸入 ----
export const StartSessionInput = z.object({
  grade: z.enum(GRADES),
  genre: z.enum(GENRES).optional(),
  articleId: z.string().max(64).optional(),
});

export const SubmitAttemptInput = z.object({
  outline: OutlineSchema,
  summary: z.string().trim().max(1200),
});

// ---- LLM 輸出：要點底稿 ----
export const KeypointsSchema = z.object({
  centralIdea: z.string().min(1),
  structure: z.string().min(1),
  vernacular: z.string().optional().nullable(),
  keyPoints: z
    .array(
      z.object({
        id: z.string(),
        text: z.string(),
        importance: z.enum(["核心", "次要"]),
        paragraphs: z.array(z.string()).default([]),
      }),
    )
    .min(2)
    .max(12),
  referenceOutline: OutlineSchema,
});
export type Keypoints = z.infer<typeof KeypointsSchema>;

// ---- LLM 輸出：評分 ----
export const LlmGradeSchema = z.object({
  scores: z
    .array(
      z.object({
        criterion: z.enum(CRITERIA),
        level: z.enum(LEVELS),
        reason: z.string(),
      }),
    )
    .length(5),
  keyPointsHit: z.array(z.string()).default([]),
  keyPointsMissed: z
    .array(z.object({ id: z.string(), paragraph: z.string().optional().nullable(), hint: z.string() }))
    .default([]),
  errors: z
    .array(z.object({ quote: z.string(), issue: z.string(), paragraph: z.string().optional().nullable() }))
    .default([]),
  strengths: z.array(z.string()).default([]),
  nextStep: z.string(),
});
export type LlmGrade = z.infer<typeof LlmGradeSchema>;

// ---- LLM 輸出：AI 範文 ----
export const GeneratedArticleSchema = z.object({
  title: z.string().trim().min(1).max(60),
  paragraphs: z.array(z.string().trim().min(1)).min(2).max(12),
  centralIdea: z.string().optional().nullable(),
});

// ---- 後台：文章編輯 ----
export const ARTICLE_STATUSES = ["draft", "approved", "archived"] as const;
export const ARTICLE_ORIGINS = ["classic", "ai", "import", "manual"] as const;
export const LICENSES = ["public-domain", "cc-by", "cc-by-sa", "ai-generated", "authorized", "original"] as const;

export const ArticleInput = z.object({
  title: z.string().trim().min(1, "請填標題").max(60),
  author: z.string().trim().min(1, "請填作者").max(40),
  era: z.string().trim().max(20).nullable().optional(),
  genre: z.enum(GENRES),
  difficulty: z.number().int().min(1).max(5),
  paragraphs: z.array(z.string().trim().min(1)).min(1, "至少一段").max(40),
  url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
  license: z.enum(LICENSES),
  notes: z.string().max(2000).nullable().optional(),
});
export type ArticleInputT = z.infer<typeof ArticleInput>;
