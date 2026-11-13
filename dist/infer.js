import { allFunctions, definitionsInFile, fileScopedKey } from "./extract.js";
import { buildCallTree, buildCallTreeFromInfo, exportsInFile, indexedFiles, resolveCall, resolveEntry, resolveEntrypointFile, } from "./calltree.js";
import { diffTrees, treeHasChanges } from "./diff.js";
import { walkDiff } from "./diffwalk.js";
function emptyCallTree(key, label) {
    return { key, label, children: [] };
}
/**
 * Every definition a call can resolve to: extracted functions plus the
 * `new Class` aliases {@link buildIndex} adds for constructors.
 */
function definitionsOf(index) {
    const out = new Set();
    for (const fn of allFunctions(index)) {
        out.add(fn);
        if (fn.key.endsWith(".constructor")) {
            const newKey = `new ${fn.key.slice(0, -".constructor".length)}`;
            for (const alias of definitionsInFile(index, fn.file, newKey)) {
                out.add(alias);
            }
        }
    }
    for (const fn of index.values())
        out.add(fn);
    return [...out];
}
/**
 * Build the resolved definition graph for one snapshot.
 *
 * A call tree only depends on call keys, branch keys and which definition each
 * call resolves to — never on line numbers — so that is all a body records.
 */
function definitionGraph(index) {
    const ids = new Map();
    const id = (fn) => {
        let value = ids.get(fn);
        if (value === undefined) {
            const rank = definitionsInFile(index, fn.file, fn.key).indexOf(fn);
            value = `${fileScopedKey(fn.file, fn.key)}\0${rank}`;
            ids.set(fn, value);
        }
        return value;
    };
    const bodies = new Map();
    const callers = new Map();
    for (const fn of definitionsOf(index)) {
        const self = id(fn);
        const encode = (steps) => steps.map((step) => {
            if (step.type === "branch") {
                return ["b", step.key, encode(step.children)];
            }
            const target = resolveCall(step.key, index, step, fn);
            const targetId = target ? id(target) : null;
            if (targetId) {
                let set = callers.get(targetId);
                if (!set) {
                    set = new Set();
                    callers.set(targetId, set);
                }
                set.add(self);
            }
            return ["c", step.key, targetId, step.children ? encode(step.children) : 0];
        });
        bodies.set(self, JSON.stringify(encode(fn.steps)));
    }
    return { id, bodies, callers };
}
/** Definitions whose body changed, plus their callers up to `maxDepth` calls away. */
function affectedDefinitions(before, after, maxDepth) {
    const distance = new Map();
    const queue = [];
    for (const id of new Set([...before.bodies.keys(), ...after.bodies.keys()])) {
        if (before.bodies.get(id) === after.bodies.get(id))
            continue;
        distance.set(id, 0);
        queue.push(id);
    }
    for (let i = 0; i < queue.length; i += 1) {
        const callee = queue[i];
        const nextDistance = distance.get(callee) + 1;
        if (nextDistance > maxDepth)
            continue;
        for (const graph of [before, after]) {
            for (const caller of graph.callers.get(callee) ?? []) {
                if (distance.has(caller))
                    continue;
                distance.set(caller, nextDistance);
                queue.push(caller);
            }
        }
    }
    return new Set(distance.keys());
}
export function changeSet(before, after, maxDepth) {
    const beforeGraph = definitionGraph(before);
    const afterGraph = definitionGraph(after);
    return {
        before: { index: before, id: beforeGraph.id },
        after: { index: after, id: afterGraph.id },
        affected: affectedDefinitions(beforeGraph, afterGraph, maxDepth),
    };
}
/**
 * Index keys whose expanded call tree may differ between the snapshots.
 *
 * A superset of the keys {@link diffEntry} reports as changed: a tree can only
 * change when its root resolves to a different definition, or when a
 * definition it reaches changed body. Line shifts alone never qualify.
 */
export function affectedEntries(before, after, maxDepth, changes = changeSet(before, after, maxDepth)) {
    const { affected } = changes;
    const keys = [];
    for (const key of new Set([...before.keys(), ...after.keys()])) {
        if (key.startsWith("new "))
            continue;
        const beforeRoot = before.get(key);
        const afterRoot = after.get(key);
        if (!beforeRoot || !afterRoot) {
            keys.push(key);
            continue;
        }
        const beforeId = changes.before.id(beforeRoot);
        const afterId = changes.after.id(afterRoot);
        if (beforeId !== afterId ||
            affected.has(beforeId) ||
            affected.has(afterId)) {
            keys.push(key);
        }
    }
    return keys.sort((a, b) => a.localeCompare(b));
}
function changedDiffs(keys, before, after, maxDepth, changes) {
    const found = [];
    for (const entry of keys) {
        const diff = diffEntry(entry, before, after, maxDepth, changes);
        if (diff)
            found.push({ entry, diff });
    }
    return found;
}
/**
 * Inferred entrypoints with their diffs: exported functions whose expanded
 * call trees differ, else any changed function.
 *
 * Diffs collapse unchanged and repeated callees unless `full` is set.
 */
