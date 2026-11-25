import {
  createReadStream,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface StorageAdapter {
  put(filename: string, data: Buffer): string;
  read(path: string): Buffer | NodeJS.ReadableStream;
  quarantine(path: string): string;
  restore(quarantinedPath: string, originalPath: string): void;
  remove(path: string): void;
}

export class LocalStorage implements StorageAdapter {
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true });
  }
  put(filename: string, data: Buffer) {
    const path = `${randomUUID()}${extname(filename).toLowerCase()}`;
    writeFileSync(join(this.directory, path), data);
    return path;
  }
  read(path: string) {
    return createReadStream(join(this.directory, path));
  }
  quarantine(path: string) {
    const quarantinedPath = `.trash-${randomUUID()}-${path}`;
    renameSync(join(this.directory, path), join(this.directory, quarantinedPath));
    return quarantinedPath;
  }
  restore(quarantinedPath: string, originalPath: string) {
    renameSync(join(this.directory, quarantinedPath), join(this.directory, originalPath));
  }
  remove(path: string) {
    const full = join(this.directory, path);
    if (existsSync(full)) unlinkSync(full);
  }
}

export class MemoryStorage implements StorageAdapter {
  private files = new Map<string, Buffer>();
  put(filename: string, data: Buffer) {
    const path = `${randomUUID()}${extname(filename)}`;
    this.files.set(path, data);
    return path;
  }
  read(path: string) {
    const data = this.files.get(path);
    if (!data) throw new Error("文件不存在");
    return data;
  }
  quarantine(path: string) {
    const data = this.files.get(path);
    if (!data) throw new Error("文件不存在");
    const quarantinedPath = `.trash-${randomUUID()}-${path}`;
    this.files.set(quarantinedPath, data);
    this.files.delete(path);
    return quarantinedPath;
  }
  restore(quarantinedPath: string, originalPath: string) {
    const data = this.files.get(quarantinedPath);
    if (!data) throw new Error("隔离文件不存在");
    this.files.set(originalPath, data);
    this.files.delete(quarantinedPath);
  }
  remove(path: string) {
    this.files.delete(path);
  }
}
