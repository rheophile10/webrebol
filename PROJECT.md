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
- View is web-native (decision of Ian, 2026-10-11): a face becomes a DOM element with CSS, not pixels on one canvas. Web words make elements as data in the element format of Plastron. The View functions of REBOL are mezzanines on these web words, with default values. `effect` uses CSS where CSS has the effect, and the list of effects will grow. `to-image` uses the SVG `foreignObject` method now, and HTML-in-Canvas when it is a standard.
- Plastron4 (later): the kernel, the topological sort and the diff of element trees will be in WebRebol. The measure of success is that Plastron4 is faster than Plastron3 in speed tests.

## Decisions

- The reference is REBOL 2.7.8. `reference/rebol-core.sh` and `reference/rebol-view.sh` start it.
- A test compares the molded result and the printed text of WebRebol with the results that REBOL recorded in `test/golden/`. For an error, it compares the type, the id and the three fields.
- Each evaluation case runs in a new REBOL session.
- `bin/record.mjs` also writes `src/natives/specs.mjs` (the parameters of each function) and `src/natives/errorids.mjs` (the error ids) from REBOL. They have no help texts and no message texts.
- The code has seven stages: `src/data/` (loader), `src/store/` (series, contexts, disk, `mold`), `src/machine/` (evaluation), `src/natives/` (the functions of Core), `src/view/` (the functions of View), `src/session/` (the global words and the start of a session), `src/edge/` (the clock, Web Crypto, the folder of the disk).
- A frame of the machine and a native value hold a JavaScript function. Thus the machine folder does not import the natives.
- The interpreter is a machine with an explicit stack, because a browser cannot block for `view` and `wait`.
- The interpreter passes an immutable store for the series, because STE-JS permits no mutation. The tables of series and contexts are shared trees (`src/store/table.mjs`), thus a change copies only one path of the tree. The words of REBOL are in a base table that a session does not copy.

