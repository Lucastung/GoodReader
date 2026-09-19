import type { z } from "zod";

export type LlmConfig = {
  baseUrl: string;
  apiKey?: string;
  mock: boolean;
};

export type LlmUsage = { tokensIn: number; tokensOut: number; latencyMs: number };

/** 去掉推理模型的思考區塊與 ```json 圍欄，取出第一個 JSON 物件 */
export function extractJson(text: string): unknown {
  let t = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("模型輸出中找不到 JSON");
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * 呼叫 OpenAI 相容的 chat completions（DeepInfra），要求 JSON 輸出並用 zod 驗證。
 * 驗證失敗會把錯誤回饋給模型重試一次。
 */
export async function chatJson<T>(
  cfg: LlmConfig,
  model: string,
  prompt: { system: string; user: string },
  schema: z.ZodType<T>,
  opts: { maxTokens?: number } = {},
): Promise<{ data: T; usage: LlmUsage }> {
  if (!cfg.apiKey) throw new Error("尚未設定 DEEPINFRA_API_KEY");
  const messages: { role: string; content: string }[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
  const usage: LlmUsage = { tokensIn: 0, tokensOut: 0, latencyMs: 0 };
  let lastErr = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0,
        max_tokens: opts.maxTokens ?? 3000,
        response_format: { type: "json_object" },
      }),
    });
    usage.latencyMs += Date.now() - t0;
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LLM API ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      choices: { message: { content: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    usage.tokensIn += json.usage?.prompt_tokens ?? 0;
    usage.tokensOut += json.usage?.completion_tokens ?? 0;
    const content = json.choices?.[0]?.message?.content ?? "";

    try {
      const parsed = schema.safeParse(extractJson(content));
      if (parsed.success) return { data: parsed.data, usage };
      lastErr = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    } catch (e) {
      lastErr = (e as Error).message;
    }
    messages.push({ role: "assistant", content });
    messages.push({
      role: "user",
      content: `你的輸出不符合要求的 JSON 格式：${lastErr}。請只輸出修正後的完整 JSON 物件。`,
    });
  }
  throw new Error(`模型輸出格式錯誤：${lastErr}`);
}
