"use client";

/** 頭像：有上傳就顯示圖片，沒有就用暱稱第一個字 */
export function Avatar({
  nickname,
  version,
  size = 32,
  src,
}: {
  nickname: string;
  version: number;
  size?: number;
  /** 指定圖片網址（預覽或管理者看學生頭像時用） */
  src?: string | null;
}) {
  const url = src ?? (version > 0 ? `/api/me/avatar?v=${version}` : null);
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (url) return <img className="avatar" src={url} alt="" width={size} height={size} style={style} />;
  const ch = [...nickname.trim()][0] ?? "?";
  const hue = [...nickname].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className="avatar initial" style={{ ...style, background: `hsl(${hue} 45% 55%)` }} aria-hidden>
      {ch}
    </span>
  );
}
