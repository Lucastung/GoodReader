import assert from "node:assert/strict";
import { test } from "node:test";
import { teamOrigin, verifyAccessJwt } from "../lib/admin.ts";

const b64url = (b: Uint8Array | string) =>
  Buffer.from(typeof b === "string" ? b : b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function makeToken(payload: Record<string, unknown>, kid = "k1") {
  const kp = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.publicKey)), kid };
  const head = b64url(JSON.stringify({ alg: "RS256", kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", kp.privateKey, new TextEncoder().encode(`${head}.${body}`)));
  return { token: `${head}.${body}.${b64url(sig)}`, jwk };
}

test("teamOrigin 接受短名與完整網域", () => {
  assert.equal(teamOrigin("gkb4u"), "https://gkb4u.cloudflareaccess.com");
  assert.equal(teamOrigin("https://gkb4u.cloudflareaccess.com/"), "https://gkb4u.cloudflareaccess.com");
});

test("Access JWT：簽章、aud、iss、到期", async () => {
  const now = Date.now();
  const base = { aud: ["AUD1"], iss: "https://t.cloudflareaccess.com", email: "Teacher@X.com", exp: Math.floor(now / 1000) + 600 };
  const { token, jwk } = await makeToken(base);
  const opts = { team: "t", aud: "AUD1", now, keys: [jwk] };
  assert.equal(await verifyAccessJwt(token, opts), "teacher@x.com");
  assert.equal(await verifyAccessJwt(token, { ...opts, aud: "OTHER" }), null);
  assert.equal(await verifyAccessJwt(token, { ...opts, team: "evil" }), null);
  assert.equal(await verifyAccessJwt(token, { ...opts, now: now + 3600_000 }), null);

  // 用別把金鑰簽的 token 不能過
  const forged = await makeToken(base);
  assert.equal(await verifyAccessJwt(forged.token, opts), null);
  // 竄改 payload
  const [h, , s] = token.split(".");
  const tampered = `${h}.${b64url(JSON.stringify({ ...base, email: "admin@x.com" }))}.${s}`;
  assert.equal(await verifyAccessJwt(tampered, opts), null);
  assert.equal(await verifyAccessJwt("garbage", opts), null);
});
