import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Character, weapon, and artifact icons served by HoYoLAB / HoYoverse CDNs.
    remotePatterns: [
      { protocol: "https", hostname: "**.mihoyo.com" },
      { protocol: "https", hostname: "**.hoyolab.com" },
      { protocol: "https", hostname: "**.hoyoverse.com" },
      // Material / character UI icons keyed by genshin-db filenames.
      { protocol: "https", hostname: "gi.yatta.moe" },
    ],
  },
};

export default nextConfig;
