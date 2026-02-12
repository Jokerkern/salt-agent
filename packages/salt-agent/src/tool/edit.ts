// Edit tool with multiple replacer strategies.
// Approaches sourced from cline and gemini-cli (same as opencode).

import z from "zod"
import fsp from "fs/promises"
import path from "path"
import { Tool } from "./tool.js"
import { Workspace } from "../workspace/workspace.js"
import { createTwoFilesPatch, diffLines } from "diff"
import { assertExternalDirectory } from "./external-directory.js"

const DESCRIPTION = `在文件中执行精确字符串替换。

用法：
- 提供 oldString 指定要查找的内容，newString 指定替换内容
- oldString 必须完全匹配（包括空格和缩进）
- 若 oldString 为空且 newString 有值，则创建新文件
- 使用 replaceAll 可替换所有匹配项
- 若 oldString 不唯一，编辑会失败；请提供更多上下文使其唯一`

function normalizeLineEndings(text: string): string {
  return text.replaceAll("\r\n", "\n")
}

export const EditTool = Tool.define("edit", {
  description: DESCRIPTION,
  parameters: z.object({
    filePath: z.string().describe("要修改的文件的绝对路径"),
    oldString: z.string().describe("要替换的文本"),
    newString: z
      .string()
      .describe(
        "替换后的文本（必须与 oldString 不同）",
      ),
    replaceAll: z
      .boolean()
      .optional()
      .describe("是否替换所有匹配项（默认 false）"),
  }),
  async execute(params, ctx) {
    if (!params.filePath) {
      throw new Error("filePath 为必填项")
    }

    if (params.oldString === params.newString) {
      throw new Error(
        "无需修改：oldString 与 newString 完全相同。",
      )
    }

    const filePath = path.isAbsolute(params.filePath)
      ? params.filePath
      : path.join(Workspace.directory, params.filePath)
    await assertExternalDirectory(ctx, filePath)

    let diff = ""
    let contentOld = ""
    let contentNew = ""

    if (params.oldString === "") {
      try {
        await fsp.stat(filePath)
      } catch {}
      contentNew = params.newString
      diff = trimDiff(
        createTwoFilesPatch(filePath, filePath, contentOld, contentNew),
      )
      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Workspace.worktree, filePath)],
        always: ["*"],
        metadata: { filepath: filePath, diff },
      })
      await fsp.mkdir(path.dirname(filePath), { recursive: true })
      await fsp.writeFile(filePath, params.newString, "utf-8")
    } else {
      let stats: any
      try {
        stats = await fsp.stat(filePath)
      } catch {}
      if (!stats) throw new Error(`文件未找到：${filePath}`)
      if (stats.isDirectory())
        throw new Error(`该路径是目录而非文件：${filePath}`)

      contentOld = await fsp.readFile(filePath, "utf-8")
      contentNew = replace(
        contentOld,
        params.oldString,
        params.newString,
        params.replaceAll,
      )

      diff = trimDiff(
        createTwoFilesPatch(
          filePath,
          filePath,
          normalizeLineEndings(contentOld),
          normalizeLineEndings(contentNew),
        ),
      )
      await ctx.ask({
        permission: "edit",
        patterns: [path.relative(Workspace.worktree, filePath)],
        always: ["*"],
        metadata: { filepath: filePath, diff },
      })

      await fsp.writeFile(filePath, contentNew, "utf-8")
      contentNew = await fsp.readFile(filePath, "utf-8")
      diff = trimDiff(
        createTwoFilesPatch(
          filePath,
          filePath,
          normalizeLineEndings(contentOld),
          normalizeLineEndings(contentNew),
        ),
      )
    }

    const filediff = {
      file: filePath,
      before: contentOld,
      after: contentNew,
      additions: 0,
      deletions: 0,
    }
    for (const change of diffLines(contentOld, contentNew)) {
      if (change.added) filediff.additions += change.count || 0
      if (change.removed) filediff.deletions += change.count || 0
    }

    ctx.metadata({
      metadata: { diff, filediff, diagnostics: {} },
    })

    return {
      metadata: { diagnostics: {}, diff, filediff },
      title: `${path.relative(Workspace.worktree, filePath)}`,
      output: "编辑已成功应用。",
    }
  },
})

