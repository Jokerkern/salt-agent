import path from "path"
import os from "os"
import fs from "fs"

const DATA_DIR = process.env["SALT_DATA_DIR"] || path.join(os.homedir(), ".salt-agent")

export function getDataDir(): string {
  return DATA_DIR
}

export function getDbPath(): string {
  return path.join(DATA_DIR, "salt-agent.db")
}

export function getWorkplaceDir(): string {
  return process.env["SALT_WORKPLACE_DIR"] || path.join(DATA_DIR, "workplace")
}

export function ensureDirs(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(getWorkplaceDir(), { recursive: true })
}
