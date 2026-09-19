import { NextResponse } from "next/server";
import { z } from "zod";
import { extractArticle, fetchWhitelisted, qualityCheck } from "@/lib/collector";
import { checkAdmin, cfEnv, jsonError } from "@/lib/http";

const Input = z.object({
  url: z.string().url(),
  config: z.object({
    domain: z.string().min(3),
    contentSelector: z.string().optional(),
    removeSelectors: z.array(z.string()).optional(),
    charset: z.enum(["auto", "big5", "gbk", "utf-8"]).optional(),
  }),
});

/** 管理端：用一組白名單規則試抓一篇，回傳正文預覽與品質檢查（不寫入資料庫） */
export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAdmin(req, env);
  if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "參數錯誤");
  const { url, config } = parsed.data;
  try {
    const html = await fetchWhitelisted(url, config);
    const extracted = extractArticle(html, config, url);
    return NextResponse.json({
      ...extracted,
      paragraphs: extracted.paragraphs.slice(0, 5),
      totalParagraphs: extracted.paragraphs.length,
      quality: qualityCheck(extracted),
    });
  } catch (e) {
    return jsonError(422, (e as Error).message);
  }
}
