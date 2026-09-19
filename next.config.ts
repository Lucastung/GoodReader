import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;

// 讓 `next dev` 也能讀到 wrangler.jsonc 裡的 D1 等 bindings
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
