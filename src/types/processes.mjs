// Processes: a thing that occurs: a step, an event, a command.

/**
 * A Frame is a process that waits for the value of an expression and then continues the work of its owner.
 * @typedef {object} Frame
 * @property {Function} step - The function that continues the work when the value comes.
 * @property {Function} [unwind] - The function that the machine calls when a thrown value moves through the frame.
 * @readby pushFrame, replaceTop
 */

export {};
