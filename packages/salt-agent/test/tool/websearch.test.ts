import { describe, it, expect } from "vitest"
import { WebSearchTool } from "../../src/tool/websearch.js"

describe("WebSearchTool", () => {
  it("has id 'websearch'", () => {
    expect(WebSearchTool.id).toBe("websearch")
  })

  it("init returns description and parameters", async () => {
    const info = await WebSearchTool.init()
    expect(info.description).toBeDefined()
    expect(info.parameters).toBeDefined()
  })

  // Note: actual search tests would require API keys.
  // We only test the tool structure here.
  it("parameters accept query", async () => {
    const info = await WebSearchTool.init()
    const parsed = info.parameters.parse({
      query: "TypeScript tutorial",
    })
    expect(parsed.query).toBe("TypeScript tutorial")
  })
})
