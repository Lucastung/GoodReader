import { NextResponse } from "next/server";
import { z } from "zod";
import { BioSchema, GradeLevelSchema, NicknameSchema, PinSchema, claimAnonymous, createUser, findUserByNickname, startSession } from "@/lib/auth";
import { checkAccess, cfEnv, jsonError } from "@/lib/http";
import { withSessionCookie } from "@/lib/http";

const Input = z.object({
  nickname: NicknameSchema,
  pin: PinSchema,
  anonId: z.string().max(64).optional(),
  gradeLevel: GradeLevelSchema.nullable().optional(),
  bio: BioSchema.nullable().optional(),
});

export async function POST(req: Request) {
  const env = cfEnv();
  const denied = checkAccess(req, env);
  if (denied) return denied;
  const parsed = Input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "資料格式錯誤");
  const { nickname, pin, anonId, gradeLevel, bio } = parsed.data;
  if (await findUserByNickname(env.DB, nickname)) return jsonError(409, "這個暱稱已經有人用了");
  const user = await createUser(env.DB, nickname, pin, { gradeLevel, bio });
  await claimAnonymous(env.DB, anonId, user.id);
  const token = await startSession(env.DB, user.id);
  return withSessionCookie(NextResponse.json({ user }), token, req);
}
