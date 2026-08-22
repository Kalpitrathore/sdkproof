import assert from "node:assert/strict";
import { test } from "node:test";
import { compareVersions, majorLines, requiredPeers, resolveVersion, stableVersions } from "../src/registry.ts";
import type { Packument } from "../src/registry.ts";

const p: Packument = {
  name: "demo",
  "dist-tags": { latest: "4.1.0", next: "5.0.0-rc.1" },
  versions: {
    "3.0.0": { name: "demo", version: "3.0.0" },
    "3.2.1": { name: "demo", version: "3.2.1" },
    "3.10.0": { name: "demo", version: "3.10.0" },
    "4.0.0": { name: "demo", version: "4.0.0" },
    "4.1.0": { name: "demo", version: "4.1.0" },
    "5.0.0-rc.1": { name: "demo", version: "5.0.0-rc.1" },
  },
  time: {
    created: "2020-01-01T00:00:00.000Z",
    "3.0.0": "2023-01-01T00:00:00.000Z",
    "3.2.1": "2023-06-01T00:00:00.000Z",
    "3.10.0": "2024-01-01T00:00:00.000Z",
    "4.0.0": "2025-09-01T00:00:00.000Z",
    "4.1.0": "2026-01-01T00:00:00.000Z",
    "5.0.0-rc.1": "2026-08-01T00:00:00.000Z",
  },
};

test("versions sort numerically, not as strings", () => {
  assert.ok(compareVersions("3.10.0", "3.2.1") > 0, "3.10.0 is newer than 3.2.1");
  assert.deepEqual(stableVersions(p), ["3.0.0", "3.2.1", "3.10.0", "4.0.0", "4.1.0"]);
});

test("prereleases are not what `npm i pkg` gives you, so they are not stable", () => {
  assert.ok(!stableVersions(p).includes("5.0.0-rc.1"));
  assert.equal(resolveVersion(p), "4.1.0");
});

test("resolveVersion accepts a tag, an exact version, a major and a major.minor", () => {
  assert.equal(resolveVersion(p, "next"), "5.0.0-rc.1");
  assert.equal(resolveVersion(p, "3.2.1"), "3.2.1");
  assert.equal(resolveVersion(p, "3"), "3.10.0");
  assert.equal(resolveVersion(p, "3.2"), "3.2.1");
  assert.throws(() => resolveVersion(p, "9"), /no version matching/);
});

test("a major line is dated from its FIRST release, not its latest patch", () => {
  // The drift window is measured from when the major landed. Dating it from the
  // newest patch makes a two-year-old major look like it shipped last month.
  assert.deepEqual(majorLines(p), [
    { major: 3, first: "2023-01-01T00:00:00.000Z", latest: "3.10.0" },
    { major: 4, first: "2025-09-01T00:00:00.000Z", latest: "4.1.0" },
  ]);
});

test("optional peers are the consumer's choice, so they are not required", () => {
  assert.deepEqual(
    requiredPeers({
      name: "demo",
      version: "1.0.0",
      peerDependencies: { react: "^19", "react-dom": "^19", graphql: "^16" },
      peerDependenciesMeta: { graphql: { optional: true } },
    }),
    ["react", "react-dom"],
  );
});
