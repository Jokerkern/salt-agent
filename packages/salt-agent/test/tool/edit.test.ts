import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { EditTool } from "../../src/tool/edit.js"
import { Workspace } from "../../src/workspace/workspace.js"
import { Storage } from "../../src/storage/storage.js"
import type { Tool } from "../../src/tool/tool.js"

const testDir = path.join(os.tmpdir(), `salt-edit-test-${Date.now()}`)
const fixtureDir = path.join(testDir, "fixtures")
process.env["SALT_DATA_DIR"] = testDir

async function cleanup() {
  await fs.rm(testDir, { recursive: true, force: true })
  Storage.reset()
}

function mockContext(overrides?: Partial<Tool.Context>): Tool.Context {
  return {
    sessionID: "ses_edit_test",
    messageID: "msg_edit_test",
    agent: "build",
    abort: new AbortController().signal,
    messages: [],
    metadata: () => {},
    ask: async () => {},
    ...overrides,
  }
}

describe("EditTool", () => {
  beforeEach(async () => {
    await cleanup()
    await fs.mkdir(fixtureDir, { recursive: true })
    Workspace.setDirectory(fixtureDir)
  })
  afterEach(cleanup)

  it("has id 'edit'", () => {
    expect(EditTool.id).toBe("edit")
  })

  it("replaces text in a file", async () => {
    const filePath = path.join(fixtureDir, "test.ts")
    await fs.writeFile(filePath, 'const x = "old";\nconst y = 1;\n')

    const info = await EditTool.init()
    const result = await info.execute(
      {
        filePath,
        oldString: 'const x = "old";',
        newString: 'const x = "new";',
      },
      mockContext(),
    )

    expect(result.output).toContain("成功")
    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toContain('"new"')
    expect(content).not.toContain('"old"')
  })

  it("creates new file when oldString is empty", async () => {
    const filePath = path.join(fixtureDir, "brand-new.ts")
    const info = await EditTool.init()
    await info.execute(
      {
        filePath,
        oldString: "",
        newString: "// new file content",
      },
      mockContext(),
    )

    const content = await fs.readFile(filePath, "utf-8")
    expect(content).toBe("// new file content")
  })

  it("throws when oldString equals newString", async () => {
    const info = await EditTool.init()
    await expect(
      info.execute(
        {
          filePath: path.join(fixtureDir, "test.ts"),
          oldString: "same",
          newString: "same",
        },
        mockContext(),
      ),
    ).rejects.toThrow("无需修改")
  })

  it("replaceAll replaces all occurrences", async () => {
    const filePath = path.join(fixtureDir, "multi.ts")
    await fs.writeFile(filePath, "foo\nbar\nfoo\nbaz\nfoo\n")

    const info = await EditTool.init()
    await info.execute(
      {
        filePath,
        oldString: "foo",
        newString: "qux",
        replaceAll: true,
      },
      mockContext(),
    )

    const content = await fs.readFile(filePath, "utf-8")
    expect(content).not.toContain("foo")
    expect(content.split("qux").length - 1).toBe(3)
  })

  it("throws when file not found and oldString is non-empty", async () => {
    const info = await EditTool.init()
    await expect(
      info.execute(
        {
          filePath: path.join(fixtureDir, "nonexistent.ts"),
          oldString: "something",
          newString: "else",
        },
        mockContext(),
      ),
    ).rejects.toThrow()
  })
})