export function inferEntryDiffs(before, after, maxDepth, options = {}) {
    const changes = changeSet(before, after, maxDepth);
    const walk = options.full ? undefined : changes;
    const affected = affectedEntries(before, after, maxDepth, changes);
    const exported = affected.filter((key) => Boolean(before.get(key)?.exported || after.get(key)?.exported));
    const found = changedDiffs(exported, before, after, maxDepth, walk);
    if (found.length > 0)
        return found;
    const checked = new Set(exported);
    return changedDiffs(affected.filter((key) => !checked.has(key)), before, after, maxDepth, walk);
}
/**
 * Infer entrypoints: exported functions whose expanded call trees differ,
 * plus any explicitly requested symbol entries.
 */
export function inferEntries(before, after, explicit, maxDepth) {
    if (explicit.length > 0) {
        const entries = [];
        for (const entry of explicit) {
            const key = resolveEntry(entry, after) ?? resolveEntry(entry, before);
            if (!key)
                throw new Error(`Entrypoint not found: ${entry}`);
            if (!entries.includes(key))
                entries.push(key);
        }
        return entries;
    }
    return inferEntryDiffs(before, after, maxDepth).map((found) => found.entry);
}
/**
 * Expand explicit `-e` symbols and `--file` paths into concrete diff roots.
 */
export function resolveExplicitDiffEntries(before, after, symbols, files = []) {
    const out = [];
    const seen = new Set();
    for (const entry of symbols) {
        const key = resolveEntry(entry, after) ?? resolveEntry(entry, before);
        if (!key)
            throw new Error(`Entrypoint not found: ${entry}`);
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ key });
    }
    for (const entry of files) {
        const file = resolveEntrypointFile(entry, [
            ...indexedFiles(before),
            ...indexedFiles(after),
        ]);
        const keys = [
            ...new Set([
                ...exportsInFile(file, before),
                ...exportsInFile(file, after),
            ].map((info) => info.key)),
        ].sort((a, b) => a.localeCompare(b));
        if (keys.length === 0) {
            throw new Error(`No exported entrypoints in ${file}`);
        }
        for (const key of keys) {
            const id = `${file}\0${key}`;
            if (seen.has(id))
                continue;
            seen.add(id);
            const beforeInfo = allFunctions(before).find((fn) => fn.file === file && fn.key === key && fn.exported);
            const afterInfo = allFunctions(after).find((fn) => fn.file === file && fn.key === key && fn.exported);
            out.push({ key, beforeInfo, afterInfo, file });
        }
    }
    return out;
}
/**
 * Diff one entry. With `changes`, unchanged and repeated callees are collapsed
 * (see `walkDiff`); without, both full trees are built and diffed.
 */
export function diffEntry(key, before, after, maxDepth, changes) {
    const beforeKey = resolveEntry(key, before) ?? key;
    const afterKey = resolveEntry(key, after) ?? key;
    const hasBefore = before.has(beforeKey);
    const hasAfter = after.has(afterKey);
    if (!hasBefore && !hasAfter)
        return null;
    if (changes) {
        const diff = walkDiff(hasBefore ? { key: beforeKey } : null, hasAfter ? { key: afterKey } : null, changes.before, changes.after, changes.affected, maxDepth);
        if (hasBefore && hasAfter && !treeHasChanges(diff))
            return null;
        return diff;
    }
    const beforeTree = hasBefore
        ? buildCallTree(beforeKey, before, maxDepth)
        : emptyCallTree(afterKey, after.get(afterKey)?.label ?? afterKey);
    const afterTree = hasAfter
        ? buildCallTree(afterKey, after, maxDepth)
        : emptyCallTree(beforeKey, before.get(beforeKey)?.label ?? beforeKey);
    if (!hasBefore && hasAfter) {
        const diff = diffTrees({ key: afterKey, label: afterTree.label, children: [] }, afterTree);
        return { ...diff, status: "added" };
    }
    if (hasBefore && !hasAfter) {
        const diff = diffTrees(beforeTree, {
            key: beforeKey,
            label: beforeTree.label,
            children: [],
        });
        return { ...diff, status: "removed" };
    }
    const diff = diffTrees(beforeTree, afterTree);
    if (!treeHasChanges(diff))
        return null;
    return diff;
}
/** Diff two file-pinned definitions (or missing on one side). */
export function diffPinnedEntry(key, beforeInfo, afterInfo, before, after, maxDepth, changes) {
    if (!beforeInfo && !afterInfo)
        return null;
    if (changes) {
        const diff = walkDiff(beforeInfo ? { key, info: beforeInfo } : null, afterInfo ? { key, info: afterInfo } : null, changes.before, changes.after, changes.affected, maxDepth);
        if (beforeInfo && afterInfo && !treeHasChanges(diff))
            return null;
        return diff;
    }
    const beforeTree = beforeInfo
        ? buildCallTreeFromInfo(beforeInfo, before, maxDepth)
        : emptyCallTree(key, afterInfo?.label ?? key);
    const afterTree = afterInfo
        ? buildCallTreeFromInfo(afterInfo, after, maxDepth)
        : emptyCallTree(key, beforeInfo?.label ?? key);
    if (!beforeInfo && afterInfo) {
        const diff = diffTrees({ key, label: afterTree.label, children: [] }, afterTree);
        return { ...diff, status: "added" };
    }
    if (beforeInfo && !afterInfo) {
        const diff = diffTrees(beforeTree, {
            key,
            label: beforeTree.label,
            children: [],
        });
        return { ...diff, status: "removed" };
    }
    const diff = diffTrees(beforeTree, afterTree);
    if (!treeHasChanges(diff))
        return null;
    return diff;
}
