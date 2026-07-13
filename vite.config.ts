/// <reference types="node" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The backend ships no CORS configuration, and its refresh cookie is SameSite=Strict with
// Path=/api/v1. Both only work if the app and the API share an origin. In production CloudFront
// provides that (default behavior -> S3, /api/* -> API Gateway); in development this proxy does.
// changeOrigin stays false so the Host header — and with it the cookie's scope — passes through
// untranslated.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Unit tests only. e2e/ holds Playwright specs, which also match *.spec.ts — without this
    // Vitest tries to run them and they explode on the @playwright/test import.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
