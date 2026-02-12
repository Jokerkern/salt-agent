import z from "zod"
import { Tool } from "./tool.js"
import { abortAfterAny } from "../util/abort.js"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB
const DEFAULT_TIMEOUT = 30 * 1000
const MAX_TIMEOUT = 120 * 1000

const DESCRIPTION = `从 URL 获取内容并以可读格式返回。

用法：
- URL 必须以 http:// 或 https:// 开头
- 格式选项：text、markdown、html（默认：markdown）
- 最大响应大小：5MB
- 最大超时：120 秒
- 默认使用 turndown 将 HTML 转换为 markdown`

export const WebFetchTool = Tool.define("webfetch", {
  description: DESCRIPTION,
  parameters: z.object({
    url: z.string().describe("要获取内容的 URL"),
    format: z
      .enum(["text", "markdown", "html"])
      .default("markdown")
      .describe(
        "返回内容的格式（text、markdown 或 html）。默认为 markdown。",
      ),
    timeout: z
      .number()
      .describe("可选超时时间（秒，最大 120）")
      .optional(),
  }),
  async execute(params, ctx) {
    if (
      !params.url.startsWith("http://") &&
      !params.url.startsWith("https://")
    ) {
      throw new Error("URL 必须以 http:// 或 https:// 开头")
    }

    await ctx.ask({
      permission: "webfetch",
      patterns: [params.url],
      always: ["*"],
      metadata: {
        url: params.url,
        format: params.format,
        timeout: params.timeout,
      },
    })

    const timeout = Math.min(
      (params.timeout ?? DEFAULT_TIMEOUT / 1000) * 1000,
      MAX_TIMEOUT,
    )
    const { signal, clearTimeout: clearTO } = abortAfterAny(
      timeout,
      ctx.abort,
    )

    let acceptHeader = "*/*"
    switch (params.format) {
      case "markdown":
        acceptHeader =
          "text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1"
        break
      case "text":
        acceptHeader =
          "text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1"
        break
      case "html":
        acceptHeader =
          "text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1"
        break
    }

    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
      Accept: acceptHeader,
      "Accept-Language": "en-US,en;q=0.9",
    }

    const initial = await fetch(params.url, { signal, headers })

    // Retry with honest UA if blocked by Cloudflare
    const response =
      initial.status === 403 &&
      initial.headers.get("cf-mitigated") === "challenge"
        ? await fetch(params.url, {
            signal,
            headers: { ...headers, "User-Agent": "salt-agent" },
          })
        : initial

    clearTO()

    if (!response.ok) {
      throw new Error(`请求失败，状态码：${response.status}`)
    }

    const contentLength = response.headers.get("content-length")
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      throw new Error("响应过大（超过 5MB 限制）")
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE) {
      throw new Error("响应过大（超过 5MB 限制）")
    }

    const content = new TextDecoder().decode(arrayBuffer)
    const contentType = response.headers.get("content-type") || ""
    const title = `${params.url} (${contentType})`

    switch (params.format) {
      case "markdown":
        if (contentType.includes("text/html")) {
          const markdown = await convertHTMLToMarkdown(content)
          return { output: markdown, title, metadata: {} }
        }
        return { output: content, title, metadata: {} }

      case "text":
        if (contentType.includes("text/html")) {
          const text = extractTextFromHTML(content)
          return { output: text, title, metadata: {} }
        }
        return { output: content, title, metadata: {} }

      case "html":
        return { output: content, title, metadata: {} }

      default:
        return { output: content, title, metadata: {} }
    }
  },
})

function extractTextFromHTML(html: string): string {
  // Simple regex-based extraction (no cheerio/HTMLRewriter dependency)
  let text = html
    // Remove script and style blocks
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    // Replace block elements with newlines
    .replace(/<(br|p|div|h[1-6]|li|tr|blockquote|hr)[^>]*>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Clean up whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return text
}

async function convertHTMLToMarkdown(html: string): Promise<string> {
  try {
    // Try to use turndown if available
    const { default: TurndownService } = await import("turndown")
    const turndownService = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    })
    turndownService.remove(["script", "style", "meta", "link"])
    return turndownService.turndown(html)
  } catch {
    // Fall back to text extraction
    return extractTextFromHTML(html)
  }
}
