import { gunzipSync } from "node:zlib";

/**
 * Read an npm tarball in memory.
 *
 * The alternative was `npm pack` plus the `tar` binary, which is what the
 * research sweep shelled out to. Doing it here instead keeps the published CLI
 * to one dependency, works the same on Windows, and skips two subprocesses and
 * a disk round-trip per package — which matters because drift mode reads two
 * versions of every package it looks at.
 */

const BLOCK = 512;

function readString(buf: Buffer, offset: number, length: number): string {
  const raw = buf.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end === -1 ? raw.length : end).toString("utf8");
}

function readOctal(buf: Buffer, offset: number, length: number): number {
  const s = readString(buf, offset, length).trim();
  return s ? parseInt(s, 8) || 0 : 0;
}

/**
 * Extract the files of a gzipped tar whose (prefix-stripped) path passes
 * `keep`. npm puts everything under `package/`, which is stripped here so
 * callers see the paths as they appear in the installed package.
 */
export function extractTarball(gz: Buffer, keep: (p: string) => boolean): Map<string, string> {
  const tar = gunzipSync(gz);
  const files = new Map<string, string>();
  let longName: string | null = null;

  for (let off = 0; off + BLOCK <= tar.length; ) {
    const header = tar.subarray(off, off + BLOCK);
    // Two consecutive zero blocks end the archive.
    if (header.every((b) => b === 0)) break;

    let name = readString(header, 0, 100);
    const size = readOctal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const prefix = readString(header, 345, 155);
    if (prefix) name = `${prefix}/${name}`;
    if (longName !== null) {
      name = longName;
      longName = null;
    }

    const dataStart = off + BLOCK;
    const dataEnd = dataStart + size;
    // GNU long-name entry: the next header's real path is this entry's body.
    if (type === "L") {
      longName = tar.subarray(dataStart, dataEnd).toString("utf8").replace(/\0+$/, "");
    } else if (type === "0" || type === "\0") {
      const rel = name.replace(/^[^/]+\//, "");
      if (keep(rel)) files.set(rel, tar.subarray(dataStart, dataEnd).toString("utf8"));
    }

    off = dataStart + Math.ceil(size / BLOCK) * BLOCK;
  }
  return files;
}

export async function fetchTarball(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`tarball fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}
