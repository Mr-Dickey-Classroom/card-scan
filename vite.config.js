import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// `npm run dev:phone` uses mode "phone": https on the home network, so the phone allows the camera.
// The certificate is made on this computer, so the phone warns about it once (see README).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: mode === "phone" ? [basicSsl({ name: "stcs-card-scan" })] : [],
  server: mode === "phone" ? { host: true } : {},
  worker: { format: "es" },
  test: { include: ["tests/unit/**/*.test.js"], environment: "node" },
}));
