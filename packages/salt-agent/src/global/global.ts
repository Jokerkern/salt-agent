import path from "path"
import os from "os"

const app = "salt-agent"

function data() {
  return process.env["SALT_DATA_DIR"] || path.join(os.homedir(), `.${app}`)
}

export namespace Global {
  export const Path = {
    get data() {
      return data()
    },
    get storage() {
      return path.join(data(), "storage")
    },
    get log() {
      return path.join(data(), "log")
    },
    get config() {
      return path.join(data(), "config")
    },
    get workplace() {
      return path.join(data(), "workplace")
    },
  }
}
