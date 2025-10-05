/** Headers that contain sensitive information and should be masked */
const SENSITIVE_HEADERS = ["authorization", "cookie", "x-auth-token"]

/** Object fields that contain sensitive information and should be masked */
const SENSITIVE_FIELDS = ["password", "token", "jwt", "secret"]

/**
 * Masks sensitive headers and normalizes header values to strings
 * @param headers - Raw headers object from request/response
 * @returns Normalized headers with sensitive values masked
 */
export function maskHeaders(
  headers: Record<string, string | string[] | number | undefined> = {}
): Record<string, string> {
  const out: Record<string, string> = {}
  Object.keys(headers).forEach((k) => {
    const v = headers[k]
    if (SENSITIVE_HEADERS.includes(k.toLowerCase())) {
      out[k] = "[REDACTED]"
    } else if (Array.isArray(v)) {
      out[k] = v.join(", ")
    } else if (typeof v === "string") {
      out[k] = v
    } else if (v !== undefined && v !== null) {
      out[k] = String(v)
    }
  })
  return out
}

/**
 * Recursively masks sensitive fields in objects and arrays
 * @param obj - Object to mask sensitive fields in
 * @returns New object with sensitive fields masked as "[REDACTED]"
 */
export function maskObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(maskObject)
  if (typeof obj === "object") {
    const o: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.includes(key.toLowerCase())) {
        o[key] = "[REDACTED]"
      } else {
        o[key] = maskObject(value)
      }
    }
    return o
  }
  return obj
}
