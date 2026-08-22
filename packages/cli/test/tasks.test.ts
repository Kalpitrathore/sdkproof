import assert from "node:assert/strict";
import { test } from "node:test";
import { importsPackage, validateTasks } from "../src/tasks.ts";

test("importsPackage catches every way of naming the package under test", () => {
  const pkg = "@tanstack/react-table";
  assert.ok(importsPackage(`import { useTable } from "${pkg}";`, pkg));
  assert.ok(importsPackage(`import type { ColumnDef } from '${pkg}/core';`, pkg));
  assert.ok(importsPackage(`const m = await import("${pkg}");`, pkg));
  assert.ok(importsPackage(`const m = require("${pkg}");`, pkg));
  assert.ok(importsPackage(`import "${pkg}";`, pkg));
  assert.ok(!importsPackage(`import { x } from "@tanstack/react-query";`, pkg));
  assert.ok(!importsPackage(`// mentions ${pkg} in a comment`, pkg));
});

test("a skeleton that imports the package under test is thrown away", () => {
  const { tasks, rejected } = validateTasks(
    [
      {
        id: "leaks-the-import",
        area: "core",
        difficulty: "easy",
        prompt: "Export buildTable(data).",
        skeleton: 'import { useTable } from "@tanstack/react-table";\n// export buildTable\n',
      },
      {
        id: "clean",
        area: "core",
        difficulty: "easy",
        prompt: "Export buildTable(data) using the library.",
        skeleton: "export type Row = { id: string };\n// write buildTable(rows: Row[]) and export it\n",
      },
    ],
    "@tanstack/react-table",
  );
  assert.deepEqual(tasks.map((t) => t.id), ["clean"]);
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason, /gives away the entrypoint/);
});

test("a task that never asks for an export is thrown away", () => {
  // verify() passes any candidate with no diagnostics, and a file with no
  // implementation has none. Without an export to produce, an empty answer
  // scores as a perfect one.
  const { tasks, rejected } = validateTasks(
    [{ id: "no-export", area: "core", difficulty: "easy", prompt: "Do something.", skeleton: "// tbd\n" }],
    "zod",
  );
  assert.equal(tasks.length, 0);
  assert.match(rejected[0].reason, /cannot be told from an empty file/);
});

test("duplicate ids are dropped, and the docsHint element is not a task", () => {
  const { tasks, docsHint, rejected } = validateTasks(
    [
      { docsHint: "Zod validates data at runtime." },
      { id: "a", area: "core", difficulty: "easy", prompt: "export one", skeleton: "" },
      { id: "a", area: "core", difficulty: "hard", prompt: "export two", skeleton: "" },
    ],
    "zod",
  );
  assert.equal(docsHint, "Zod validates data at runtime.");
  assert.deepEqual(tasks.map((t) => t.id), ["a"]);
  assert.deepEqual(rejected, [{ id: "a", reason: "duplicate id" }]);
});

test("an unknown difficulty falls back to medium rather than failing the run", () => {
  const { tasks } = validateTasks(
    [{ id: "a", area: "Core", difficulty: "extreme", prompt: "export it", skeleton: "" }],
    "zod",
  );
  assert.equal(tasks[0].difficulty, "medium");
  assert.equal(tasks[0].area, "core");
});
