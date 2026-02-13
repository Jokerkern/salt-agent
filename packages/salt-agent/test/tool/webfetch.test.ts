import { describe, it, expect } from "vitest"
import { WebFetchTool } from "../../src/tool/webfetch.js"

describe("WebFetchTool", () => {
  it("has id 'webfetch'", () => {
    expect(WebFetchTool.id).toBe("webfetch")
  })

  it("init returns description and parameters", async () => {
    const info = await WebFetchTool.init()
    expect(info.description).toContain("URL")
    expect(info.parameters).toBeDefined()
  })

  // Note: actual HTTP fetch tests would require network access.
  // We only test the tool structure here.
  it("parameters accept url and format", async () => {
    const info = await WebFetchTool.init()
    const parsed = info.parameters.parse({
      url: "https://example.com",
      format: "markdown",
    })
    expect(parsed.url).toBe("https://example.com")
    expect(parsed.format).toBe("markdown")
  })

  it("parameters default format to markdown", async () => {
    const info = await WebFetchTool.init()
    const parsed = info.parameters.parse({
      url: "https://example.com",
    })
    expect(parsed.format).toBe("markdown")
  })
})