- Error messages: WebRebol has its own message texts in `src/natives/report.mjs`. They obey ASD-STE100, they tell the cause, and they end with the REBOL type and id. WebRebol does not copy the message texts of REBOL (decision of Ian, 2026-10-11).
- The edge: a native that needs the clock, Web Crypto, the disk or the network stops the machine with the mode "wait" and a request. `src/edge/drive.mjs` does the work and continues the machine. The machine stays pure. `now` and `checksum` use this mechanism.
- `checksum`: SHA-1 and HMAC use Web Crypto (decision of Ian, 2026-10-11). Web Crypto has no MD5 and no CRC, thus these are in JavaScript. The CRC is the algorithm of the open REBOL 3 source.
- `src/edge/drive.mjs` uses `Reflect.construct(Uint8Array, ...)` to read a Web Crypto result, because STE-JS does not approve `new` for a typed array.
- `random` uses the mulberry32 generator. Ian accepts that the same seed does not give the numbers of REBOL (2026-10-11). The tests compare only properties of the results.
- The recorder runs each case in a new empty folder, and it changes the path of that folder in the results to the root of the disk.
- View reference: `bin/record.mjs` runs the cases of `test/cases/view/` in REBOL View 2.7.8 in Docker, with a new session for each case. It also writes `src/view/viewdata.mjs` (the color words, the character widths of each font, the facets of each VID style) and `src/view/viewspecs.mjs` (the parameters of the 106 functions that View adds).
- View text sizes: WebRebol uses the character widths that REBOL View measured in the Docker image. Thus `layout` gives the same face sizes as REBOL View in that image. A browser draws text with different widths.
- Web view, done (2026-10-11): the web words `element` and `element?` make elements in the format of Plastron (`src/view/elements.mjs`). The View mezzanines are REBOL text in `src/view/boot.mjs`: the object `theme` and the functions `face-css` and `face-to-element`. A session evaluates them one time, and all sessions share the result. `view`, `unview` and `show` are natives. `src/edge/page.mjs` runs the machine in steps, draws at the animation frame with the diff, and gives click and input events to the machine. `browser/index.html` and `bin/serve.mjs` are the test page. `src/view/diff.mjs` and `src/edge/dom.mjs` are copies of Plastron3 code.
- Look and feel: a script changes the look in four ways: the fields of `theme` (`font-family`, `tags`, `types`, `colors`), the block `theme/css` with CSS for each style, the facet `css [...]` of one face in a layout, and a replacement of `face-to-element`.
- Grid words (request of Ian): `find-threshold`, `hash-cell`, `smooth-noise` and `measure-center` are copies of the number tools of `stegosaurus/animations/src/reveals/grid.mjs`. The layer tools of that file (`makeRevealField`, `cutHoles`, `paintLights`, `writeGlyphs`, `makeCellReveal`) will come with `effect` and the canvas.
- A hidden browser tab gets no animation frames. Thus a test of the page must make the tab visible, or it must take a screenshot.
- Corpus (2026-10-11): `corpus/` is not in git. `corpus/github/` has shallow clones of seven public repositories of REBOL code (rgchris/Scripts, rebolsource/rebol-test, dockimbel/cheyenne, henrikmk/VID-Extension-Kit, Oldes/rs, gchiu/Rebol2, rgchris/QuarterMaster): 538 script files with 143726 lines. rebol.org gave a server error for each download, thus it is not a source.
- Load comparison: `node bin/compare.mjs` loads each corpus script in REBOL View (Docker, without a network) and in WebRebol, and it compares the type and the text of each loaded value. Result: 529 of 538 scripts agree (98.3%).
- Test suite comparison: `node bin/conform.mjs` runs the public REBOL core test suite (rebolsource/rebol-test, Apache-2.0) in the two engines, in one session, with a new session after a test that stops REBOL. `node bin/conform.mjs record` runs REBOL again, and without the argument the program uses the kept outcomes (10 seconds). Result on 2026-10-11: 4230 of 4586 tests give the same outcome (92.2%). 11 tests stop REBOL 2.7.8 itself. The differences are in `corpus/tests-report.txt`.
- Types (2026-10-11): `image!` is a series of pixels with a size (`make image!`, `pick`, `first`, `copy`, `mold`, the construct form). `event!` is the value that an engage function gets, with the fields `type`, `offset`, `key` and `face`. `hash!` and `list!` are block types. `closure` is a real closure. Not done: `poke` and `draw` on an image, `to-image`, `struct!`, and the special rules of `list!`. The real limits are `port!` for sockets, and `library!` and `routine!` until the WebAssembly plan.
- Feel and engage: the mezzanine `layout` makes an object from the facet `feel [...]`. The page calls `engage` with the face, the action word (`down`, `up`, `over`, `time`) and an event value, as REBOL View does. The web facets `on-down`, `on-move` and `on-up` stay as the short form.
- Image in a face (2026-10-11): a face with an `image!` value in `face/image` gets a canvas, and the page reads the pixels from the store when the image changes. `draw image [...]` changes the pixels in the machine, with the commands `pen`, `fill-pen`, `line-width`, `line`, `box`, `circle` and `flood` (`src/view/raster.mjs`, pure). `poke` changes one pixel. `to-image face` asks the page for the pixels of a face, and `download-image face name` gives a PNG file to the person. `examples/paint` uses an image, with a fill tool.
- An action of a face can wait for the edge: the store keeps the waiting machine in `paused`, and the page continues it with `continueAction`.
- SVG: `element 'svg [...] [...]` makes SVG elements, `form-element` gives the SVG text, and a face shows an element that is in `face/data`. `examples/svg` makes a bar chart and writes `%chart.svg` to the disk.
- Web Crypto words (request of Ian): `crypto-digest` (SHA-1, SHA-256, SHA-384, SHA-512), `crypto-random`, `crypto-uuid`, `crypto-hmac`, `crypto-derive` (PBKDF2 with SHA-256, a key of 256 bits), `crypto-encrypt` and `crypto-decrypt` (AES-GCM with a random start value of 12 bytes before the data), `crypto-key-pair`, `crypto-sign` and `crypto-verify` (ECDSA P-256 with SHA-256, keys as JWK text). All use the edge request, in Node.js and in a browser.
- In a layout, a word that is not a command, a style or a color gives its value as a facet, as VID does.
- Paint effect: a face with `effect [paint [...]]` gets a canvas that keeps its pixels. `src/edge/paint.mjs` draws only the commands that are new. `examples/paint` uses it with `feel` and `engage`. The `draw` effect with SVG stays for shapes that a script changes.
- Reveal animations (request of Ian): the eight cell reveals of `stegosaurus/animations` (dissolve, wipe, blinds, ripple, melt, sweep, glitch, burn) are REBOL mezzanines in `src/view/boot.mjs`: `reveal-timers`, `reveal-looks`, `make-reveal-field`, `make-reveal`. A face with a reveal effect gets a canvas, and `src/edge/reveal.mjs` paints the canvas on each animation frame. The four letter reveals (rain, punch, printer, cipher) are not done.
- Web facets of layout: `rate`, `on-time` and `on-key` give timer and keyboard events to a face. The word `key` has the name of the key. `on-down`, `on-move` and `on-up` give pointer events, and the word `pointer` has the position in the face as a pair.
- Draw: a face with `effect [draw [...]]` gets an SVG element. The mezzanine `draw-element` reads `pen`, `fill-pen`, `line-width`, `line`, `box` and `circle`. `examples/paint` uses it.
- Examples (in git, with the start page `examples/index.html`): `examples/tamagotchi`, `examples/pong`, `examples/snake`, `examples/reveals`, `examples/paint`, `examples/svg`. Each one is an `index.html` with its REBOL script. Start `node bin/serve.mjs` and open `http://localhost:8017/examples/<name>/index.html`.
- Script mode of View: `show face` is the signal for a change. The page draws at the next animation frame, and it compares element trees to change the DOM. `layout` stays a JavaScript native.
- First speed comparison (2026-10-11, 2000 values in a chain, Node.js): the Plastron3 kernel needs 3700 ms to load and calculate, and 4600 ms after one edit. WebRebol evaluates the same 2000 expressions in 30 to 45 ms, but with no dependency graph and no sort. The comparison is not equal work.
- Files (strategy confirmed by Ian): the store keeps the disk as an immutable table of paths, bytes and folders (`src/store/disk.mjs`). The file functions are pure. In Node.js, `src/edge/folder.mjs` reads a folder at the start and writes the changes at the end (`WEBREBOL_DISK=<folder>`). In a browser, the host page saves the disk (decision of Ian, 2026-10-11): WebRebol gives the disk to the page as data, and the page (for example Plastron) keeps it with its own file system and encryption. WebRebol has no IndexedDB code. OPFS does not work at `file://` (see `~/projects/plastron-vfs` and the blog post "SQLite in the browser that reads pages on demand" on rheophile.ca).
- Networks (later): `http` and `https` use `fetch` from an edge module, and the machine stops until the answer comes. A browser cannot open a socket, thus `tcp`, `ftp`, `smtp` and `pop` give a REBOL error.
- Email is not planned. It needs an external service with secret keys, and Ian sees this as a security risk. `README.md` lists the limits.
- The function lists `reference/functions-*.txt` hold the help texts of REBOL Technologies. They stay out of the public repository.

