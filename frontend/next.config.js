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
    // BACKEND_URL is a private server-side env var set in Vercel/Render dashboard.
    // It is NOT prefixed NEXT_PUBLIC_ so it never leaks into the client bundle.
    // Client-side axios uses NEXT_PUBLIC_API_URL="" (empty) → relative paths →
    // hit these rewrites → Vercel proxies server-to-server → no CORS needed.
    const apiBase =
      process.env.BACKEND_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:8000";
    return [
      { source: "/api/:path*", destination: `${apiBase}/api/:path*` },
      { source: "/health", destination: `${apiBase}/health` },
    ];
  },
};

module.exports = nextConfig;
