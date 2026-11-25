import { afterEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  linkSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { LATEST_DATABASE_VERSION, migrate } from "../src/database.js";
import { runData } from "../src/maintenance/data.js";

const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "linjian-maintenance-test-"));
  roots.push(root);
  const dbPath = join(root, "source.sqlite"),
    uploads = join(root, "uploads");
  mkdirSync(uploads);
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0");
  migrate(db);
  db.prepare(
    "INSERT INTO assets VALUES ('local','picture.png','image/png',3,'local','picture.png',NULL,'now')",
  ).run();
  writeFileSync(join(uploads, "picture.png"), "abc");
  return { root, dbPath, uploads, db };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("offline data maintenance", () => {
  it("captures WAL-only changes without changing source files, then restores a standalone copy", () => {
    const { root, dbPath, uploads, db } = setup();
    db.exec("INSERT INTO categories VALUES ('wal-sentinel','sentinel',999)");
    const beforeNames = readdirSync(root),
      before = new Map(
        beforeNames
          .filter((n) => n.startsWith("source.sqlite"))
          .map((n) => [n, readFileSync(join(root, n))]),
      );
    const backup = join(root, "backup"),
      restore = join(root, "restore");
    expect(runData(["backup", dbPath, uploads, backup])).toBe(0);
    expect(readdirSync(root).filter((n) => n.startsWith("source.sqlite"))).toEqual(
      beforeNames.filter((n) => n.startsWith("source.sqlite")),
    );
    for (const [name, bytes] of before) expect(readFileSync(join(root, name))).toEqual(bytes);
    expect(runData(["restore", backup, restore])).toBe(0);
    expect(readdirSync(restore).sort()).toEqual(["linjian.sqlite", "uploads"]);
    const restored = new DatabaseSync(join(restore, "linjian.sqlite"), { readOnly: true });
    expect(
      restored.prepare("SELECT id FROM categories WHERE id='wal-sentinel'").get(),
    ).toBeTruthy();
    restored.close();
    db.close();
  });
  it("reports missing, size mismatch, orphan, and quarantine separately", () => {
    const { root, dbPath, uploads, db } = setup();
    db.prepare(
      "INSERT INTO assets VALUES ('missing','missing','image/png',1,'local','missing',NULL,'now')",
    ).run();
    writeFileSync(join(uploads, "picture.png"), "xx");
    writeFileSync(join(uploads, "orphan"), "x");
    writeFileSync(join(uploads, ".trash-test"), "x");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const target = join(root, "backup");
    expect(runData(["backup", dbPath, uploads, target])).toBe(1);
    const output = log.mock.calls.flat().join("\n");
    for (const text of [
      "missing: missing",
      "size mismatch: picture.png",
      "orphan: orphan",
      "quarantine: .trash-test",
    ])
      expect(output).toContain(text);
    expect(readdirSync(target)).not.toContain("manifest.json");
    db.close();
  });
  it("rejects same-size tampering and extra files", () => {
    const { root, dbPath, uploads, db } = setup(),
      backup = join(root, "backup");
    expect(runData(["backup", dbPath, uploads, backup])).toBe(0);
    writeFileSync(join(backup, "uploads", "picture.png"), "xyz");
    expect(runData(["restore", backup, join(root, "restore")])).toBe(1);
    writeFileSync(join(backup, "uploads", "picture.png"), "abc");
    writeFileSync(join(backup, "extra"), "x");
    expect(runData(["restore", backup, join(root, "restore")])).toBe(1);
    db.close();
  });
  it("refuses symlinks, existing destinations, overlapping paths and rollback journals", () => {
    const { root, dbPath, uploads, db } = setup();
    symlinkSync(uploads, join(root, "link"));
    expect(runData(["check", dbPath, join(root, "link")])).toBe(2);
    expect(runData(["backup", dbPath, uploads, uploads])).toBe(2);
    expect(runData(["backup", dbPath, uploads, root])).toBe(2);
    mkdirSync(join(root, "existing"));
    expect(runData(["backup", dbPath, uploads, join(root, "existing")])).toBe(2);
    writeFileSync(`${dbPath}-journal`, "nonempty");
    expect(runData(["check", dbPath, uploads])).toBe(2);
    db.close();
  });
  it("never creates a destination at a reserved source sidecar name", () => {
    const { root, dbPath, uploads, db } = setup();
    db.close();
    const names = readdirSync(root),
      bytes = readFileSync(dbPath);
    for (const suffix of ["-wal", "-shm", "-journal", "-mj123", "-wal2", "-shm2"]) {
      const destination = `${dbPath}${suffix}`;
      expect(existsSync(destination)).toBe(false);
      expect(runData(["backup", dbPath, uploads, destination])).toBe(2);
      expect(existsSync(destination)).toBe(false);
      expect(readdirSync(root)).toEqual(names);
      expect(readFileSync(dbPath)).toEqual(bytes);
    }
    expect(runData(["backup", dbPath, uploads, join(root, "valid-backup")])).toBe(0);
  }, 20_000);
  it("rejects a hardlinked main whose original basename has WAL-only changes", () => {
    const { root, dbPath, uploads, db } = setup();
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec("INSERT INTO categories VALUES ('wal-only','sentinel',998)");
    const alias = join(root, "alias.sqlite"),
      target = join(root, "backup");
    linkSync(dbPath, alias);
    const names = readdirSync(root),
      before = new Map(
        names
          .filter((name) => name.startsWith("source.sqlite"))
          .map((name) => [name, readFileSync(join(root, name))]),
      );
    expect(runData(["check", alias, uploads])).toBe(2);
    expect(runData(["backup", alias, uploads, target])).toBe(2);
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(root)).toEqual(names);
    for (const [name, bytes] of before) expect(readFileSync(join(root, name))).toEqual(bytes);
    db.close();
  }, 20_000);
  it("rejects a future schema and an unrelated lookalike without publishing a manifest", () => {
    const { root, dbPath, uploads, db } = setup();
    db.exec(`PRAGMA user_version=${LATEST_DATABASE_VERSION + 1}`);
    const future = join(root, "future");
    expect(runData(["check", dbPath, uploads])).toBe(2);
    expect(runData(["backup", dbPath, uploads, future])).toBe(2);
    expect(existsSync(join(future, "manifest.json"))).toBe(false);
    db.close();
    const bogusPath = join(root, "bogus.sqlite"),
      bogus = new DatabaseSync(bogusPath);
    bogus.exec(
      "CREATE TABLE assets(kind TEXT, path TEXT, byte_size INTEGER); PRAGMA user_version=1",
    );
    bogus.close();
    const unrelated = join(root, "unrelated");
    expect(runData(["backup", bogusPath, uploads, unrelated])).toBe(2);
    expect(existsSync(join(unrelated, "manifest.json"))).toBe(false);
  }, 20_000);
});
