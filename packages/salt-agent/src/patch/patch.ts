import { readFileSync } from "fs"

/**
 * Patch parser and applier.
 * Ported from opencode's src/patch/index.ts.
 *
 * Patch format:
 *   *** Begin Patch
 *   *** Add File: <path>
 *   +line1
 *   +line2
 *   *** Update File: <path>
 *   *** Move to: <path>     (optional)
 *   @@ context
 *    kept line
 *   -removed line
 *   +added line
 *   *** Delete File: <path>
 *   *** End Patch
 */
export namespace Patch {
  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  export type Hunk =
    | { type: "add"; path: string; contents: string }
    | { type: "delete"; path: string }
    | {
        type: "update"
        path: string
        move_path?: string
        chunks: UpdateFileChunk[]
      }

  export interface UpdateFileChunk {
    old_lines: string[]
    new_lines: string[]
    change_context?: string
    is_end_of_file?: boolean
  }

  export interface FileUpdate {
    unified_diff: string
    content: string
  }

  // ---------------------------------------------------------------------------
  // Parse
  // ---------------------------------------------------------------------------

  function parsePatchHeader(
    lines: string[],
    startIdx: number,
  ): { filePath: string; movePath?: string; nextIdx: number } | null {
    const line = lines[startIdx]!

    if (line.startsWith("*** Add File:")) {
      const filePath = line.split(":", 2)[1]?.trim()
      return filePath ? { filePath, nextIdx: startIdx + 1 } : null
    }

    if (line.startsWith("*** Delete File:")) {
      const filePath = line.split(":", 2)[1]?.trim()
      return filePath ? { filePath, nextIdx: startIdx + 1 } : null
    }

    if (line.startsWith("*** Update File:")) {
      const filePath = line.split(":", 2)[1]?.trim()
      let movePath: string | undefined
      let nextIdx = startIdx + 1

      if (
        nextIdx < lines.length &&
        lines[nextIdx]!.startsWith("*** Move to:")
      ) {
        movePath = lines[nextIdx]!.split(":", 2)[1]?.trim()
        nextIdx++
      }

      return filePath ? { filePath, movePath, nextIdx } : null
    }

    return null
  }

  function parseUpdateFileChunks(
    lines: string[],
    startIdx: number,
  ): { chunks: UpdateFileChunk[]; nextIdx: number } {
    const chunks: UpdateFileChunk[] = []
    let i = startIdx

    while (i < lines.length && !lines[i]!.startsWith("***")) {
      if (lines[i]!.startsWith("@@")) {
        const contextLine = lines[i]!.substring(2).trim()
        i++

        const oldLines: string[] = []
        const newLines: string[] = []
        let isEndOfFile = false

        while (
          i < lines.length &&
          !lines[i]!.startsWith("@@") &&
          !lines[i]!.startsWith("***")
        ) {
          const changeLine = lines[i]!

          if (changeLine === "*** End of File") {
            isEndOfFile = true
            i++
            break
          }

          if (changeLine.startsWith(" ")) {
            const content = changeLine.substring(1)
            oldLines.push(content)
            newLines.push(content)
          } else if (changeLine.startsWith("-")) {
            oldLines.push(changeLine.substring(1))
          } else if (changeLine.startsWith("+")) {
            newLines.push(changeLine.substring(1))
          }

          i++
        }

        chunks.push({
          old_lines: oldLines,
          new_lines: newLines,
          change_context: contextLine || undefined,
          is_end_of_file: isEndOfFile || undefined,
        })
      } else {
        i++
      }
    }

    return { chunks, nextIdx: i }
  }

  function parseAddFileContent(
    lines: string[],
    startIdx: number,
  ): { content: string; nextIdx: number } {
    let content = ""
    let i = startIdx

    while (i < lines.length && !lines[i]!.startsWith("***")) {
      if (lines[i]!.startsWith("+")) {
        content += lines[i]!.substring(1) + "\n"
      }
      i++
    }

    if (content.endsWith("\n")) {
      content = content.slice(0, -1)
    }

    return { content, nextIdx: i }
  }

