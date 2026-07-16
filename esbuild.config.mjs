import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const isWatch = process.argv.includes("--watch");
const deployDir = "deploy/osumania-estimator by Akuta Zehy";

function deploy() {
  mkdirSync(join(deployDir, "dist"), { recursive: true });
  mkdirSync(join(deployDir, "styles"), { recursive: true });
  const files = [
    ["dist/index.js", "dist/index.js"],
    ["metadata.txt", "metadata.txt"],
    ["settings.json", "settings.json"],
    ["index.html", "index.html"],
    ["styles/main.css", "styles/main.css"],
    ["src/tosu/socket.js", "dist/socket.js"],
    // Etterna WASM + JS glue (vibro detection)
    ["src/ett/versions/minaclac-72.3.js", "dist/minaclac-72.3.js"],
    ["src/ett/versions/minaclac-72.3.wasm", "dist/minaclac-72.3.wasm"],
  ];
  for (const [src, dst] of files) {
    copyFileSync(src, join(deployDir, dst));
  }
  console.log(`[deploy] -> ${deployDir}/`);
}

/** @type {esbuild.BuildOptions} */
const config = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  outfile: "dist/index.js",
  platform: "browser",
  format: "iife",
  target: "es2020",
  sourcemap: false,
  minify: false,
  treeShaking: true,
  define: {
    __VERSION__: JSON.stringify("1.0.0"),
    __DEV__: JSON.stringify(isWatch),
  },
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log("[esbuild] Watching for changes...");
} else {
  await esbuild.build(config);
  console.log("[esbuild] Build complete → dist/index.js");
  deploy();
}