// ---------------------------------------------------------------------------
// Replacer strategies
// ---------------------------------------------------------------------------

export type Replacer = (
  content: string,
  find: string,
) => Generator<string, void, unknown>

const SINGLE_CANDIDATE_SIMILARITY_THRESHOLD = 0.0
const MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD = 0.3

function levenshtein(a: string, b: string): number {
  if (a === "" || b === "") return Math.max(a.length, b.length)
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      )
    }
  }
  return matrix[a.length]![b.length]!
}

export const SimpleReplacer: Replacer = function* (_content, find) {
  yield find
}

export const LineTrimmedReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  for (let i = 0; i <= originalLines.length - searchLines.length; i++) {
    let matches = true
    for (let j = 0; j < searchLines.length; j++) {
      if (originalLines[i + j]!.trim() !== searchLines[j]!.trim()) {
        matches = false
        break
      }
    }
    if (matches) {
      let matchStartIndex = 0
      for (let k = 0; k < i; k++)
        matchStartIndex += originalLines[k]!.length + 1
      let matchEndIndex = matchStartIndex
      for (let k = 0; k < searchLines.length; k++) {
        matchEndIndex += originalLines[i + k]!.length
        if (k < searchLines.length - 1) matchEndIndex += 1
      }
      yield content.substring(matchStartIndex, matchEndIndex)
    }
  }
}

export const BlockAnchorReplacer: Replacer = function* (content, find) {
  const originalLines = content.split("\n")
  const searchLines = find.split("\n")
  if (searchLines.length < 3) return
  if (searchLines[searchLines.length - 1] === "") searchLines.pop()

  const firstLineSearch = searchLines[0]!.trim()
  const lastLineSearch = searchLines[searchLines.length - 1]!.trim()
  const searchBlockSize = searchLines.length

  const candidates: Array<{ startLine: number; endLine: number }> = []
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i]!.trim() !== firstLineSearch) continue
    for (let j = i + 2; j < originalLines.length; j++) {
      if (originalLines[j]!.trim() === lastLineSearch) {
        candidates.push({ startLine: i, endLine: j })
        break
      }
    }
  }

  if (candidates.length === 0) return

  if (candidates.length === 1) {
    const { startLine, endLine } = candidates[0]!
    const actualBlockSize = endLine - startLine + 1
    let similarity = 0
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)
    if (linesToCheck > 0) {
      for (
        let j = 1;
        j < searchBlockSize - 1 && j < actualBlockSize - 1;
        j++
      ) {
        const originalLine = originalLines[startLine + j]!.trim()
        const searchLine = searchLines[j]!.trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) continue
        const distance = levenshtein(originalLine, searchLine)
        similarity += (1 - distance / maxLen) / linesToCheck
        if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) break
      }
    } else {
      similarity = 1.0
    }

    if (similarity >= SINGLE_CANDIDATE_SIMILARITY_THRESHOLD) {
      let matchStartIndex = 0
      for (let k = 0; k < startLine; k++)
        matchStartIndex += originalLines[k]!.length + 1
      let matchEndIndex = matchStartIndex
      for (let k = startLine; k <= endLine; k++) {
        matchEndIndex += originalLines[k]!.length
        if (k < endLine) matchEndIndex += 1
      }
      yield content.substring(matchStartIndex, matchEndIndex)
    }
    return
  }

  let bestMatch: { startLine: number; endLine: number } | null = null
  let maxSimilarity = -1
  for (const candidate of candidates) {
    const { startLine, endLine } = candidate
    const actualBlockSize = endLine - startLine + 1
    let similarity = 0
    const linesToCheck = Math.min(searchBlockSize - 2, actualBlockSize - 2)
    if (linesToCheck > 0) {
      for (
        let j = 1;
        j < searchBlockSize - 1 && j < actualBlockSize - 1;
        j++
      ) {
        const originalLine = originalLines[startLine + j]!.trim()
        const searchLine = searchLines[j]!.trim()
        const maxLen = Math.max(originalLine.length, searchLine.length)
        if (maxLen === 0) continue
        const distance = levenshtein(originalLine, searchLine)
        similarity += 1 - distance / maxLen
      }
      similarity /= linesToCheck
    } else {
      similarity = 1.0
    }
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity
      bestMatch = candidate
    }
  }

  if (maxSimilarity >= MULTIPLE_CANDIDATES_SIMILARITY_THRESHOLD && bestMatch) {
    const { startLine, endLine } = bestMatch
    let matchStartIndex = 0
    for (let k = 0; k < startLine; k++)
      matchStartIndex += originalLines[k]!.length + 1
    let matchEndIndex = matchStartIndex
    for (let k = startLine; k <= endLine; k++) {
      matchEndIndex += originalLines[k]!.length
      if (k < endLine) matchEndIndex += 1
    }
    yield content.substring(matchStartIndex, matchEndIndex)
  }
}

