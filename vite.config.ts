import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const githubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
  base: githubPages ? "/gpu-price-tracker/" : "/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client/src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
});