## Sessions

- 2026-10-11 · ac9730f2 · Got REBOL 2.7.8 Core and View, wrote the function lists, and made the loader and `mold` with 191 reference cases. Made the git repository and published it (MIT). Made the evaluator machine. Added objects, paths, binding, error fields, series refinements `parse`, own error messages, the scalar types, the edge for the clock and Web Crypto, the disk, `random`, a faster store, 327 Core functions with 1563 evaluation cases, and the first part of View (`layout`) with 54 cases.

## Todos

- Loader: base-64 binary, a path that has a paren, `/a/b` as two refinements. The century of a year of 2 digits.
- Loader: keep the line ends of a block, because `mold` shows them. Remove the limit of 16 levels for nested braces.
- Errors: the `near` and `where` fields, and a `** Near:` line in the message.
- Evaluator: `catch/name`, `case/all`, a `for` with a bump of zero. `mold` of a block from `load` (REBOL puts a line end before the last bracket).
- Series: `find/any`, `select/skip`, `sort/skip`, `sort/compare`. The sequence of mixed types in `sort`.
- Parse: `break`, and `to` or `thru` with a block of choices. A paren in a parse rule runs in a machine of its own, thus `wait` and `view` cannot stop the machine there.
- Parse: REBOL does not end if a `some` or `any` rule matches and does not move the position. WebRebol stops such a loop.
- Natives: many REBOL functions accept more types than WebRebol does (for example `first` of a pair). Such a call can stop JavaScript with an exception. Each native must give a REBOL error.
- Types: the fields of a `money!` value (`m/1`), `and` for tuples, a time divided by zero, `now`, `random`. The `to-` functions for the types that remain.
- Disk: a `read` of a url with `fetch`. The time of a file is the start time of the session.
- Store: a change of a long series copies all its items, thus many appends to one long block are slow. The store never removes a series or a context that the program does not use (no garbage collection).
- Symbols: REBOL molds a word with the spelling of its first use. WebRebol keeps the spelling of each use.
- Functions: 327 of 443 Core functions have a first version. The 116 that remain are in four groups. (1) Possible now: `to`, `move`, `collect-words`, `resolve`, `new-line`, `unbind`, `alias`, `!`, `??`, `dump-obj`, `to-bitset`, `to-datatype`, `types-of`, `decode-url`, `parse-header`, `build-markup`, `decode-cgi`, `parse-xml`, `utf?`, `to-itime`, `to-idate`. (2) Need the edge or a known algorithm: `wait`, `input`, `ask`, `confirm`, `dt`, `compress`, `decompress`, `encloak`, `decloak`, `help`, `source`, `what`, `trace`, `protect`. Also `checksum/hash` and `checksum/key` with the method md5. (3) Need more work on the disk: `open`, `close`, `update`, `query`, `list-dir`, `in-dir`, `to-relative-file`, `echo`, and the short names `ls`, `pwd`, `rm`, `cd`. (4) Not possible in a browser, or not planned: the email functions, `call`, `launch`, `browse`, `secure`, the library functions, and the functions of the REBOL company services.
- Conformance, next: 356 tests of the public suite do not agree. Approximately 50 need `port!`, `struct!`, `library!` or `routine!`. The others are a long list of special cases: decimal and money precision, `for` with a series, `apply/only`, `return` in special positions, functions in a block compared with `lesser?`, the default `trim` with lines, `collect-words`, and the limits of time values.
- Types, next: key events through `engage`, the `away` action, the other draw commands (arc, polygon, text, image), a faster image (each draw command copies the changed rows, and the page makes all the bytes again for each change), `struct!` (a byte buffer, for the WebAssembly plan), the rules of `list!`.
- Crypto, next: RSA, ECDH, AES-CBC and AES-CTR, HKDF, and keys that the script cannot read.
- Loader, next: the 19 corpus scripts that do not agree: the constructs `#[datatype! ...]` and `#[unset!]`, base-64 binary, a tag or a string in a path, an empty file name.
- View, next: `draw` as SVG or canvas, `effect` with CSS, animations in REBOL that use the grid words, `to-image`, the action of a face as a function with `face` and `value`, a draw of only the faces that `show` names, `hide`, and `panel`.
- View, done: `layout` with 60 styles, the commands `across`, `below`, `return`, `at`, `pad`, `space`, `origin`, the facets text, size, width, color and action, `size-text`, and the color words. View, not done: the fonts `courier` and some sizes of bold and italic fonts, the default color of a button, text with more than one line, `style`, `guide`, `tab`, `panel`, the feel functions, `view`, `show`, the frame loop, drawing on a canvas, `draw`, `effect`, and events.
