import path from "path";
import os from "os";

/**
 * Get the salt-agent data directory.
 * Priority: SALT_DATA_DIR env > ~/.salt-agent
 */
export function getDataDir(): string {
  return process.env.SALT_DATA_DIR || path.join(os.homedir(), ".salt-agent");
}

export function getSessionsDir(): string {
  return path.join(getDataDir(), "sessions");
}

export function getSettingsPath(): string {
  return path.join(getDataDir(), "settings.json");
}

/** Agent 工具（bash/read/write）的默认工作目录 */
export function getWorkplaceDir(): string {
  return path.join(getDataDir(), "workplace");
}
