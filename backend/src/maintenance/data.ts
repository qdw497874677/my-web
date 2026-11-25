import { createHash } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LATEST_DATABASE_VERSION } from "../database.js";

class Problem extends Error {
  constructor(
    public readonly code: 1 | 2,
    message: string,
  ) {
    super(message);
  }
}
type Entry = { path: string; size: number; sha256: string };
type Manifest = { version: 1; files: Entry[] };
const manifestLimit = 16 * 1024 * 1024;

// Require every existing path component to be real, including ancestors.
function safePath(input: string, mustExist = true): string {
  const path = resolve(input);
  let part: string = sep;
  for (const name of path.slice(1).split(sep).filter(Boolean)) {
    part = join(part, name);
    try {
      if (lstatSync(part).isSymbolicLink()) throw new Problem(2, "symlink path is not supported");
    } catch (error) {
      if (error instanceof Problem) throw error;
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && !mustExist && part === path)
        return path;
      throw error;
    }
  }
  return path;
}
function file(path: string): void {
  if (!lstatSync(path).isFile()) throw new Problem(2, "expected a regular file");
}
function directory(path: string): void {
  if (!lstatSync(path).isDirectory()) throw new Problem(2, "expected a directory");
}
function inside(a: string, b: string): boolean {
  const r = relative(a, b);
  return r === "" || (!r.startsWith(`..${sep}`) && r !== ".." && !isAbsolute(r));
}
function distinct(a: string, b: string): void {
  if (inside(a, b) || inside(b, a)) throw new Problem(2, "paths overlap");
}
function safeName(name: string): boolean {
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !/[\x00-\x1f\x7f]/.test(name)
  );
}
function files(path: string): string[] {
  directory(path);
  const names = readdirSync(path).sort();
  for (const name of names) {
    if (!safeName(name)) throw new Problem(2, "unsupported upload filename");
    file(join(path, name));
  }
  return names;
}
function copy(source: string, target: string): void {
  file(source);
  copyFileSync(source, target, constants.COPYFILE_EXCL);
  chmodSync(target, 0o600);
}
function newDirectory(path: string): void {
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}
function sidecarName(base: string, name: string): boolean {
  return (
    ["-wal", "-shm", "-journal", "-wal2", "-shm2"].some((suffix) => name === `${base}${suffix}`) ||
    name.startsWith(`${base}-mj`)
  );
}
function sourceDatabase(path: string): void {
  file(path);
  const base = basename(path);
  for (const name of readdirSync(dirname(path))) {
    if (!sidecarName(base, name)) continue;
    if (name === `${base}-wal` || name === `${base}-shm` || name === `${base}-journal`) {
      const sidecar = join(dirname(path), name);
      file(sidecar);
      if (name.endsWith("-journal") && lstatSync(sidecar).size !== 0)
        throw new Problem(2, "nonempty rollback journal is unsupported");
    } else throw new Problem(2, "unexpected SQLite sidecar is unsupported");
  }
}
function snapshot(db: string, uploads: string, out: string): void {
  sourceDatabase(db);
  const names = files(uploads);
  copy(db, join(out, "linjian.sqlite"));
  if (existsSync(`${db}-wal`)) copy(`${db}-wal`, join(out, "linjian.sqlite-wal"));
  newDirectory(join(out, "uploads"));
  for (const name of names) copy(join(uploads, name), join(out, "uploads", name));
  const connection = new DatabaseSync(join(out, "linjian.sqlite"));
  try {
    const result = connection.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
    if (result.busy !== 0) throw new Problem(2, "checkpoint busy");
    const mode = connection.prepare("PRAGMA journal_mode=DELETE").get() as { journal_mode: string };
    if (mode.journal_mode.toLowerCase() !== "delete")
      throw new Problem(2, "could not switch to DELETE journal mode");
  } finally {
    connection.close();
  }
}
function audit(root: string): string[] {
  const issues: string[] = [];
  const db = new DatabaseSync(join(root, "linjian.sqlite"), { readOnly: true });
  try {
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version;
    if (version < 1 || version > LATEST_DATABASE_VERSION)
      throw new Problem(2, "unsupported database version");
    const tables = new Set(
      (
        db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all() as { name: string }[]
      ).map((row) => row.name),
    );
    const required = [
      "owners",
      "sessions",
      "categories",
      "assets",
      "articles",
      "article_slugs",
      "albums",
      "photos",
      "subscriptions",
      version < 3 ? "featured" : "collections",
    ];
    if (
      required.some((name) => !tables.has(name)) ||
      (version >= 3 && !tables.has("collection_presentation"))
    )
      throw new Problem(2, "unrecognized database schema");
    const integrity = db.prepare("PRAGMA integrity_check").all() as { integrity_check: string }[];
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== "ok")
      issues.push("database integrity check failed");
    if (db.prepare("PRAGMA foreign_key_check").get())
      issues.push("database foreign key check failed");
    const rows = db.prepare("SELECT path, byte_size FROM assets WHERE kind='local'").all() as {
      path: string;
      byte_size: number;
    }[];
    const names = files(join(root, "uploads"));
    const present = new Set(names),
      referenced = new Set<string>();
    for (const row of rows) {
      if (typeof row.path !== "string" || !safeName(row.path)) {
        issues.push("invalid local asset path");
        continue;
      }
      referenced.add(row.path);
      if (!present.has(row.path)) issues.push(`missing: ${row.path}`);
      else if (lstatSync(join(root, "uploads", row.path)).size !== row.byte_size)
        issues.push(`size mismatch: ${row.path}`);
    }
    for (const name of names) {
      if (name.startsWith(".trash-")) issues.push(`quarantine: ${name}`);
      else if (!referenced.has(name)) issues.push(`orphan: ${name}`);
    }
  } finally {
    db.close();
  }
  return issues;
}
function digest(path: string): { size: number; sha256: string } {
  file(path);
  const fd = openSync(path, "r"),
    hash = createHash("sha256"),
    buffer = Buffer.allocUnsafe(128 * 1024);
  let size = 0;
  try {
    for (;;) {
      const n = readSync(fd, buffer, 0, buffer.length, null);
      if (!n) break;
      size += n;
      hash.update(buffer.subarray(0, n));
    }
  } finally {
    closeSync(fd);
  }
  return { size, sha256: hash.digest("hex") };
}
function inventory(root: string): Entry[] {
  return ["linjian.sqlite", ...files(join(root, "uploads")).map((name) => `uploads/${name}`)]
    .sort()
    .map((path) => ({ path, ...digest(join(root, path)) }));
}
function ensureHealthy(root: string): void {
  const issues = audit(root);
  if (issues.length)
    throw new Problem(
      1,
      `${issues.slice(0, 30).join("\n")}${issues.length > 30 ? `\n... ${issues.length - 30} more` : ""}`,
    );
}
function verifyManifest(root: string): void {
  const layout = readdirSync(root).sort();
  if (layout.join("\n") !== ["linjian.sqlite", "manifest.json", "uploads"].join("\n"))
    throw new Problem(1, "unexpected backup layout");
  file(join(root, "manifest.json"));
  if (lstatSync(join(root, "manifest.json")).size > manifestLimit)
    throw new Problem(1, "manifest too large");
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
  } catch {
    throw new Problem(1, "invalid manifest");
  }
  const actual = inventory(root);
  if (
    !manifest ||
    Object.keys(manifest).sort().join(",") !== "files,version" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== actual.length
  )
    throw new Problem(1, "invalid manifest");
  for (let i = 0; i < actual.length; i++) {
    const expected = manifest.files[i],
      entry = actual[i]!;
    if (
      !expected ||
      Object.keys(expected).sort().join(",") !== "path,sha256,size" ||
      expected.path !== entry.path ||
      expected.size !== entry.size ||
      expected.sha256 !== entry.sha256
    )
      throw new Problem(1, "manifest mismatch");
  }
}
function inputs(
  dbArg: string,
  uploadsArg: string,
  targetArg?: string,
): [string, string, string | undefined] {
  const db = safePath(dbArg),
    uploads = safePath(uploadsArg);
  file(db);
  if (lstatSync(db).nlink !== 1) throw new Problem(2, "hardlinked source database is unsupported");
  distinct(db, uploads);
  const target = targetArg === undefined ? undefined : safePath(targetArg, false);
  if (target) {
    distinct(db, target);
    distinct(uploads, target);
    const relativeTarget = relative(dirname(db), target);
    if (sidecarName(basename(db), relativeTarget.split(sep)[0]!))
      throw new Problem(2, "destination overlaps a reserved SQLite sidecar");
    if (existsSync(target)) throw new Problem(2, "destination already exists");
  }
  return [db, uploads, target];
}
export function runData(args: string[]): number {
  try {
    if ((args[0] === "check" && args.length === 3) || (args[0] === "backup" && args.length === 4)) {
      const [db, uploads, target] = inputs(args[1]!, args[2]!, args[3]);
      let root = target;
      if (!root) {
        const tempParent = safePath(tmpdir());
        if (inside(uploads, tempParent))
          throw new Problem(2, "temporary directory overlaps uploads");
        root = mkdtempSync(join(tempParent, "linjian-data-"));
      }
      if (target) newDirectory(root);
      try {
        snapshot(db, uploads, root);
        ensureHealthy(root);
        if (target) {
          const manifest = `${JSON.stringify({ version: 1, files: inventory(root) }, null, 2)}\n`;
          if (Buffer.byteLength(manifest) > manifestLimit)
            throw new Problem(2, "manifest too large to restore");
          const temporary = join(root, ".manifest.json.tmp");
          writeFileSync(temporary, manifest, { mode: 0o600, flag: "wx" });
          renameSync(temporary, join(root, "manifest.json"));
        }
      } finally {
        if (!target) rmSync(root, { recursive: true, force: true });
      }
    } else if (args[0] === "restore" && args.length === 3) {
      const source = safePath(args[1]!),
        target = safePath(args[2]!, false);
      distinct(source, target);
      directory(source);
      if (existsSync(target)) throw new Problem(2, "destination already exists");
      // Validate before copying, then validate the actual copied bytes again.
      verifyManifest(source);
      newDirectory(target);
      newDirectory(join(target, "uploads"));
      copy(join(source, "linjian.sqlite"), join(target, "linjian.sqlite"));
      copy(join(source, "manifest.json"), join(target, "manifest.json"));
      for (const name of files(join(source, "uploads")))
        copy(join(source, "uploads", name), join(target, "uploads", name));
      verifyManifest(target);
      ensureHealthy(target);
      // Manifest belongs to backup only; remove our own fresh copy after successful verification.
      rmSync(join(target, "manifest.json"));
    } else
      throw new Problem(
        2,
        "usage: data check <database> <uploads> | backup <database> <uploads> <new-dir> | restore <backup-dir> <new-dir>",
      );
    console.log("healthy");
    return 0;
  } catch (error) {
    if (error instanceof Problem) {
      console.error(error.message);
      return error.code;
    }
    const message = error instanceof Error ? error.message : "";
    if (/database disk image is malformed|file is not a database/i.test(message)) {
      console.error("database integrity check failed");
      return 1;
    }
    // Avoid leaking paths, data rows, or underlying SQL details.
    console.error("unsupported input, database, or I/O error");
    return 2;
  }
}
