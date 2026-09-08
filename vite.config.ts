import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: true,
    port: 5175
  },
  preview: {
    host: true,
    port: 4175
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 0
  }
});
