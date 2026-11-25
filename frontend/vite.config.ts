import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(() => {
  const apiTarget = process.env.VITE_API_PROXY_TARGET ?? "http://127.0.0.1:3001";
  return {
    plugins: [react()],
    server: { proxy: { "/api": apiTarget } },
    preview: { proxy: { "/api": apiTarget } },
  };
});
