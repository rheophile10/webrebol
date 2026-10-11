// The comparison of two element trees. This code is a copy of the diff of Plastron3 (src/libraries/web.mjs), by the same author.

/**
 * @usedby sameKind, diff
 */
const isText = (vnode) => "text" in vnode;

/**
 * Decides if two nodes are the same kind of node: both texts, or both elements with the same tag and key.
 * @uses isText
 * @usedby diff
 */
const sameKind = (before, after) => isText(before) === isText(after) && before.tag === after.tag && before.key === after.key;

/**
 * The patch of the attributes of one element, or no patch if nothing changed.
 * @usedby diff
 */
const diffProps = (before, after, path) => {
  const set = Object.fromEntries(Object.entries(after.props).filter(([name, value]) => before.props[name] !== value));
  const remove = Object.keys(before.props).filter((name) => !(name in after.props));
  return Object.keys(set).length === 0 && remove.length === 0 ? [] : [{ kind: "props", path, set, remove }];
};

/**
 * The patches of children without keys: the shared positions first, then the removals from the end, then the insertions.
 * @uses diff
 * @usedby diffChildren
 */
const positionalChildren = (before, after, path) => {
  const shared = Math.min(before.children.length, after.children.length);
  const inner = before.children.slice(0, shared).flatMap((child, index) => diff(child, after.children[index], [...path, index]));
  const removals = before.children.slice(shared).map((_, offset) => ({ kind: "remove", path: [...path, before.children.length - 1 - offset] }));
  const insertions = after.children.slice(shared).map((child, offset) => ({ kind: "insert", path: [...path, shared + offset], vnode: child }));
  return [...inner, ...removals, ...insertions];
};

/**
 * The positions of the longest increasing subsequence of the positions that are not -1. Those children stay where they are.
 * @usedby keyedChildren
 */
const longestIncreasing = (positions) => {
  const lengths = positions.reduce((found, position) => {
    const best = found.reduce((top, candidate, earlier) => (positions[earlier] < position && positions[earlier] >= 0 && candidate > top ? candidate : top), 0);
    return [...found, position < 0 ? 0 : best + 1];
  }, []);
  const walkBack = (index, length) => {
    if (length === 0) return [];
    const found = lengths.lastIndexOf(length, index);
    return [...walkBack(found - 1, length - 1), found];
  };
  return walkBack(lengths.length - 1, Math.max(0, ...lengths));
};

/**
 * Moves one item of a simulated list, as the page moves a node: out of its index, then before the reference index.
 * @usedby reorderStep
 */
const simulateMove = (list, from, before) => {
  const without = list.filter((_, index) => index !== from);
  const target = before === null ? without.length : before - (before > from ? 1 : 0);
  return [...without.slice(0, target), list[from], ...without.slice(target)];
};

/**
 * One step of the reorder, from the last new child to the first. A stable child stays. Another child moves before the next one. A new child is inserted before the next one.
 * The patches are in the sequence of the steps, because each step sees the list as the page sees it after the steps before.
 * @uses simulateMove
 * @usedby keyedChildren
 */
const reorderStep = (path, kept) => (state, child, index) => {
  const current = state.current.indexOf(child.key);
  if (current >= 0 && kept.stable.has(index)) return { ...state, next: current };
  if (current < 0) {
    const slot = state.next ?? state.current.length;
    return { current: [...state.current.slice(0, slot), child.key, ...state.current.slice(slot)], next: slot, patches: [...state.patches, { kind: "insert", path: [...path, slot], vnode: child }] };
  }
  const moved = simulateMove(state.current, current, state.next);
  return { current: moved, next: moved.indexOf(child.key), patches: [...state.patches, { kind: "move", path, from: current, before: state.next }] };
};

/**
 * The patches of children with keys: the removals, then the fewest moves and the insertions, then the patches inside each kept child.
 * @uses longestIncreasing, reorderStep, diff
 * @usedby diffChildren
 */
const keyedChildren = (before, after, path) => {
  const newKeys = new Set(after.children.map((child) => child.key));
  const gone = before.children.flatMap((child, index) => (newKeys.has(child.key) ? [] : [{ kind: "remove", path: [...path, index] }]));
  const removals = [...gone].reverse();
  const kept = before.children.filter((child) => newKeys.has(child.key));
  const keptIndex = new Map(kept.map((child, index) => [child.key, index]));
  const positions = after.children.map((child) => keptIndex.get(child.key) ?? -1);
  const stable = new Set(longestIncreasing(positions));
  const start = { current: kept.map((child) => child.key), next: null, patches: [] };
  const reorder = after.children.reduceRight(reorderStep(path, { stable }), start).patches;
  const inner = after.children.flatMap((child, index) => (positions[index] < 0 ? [] : diff(kept[positions[index]], child, [...path, index])));
  return [...removals, ...reorder, ...inner];
};

/**
 * @usedby diffChildren
 */
const allKeyed = (children) => children.length > 0 && children.every((child) => child.key !== undefined);

/**
 * The patches of the children. Children that all have keys are matched by key, with the fewest moves. Others are matched by position.
 * @uses allKeyed, keyedChildren, positionalChildren
 * @usedby diff
 */
const diffChildren = (before, after, path) =>
  allKeyed(before.children) && allKeyed(after.children) ? keyedChildren(before, after, path) : positionalChildren(before, after, path);

/**
 * Compares two views and gives the patches that change the first into the second.
 * @param {object | undefined} before - The view on the page. Undefined if the page is empty.
 * @param {object | undefined} after - The new view. Undefined if the node goes.
 * @param {number[]} path - The position of the node: the index of each child from the root.
 * @returns {object[]}
 * @standard same - Two equal views give no patch.
 * @standard replace - A different tag or key gives one replace patch for the node.
 * @standard order - Without keys, the removals come after the inner patches and go from the last child to the first. The insertions come last.
 * @standard keyed - With keys on every child, a child that moves gives one move patch, and the children of the longest kept sequence give none.
 * @standard minimal - A list in the reverse sequence gives n - 1 moves, and a list with one child moved gives one move.
 * @uses sameKind, isText, diffProps, diffChildren
 * @usedby paint (src/edge/page.mjs), positionalChildren, keyedChildren
 */
export const diff = (before, after, path) => {
  if (before === undefined) return after === undefined ? [] : [{ kind: "insert", path, vnode: after }];
  if (after === undefined) return [{ kind: "remove", path }];
  if (!sameKind(before, after)) return [{ kind: "replace", path, vnode: after }];
  if (isText(after)) return before.text === after.text ? [] : [{ kind: "text", path, text: after.text }];
  return [...diffProps(before, after, path), ...diffChildren(before, after, path)];
};
