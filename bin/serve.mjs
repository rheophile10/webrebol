// Start: node bin/serve.mjs
// This program serves the files of the project to a browser. The page browser/index.html runs WebRebol.
import { createServer } from "node:http";
import { readFile } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT ?? 8017);
const TYPES = { html: "text/html", mjs: "text/javascript", "js": "text/javascript", css: "text/css", json: "application/json" };

/**
 * @uses ROOT, TYPES
 * @usedby bin/serve.mjs
 */
const sendFile = (request, response) => {
  // Serve only files in the project. A path with ".." is not permitted.
  const path = new URL(request.url, "http://localhost").pathname;
  const safe = path.includes("..") ? "/browser/index.html" : path.replace(/\/$/, "/browser/index.html");
  readFile(`${ROOT}${safe.slice(1)}`, (fault, content) => {
    const type = TYPES[safe.split(".").slice(-1)[0]] ?? "text/plain";
    response.writeHead(fault === null ? 200 : 404, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(fault === null ? content : "This file is not in the project.");
  });
};

createServer(sendFile).listen(PORT, () => console.log(`WebRebol page: http://localhost:${PORT}/browser/index.html`));
