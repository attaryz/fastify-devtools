/**
 * Attempts to parse JSON with relaxed rules, handling common prefixes
 * that prevent standard JSON parsing (like JSONP callbacks, security prefixes)
 * @param text - String to parse as JSON
 * @returns Object with success flag and parsed value if successful
 */
export function parseJsonRelaxed(text: string): { ok: boolean; value?: unknown } {
  if (typeof text !== "string") return { ok: false }
  let t = text.trim()
  if (!t) return { ok: false }
  
  // Remove BOM if present
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  
  // Remove common JSON security prefixes
  t = t
    .replace(/^\)\]\}',?\s*/, "")
    .replace(/^while\(1\);\s*/, "")
    .replace(/^for\(;;\);\s*/, "")
    
  try {
    const v = JSON.parse(t)
    if (typeof v === "string") {
      const s = v.trim()
      if (
        (s.startsWith("{") && s.endsWith("}")) ||
        (s.startsWith("[") && s.endsWith("]"))
      ) {
        try {
          return { ok: true, value: JSON.parse(s) }
        } catch {
          return { ok: true, value: v }
        }
      }
    }
    return { ok: true, value: v }
  } catch {
    return { ok: false }
  }
}
