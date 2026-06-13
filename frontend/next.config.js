/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async rewrites() {
    // This proxy is used in production when NEXT_PUBLIC_API_URL is set to an
    // empty string. All /api/* and /health requests are forwarded to the
    // FastAPI backend, keeping everything on one domain (no CORS needed).
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/health", destination: `${apiBase}/health` },
    ];
  },
};

module.exports = nextConfig;
