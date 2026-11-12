import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import {
  encodeHistory,
  overviewSnapshot,
  readSnapshot,
} from "./shared/browser-snapshot";

const githubPages = process.env.GITHUB_PAGES === "true";
const base = githubPages ? "/gpu-price-tracker/" : "/";
let revision = "";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "current-price-snapshot",
      apply: "build",
      generateBundle() {
        const file = new URL(
          "./client/public/data/latest.json",
          import.meta.url
        );
        const snapshot = readSnapshot(JSON.parse(readFileSync(file, "utf8")));
        revision = snapshot.generatedAt;
        this.emitFile({
          type: "asset",
          fileName: "data/current.json",
          source: JSON.stringify(overviewSnapshot(snapshot)),
        });
        this.emitFile({
          type: "asset",
          fileName: "data/history.json",
          source: JSON.stringify(encodeHistory(snapshot)),
        });
      },
      transformIndexHtml: {
        order: "post",
        handler: (_html, { bundle }) =>
          bundle
            ? [
                {
                  tag: "link",
                  attrs: {
                    rel: "preload",
                    as: "fetch",
                    id: "current-price-preload",
                    href: `${base}data/current.json?revision=${encodeURIComponent(revision)}`,
                    crossorigin: "anonymous",
                  },
                  injectTo: "head-prepend",
                },
              ]
            : [],
      },
    },
    githubPages && {
      name: "pages-web-analytics",
      apply: "build",
      transformIndexHtml: {
        order: "post",
        handler: () => [
          {
            tag: "script",
            attrs: {
              type: "module",
              async: true,
              fetchpriority: "low",
              src: "https://static.cloudflareinsights.com/beacon.min.js",
              // Cloudflare's public site identifier for darkstarstrix.github.io.
              "data-cf-beacon": JSON.stringify({
                token: "6d76c7f472a543989c6f58f012fc5ecc",
              }),
            },
            injectTo: "body",
          },
        ],
      },
    },
  ],
  root: "client",
  base,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
