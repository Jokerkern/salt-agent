export namespace Wildcard {
  export function match(str: string, pattern: string) {
    let escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")

    // If pattern ends with " *" (space + wildcard), make the trailing part optional
    // This allows "ls *" to match both "ls" and "ls -la"
    if (escaped.endsWith(" .*")) {
      escaped = escaped.slice(0, -3) + "( .*)?"
    }

    return new RegExp("^" + escaped + "$", "s").test(str)
  }

  export function all(input: string, patterns: Record<string, any>) {
    const sorted = Object.entries(patterns).sort((a, b) => {
      const lenDiff = a[0].length - b[0].length
      if (lenDiff !== 0) return lenDiff
      return a[0].localeCompare(b[0])
    })
    let result = undefined
    for (const [pattern, value] of sorted) {
      if (match(input, pattern)) {
        result = value
        continue
      }
    }
    return result
  }
}
