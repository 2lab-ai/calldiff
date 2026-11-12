import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, onTestFinished, test } from "vitest";
import { loadGrammarPackage } from "../src/languages/grammars.js";

test("installing a second grammar keeps the first in the cache", () => {
  const cache = mkdtempSync(join(tmpdir(), "calldiff-grammar-keep-"));
  const previous = process.env.CALLDIFF_GRAMMAR_CACHE;
  process.env.CALLDIFF_GRAMMAR_CACHE = cache;
  onTestFinished(() => {
    if (previous === undefined) delete process.env.CALLDIFF_GRAMMAR_CACHE;
    else process.env.CALLDIFF_GRAMMAR_CACHE = previous;
    rmSync(cache, { recursive: true, force: true });
  });

  loadGrammarPackage("tree-sitter-python");
  loadGrammarPackage("tree-sitter-bash");

  // Without this, every run of a repo with two on-demand languages
  // reinstalls both from the network.
  expect(existsSync(join(cache, "node_modules", "tree-sitter-bash"))).toBe(true);
  expect(existsSync(join(cache, "node_modules", "tree-sitter-python"))).toBe(true);
});
