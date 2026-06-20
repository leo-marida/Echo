import type { NextConfig } from "next";

// connect-src must allow the backend's HTTP(S) and WS(S) origins for fetch/EventSource
// and the WebSocket audio connection — derived from the API URL env var so this works
// in both local dev (http://localhost:8001) and production automatically.
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
const wsUrl = apiUrl.replace(/^http/, "ws");

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl} ${wsUrl}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: csp }],
      },
    ];
  },
};

export default nextConfig;
