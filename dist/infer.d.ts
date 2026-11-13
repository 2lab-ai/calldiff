import type { FunctionIndex } from "./extract.js";
import { type DiffSide } from "./diffwalk.js";
import type { DiffNode, FunctionInfo } from "./types.js";
/** What changed between two snapshots, at definition granularity. */
export type ChangeSet = {
    before: DiffSide;
    after: DiffSide;
    /** Definitions whose call tree may differ: changed, or calling a changed one within maxDepth. */
    affected: Set<string>;
};
export declare function changeSet(before: FunctionIndex, after: FunctionIndex, maxDepth: number): ChangeSet;
/**
 * Index keys whose expanded call tree may differ between the snapshots.
 *
 * A superset of the keys {@link diffEntry} reports as changed: a tree can only
 * change when its root resolves to a different definition, or when a
 * definition it reaches changed body. Line shifts alone never qualify.
 */
export declare function affectedEntries(before: FunctionIndex, after: FunctionIndex, maxDepth: number, changes?: ChangeSet): string[];
export type InferredDiff = {
    entry: string;
    diff: DiffNode;
};
/**
 * Inferred entrypoints with their diffs: exported functions whose expanded
 * call trees differ, else any changed function.
 *
 * Diffs collapse unchanged and repeated callees unless `full` is set.
 */
export declare function inferEntryDiffs(before: FunctionIndex, after: FunctionIndex, maxDepth: number, options?: {
    full?: boolean;
}): InferredDiff[];
/**
 * Infer entrypoints: exported functions whose expanded call trees differ,
 * plus any explicitly requested symbol entries.
 */
export declare function inferEntries(before: FunctionIndex, after: FunctionIndex, explicit: string[], maxDepth: number): string[];
export type ExplicitDiffEntry = {
    key: string;
    beforeInfo?: FunctionInfo;
    afterInfo?: FunctionInfo;
    /** When set, trees are built from these file-pinned definitions. */
    file?: string;
};
/**
 * Expand explicit `-e` symbols and `--file` paths into concrete diff roots.
 */
export declare function resolveExplicitDiffEntries(before: FunctionIndex, after: FunctionIndex, symbols: string[], files?: string[]): ExplicitDiffEntry[];
/**
 * Diff one entry. With `changes`, unchanged and repeated callees are collapsed
 * (see `walkDiff`); without, both full trees are built and diffed.
 */
export declare function diffEntry(key: string, before: FunctionIndex, after: FunctionIndex, maxDepth: number, changes?: ChangeSet): DiffNode | null;
/** Diff two file-pinned definitions (or missing on one side). */
export declare function diffPinnedEntry(key: string, beforeInfo: FunctionInfo | undefined, afterInfo: FunctionInfo | undefined, before: FunctionIndex, after: FunctionIndex, maxDepth: number, changes?: ChangeSet): DiffNode | null;
