import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPin, verifyPin, nicknameKey, NicknameSchema, PinSchema } from "../lib/auth.ts";

test("PIN 雜湊：同 PIN 可驗證、錯 PIN 失敗、每次 salt 不同", async () => {
  const a = await hashPin("1234");
  const b = await hashPin("1234");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.ok(await verifyPin("1234", a.hash, a.salt));
  assert.ok(!(await verifyPin("1235", a.hash, a.salt)));
});

test("暱稱與 PIN 格式", () => {
  assert.equal(nicknameKey("  小明 Ming "), "小明 ming");
  assert.ok(NicknameSchema.safeParse("小明").success);
  assert.ok(!NicknameSchema.safeParse("a").success);
  assert.ok(!NicknameSchema.safeParse("<script>").success);
  assert.ok(PinSchema.safeParse("0000").success);
  assert.ok(PinSchema.safeParse("123456").success);
  assert.ok(!PinSchema.safeParse("123").success);
  assert.ok(!PinSchema.safeParse("12ab").success);
});
