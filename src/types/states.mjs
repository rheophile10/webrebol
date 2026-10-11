// States: a thing that continues, shown at one moment.
/** @import { Datatype } from "./categories.mjs" */

/**
 * A Datum is a state that holds one REBOL value at one moment.
 * @typedef {object} Datum
 * @property {Datatype} type - The REBOL type of the value.
 * @property {number | string | boolean | null | number[] | Datum[] | object} value - The data of the value. A time is in nanoseconds. A series in a store has its number and its index.
 * @property {number} [bind] - The number of the context of a word.
 * @property {Datum[]} [args] - The values of the fields arg1, arg2 and arg3 of an error.
 * @madeby readToken, loadSource, makeLogic, makeWord, readItem, findError
 * @changedby 19 declarations in datum, bitsets, loops, scalars, series, parts, store
 * @readby 38 declarations in call, machine, path, spec, bitsets, compare, control, edit, faults, loops, report, scalars, series, mold, store
 */

/**
 * A Store is a state that holds the series, the contexts and the output of one REBOL session.
 * @typedef {object} Store
 * @property {Object<number, string | number[] | Datum[]>} series - The content of each series, by its number.
 * @property {Object<number, Object<string, Datum>>} contexts - The values of the words of each context, by its number.
 * @property {number} next - The number that the next series or context gets.
 * @property {string} output - The text that the session printed.
 * @madeby START_STORE
 * @changedby 9 declarations in store
 * @readby 15 declarations in machine, compare, loops, report, series, mold, store
 */

/**
 * A Machine is a state that holds one evaluation between two steps.
 * @typedef {object} Machine
 * @property {Store} store
 * @property {{ id: number, index: number } | null} cursor - The position of the next value to evaluate.
 * @property {Datum} value - The result of the last expression.
 * @property {{ top: object, below: object } | null} frames - The stack of the frames that wait for a value. The top frame is first.
 * @property {"next" | "operand" | "give" | "throw" | "done"} mode - The work of the next step.
 * @property {{ kind: string, value: Datum } | null} thrown - The error, the return or the break that moves up the stack.
 * @madeby makeMachine, interpretSource
 * @changedby 26 declarations in call, evaluate, machine, path, run, bitsets, control, edit, faults, loops, series
 * @readby atEnd, readItem, showResult, findError
 */

export {};
