"use client";

import { useState } from "react";
import { toAvatarDataUrl } from "@/lib/image";
import { Avatar } from "./Avatar";

/** 選頭像：從相簿或相機選一張，瀏覽器裁切縮小後預覽 */
export function AvatarPicker({
  nickname,
  version,
  preview,
  onPick,
  onRemove,
  busy,
}: {
  nickname: string;
  version: number;
  preview: string | null;
  onPick: (dataUrl: string) => void;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const [err, setErr] = useState<string | null>(null);
  const has = !!preview || version > 0;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    try {
      onPick(await toAvatarDataUrl(f));
    } catch (x) {
      setErr((x as Error).message);
    }
  }

  return (
    <div>
      <div className="avatar-pick">
        <Avatar nickname={nickname || "？"} version={version} src={preview} size={72} />
        <div className="btns">
          <span className="file-btn btn-outline">
            {has ? "換一張" : "上傳頭像"}
            <input type="file" accept="image/*" onChange={pick} disabled={busy} aria-label="選擇頭像圖片" />
          </span>
          {has && onRemove && (
            <button type="button" className="linkish" onClick={onRemove} disabled={busy}>
              移除
            </button>
          )}
        </div>
      </div>
      <p className="muted small" style={{ margin: "6px 0 0" }}>
        會自動裁成正方形。建議用圖畫或喜歡的東西，不要用自己的照片；頭像只有你自己看得到。
      </p>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}
