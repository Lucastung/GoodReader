import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/admin";
import { costOf, getPrices, setPrices, usageStats } from "@/lib/admin-db";
import { cfEnv, jsonError, requireAdmin } from "@/lib/http";

/** 台灣時間的日期字串 */
const twDay = (t: number) => new Date(t + 8 * 3600_000).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get("days")) || 30));
  const [s, prices] = await Promise.all([usageStats(env.DB, days), getPrices(env.DB)]);

  const now = Date.now();
  const byDay = new Map(
    Array.from({ length: days }, (_, i) => twDay(now - (days - 1 - i) * 86400_000)).map((d) => [
      d,
      { day: d, grades: 0, otherCalls: 0, tokensIn: 0, tokensOut: 0, cost: 0, active: 0, signups: 0 },
    ]),
  );
  const byModel = new Map<string, { kind: string; model: string; calls: number; tokensIn: number; tokensOut: number; cost: number; latencySum: number }>();
  for (const r of s.llm) {
    const cost = costOf(prices, r.model, r.tin, r.tout);
    const d = byDay.get(r.day);
    if (d) {
      if (r.kind === "grade") d.grades += r.calls;
      else d.otherCalls += r.calls;
      d.tokensIn += r.tin;
      d.tokensOut += r.tout;
      d.cost += cost;
    }
    const k = `${r.kind}|${r.model}`;
    const m = byModel.get(k) ?? { kind: r.kind, model: r.model, calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, latencySum: 0 };
    m.calls += r.calls;
    m.tokensIn += r.tin;
    m.tokensOut += r.tout;
    m.cost += cost;
    m.latencySum += (r.latency ?? 0) * r.calls;
    byModel.set(k, m);
  }
  for (const r of s.active) byDay.get(r.day) && (byDay.get(r.day)!.active = r.n);
  for (const r of s.signups) byDay.get(r.day) && (byDay.get(r.day)!.signups = r.n);

  const models = [...byModel.values()].map(({ latencySum, ...m }) => ({
    ...m,
    avgLatencyMs: m.calls ? Math.round(latencySum / m.calls) : null,
    priced: !!prices[m.model],
  }));
  const totalCost = models.reduce((n, m) => n + m.cost, 0);
  const grades = models.filter((m) => m.kind === "grade").reduce((n, m) => n + m.calls, 0);
  const gradeCost = models.filter((m) => m.kind === "grade").reduce((n, m) => n + m.cost, 0);

  return NextResponse.json({
    days,
    daily: [...byDay.values()],
    models,
    summary: {
      grades,
      totalCost,
      costPerGrade: grades ? gradeCost / grades : null,
      monthlyProjection: (totalCost / days) * 30,
    },
    totals: s.totals,
    topUsers: s.topUsers,
    topArticles: s.topArticles,
    prices,
  });
}

const Prices = z.record(
  z.string().min(1).max(100),
  z.object({ in: z.number().min(0).max(1000), out: z.number().min(0).max(1000) }),
);

/** 改模型單價（美元／百萬 tokens） */
export async function PUT(req: Request) {
  const env = cfEnv();
  const a = await requireAdmin(req, env);
  if (a instanceof Response) return a;
  const parsed = Prices.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "單價格式錯誤");
  await setPrices(env.DB, parsed.data, a.email);
  await audit(env.DB, a, "settings.prices", undefined, parsed.data);
  return NextResponse.json({ ok: true });
}
