import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// When deploying to GitHub Pages at https://<user>.github.io/<repo>/
// set VITE_BASE=/repo-name/ in your repo's Actions secrets/variables,
// or just leave it unset for a custom domain / user-root deployment.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? "/",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
