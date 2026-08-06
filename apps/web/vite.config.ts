import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8"
}).trim();
const sourceClean =
  execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=no"], {
    cwd: repositoryRoot,
    encoding: "utf8"
  }).trim() === "";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "dwarven-depths-source-head",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: { name: "dd-source-head", content: sourceHead },
            injectTo: "head"
          },
          {
            tag: "meta",
            attrs: {
              name: "dd-source-clean",
              content: String(sourceClean)
            },
            injectTo: "head"
          }
        ];
      }
    }
  ],
  build: {
    sourcemap: true
  }
});
