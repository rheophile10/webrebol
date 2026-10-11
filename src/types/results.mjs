// Results: a record that a stage of the data flow makes.
/** @import { Datatype } from "./categories.mjs" */

/**
 * A Token is a result that holds one lexical part of a source text.
 * @typedef {object} Token
 * @property {string} kind - The name of the pattern that found the part.
 * @property {string} text - The characters of the part.
 * @madeby scanTokens
 * @readby readToken
 */

/**
 * A Datum is a result that holds one REBOL value as the loader read it.
 * @typedef {object} Datum
 * @property {Datatype} type - The REBOL type of the value.
 * @property {number | string | boolean | null | number[] | Datum[]} value - The data of the value. A time is in nanoseconds.
 * @madeby readToken, loadSource
 * @changedby makeDatum
 * @readby moldDatum, moldItems
 */

export {};
