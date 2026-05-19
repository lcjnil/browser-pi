import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openaiApiUrl = env.OPENAI_API_URL?.trim();
  const proxyTarget = openaiApiUrl?.replace(/\/+$/, "").replace(/\/v1$/, "");

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: proxyTarget ? {
        "/v1": {
          target: proxyTarget,
          changeOrigin: true,
          secure: true,
        },
      } : undefined,
    },
  };
});
