import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import { extractTarball } from "../src/tarball.ts";

/** Build one 512-byte ustar header plus its NUL-padded body. */
function entry(name: string, body: string, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, "utf8");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write("        ", 148); // checksum placeholder, per the format
  header.write(type, 156);
  header.write("ustar\0", 257);
  header.write("00", 263);
  let sum = 0;
  for (const b of header) sum += b;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);

  const data = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
  data.write(body, 0, "utf8");
  return Buffer.concat([header, data]);
}

function tarball(files: Record<string, string>): Buffer {
  return gzipSync(
    Buffer.concat([...Object.entries(files).map(([n, b]) => entry(n, b)), Buffer.alloc(1024)]),
  );
}

test("extractTarball strips npm's package/ prefix and honours the filter", () => {
  const gz = tarball({
    "package/package.json": '{"name":"x"}',
    "package/dist/index.d.ts": "export declare const a: string;",
    "package/dist/index.js": "module.exports = {};",
  });
  const files = extractTarball(gz, (p) => p === "package.json" || p.endsWith(".d.ts"));
  assert.deepEqual([...files.keys()].sort(), ["dist/index.d.ts", "package.json"]);
  assert.equal(files.get("package.json"), '{"name":"x"}');
  assert.equal(files.get("dist/index.d.ts"), "export declare const a: string;");
});

test("a GNU long-name entry names the file that follows it", () => {
  const long = "package/" + "a/".repeat(60) + "index.d.ts";
  const gz = gzipSync(
    Buffer.concat([
      entry("././@LongLink", long, "L"),
      entry("ignored-short-name", "export declare const deep: 1;"),
      Buffer.alloc(1024),
    ]),
  );
  const files = extractTarball(gz, () => true);
  assert.ok([...files.keys()].some((k) => k.endsWith("index.d.ts")), [...files.keys()].join(","));
});

test("an empty archive is empty, not an error", () => {
  assert.equal(extractTarball(gzipSync(Buffer.alloc(1024)), () => true).size, 0);
});
