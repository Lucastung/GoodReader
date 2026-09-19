"use client";

// 在瀏覽器裡把照片裁成正方形、縮成 256×256 再重新編碼。
// 重新畫到 canvas 會丟掉原檔的 EXIF（包含拍照地點），上傳的只剩像素。

const SIZE = 256;
const MAX_BYTES = 75_000;

export async function toAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("請選擇圖片檔");
  if (file.size > 15 * 1024 * 1024) throw new Error("圖片太大（上限 15 MB）");
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("這個圖片格式瀏覽器讀不了，請換 JPG 或 PNG");
  }
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, SIZE, SIZE);
  bmp.close();

  for (const q of [0.85, 0.7, 0.55, 0.4]) {
    let url = canvas.toDataURL("image/webp", q);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", q); // 舊版 Safari 不支援 webp
    if ((url.length * 3) / 4 < MAX_BYTES) return url;
  }
  throw new Error("圖片壓縮後還是太大，請換一張");
}
