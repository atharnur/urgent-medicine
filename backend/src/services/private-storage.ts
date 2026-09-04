import fs from "node:fs/promises";
import path from "node:path";

export type StoredObject = { key: string; absolutePath: string };

const root = path.resolve(process.env.PRIVATE_UPLOAD_DIR ?? path.join(process.cwd(), "storage/private"));

function safeKey(key: string) {
  const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..") || normalized.includes("//")) throw Object.assign(new Error("Invalid storage key"), { statusCode: 400, code: "INVALID_STORAGE_KEY" });
  return normalized;
}

export async function putPrivateObject(key: string, data: Buffer): Promise<StoredObject> {
  const relative = safeKey(key);
  const absolutePath = path.resolve(root, relative);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("Invalid storage path"), { statusCode: 400, code: "INVALID_STORAGE_KEY" });
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, data, { flag: "wx" });
  return { key: relative, absolutePath };
}

export async function readPrivateObject(key: string): Promise<Buffer> {
  const relative = safeKey(key);
  const absolutePath = path.resolve(root, relative);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("Invalid storage path"), { statusCode: 400, code: "INVALID_STORAGE_KEY" });
  return fs.readFile(absolutePath);
}

export async function deletePrivateObject(key: string): Promise<void> {
  const relative = safeKey(key);
  const absolutePath = path.resolve(root, relative);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) throw Object.assign(new Error("Invalid storage path"), { statusCode: 400, code: "INVALID_STORAGE_KEY" });
  await fs.rm(absolutePath, { force: true });
}