export const WhitespaceNormalizedReplacer: Replacer = function* (
  content,
  find,
) {
  const normalizeWhitespace = (text: string) =>
    text.replace(/\s+/g, " ").trim()
  const normalizedFind = normalizeWhitespace(find)
  const lines = content.split("\n")

  for (const line of lines) {
    if (normalizeWhitespace(line) === normalizedFind) {
      yield line
    } else {
      const normalizedLine = normalizeWhitespace(line)
      if (normalizedLine.includes(normalizedFind)) {
        const words = find.trim().split(/\s+/)
        if (words.length > 0) {
          const pattern = words
            .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("\\s+")
          try {
            const regex = new RegExp(pattern)
            const match = line.match(regex)
            if (match) yield match[0]
          } catch {}
        }
      }
    }
  }

  const findLines = find.split("\n")
  if (findLines.length > 1) {
    for (let i = 0; i <= lines.length - findLines.length; i++) {
      const block = lines.slice(i, i + findLines.length)
      if (normalizeWhitespace(block.join("\n")) === normalizedFind) {
        yield block.join("\n")
      }
    }
  }
}

export const IndentationFlexibleReplacer: Replacer = function* (
  content,
  find,
) {
  const removeIndentation = (text: string) => {
    const lines = text.split("\n")
    const nonEmptyLines = lines.filter((line) => line.trim().length > 0)
    if (nonEmptyLines.length === 0) return text
    const minIndent = Math.min(
      ...nonEmptyLines.map((line) => {
        const match = line.match(/^(\s*)/)
        return match ? match[1]!.length : 0
      }),
    )
    return lines
      .map((line) => (line.trim().length === 0 ? line : line.slice(minIndent)))
      .join("\n")
  }

  const normalizedFind = removeIndentation(find)
  const contentLines = content.split("\n")
  const findLines = find.split("\n")

  for (let i = 0; i <= contentLines.length - findLines.length; i++) {
    const block = contentLines.slice(i, i + findLines.length).join("\n")
    if (removeIndentation(block) === normalizedFind) yield block
  }
}

export const EscapeNormalizedReplacer: Replacer = function* (content, find) {
  const unescapeString = (str: string): string =>
    str.replace(
      /\\(n|t|r|'|"|`|\\|\n|\$)/g,
      (match, capturedChar: string) => {
        switch (capturedChar) {
          case "n": return "\n"
          case "t": return "\t"
          case "r": return "\r"
          case "'": return "'"
          case '"': return '"'
          case "`": return "`"
          case "\\": return "\\"
          case "\n": return "\n"
          case "$": return "$"
          default: return match
        }
      },
    )

  const unescapedFind = unescapeString(find)
  if (content.includes(unescapedFind)) yield unescapedFind

  const lines = content.split("\n")
  const findLines = unescapedFind.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (unescapeString(block) === unescapedFind) yield block
  }
}

