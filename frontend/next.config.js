/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**" },
    ],
  },
  async headers() {
    return [
      {
        // Vercel does not set application/wasm by default; without this header
        // browsers reject WebAssembly.instantiateStreaming() and MediaPipe
        // fails to initialise silently.
        source: "/mediapipe-wasm/:file*.wasm",
        headers: [{ key: "Content-Type", value: "application/wasm" }],
      },
      {
        // The .task model is a flatbuffer binary; serve it as octet-stream so
        // the browser does not try to parse it as text and corrupt the bytes.
        source: "/models/:file*",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
        ],
      },
    ];
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
