# WebRebol

WebRebol is an interpreter for REBOL 2 Core and REBOL 2 View that runs in JavaScript.
At this time, it evaluates REBOL source text with 327 of the 443 Core functions: arithmetic for all scalar types, comparison, control, loops, functions, objects, paths, binding, errors, series, text, conversions, and `parse`.

## Use

- `node bin/webrebol.mjs 'print "hello" 1 + 2'` evaluates the source text. It shows the printed text and the molded result.
- `WEBREBOL_DISK=./disk node bin/webrebol.mjs 'write %a.txt "hello"'` keeps the files of the session in the folder `./disk`.
- `npm test` compares WebRebol with the recorded results of REBOL 2.7.8.
- `npm run record` runs the cases of `test/cases/` in REBOL 2.7.8 and writes `test/golden/`.

## Limits

WebRebol runs in a browser page. A browser page cannot open a socket. Thus some parts of REBOL 2 are not available.

| Part of REBOL 2 | State |
|---|---|
| Email: `send`, the `smtp`, `pop` and `esmtp` schemes | Not available, and not planned. Email needs an external service with secret keys, and this is a security risk. |
| `tcp`, `udp`, `dns`, `ftp`, `nntp`, `finger`, `whois`, `daytime` schemes | Not available, and not planned. A browser page and its workers cannot open a socket. A relay server can, but it is a security risk. |
| `http` and `https` schemes | Not available at this time. Planned with `fetch`. The CORS rules of the browser will apply. |
| Files: `read`, `write`, `load`, `save`, `do`, the directory functions | Available. The files are on a disk in memory. In Node.js, the environment variable `WEBREBOL_DISK` names a folder that keeps the disk. In a browser, IndexedDB will keep the disk (not done). A script cannot read other files of the computer. |
| `random` | The numbers are random, but the same seed does not give the same numbers as REBOL 2. REBOL does not publish its algorithm. |
| `call` | Not available. A browser page cannot start a program. |
| `library!`, `routine!`, `struct!` | Not available. A browser page cannot load a native library. A possible later option is a WebAssembly module as the library. |
| View | Not available at this time. The pixels will not be equal to REBOL 2, because the fonts of a browser are different. |
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
- [`scanTokens`](src/data/tokens.mjs#L56) — Divides a source text into its lexical parts, without the spaces and the comments.
- [`readToken`](src/data/datum.mjs#L279) — Reads the REBOL value that one token shows.
- [`loadSource`](src/data/load.mjs#L83) — Makes the block of REBOL values that a source text shows.
- [`allocate`](src/store/store.mjs#L102) — Moves a loaded value into a store.
- [`makeMachine`](src/machine/machine.mjs#L206) — Makes a machine that is ready to evaluate a block.
- [`runMachine`](src/machine/run.mjs#L59) — Does steps until the evaluation is done or the budget is used.
- [`stepMachine`](src/machine/run.mjs#L40) — Does one step of the evaluation.
- [`evaluateOperand`](src/machine/evaluate.mjs#L51) — Evaluates the value at the cursor, without a look for an operator after it.
- [`startCall`](src/machine/call.mjs#L175) — Starts the call of a function.
- [`interpretSource`](src/natives/interpret.mjs#L44) — Evaluates a REBOL source text in a new session, without an edge.
- [`showResult`](src/natives/interpret.mjs#L54) — Makes the text that shows the end of an evaluation: the molded result, or the error.
- [`moldValue`](src/store/mold.mjs#L223) — Makes the REBOL source text of one value.
<!-- /ste-doc -->
