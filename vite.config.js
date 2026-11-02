import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// After a build, writes dist/sw.js from src/sw.js with the list of every file in dist/, so the phone
// keeps a copy of the whole app. VERSION changes whenever any file changes, which makes phones update.
function swPlugin() {
  let outDir;
  return {
    name: "stcs-sw",
    apply: "build",
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
      const walk = d => readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]);
      const files = walk(outDir).map(f => relative(outDir, f).split(sep).join("/")).filter(f => f !== "sw.js" && f !== ".DS_Store").sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const list = ["./", ...files.filter(f => f !== "index.html")];
      const src = readFileSync(new URL("./src/sw.js", import.meta.url), "utf8")
        .replace("self.__FILES__", JSON.stringify(list))
        .replace("self.__VERSION__", JSON.stringify(hash.digest("hex").slice(0, 12)));
      writeFileSync(join(outDir, "sw.js"), src);
    },
  };
}

// `npm run dev:phone` uses mode "phone": https on the home network, so the phone allows the camera.
// The certificate is made on this computer, so the phone warns about it once (see README).
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [swPlugin(), ...(mode === "phone" ? [basicSsl({ name: "stcs-card-scan" })] : [])],
  server: mode === "phone" ? { host: true } : {},
  worker: { format: "es" },
  test: { include: ["tests/unit/**/*.test.js"], environment: "node" },
}));