  function stripHeredoc(input: string): string {
    const heredocMatch = input.match(
      /^(?:cat\s+)?<<['"]?(\w+)['"]?\s*\n([\s\S]*?)\n\1\s*$/,
    )
    if (heredocMatch) {
      return heredocMatch[2]!
    }
    return input
  }

  export function parsePatch(patchText: string): { hunks: Hunk[] } {
    const cleaned = stripHeredoc(patchText.trim())
    const lines = cleaned.split("\n")
    const hunks: Hunk[] = []

    const beginMarker = "*** Begin Patch"
    const endMarker = "*** End Patch"

    const beginIdx = lines.findIndex((line) => line.trim() === beginMarker)
    const endIdx = lines.findIndex((line) => line.trim() === endMarker)

    if (beginIdx === -1 || endIdx === -1 || beginIdx >= endIdx) {
      throw new Error("无效的 patch 格式：缺少 Begin/End 标记")
    }

    let i = beginIdx + 1

    while (i < endIdx) {
      const header = parsePatchHeader(lines, i)
      if (!header) {
        i++
        continue
      }

      if (lines[i]!.startsWith("*** Add File:")) {
        const { content, nextIdx } = parseAddFileContent(
          lines,
          header.nextIdx,
        )
        hunks.push({ type: "add", path: header.filePath, contents: content })
        i = nextIdx
      } else if (lines[i]!.startsWith("*** Delete File:")) {
        hunks.push({ type: "delete", path: header.filePath })
        i = header.nextIdx
      } else if (lines[i]!.startsWith("*** Update File:")) {
        const { chunks, nextIdx } = parseUpdateFileChunks(
          lines,
          header.nextIdx,
        )
        hunks.push({
          type: "update",
          path: header.filePath,
          move_path: header.movePath,
          chunks,
        })
        i = nextIdx
      } else {
        i++
      }
    }

    return { hunks }
  }

  // ---------------------------------------------------------------------------
  // Apply chunks to derive new file contents
  // ---------------------------------------------------------------------------

  export function deriveNewContentsFromChunks(
    filePath: string,
    chunks: UpdateFileChunk[],
  ): FileUpdate {
    let originalContent: string
    try {
      originalContent = readFileSync(filePath, "utf-8")
    } catch (error) {
      throw new Error(`无法读取文件 ${filePath}: ${error}`)
    }

    let originalLines = originalContent.split("\n")

    // Drop trailing empty element for consistent line counting
    if (
      originalLines.length > 0 &&
      originalLines[originalLines.length - 1] === ""
    ) {
      originalLines.pop()
    }

    const replacements = computeReplacements(originalLines, filePath, chunks)
    const newLines = applyReplacements(originalLines, replacements)

    // Ensure trailing newline
    if (newLines.length === 0 || newLines[newLines.length - 1] !== "") {
      newLines.push("")
    }

    const newContent = newLines.join("\n")
    const unifiedDiff = generateUnifiedDiff(originalContent, newContent)

    return {
      unified_diff: unifiedDiff,
      content: newContent,
    }
  }

  // ---------------------------------------------------------------------------
  // Replacement computation
  // ---------------------------------------------------------------------------

  function computeReplacements(
    originalLines: string[],
    filePath: string,
    chunks: UpdateFileChunk[],
  ): Array<[number, number, string[]]> {
    const replacements: Array<[number, number, string[]]> = []
    let lineIndex = 0

    for (const chunk of chunks) {
      if (chunk.change_context) {
        const contextIdx = seekSequence(
          originalLines,
          [chunk.change_context],
          lineIndex,
        )
        if (contextIdx === -1) {
          throw new Error(
            `在 ${filePath} 中未找到上下文 '${chunk.change_context}'`,
          )
        }
        lineIndex = contextIdx + 1
      }

      // Pure addition (no old lines to match)
      if (chunk.old_lines.length === 0) {
        const insertionIdx =
          originalLines.length > 0 &&
          originalLines[originalLines.length - 1] === ""
            ? originalLines.length - 1
            : originalLines.length
        replacements.push([insertionIdx, 0, chunk.new_lines])
        continue
      }

      let pattern = chunk.old_lines
      let newSlice = chunk.new_lines
      let found = seekSequence(
        originalLines,
        pattern,
        lineIndex,
        chunk.is_end_of_file,
      )

      // Retry without trailing empty line
      if (found === -1 && pattern.length > 0 && pattern[pattern.length - 1] === "") {
        pattern = pattern.slice(0, -1)
        if (newSlice.length > 0 && newSlice[newSlice.length - 1] === "") {
          newSlice = newSlice.slice(0, -1)
        }
        found = seekSequence(
          originalLines,
          pattern,
          lineIndex,
          chunk.is_end_of_file,
        )
      }

      if (found !== -1) {
        replacements.push([found, pattern.length, newSlice])
        lineIndex = found + pattern.length
      } else {
        throw new Error(
          `在 ${filePath} 中未找到预期的行：\n${chunk.old_lines.join("\n")}`,
        )
      }
    }

    replacements.sort((a, b) => a[0] - b[0])
    return replacements
  }

  function applyReplacements(
    lines: string[],
    replacements: Array<[number, number, string[]]>,
  ): string[] {
    const result = [...lines]

    // Apply in reverse to avoid index shifting
    for (let i = replacements.length - 1; i >= 0; i--) {
      const entry = replacements[i]!
      result.splice(entry[0], entry[1], ...entry[2])
    }

    return result
  }

  // ---------------------------------------------------------------------------
  // Line matching with progressive relaxation
  // ---------------------------------------------------------------------------

  function normalizeUnicode(str: string): string {
    return str
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-")
      .replace(/\u2026/g, "...")
      .replace(/\u00A0/g, " ")
  }

  type Comparator = (a: string, b: string) => boolean

  function tryMatch(
    lines: string[],
    pattern: string[],
    startIndex: number,
    compare: Comparator,
    eof: boolean,
  ): number {
    // If EOF anchor, try matching from end of file first
    if (eof) {
      const fromEnd = lines.length - pattern.length
      if (fromEnd >= startIndex) {
        let matches = true
        for (let j = 0; j < pattern.length; j++) {
          if (!compare(lines[fromEnd + j]!, pattern[j]!)) {
            matches = false
            break
          }
        }
        if (matches) return fromEnd
      }
    }

    // Forward search from startIndex
    for (let i = startIndex; i <= lines.length - pattern.length; i++) {
      let matches = true
      for (let j = 0; j < pattern.length; j++) {
        if (!compare(lines[i + j]!, pattern[j]!)) {
          matches = false
          break
        }
      }
      if (matches) return i
    }

    return -1
  }

  function seekSequence(
    lines: string[],
    pattern: string[],
    startIndex: number,
    eof = false,
  ): number {
    if (pattern.length === 0) return -1

    // Pass 1: exact match
    const exact = tryMatch(lines, pattern, startIndex, (a, b) => a === b, eof)
    if (exact !== -1) return exact

    // Pass 2: trim trailing whitespace
    const rstrip = tryMatch(
      lines,
      pattern,
      startIndex,
      (a, b) => a.trimEnd() === b.trimEnd(),
      eof,
    )
    if (rstrip !== -1) return rstrip

    // Pass 3: trim both ends
    const trim = tryMatch(
      lines,
      pattern,
      startIndex,
      (a, b) => a.trim() === b.trim(),
      eof,
    )
    if (trim !== -1) return trim

    // Pass 4: Unicode punctuation normalization
    const normalized = tryMatch(
      lines,
      pattern,
      startIndex,
      (a, b) => normalizeUnicode(a.trim()) === normalizeUnicode(b.trim()),
      eof,
    )
    return normalized
  }

  // ---------------------------------------------------------------------------
  // Diff generation (simplified)
  // ---------------------------------------------------------------------------

  function generateUnifiedDiff(
    oldContent: string,
    newContent: string,
  ): string {
    const oldLines = oldContent.split("\n")
    const newLines = newContent.split("\n")

    let diff = "@@ -1 +1 @@\n"
    const maxLen = Math.max(oldLines.length, newLines.length)
    let hasChanges = false

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] ?? ""
      const newLine = newLines[i] ?? ""

      if (oldLine !== newLine) {
        if (oldLine) diff += `-${oldLine}\n`
        if (newLine) diff += `+${newLine}\n`
        hasChanges = true
      } else if (oldLine) {
        diff += ` ${oldLine}\n`
      }
    }

    return hasChanges ? diff : ""
  }
}
