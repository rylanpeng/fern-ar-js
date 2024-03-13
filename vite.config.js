import { defineConfig } from "vite";

export default defineConfig({
  mode: "production",
  build: {
    outDir: "dist",
    emptyOutDir: true, 
    sourcemap: "inline",
    minify: false,
    lib: {
      entry: "src/aframe.js", 
      name: "FERNAR",
      fileName: () => "[name].prod.js",
      formats: ["iife"],
    },
    rollupOptions: {
      input: {
        "fernar-gesture": "./src/aframe.js",
      },
    },
  },
});
