// Tiny static server for the screenshot rig — serves the repo root with
// URI decoding (needed for spaces/brackets in map filenames).
import { createServer } from "http";
import { readFile } from "fs/promises";
import { join, extname } from "path";

const root = process.cwd();
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".osu": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".json": "application/json",
};

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (p === "/") p = "/shot.html";
    const data = await readFile(join(root, p));
    res.writeHead(200, { "Content-Type": MIME[extname(p)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(8123, "127.0.0.1", () => console.log("[shotServer] ready on http://127.0.0.1:8123"));
