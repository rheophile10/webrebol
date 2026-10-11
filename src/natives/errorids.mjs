// bin/record.mjs makes this file from REBOL Core 2.7.8. Do not change it.

/**
 * The first code and the ids of each category of REBOL errors, without the message texts.
 */
export const ERROR_IDS = {
  "throw": { code: 0, ids: ["no-loop","no-function","no-catch"] },
  "note": { code: 100, ids: ["no-load","exited"] },
  "syntax": { code: 200, ids: ["invalid","missing","header"] },
  "script": { code: 300, ids: ["no-value","need-value","no-arg","expect-arg","expect-set","invalid-arg","invalid-op","no-op-arg","no-return","not-defined","no-refine","invalid-path","cannot-use","already-used","out-of-range","past-end","no-memory","block-lines","invalid-part","wrong-denom","else-gone","bad-press","bad-prompt","bad-port-action","needs","locked-word","too-many-refines","dup-vars","feature-na","bad-bad","limit-hit","call-fail","face-error","face-reused","bad-refine","permission"] },
  "math": { code: 400, ids: ["zero-divide","overflow","positive"] },
  "access": { code: 500, ids: ["cannot-open","not-open","already-open","already-closed","read-error","invalid-spec","socket-open","no-connect","no-delete","no-rename","no-make-dir","protocol","timeout","new-level","security","invalid-path","bad-image","would-block","serial-timeout","write-error","not-open-lib"] },
  "command": { code: 600, ids: ["fmt-too-short","fmt-no-struct-size","fmt-no-struct-align","fmt-bad-word","fmt-type-mismatch","fmt-size-mismatch","dll-arg-count","empty-command","db-not-open","db-too-many","cant-free","nothing-to-free","ssl-error"] },
  "user": { code: 800, ids: ["message"] },
  "internal": { code: 900, ids: ["bad-path","not-here","stack-overflow","globals-full","bad-internal"] },
};
