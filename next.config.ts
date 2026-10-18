import type { NextConfig } from "next";

// Accounts are optional. With no Clerk keys, a signed-out stand-in replaces Clerk so the app still runs.
const noClerk = !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const nextConfig: NextConfig = {
  serverExternalPackages: ["linkedom"],
  ...(noClerk
    ? { turbopack: { resolveAlias: { "@clerk/nextjs/server": "./lib/clerk-off/server.ts", "@clerk/nextjs": "./lib/clerk-off/index.tsx" } } }
    : {}),
  poweredByHeader: false,
  // The library is hidden for now.
  async redirects() {
    return [{ source: "/library/:path*", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
