import { type FunctionIndex } from "./extract.js";
import type { DiffNode, FunctionInfo } from "./types.js";
export type DiffSide = {
    index: FunctionIndex;
    /** Definition identity shared by both sides (see `changeSet`). */
    id: (fn: FunctionInfo) => string;
};
export type WalkRoot = {
    key: string;
    /** Pin the root to this definition instead of resolving `key`. */
    info?: FunctionInfo;
};
/**
 * Diff one entry. A missing side (`null`) makes the whole tree added or
 * removed, like `diffTrees` against an empty tree.
 */
export declare function walkDiff(beforeRoot: WalkRoot | null, afterRoot: WalkRoot | null, before: DiffSide, after: DiffSide, affected: Set<string>, maxDepth: number): DiffNode;
