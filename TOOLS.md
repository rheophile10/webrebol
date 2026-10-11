# Tools

| Tool | Location | Scope | Start |
|---|---|---|---|
| `ste-lint` | `~/.local/bin/ste-lint` | user | `ste-lint src bin test` |
| `code_annotate` | MCP server `tools` (`~/projects/tools`) | user | `node ~/projects/tools/bin/run.edge.mjs code_annotate '{"root":"<project>","write":true}'` |

The project has no `.mcp.json`.

The reference programs are not agent tools. They are in `reference/`:

| Program | Start |
|---|---|
| REBOL Core 2.7.8.4.10 | `reference/rebol-core.sh -qs <script>` |
| REBOL View 2.7.8.4.3 (Docker image `webrebol-rebview`) | `reference/rebol-view.sh -qs <script in reference/>` |

To make the Docker image again: `docker build -t webrebol-rebview reference/`.
