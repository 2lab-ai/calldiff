import { type FunctionIndex } from "./extract.js";
import type { CallNode, FunctionInfo } from "./types.js";
/** Normalize user-facing paths for entry matching (`\` → `/`, strip `./`). */
export declare function normalizeEntryPath(entry: string): string;
/** Unique source paths present in an index. */
export declare function indexedFiles(index: FunctionIndex): string[];
/**
 * Resolve which indexed source files match a `--file` argument.
 * Exact path wins; otherwise a unique suffix match (`routes.ts` → `src/routes.ts`).
 */
export declare function matchEntrypointFiles(entry: string, files: Iterable<string>): string[];
/**
 * Resolve a `--file` argument to a single indexed source path.
 * Throws when missing or ambiguous.
 */
export declare function resolveEntrypointFile(entry: string, files: Iterable<string>): string;
/** Exported definitions in a concrete source path. */
export declare function exportsInFile(file: string, index: FunctionIndex): FunctionInfo[];
/**
 * Exported definitions for a `--file` argument against one index.
 * Throws when the path is missing/ambiguous; returns [] when the file has no exports.
 */
export declare function resolveFileEntrypoints(entry: string, index: FunctionIndex): FunctionInfo[];
/**
 * Resolve one call to a definition.
 *
 * A definition in the file the call was written in always wins: the bare-key
 * map is global and first-wins, so without this a call resolves to whichever
 * same-named function happened to be indexed first, grafting an unrelated body
 * into the tree. See #19.
 *
 * Falls back to the global map, which is what callers across file boundaries
 * (the common case) rely on.
 */
export declare function resolveCall(key: string, index: FunctionIndex, callSite?: {
    file?: string;
    line?: number;
}, owner?: FunctionInfo): FunctionInfo | undefined;
export declare function displayCallLabel(key: string, index: FunctionIndex, info?: FunctionInfo): string;
/**
 * Expand a function into a nested call tree by following known definitions.
 */
export declare function buildCallTree(entryKey: string, index: FunctionIndex, maxDepth: number): CallNode;
/**
 * Expand a specific definition. Used by `reach` when several functions share a
 * bare key and first-wins indexing would otherwise hide all but one body.
 */
export declare function buildCallTreeFromInfo(info: FunctionInfo, index: FunctionIndex, maxDepth: number): CallNode;
export declare function resolveEntry(entry: string, index: FunctionIndex): string | null;
/**
 * Every definition that matches `entry` (including those shadowed in the
 * bare-key map). Prefer exact bare-key hits; otherwise Class.method / `new X`.
 * Order is stable by label, then file — independent of extract order.
 */
export declare function resolveAllEntries(entry: string, index: FunctionIndex): FunctionInfo[];
