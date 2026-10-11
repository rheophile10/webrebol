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
- A test compares the molded result and the printed text of WebRebol with the results that REBOL recorded in `test/golden/`. For an error, it compares the type, the id and the three fields.
- Each evaluation case runs in a new REBOL session.
- `bin/record.mjs` also writes `src/natives/specs.mjs` (the parameters of each function) and `src/natives/errorids.mjs` (the error ids) from REBOL. They have no help texts and no message texts.
- The code has four stages: `src/data/` (loader), `src/store/` (series, contexts, `mold`), `src/machine/` (evaluation), `src/natives/` (the functions of REBOL).
- A frame of the machine and a native value hold a JavaScript function. Thus the machine folder does not import the natives.
- The interpreter is a machine with an explicit stack, because a browser cannot block for `view` and `wait`.
- The interpreter passes an immutable store for the series, because STE-JS permits no mutation.

- Error messages: WebRebol has its own message texts in `src/natives/report.mjs`. They obey ASD-STE100, they tell the cause, and they end with the REBOL type and id. WebRebol does not copy the message texts of REBOL (decision of Ian, 2026-10-11).
- Files (later): the interpreter keeps a disk as an immutable tree of paths and bytes. An edge module saves the disk: IndexedDB in a browser, a folder in Node.js. OPFS does not work at `file://` (see `~/projects/plastron-vfs` and the blog post "SQLite in the browser that reads pages on demand" on rheophile.ca).
- Networks (later): `http` and `https` use `fetch` from an edge module, and the machine stops until the answer comes. A browser cannot open a socket, thus `tcp`, `ftp`, `smtp` and `pop` give a REBOL error.
- Email is not planned. It needs an external service with secret keys, and Ian sees this as a security risk. `README.md` lists the limits.
- The function lists `reference/functions-*.txt` hold the help texts of REBOL Technologies. They stay out of the public repository.

## Sessions

- 2026-10-11 · ac9730f2 · Got REBOL 2.7.8 Core and View, wrote the function lists, and made the loader and `mold` with 191 reference cases. Made the git repository and published it (MIT). Made the evaluator machine. Added objects, paths, binding, error fields, series refinements `parse`, own error messages, the scalar types, and 205 Core functions, with 1180 evaluation cases.

## Todos

- Loader: base-64 binary, a path that has a paren, `/a/b` as two refinements. The century of a year of 2 digits.
- Loader: keep the line ends of a block, because `mold` shows them. Remove the limit of 16 levels for nested braces.
- Errors: the `near` and `where` fields, and a `** Near:` line in the message.
- Evaluator: get-arguments (`:x`), `catch/name`, `case/all`, a `for` with a bump of zero.
- Series: `find/any`, `select/skip`, `sort/skip`, `sort/compare`. The sequence of mixed types in `sort`.
- Parse: `break`, and `to` or `thru` with a block of choices. A paren in a parse rule runs in a machine of its own, thus `wait` and `view` cannot stop the machine there.
- Parse: REBOL does not end if a `some` or `any` rule matches and does not move the position. WebRebol stops such a loop.
- Natives: many REBOL functions accept more types than WebRebol does (for example `first` of a pair). Such a call can stop JavaScript with an exception. Each native must give a REBOL error.
- Types: the fields of a `money!` value (`m/1`), `and` for tuples, a time divided by zero, `now`, `random`. The `to-` functions for the types that remain.
- Types of functions: REBOL has `native!`, `action!` and `function!`. WebRebol gives `native!` for all its own functions.
- Store: a faster structure. At this time, each change copies the table of all series or of one context.
- Symbols: REBOL molds a word with the spelling of its first use. WebRebol keeps the spelling of each use.
- One group of recorded cases for each function. 205 of 443 Core functions have a first version.
- View: faces, `draw`, the frame loop, VID, `effect`.
