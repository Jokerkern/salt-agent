import z from "zod"
import { Tool } from "./tool.js"
import { abortAfterAny } from "../util/abort.js"

const API_CONFIG = {
  BASE_URL: "https://mcp.exa.ai",
  ENDPOINTS: { SEARCH: "/mcp" },
  DEFAULT_NUM_RESULTS: 8,
} as const

interface McpSearchRequest {
  jsonrpc: string
  id: number
  method: string
  params: {
    name: string
    arguments: {
      query: string
      numResults?: number
      livecrawl?: "fallback" | "preferred"
      type?: "auto" | "fast" | "deep"
      contextMaxCharacters?: number
    }
  }
}

interface McpSearchResponse {
  jsonrpc: string
  result: {
    content: Array<{
      type: string
      text: string
    }>
  }
}

const DESCRIPTION = `搜索网络获取任意主题的实时信息。

用法：
- 需要最新信息时使用
- 支持搜索类型：auto（默认）、fast、deep
- 使用 livecrawl 获取最新内容
- 返回搜索结果的摘要信息`

export const WebSearchTool = Tool.define("websearch", async () => {
  return {
    get description() {
      return DESCRIPTION.replace(
        "{{date}}",
        new Date().toISOString().slice(0, 10),
      )
    },
    parameters: z.object({
      query: z.string().describe("Web 搜索查询"),
      numResults: z
        .number()
        .optional()
        .describe("返回的搜索结果数量（默认：8）"),
      livecrawl: z
        .enum(["fallback", "preferred"])
        .optional()
        .describe("实时爬取模式"),
      type: z
        .enum(["auto", "fast", "deep"])
        .optional()
        .describe("搜索类型"),
      contextMaxCharacters: z
        .number()
        .optional()
        .describe(
          "面向 LLM 的上下文最大字符数（默认：10000）",
        ),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
          livecrawl: params.livecrawl,
          type: params.type,
          contextMaxCharacters: params.contextMaxCharacters,
        },
      })

      const searchRequest: McpSearchRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "web_search_exa",
          arguments: {
            query: params.query,
            type: params.type || "auto",
            numResults:
              params.numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
            livecrawl: params.livecrawl || "fallback",
            contextMaxCharacters: params.contextMaxCharacters,
          },
        },
      }

      const { signal, clearTimeout: clearTO } = abortAfterAny(
        25000,
        ctx.abort,
      )

      try {
        const response = await fetch(
          `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.SEARCH}`,
          {
            method: "POST",
            headers: {
              accept: "application/json, text/event-stream",
              "content-type": "application/json",
            },
            body: JSON.stringify(searchRequest),
            signal,
          },
        )

        clearTO()

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `搜索错误（${response.status}）：${errorText}`,
          )
        }

        const responseText = await response.text()
        const lines = responseText.split("\n")
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data: McpSearchResponse = JSON.parse(line.substring(6))
            if (
              data.result?.content?.length &&
              data.result.content.length > 0
            ) {
              return {
                output: data.result.content[0]!.text,
                title: `Web 搜索：${params.query}`,
                metadata: {},
              }
            }
          }
        }

        return {
          output:
            "未找到搜索结果。请尝试其他查询。",
          title: `Web 搜索：${params.query}`,
          metadata: {},
        }
      } catch (error) {
        clearTO()
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          throw new Error("搜索请求超时")
        }
        throw error
      }
    },
  }
})
