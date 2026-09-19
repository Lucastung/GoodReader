// 頭像：瀏覽器端先裁成正方形、縮成 256×256、重新編碼（會去掉 EXIF 與拍照定位），伺服器再驗格式與大小。

export const AVATAR_MAX_BYTES = 80_000;
const TYPES: Record<string, (b: Uint8Array) => boolean> = {
  "image/webp": (b) => b.length > 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "image/jpeg": (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.length > 8 && b[0] === 0x89 && String.fromCharCode(...b.slice(1, 4)) === "PNG",
};

/** 解析 data URL，驗證是 webp/jpeg/png 且不超過大小；失敗回傳錯誤訊息 */
export function parseAvatarDataUrl(dataUrl: string): { mime: string; b64: string } | { error: string } {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return { error: "圖片格式不支援" };
  const [, mime, b64] = m;
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return { error: "圖片資料損壞" };
  }
  if (bytes.length > AVATAR_MAX_BYTES) return { error: "圖片太大" };
  if (!TYPES[mime](bytes)) return { error: "圖片內容與格式不符" };
  return { mime, b64 };
}

export async function getAvatar(db: D1Database, userId: string) {
  return db.prepare("SELECT mime, data_b64 FROM avatars WHERE user_id = ?").bind(userId).first<{ mime: string; data_b64: string }>();
}

export function avatarResponse(a: { mime: string; data_b64: string }) {
  const bytes = Uint8Array.from(atob(a.data_b64), (c) => c.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      "Content-Type": a.mime,
      // 只給本人／管理者看，不讓共用快取留存；網址帶 ?v= 版本號，換頭像就換網址
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function removeAvatar(db: D1Database, userId: string) {
  await db.batch([
    db.prepare("DELETE FROM avatars WHERE user_id = ?").bind(userId),
    db.prepare("UPDATE users SET avatar_version = 0 WHERE id = ?").bind(userId),
  ]);
}
