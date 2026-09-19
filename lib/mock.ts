// LLM_MOCK=1 時使用：不呼叫 DeepInfra，產生結構正確的假資料，用來測試整個流程與畫面。
import type { Keypoints, LlmGrade, Paragraph } from "./schemas.ts";

export function mockKeypoints(paragraphs: Paragraph[]): Keypoints {
  const firstSentence = (t: string) => (t.split(/[。！？]/)[0] || t).slice(0, 40);
  return {
    centralIdea: "（模擬）這是測試用的中心思想。",
    structure: "（模擬）依段落順序發展。",
    vernacular: null,
    keyPoints: paragraphs.slice(0, 8).map((p, i) => ({
      id: `KP${i + 1}`,
      text: firstSentence(p.text),
      importance: i < 3 ? "核心" : "次要",
      paragraphs: [p.id],
    })),
    referenceOutline: paragraphs.slice(0, 6).map((p) => ({ text: firstSentence(p.text), children: [] })),
  };
}

export function mockGrade(kp: Keypoints, outlineItems: number): LlmGrade {
  const lvl = outlineItems >= kp.keyPoints.length ? "良" : outlineItems >= 3 ? "尚可" : "待加強";
  return {
    scores: [
      { criterion: "outline_coverage", level: lvl, reason: "（模擬）依大綱條數判斷。" },
      { criterion: "outline_structure", level: "良", reason: "（模擬）" },
      { criterion: "summary_gist", level: "尚可", reason: "（模擬）" },
      { criterion: "summary_fidelity", level: "良", reason: "（模擬）" },
      { criterion: "summary_concision", level: "良", reason: "（模擬）" },
    ],
    keyPointsHit: kp.keyPoints.slice(0, 2).map((k) => k.id),
    keyPointsMissed: kp.keyPoints.slice(2, 4).map((k) => ({
      id: k.id,
      paragraph: k.paragraphs[0] ?? null,
      hint: `（模擬）回去看 ${k.paragraphs[0] ?? "原文"}。`,
    })),
    errors: [],
    strengths: ["（模擬）有完成大綱與摘要。"],
    nextStep: "（模擬）這是 LLM_MOCK 模式，接上 DeepInfra 後會有真正的回饋。",
  };
}
