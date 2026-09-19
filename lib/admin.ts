// 後台身分：Cloudflare Access 驗證 email（一次性驗證碼），程式再依 email 查角色。
// Access 會在每個受保護的請求加上 Cf-Access-Jwt-Assertion（RS256 JWT），這裡驗簽章、aud、iss、到期時間。

export type AdminRole = "admin" | "reviewer";
export type Admin = { email: string; role: AdminRole };

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { url: string; keys: Jwk[]; at: number } | null = null;

const b64urlToBytes = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

/** 接受 "myteam" 或 "myteam.cloudflareaccess.com" */
export function teamOrigin(team: string) {
  const t = team.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `https://${t.includes(".") ? t : `${t}.cloudflareaccess.com`}`;
}

async function getKeys(origin: string, force = false): Promise<Jwk[]> {
  const url = `${origin}/cdn-cgi/access/certs`;
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.at < 3600_000) return jwksCache.keys;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`取不到 Access 公鑰：${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { url, keys, at: Date.now() };
  return keys;
}

/** 驗證 Access JWT，成功回傳 email，失敗回傳 null */
export async function verifyAccessJwt(
  token: string,
  opts: { team: string; aud: string; now?: number; keys?: Jwk[] },
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; email?: string };
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256") return null;
  const origin = teamOrigin(opts.team);
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(opts.aud)) return null;
  if (payload.iss !== origin) return null;
  if (!payload.exp || payload.exp < now) return null;
  if (payload.nbf && payload.nbf > now + 60) return null;
  if (!payload.email) return null;

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlToBytes(parts[2]);
  const tryKeys = async (keys: Jwk[]) => {
    for (const k of keys.filter((k) => !header.kid || k.kid === header.kid)) {
      const key = await crypto.subtle.importKey(
        "jwk",
        { kty: k.kty, n: k.n, e: k.e, alg: "RS256", ext: true },
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, sig, data)) return true;
    }
    return false;
  };
  let ok = await tryKeys(opts.keys ?? (await getKeys(origin)));
  if (!ok && !opts.keys) ok = await tryKeys(await getKeys(origin, true)); // 金鑰輪替
  return ok ? payload.email.toLowerCase() : null;
}

export function bootstrapAdmins(env: CloudflareEnv) {
  return (env.ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function roleFor(env: CloudflareEnv, email: string): Promise<AdminRole | null> {
  if (bootstrapAdmins(env).includes(email)) return "admin";
  const r = await env.DB.prepare("SELECT role FROM admin_roles WHERE email = ?").bind(email).first<{ role: AdminRole }>();
  return r?.role ?? null;
}

const isLocalHost = (req: Request) => ["localhost", "127.0.0.1"].includes(new URL(req.url).hostname);

/**
 * 取得後台身分。依序：
 * 1. Authorization: Bearer ADMIN_TOKEN（指令列用，視為管理者）
 * 2. 本機開發：ADMIN_DEV_EMAIL（只在 localhost 生效）
 * 3. Cloudflare Access JWT
 */
export async function getAdmin(req: Request, env: CloudflareEnv): Promise<Admin | { error: string; status: number }> {
  if (env.ADMIN_TOKEN && req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`)
    return { email: "admin-token", role: "admin" };

  let email: string | null = null;
  if (env.ADMIN_DEV_EMAIL && isLocalHost(req)) email = env.ADMIN_DEV_EMAIL.toLowerCase();
  else {
    const token = req.headers.get("cf-access-jwt-assertion");
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD)
      return { status: 503, error: "後台尚未設定 Cloudflare Access（ACCESS_TEAM_DOMAIN、ACCESS_AUD）" };
    if (!token) return { status: 401, error: "請透過 Cloudflare Access 登入後台" };
    email = await verifyAccessJwt(token, { team: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }).catch(() => null);
    if (!email) return { status: 401, error: "後台登入已失效，請重新整理頁面" };
  }
  const role = await roleFor(env, email);
  if (!role) return { status: 403, error: `${email} 沒有後台權限，請管理者把你加進「權限」名單` };
  return { email, role };
}

export async function audit(db: D1Database, admin: Admin, action: string, target?: string, detail?: unknown) {
  await db
    .prepare("INSERT INTO admin_audit (id, email, action, target, detail) VALUES (?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), admin.email, action, target ?? null, detail === undefined ? null : JSON.stringify(detail))
    .run();
}
