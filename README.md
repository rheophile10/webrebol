# WebRebol

WebRebol is an interpreter for REBOL 2 Core and REBOL 2 View that runs in JavaScript.
At this time, it evaluates REBOL source text with 327 of the 443 Core functions: arithmetic for all scalar types, comparison, control, loops, functions, objects, paths, binding, errors, series, text, conversions, and `parse`.

## Use

- `node bin/webrebol.mjs 'print "hello" 1 + 2'` evaluates the source text. It shows the printed text and the molded result.
- `WEBREBOL_DISK=./disk node bin/webrebol.mjs 'write %a.txt "hello"'` keeps the files of the session in the folder `./disk`.
- `node bin/serve.mjs` serves the pages. Open `http://localhost:8017/`. The start page lists the transitions, the games, and the page where you write a script.
- `npm test` compares WebRebol with the recorded results of REBOL 2.7.8.
- `npm run record` runs the cases of `test/cases/` in REBOL 2.7.8 and writes `test/golden/`.

## Use in a page

WebRebol has no code for IndexedDB. The host page gives the disk to a session and gets it back at the end.

```js
import { interpretWithEdge } from "./src/edge/drive.mjs";
import { showResult } from "./src/session/interpret.mjs";

// `disk` is a table of full paths. An entry is { kind: "folder" } or { kind: "file", bytes, modified }.
const machine = await interpretWithEdge('write %note.txt "hello"', 5000, disk);
const result = showResult(machine);
const printed = machine.store.output;
const nextDisk = machine.store.disk; // The page saves this, for example with its own encrypted file system.
```

## Proof of the same behavior

Three comparisons run the same code in REBOL 2.7.8 and in WebRebol:

| Comparison | Command | Result on 2026-10-11 |
|---|---|---|
| Recorded cases of this project | `npm test` | All 1851 cases agree. |
| Load of downloaded REBOL scripts | `node bin/compare.mjs` | 529 of 538 scripts agree (143726 lines of code). |
| The public REBOL core test suite | `node bin/conform.mjs` | 4061 of 4586 tests give the same outcome (88.6%). |

The downloaded scripts and the reports are in `corpus/`, which is not in git. REBOL View runs in Docker without a network.

## The look of View

The View functions are REBOL code on the web word `element`. A script changes the look with the object `theme`:

```
theme/font-family: "Georgia"
append theme/css [button [border-radius 6 background-color 20.120.60]]
view layout [button "OK" button "Special" css [background-color 150.40.40]]
```

- `theme/tags` gives the HTML tag of each style, and `theme/colors` gives its default color.
- `theme/css` gives CSS names and values for each style. A later entry wins.
- The facet `css [...]` gives CSS for one face.
- A script can replace the function `face-to-element` to make different elements.

## Limits

WebRebol runs in a browser page. A browser page cannot open a socket. Thus some parts of REBOL 2 are not available.

| Part of REBOL 2 | State |
|---|---|
| Email: `send`, the `smtp`, `pop` and `esmtp` schemes | Not available, and not planned. Email needs an external service with secret keys, and this is a security risk. |
| `tcp`, `udp`, `dns`, `ftp`, `nntp`, `finger`, `whois`, `daytime` schemes | Not available, and not planned. A browser page and its workers cannot open a socket. A relay server can, but it is a security risk. |
| `http` and `https` schemes | Not available at this time. Planned with `fetch`. The CORS rules of the browser will apply. |
| Files: `read`, `write`, `load`, `save`, `do`, the directory functions | Available. The files are on a disk in memory. In Node.js, the environment variable `WEBREBOL_DISK` names a folder that keeps the disk. In a browser, the host page keeps the disk: see "Use in a page". A script cannot read other files of the computer. |
| `random` | The numbers are random, but the same seed does not give the same numbers as REBOL 2. REBOL does not publish its algorithm. |
| `call` | Not available. A browser page cannot start a program. |
| `library!`, `routine!` | Not available. A browser page cannot load a native library. A possible later option is a WebAssembly module as the library. |
| `image!`, `event!`, `struct!` | Not available at this time. These types are possible, and they are planned. |
| View | `layout` gives a face tree with the same positions and sizes as REBOL View 2.7.8. `view` shows each face as a DOM element with CSS, and a click runs the action of a button. `draw`, `effect`, timers and keyboard events are not available at this time. The pixels are not equal to REBOL 2, because a browser draws the elements and the fonts. |
| The body of a system function (`source append`, `second :append`) | Not available. Each function is written in JavaScript. |
| `parse` with a loop that does not move | REBOL 2 does not end if a `some` or `any` rule matches and does not move the position. WebRebol stops the loop. |
| `checksum` with MD5 or with a key | REBOL 2.7.8 for 64-bit Linux gives wrong and changing MD5 results for 8 or more bytes. WebRebol gives the standard MD5 (RFC 1321) and the standard HMAC. |
| Error messages | The type, the id and the fields of an error agree with REBOL 2. The message text does not. WebRebol has its own messages, and each message ends with the REBOL type and id. A script that reads `system/error` does not get the REBOL texts. |

A function that is not available gives a REBOL error. It does not fail silently.

## Reference

- `reference/functions.r` writes each function with its type and its specification. Keep the output out of the repository.
- REBOL 2.7.8 is the property of REBOL Technologies. Do not publish the programs in `reference/`.

## Licence

WebRebol has the MIT licence. See `LICENSE`.

## Route through the code

<!-- ste-doc -->
- [`scanTokens`](src/data/tokens.mjs#L88) — Divides a source text into its lexical parts, without the spaces and the comments.
- [`readToken`](src/data/datum.mjs#L309) — Reads the REBOL value that one token shows.
- [`loadSource`](src/data/load.mjs#L183) — Makes the block of REBOL values that a source text shows.
- [`allocate`](src/store/store.mjs#L124) — Moves a loaded value into a store.
- [`makeMachine`](src/machine/machine.mjs#L213) — Makes a machine that is ready to evaluate a block.
- [`runMachine`](src/machine/run.mjs#L72) — Does steps until the evaluation is done or the budget is used.
- [`stepMachine`](src/machine/run.mjs#L52) — Does one step of the evaluation.
- [`evaluateOperand`](src/machine/evaluate.mjs#L52) — Evaluates the value at the cursor, without a look for an operator after it.
- [`startCall`](src/machine/call.mjs#L208) — Starts the call of a function.
- [`interpretSource`](src/session/interpret.mjs#L45) — Evaluates a REBOL source text in a new session, without an edge.
- [`showResult`](src/session/interpret.mjs#L56) — Makes the text that shows the end of an evaluation: the molded result, or the error.
- [`moldValue`](src/store/mold.mjs#L237) — Makes the REBOL source text of one value.
<!-- /ste-doc -->
