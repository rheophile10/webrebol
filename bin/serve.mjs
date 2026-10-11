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
  // The start page is in the folder examples. Go to its address, so that its links are correct.
  const path = new URL(request.url, "http://localhost").pathname;
  if (path === "/") {
    response.writeHead(302, { Location: "/examples/index.html" });
    return response.end();
  }
  // Serve only files in the project. A path with ".." is not permitted.
  const safe = path.includes("..") ? "/examples/index.html" : path.replace(/\/$/, "/index.html");
  return readFile(`${ROOT}${safe.slice(1)}`, (fault, content) => {
    const type = TYPES[safe.split(".").slice(-1)[0]] ?? "text/plain";
    response.writeHead(fault === null ? 200 : 404, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(fault === null ? content : "This file is not in the project. The start page is /examples/index.html");
  });
};

createServer(sendFile).listen(PORT, () => console.log(`WebRebol page: http://localhost:${PORT}/examples/index.html`));
