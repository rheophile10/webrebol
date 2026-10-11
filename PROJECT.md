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
- A test compares the molded result and the printed text of WebRebol with the results that REBOL recorded in `test/golden/`.
- The code has four stages: `src/data/` (loader), `src/store/` (series, contexts, `mold`), `src/machine/` (evaluation), `src/natives/` (the functions of REBOL).
- A frame of the machine and a native value hold a JavaScript function. Thus the machine folder does not import the natives.
- The interpreter is a machine with an explicit stack, because a browser cannot block for `view` and `wait`.
- The interpreter passes an immutable store for the series, because STE-JS permits no mutation.

- Files (later): the interpreter keeps a disk as an immutable tree of paths and bytes. An edge module saves the disk: IndexedDB in a browser, a folder in Node.js. OPFS does not work at `file://` (see `~/projects/plastron-vfs` and the blog post "SQLite in the browser that reads pages on demand" on rheophile.ca).
- Networks (later): `http` and `https` use `fetch` from an edge module, and the machine stops until the answer comes. A browser cannot open a socket, thus `tcp`, `ftp`, `smtp` and `pop` give a REBOL error.
- Email is not planned. It needs an external service with secret keys, and Ian sees this as a security risk. `README.md` lists the limits.
- The function lists `reference/functions-*.txt` hold the help texts of REBOL Technologies. They stay out of the public repository.

## Sessions

- 2026-10-11 · ac9730f2 · Got REBOL 2.7.8 Core and View, wrote the function lists, and made the loader and `mold` with 191 reference cases. Made the git repository and published it (MIT). Made the evaluator machine and the first 91 functions, with 288 evaluation cases.

## Todos

- Loader: `date!`, `money!`, base-64 binary, a path that has a paren, `/a/b` as two refinements.
- Loader: keep the line ends of a block, because `mold` shows them. Remove the limit of 16 levels for nested braces.
- Evaluator: set-path, get-arguments (`:x`), `foreach` with a block of words and with a text, `any`, `all`, `case`, `switch`, `catch`, `throw`.
- Evaluator: real error objects (`disarm`, the `arg1` field), and the `near` and `where` fields.
- Evaluator: `object!` and `make`, `bind`, `use`, `set`, `get`, `in`.
- Store: a faster structure. At this time, each change copies the table of all series or of one context.
- Symbols: REBOL molds a word with the spelling of its first use. WebRebol keeps the spelling of each use.
- One group of recorded cases for each function of `reference/functions-core.txt`. 91 of 444 Core functions have a first version.
- `parse`, then the other Core functions in JavaScript.
- View: faces, `draw`, the frame loop, VID, `effect`.
