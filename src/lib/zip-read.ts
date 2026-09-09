import fs from "node:fs";
import AdmZip from "adm-zip";

export type ZipEntry = {
  name: string;
  content: Buffer;
};

export function readZip(zipPath: string): Promise<ZipEntry[]> {
  const zip = new AdmZip(zipPath);
  const entries = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => ({
      name: entry.entryName.replace(/\\/g, "/"),
      content: entry.getData(),
    }));
  return Promise.resolve(entries);
}

export function zipExists(zipPath: string): boolean {
  return fs.existsSync(zipPath);
}
