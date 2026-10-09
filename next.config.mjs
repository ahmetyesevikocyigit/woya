/** @type {import('next').NextConfig} */
const nextConfig = {
  agentRules: false,
  compress: true,
  devIndicators: false,
  output: "standalone",
  cacheMaxMemorySize: 16 * 1024 * 1024,
  outputFileTracingExcludes: {
    "/*": [
      "./.env*",
      "./.git/**/*",
      "./.next/cache/**/*",
      "./dist/**/*",
      "./outputs/**/*",
      "./tests/**/*",
      "./work/**/*",
    ],
  },
  poweredByHeader: false,
  async headers() {
    const headers = [
      ...(process.env.APP_URL?.startsWith("https:")
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
        : []),
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [
      ...["/profil/:path*", "/api/hesap/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      })),
      { source: "/:path*", headers },
      {
        source: "/odeme/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/api/odeme/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
    imageSizes: [96, 160, 240, 320, 480, 640],
    localPatterns: [
      { pathname: "/media/**", search: "" },
      {
        pathname: "/images/**",
        search: "",
      },
      {
        pathname: "/images/builder-parts/woya/**",
        search: "?v=20260903-clean-png-v5",
      },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/woya/**",
        search: "",
      },
    ],
  },
  experimental: {
    imgOptConcurrency: 1,
    imgOptOperationCache: false,
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
