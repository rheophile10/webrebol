# WebRebol

WebRebol is an interpreter for REBOL 2 Core and REBOL 2 View that runs in JavaScript.

- Start date: 2026-10-11

## Objective

- WebRebol runs REBOL 2 scripts in a browser and in Node.js.
- For each function of Core and View, WebRebol gives the same result as REBOL 2.7.8.
- Each function is written in JavaScript. WebRebol does not copy the REBOL source of the mezzanines.
- View draws with `requestAnimationFrame`. The comparison for View is the face tree and the draw commands, not the pixels.
- Files and networks come later. The use in Plastron comes later.
- Possible later option: `library!`, `routine!` and `struct!` use a WebAssembly module (for example, C code that Emscripten compiled).
- Later, View gets DOM elements (for example canvas) and standard CSS attributes.

## Decisions

- The reference is REBOL 2.7.8. `reference/rebol-core.sh` and `reference/rebol-view.sh` start it.
- A test compares the molded result of WebRebol with a result that REBOL recorded in `test/golden/`.
- The interpreter will be a machine with an explicit stack, because a browser cannot block for `view` and `wait`.
- The interpreter will pass an immutable store for the series, because STE-JS permits no mutation.

- Files (later): the interpreter keeps a disk as an immutable tree of paths and bytes. An edge module saves the disk: IndexedDB in a browser, a folder in Node.js. OPFS does not work at `file://` (see `~/projects/plastron-vfs` and the blog post "SQLite in the browser that reads pages on demand" on rheophile.ca).
- Networks (later): `http` and `https` use `fetch` from an edge module, and the machine stops until the answer comes. A browser cannot open a socket, thus `tcp`, `ftp`, `smtp` and `pop` give a REBOL error.
- Email is not planned. It needs an external service with secret keys, and Ian sees this as a security risk. `README.md` lists the limits.
- The function lists `reference/functions-*.txt` hold the help texts of REBOL Technologies. They stay out of the public repository.

## Sessions

- 2026-10-11 · ac9730f2 · Got REBOL 2.7.8 Core and View, wrote the function lists, and made the loader and `mold` with 191 reference cases. Made the git repository.

## Todos

- Load and mold `date!` and `money!`.
- Load base-64 binary, a path that has a paren, and two refinements without a space (`/a/b`).
- Keep the line ends of a block, because `mold` shows them.
- Remove the limit of 16 levels for nested braces in a string.
- Make the store for series, then the evaluator machine, the contexts, and the natives.
- Make a recorder for evaluation cases (one group for each function of `reference/functions-core.txt`).
- `parse`, then the 181 Core mezzanines in JavaScript.
- View: faces, `draw`, the frame loop, VID, `effect`.
