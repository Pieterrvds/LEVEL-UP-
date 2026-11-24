import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The site is served from a folder (GitHub Pages), so every path is relative. The build goes to ../movement,
// the folder that is published; when the project moves to its own repository this becomes "dist".
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../movement", emptyOutDir: true },
});