export const MultiOccurrenceReplacer: Replacer = function* (content, find) {
  let startIndex = 0
  while (true) {
    const index = content.indexOf(find, startIndex)
    if (index === -1) break
    yield find
    startIndex = index + find.length
  }
}

export const TrimmedBoundaryReplacer: Replacer = function* (content, find) {
  const trimmedFind = find.trim()
  if (trimmedFind === find) return
  if (content.includes(trimmedFind)) yield trimmedFind

  const lines = content.split("\n")
  const findLines = find.split("\n")
  for (let i = 0; i <= lines.length - findLines.length; i++) {
    const block = lines.slice(i, i + findLines.length).join("\n")
    if (block.trim() === trimmedFind) yield block
  }
}

export const ContextAwareReplacer: Replacer = function* (content, find) {
  const findLines = find.split("\n")
  if (findLines.length < 3) return
  if (findLines[findLines.length - 1] === "") findLines.pop()

  const contentLines = content.split("\n")
  const firstLine = findLines[0]!.trim()
  const lastLine = findLines[findLines.length - 1]!.trim()

  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i]!.trim() !== firstLine) continue
    for (let j = i + 2; j < contentLines.length; j++) {
      if (contentLines[j]!.trim() === lastLine) {
        const blockLines = contentLines.slice(i, j + 1)
        if (blockLines.length === findLines.length) {
          let matchingLines = 0
          let totalNonEmptyLines = 0
          for (let k = 1; k < blockLines.length - 1; k++) {
            const blockLine = blockLines[k]!.trim()
            const findLine = findLines[k]!.trim()
            if (blockLine.length > 0 || findLine.length > 0) {
              totalNonEmptyLines++
              if (blockLine === findLine) matchingLines++
            }
          }
          if (
            totalNonEmptyLines === 0 ||
            matchingLines / totalNonEmptyLines >= 0.5
          ) {
            yield blockLines.join("\n")
            break
          }
        }
        break
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core replace function
// ---------------------------------------------------------------------------

export function trimDiff(diff: string): string {
  const lines = diff.split("\n")
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  )

  if (contentLines.length === 0) return diff

  let min = Infinity
  for (const line of contentLines) {
    const content = line.slice(1)
    if (content.trim().length > 0) {
      const match = content.match(/^(\s*)/)
      if (match) min = Math.min(min, match[1]!.length)
    }
  }
  if (min === Infinity || min === 0) return diff

  return lines
    .map((line) => {
      if (
        (line.startsWith("+") ||
          line.startsWith("-") ||
          line.startsWith(" ")) &&
        !line.startsWith("---") &&
        !line.startsWith("+++")
      ) {
        return line[0] + line.slice(1).slice(min)
      }
      return line
    })
    .join("\n")
}

export function replace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false,
): string {
  if (oldString === newString) {
    throw new Error(
      "No changes to apply: oldString and newString are identical.",
    )
  }

  let notFound = true

  for (const replacer of [
    SimpleReplacer,
    LineTrimmedReplacer,
    BlockAnchorReplacer,
    WhitespaceNormalizedReplacer,
    IndentationFlexibleReplacer,
    EscapeNormalizedReplacer,
    TrimmedBoundaryReplacer,
    ContextAwareReplacer,
    MultiOccurrenceReplacer,
  ]) {
    for (const search of replacer(content, oldString)) {
      const index = content.indexOf(search)
      if (index === -1) continue
      notFound = false
      if (replaceAll) return content.replaceAll(search, newString)
      const lastIndex = content.lastIndexOf(search)
      if (index !== lastIndex) continue
      return (
        content.substring(0, index) +
        newString +
        content.substring(index + search.length)
      )
    }
  }

  if (notFound) {
    throw new Error(
      "在文件中未找到 oldString。必须完全匹配，包括空格、缩进和换行符。",
    )
  }
  throw new Error(
    "oldString 存在多个匹配。请提供更多上下文以使匹配唯一。",
  )
}
