# WebRebol

WebRebol is an interpreter for REBOL 2 Core and REBOL 2 View that runs in JavaScript.
At this time, it loads a REBOL source text and molds the values. It does not evaluate.

## Use

- `node bin/webrebol.mjs '[a 1.5 "text"]'` loads the source text and shows the molded values.
- `npm test` compares WebRebol with the recorded results of REBOL 2.7.8.
- `npm run record` runs the cases of `test/cases/` in REBOL 2.7.8 and writes `test/golden/`.

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
