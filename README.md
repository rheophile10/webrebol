# WebRebol

WebRebol is an interpreter for REBOL 2 Core and REBOL 2 View that runs in JavaScript.
At this time, it loads a REBOL source text and molds the values. It does not evaluate.

## Use

- `node bin/webrebol.mjs '[a 1.5 "text"]'` loads the source text and shows the molded values.
- `npm test` compares WebRebol with the recorded results of REBOL 2.7.8.
- `npm run record` runs the cases of `test/cases/` in REBOL 2.7.8 and writes `test/golden/`.

## Limits

WebRebol runs in a browser page. A browser page cannot open a socket. Thus some parts of REBOL 2 are not available.

| Part of REBOL 2 | State |
|---|---|
| Email: `send`, the `smtp`, `pop` and `esmtp` schemes | Not available, and not planned. Email needs an external service with secret keys, and this is a security risk. |
| `tcp`, `udp`, `dns`, `ftp`, `nntp`, `finger`, `whois`, `daytime` schemes | Not available. A browser page cannot open a socket. |
| `http` and `https` schemes | Not available at this time. Planned with `fetch`. The CORS rules of the browser will apply. |
| Files: `read`, `write`, `load`, `save`, the directory functions | Not available at this time. Planned as a disk in memory that IndexedDB keeps. A script cannot read the files of the computer. |
| `call`, `library!`, `routine!`, `struct!` | Not available. A browser page cannot start a program or load a native library. |
| View | Not available at this time. The pixels will not be equal to REBOL 2, because the fonts of a browser are different. |
| The body of a system function (`source append`, `second :append`) | Not available. Each function is written in JavaScript. |

A function that is not available gives a REBOL error. It does not fail silently.

## Reference

- `reference/functions.r` writes each function with its type and its specification. Keep the output out of the repository.
- REBOL 2.7.8 is the property of REBOL Technologies. Do not publish the programs in `reference/`.

## Route through the code

<!-- ste-doc -->
- scanTokens
- readToken
- loadSource
- moldDatum
- moldItems
<!-- /ste-doc -->
