// States: a thing that continues, shown at one moment.
/** @import { Datatype } from "./categories.mjs" */

/**
 * A Datum is a state that holds one REBOL value at one moment.
 * @typedef {object} Datum
 * @property {Datatype} type - The REBOL type of the value.
 * @property {number | string | boolean | null | number[] | Datum[] | object} value - The data of the value. A time is in nanoseconds. A series in a store has its number and its index.
 * @property {number} [bind] - The number of the context of a word.
 * @property {Datum[]} [args] - The values of the fields arg1, arg2 and arg3 of an error.
 * @madeby readToken, loadSource, makeLogic, makeWord, readItem, findError, readContext
 * @changedby 20 declarations in datum, bitsets, loops, scalars, series, parts, store
 * @readby 43 declarations in call, machine, path, spec, bitsets, compare, control, convert, digest, edit, faults, files, loops, report, scalars, series, mold, store, elements
 */

/**
 * A Store is a state that holds the series, the contexts and the output of one REBOL session.
 * @typedef {object} Store
 * @property {object} series - The table of the content of each series, by its number.
 * @property {object} contexts - The table of the values of the words of each context, by its number.
 * @property {object} globals - The table of the global words that the session set, by the hash of their key.
 * @property {Object<string, Datum>} base - The words of REBOL: the functions, the constants and the datatypes. A session does not change this table.
 * @property {number} next - The number that the next series or context gets.
 * @property {string} output - The text that the session printed.
 * @property {Object<string, object>} disk - The files and the folders of the session, by their full path.
 * @property {string} directory - The current folder. It ends with "/".
 * @property {number} started - The time at the start of the session, in milliseconds. A file that the session writes gets this time.
 * @property {number} seed - The state of the generator of random numbers.
 * @property {Datum[]} windows - The faces that are windows of the session.
 * @property {boolean} dirty - A face changed, and the page did not draw it yet.
 * @madeby BOOT_BUDGET
 * @changedby 12 declarations in store, windows
 * @readby 19 declarations in machine, compare, digest, loops, report, series, mold, store, elements, windows
 */

/**
 * A Machine is a state that holds one evaluation between two steps.
 * @typedef {object} Machine
 * @property {Store} store
 * @property {{ id: number, index: number } | null} cursor - The position of the next value to evaluate.
 * @property {Datum} value - The result of the last expression.
 * @property {{ top: object, below: object } | null} frames - The stack of the frames that wait for a value. The top frame is first.
 * @property {"next" | "operand" | "give" | "throw" | "done" | "wait"} mode - The work of the next step.
 * @property {object | null} [request] - The work that the machine waits for, when the mode is "wait".
 * @property {{ kind: string, value: Datum } | null} thrown - The error, the return or the break that moves up the stack.
 * @madeby interpretWithEdge, makeMachine, startSource, interpretSource
 * @changedby 32 declarations in drive, call, evaluate, machine, path, run, bitsets, control, convert, edit, faults, files, loops, series
 * @readby atEnd, readItem, findError, showResult
 */

export {};
