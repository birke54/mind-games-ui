/// <reference types="node" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// The backend ships no CORS configuration, and its refresh cookie is SameSite=Strict with
// Path=/api/v1. Both only work if the app and the API share an origin. In production CloudFront
// provides that (default behavior -> S3, /api/* -> API Gateway); in development this proxy does.
// changeOrigin stays false so the Host header — and with it the cookie's scope — passes through
// untranslated.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "Cortex Clash",
        short_name: "Cortex",
        description: "Sudoku, on your desk and in your pocket.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache the shell only. A claimed board is fully playable offline because the solution
        // ships with it and the moves are mirrored to localStorage — so the shell is genuinely all
        // that's needed.
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        // NEVER cache the API. Every endpoint is authenticated and per-user; a cached response
        // would serve one player's boards to another, and a cached 401 would lock someone out of
        // their own account.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
      devOptions: {
        // Off in dev: a service worker caching a dev bundle is a debugging trap.
        enabled: false,
      },
    }),
  ],
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
