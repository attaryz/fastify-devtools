import fp from "fastify-plugin"
import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteOptions,
} from "fastify"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

// Extend Fastify types for DevTools properties
declare module "fastify" {
  interface FastifyRequest {
    __devtoolsId?: string
    __dev_t_onRequest?: number
    __dev_t_preHandler?: number
    __dev_t_onSend?: number
  }

  interface FastifyInstance {
    mongoose?: {
      Schema: any
      models: Record<string, any>
      model: (name: string, schema: any) => any
      connection: {
        readyState: number
      }
      Types: {
        ObjectId: new (id?: string) => any
      }
    }
  }
}

/**
 * Configuration options for the Fastify DevTools plugin
 */
export interface DevtoolsOptions {
  /**
   * Whether the DevTools plugin is enabled
   * @default true
   */
  enabled?: boolean
  
  /**
   * Base path for DevTools routes
   * @default "/__devtools"
   */
  basePath?: string
  
  /**
   * Maximum number of requests to keep in memory buffer
   * @default 200
   */
  bufferSize?: number
  
  /**
   * Authentication token required to access DevTools endpoints
   * If not provided, no authentication is required
   */
  token?: string
  
  /**
   * Maximum size in bytes for request/response body capture
   * Bodies larger than this will be truncated
   * @default 10000
   */
  maxBodyBytes?: number
  
  /**
   * Enable persistent storage of requests using MongoDB
   * Requires fastify.mongoose decoration by host application
   * @default false
   */
  persistEnabled?: boolean
  
  /**
   * Number of days to keep persisted entries before automatic deletion
   * Only applies when persistEnabled is true
   * @default 14
   */
  persistTtlDays?: number
  
  /**
   * Threshold in milliseconds to consider a request as "slow"
   * Used for UI labeling purposes only
   * @default 1000
   */
  slowMs?: number
}

/**
 * Represents a captured HTTP request/response entry in the DevTools
 */
interface DevtoolsEntry {
  /** Unique identifier for this entry */
  id: string
  
  /** Timestamp when the request was received (milliseconds since epoch) */
  ts: number
  
  /** HTTP method (GET, POST, etc.) */
  method: string
  
  /** Request URL path */
  url: string
  
  /** Matched route pattern (if available) */
  route?: string
  
  /** Query parameters from the request */
  query?: Record<string, string | string[] | undefined>
  
  /** Route parameters from the request */
  params?: Record<string, string | undefined>
  
  /** Request headers (sensitive headers are masked) */
  headers?: Record<string, string>
  
  /** Fastify request ID */
  requestId?: string
  
  /** Request body (sensitive fields are masked, may be truncated) */
  body?: unknown
  
  /** Response information */
  response?: {
    /** HTTP status code */
    statusCode: number
    /** Response headers (sensitive headers are masked) */
    headers?: Record<string, string>
    /** Response body (may be truncated) */
    body?: unknown
  }
  
  /** Total request duration in milliseconds */
  durationMs?: number
  
  /** Whether the request/response body was truncated due to size limits */
  truncated?: boolean
  
  /** Error message if request processing failed */
  error?: string
  
  /** Detailed timing breakdown for request lifecycle phases */
  timings?: {
    /** Time spent in preHandler hooks (milliseconds) */
    preHandlerMs?: number
    /** Time spent in route handler (milliseconds) */
    handlerMs?: number
    /** Time spent sending response (milliseconds) */
    sendMs?: number
  }
  
  /** Size of the response body in bytes */
  responseSizeBytes?: number
  
  /** Content-Type of the response */
  contentType?: string
}

/** Headers that contain sensitive information and should be masked */
const SENSITIVE_HEADERS = ["authorization", "cookie", "x-auth-token"]

/** Object fields that contain sensitive information and should be masked */
const SENSITIVE_FIELDS = ["password", "token", "jwt", "secret"]

/**
 * Masks sensitive headers and normalizes header values to strings
 * @param headers - Raw headers object from request/response
 * @returns Normalized headers with sensitive values masked
 */
function maskHeaders(
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
function maskObject(obj: unknown): unknown {
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

/**
 * Attempts to parse JSON with relaxed rules, handling common prefixes
 * that prevent standard JSON parsing (like JSONP callbacks, security prefixes)
 * @param text - String to parse as JSON
 * @returns Object with success flag and parsed value if successful
 */
function parseJsonRelaxed(text: string): { ok: boolean; value?: unknown } {
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

/**
 * Fastify DevTools Plugin
 * 
 * Provides a comprehensive development toolkit for monitoring and debugging
 * HTTP requests and responses in Fastify applications. Features include:
 * - Real-time request/response capture and inspection
 * - Request replay functionality
 * - Optional MongoDB persistence for request history
 * - Server-sent events for live updates
 * - Web-based dashboard interface
 * 
 * @param fastify - The Fastify instance to register the plugin with
 * @param opts - Configuration options for the DevTools plugin
 * @returns Promise that resolves when the plugin is fully registered
 */
const devtoolsPlugin: FastifyPluginAsync<DevtoolsOptions> = async (
  fastify: FastifyInstance,
  opts: DevtoolsOptions = {}
) => {
  const enabled = opts.enabled !== false
  if (!enabled) {
    fastify.log.info("DevTools disabled")
    return
  }

  const basePath = opts.basePath || "/__devtools"
  const bufferSize = Number(opts.bufferSize ?? 200)
  const token = opts.token
  const maxBody = Number(opts.maxBodyBytes ?? 10_000)
  const persistEnabled = !!opts.persistEnabled
  const persistTtlDays = Number(opts.persistTtlDays ?? 14)
  const slowMs = Number(opts.slowMs ?? 1000)

  const isDevtoolsRoute = (url: string) => url.startsWith(basePath)

  const buffer: DevtoolsEntry[] = []
  const pending = new Map<string, DevtoolsEntry>()
  const clients = new Set<FastifyReply>()

  function viewCandidates(name: string): string[] {
    return [
      path.resolve(__dirname, "views", name),
      path.resolve(
        process.cwd(),
        "node_modules",
        "@attaryz",
        "fastify-devtools",
        "dist",
        "views",
        name
      ),
    ]
  }
  async function loadView(name: string): Promise<string> {
    const candidates = viewCandidates(name)
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          return await fs.promises.readFile(p, "utf8")
        }
      } catch {}
    }
    throw new Error(`DevTools view not found: ${name}`)
  }
  function renderTemplate(tpl: string, vars: Record<string, string>): string {
    let out = tpl
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(`{{${k}}}`).join(v)
    }
    return out
  }

  function push(entry: DevtoolsEntry) {
    buffer.push(entry)
    while (buffer.length > bufferSize) buffer.shift()
    const data = `data: ${JSON.stringify(entry)}\n\n`
    for (const client of clients) {
      try {
        client.raw.write(data)
      } catch {}
    }
  }

  async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!token) return true
    const provided =
      (request.headers["x-devtools-token"] as string) ||
      (request.query as Record<string, string | string[] | undefined>)?.token
    if (provided !== token) {
      reply
        .code(401)
        .send({ error: "Unauthorized", message: "Invalid devtools token" })
      return false
    }
    return true
  }

  // Hooks to capture request/response lifecycle
  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isDevtoolsRoute(request.url)) return
      const now = Date.now()
      const e: DevtoolsEntry = {
        id: randomUUID(),
        ts: now,
        method: request.method,
        url: request.url,
        route: request.routeOptions?.url,
        query: maskObject(request.query) as Record<string, string | string[] | undefined>,
        params: maskObject(request.params) as Record<string, string | undefined>,
        headers: maskHeaders(request.headers),
        requestId: request.id as string,
      }
      request.__devtoolsId = e.id
      request.__dev_t_onRequest = now
      pending.set(e.id, e)
    }
  )

  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isDevtoolsRoute(request.url)) return
      const id = request.__devtoolsId
      const e = id && pending.get(id)
      if (!e) return
      try {
        const body = request.body
        if (body !== undefined) {
          const json =
            typeof body === "string" ? body : JSON.parse(JSON.stringify(body))
          const masked = maskObject(json)
          const serialized =
            typeof masked === "string" ? masked : JSON.stringify(masked)
          if (serialized.length > maxBody) {
            e.body =
              serialized.slice(0, maxBody) +
              `... [truncated ${serialized.length - maxBody} bytes]`
            e.truncated = true
          } else {
            e.body = masked
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        e.error = `Failed to capture body: ${errorMessage}`
      }
      request.__dev_t_preHandler = Date.now()
    }
  )

  fastify.addHook(
    "onSend",
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      if (isDevtoolsRoute(request.url)) return payload
      const id = request.__devtoolsId
      const e = id && pending.get(id)
      if (!e) return payload

      try {
        let bodyText: string | undefined
        if (Buffer.isBuffer(payload)) {
          bodyText = payload.toString("utf8")
        } else if (typeof payload === "string") {
          bodyText = payload
        } else if (payload && typeof payload === "object") {
          bodyText = JSON.stringify(payload)
        }
        const resp = (e.response =
          e.response ?? ({ statusCode: reply.statusCode }))
        if (bodyText) {
          try {
            e.responseSizeBytes = Buffer.byteLength(bodyText, "utf8")
          } catch {}
        }
        if (bodyText) {
          let parsed: unknown
          let parsedOk = false
          const pr = parseJsonRelaxed(bodyText)
          if (pr.ok) {
            parsed = pr.value
            parsedOk = true
          }
          if (parsedOk) {
            if (Array.isArray(parsed)) {
              const previewLimit = 50
              if (bodyText.length > maxBody || parsed.length > previewLimit) {
                resp.body = parsed.slice(0, previewLimit)
                e.truncated =
                  parsed.length > previewLimit || bodyText.length > maxBody
              } else {
                resp.body = parsed
              }
            } else {
              resp.body = parsed
              if (bodyText.length > maxBody) e.truncated = true
            }
          } else {
            if (bodyText.length > maxBody) {
              resp.body =
                bodyText.slice(0, maxBody) +
                `... [truncated ${bodyText.length - maxBody} bytes]`
              e.truncated = true
            } else {
              resp.body = bodyText
            }
          }
        }
        const hdrs = reply.getHeaders ? reply.getHeaders() : ({} as Record<string, string | string[] | number | undefined>)
        resp.headers = maskHeaders(hdrs)
        try {
          const headers = hdrs as Record<string, string | string[] | number | undefined>
          const contentTypeHeader = headers["content-type"] || headers["Content-Type"]
          e.contentType = String(contentTypeHeader || "")
        } catch {}
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        e.error = `Failed to capture response: ${errorMessage}`
      }
      request.__dev_t_onSend = Date.now()
      return payload
    }
  )

  fastify.addHook(
    "onResponse",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (isDevtoolsRoute(request.url)) return
      const id = request.__devtoolsId
      const e = id && pending.get(id)
      if (!e) return
      const tResp = Date.now()
      e.durationMs = tResp - e.ts
      const tReq = request.__dev_t_onRequest
      const tPre = request.__dev_t_preHandler
      const tSend = request.__dev_t_onSend
      if (!e.timings) e.timings = {}
      if (tReq && tPre && tPre >= tReq) e.timings.preHandlerMs = tPre - tReq
      if (tPre && tSend && tSend >= tPre) e.timings.handlerMs = tSend - tPre
      if (tSend && tResp && tResp >= tSend) e.timings.sendMs = tResp - tSend
      if (!e.response) e.response = { statusCode: reply.statusCode }
      push(e)
      persistEntry(e)
      pending.delete(id)
    }
  )

  // Mongo persistence (optional)
  let DevEntryModel: any = null
  function ensureModel() {
    if (!persistEnabled) return
    const m = fastify.mongoose
    if (!m || DevEntryModel) return
    const Schema = m.Schema
    const schema = new Schema(
      {
        id: { type: String, index: true },
        ts: Number,
        tsDate: { type: Date, index: true },
        method: String,
        url: String,
        route: String,
        query: Schema.Types.Mixed,
        params: Schema.Types.Mixed,
        headers: Schema.Types.Mixed,
        requestId: String,
        body: Schema.Types.Mixed,
        response: Schema.Types.Mixed,
        durationMs: Number,
        truncated: Boolean,
        error: String,
        timings: Schema.Types.Mixed,
        responseSizeBytes: Number,
        contentType: String,
      },
      { minimize: false, strict: false }
    )
    schema.index({ tsDate: -1, _id: -1 })
    try {
      schema.index(
        { tsDate: 1 },
        {
          name: "tsDate_ttl",
          expireAfterSeconds: Math.max(
            1,
            Math.floor((opts.persistTtlDays ?? 14) * 86400)
          ),
        }
      )
    } catch {}
    DevEntryModel = m.models.DevtoolsEntry || m.model("DevtoolsEntry", schema)
    try {
      DevEntryModel.createIndexes?.().catch(() => {})
    } catch {}
  }
  function isMongoReady() {
    try {
      const m = fastify.mongoose
      return !!m && m.connection && m.connection.readyState === 1
    } catch {
      return false
    }
  }
  async function persistEntry(e: DevtoolsEntry) {
    if (!persistEnabled) return
    try {
      ensureModel()
      if (!DevEntryModel) return
      if (!isMongoReady()) return
      const doc = { ...e, tsDate: new Date(e.ts) }
      DevEntryModel.create(doc).catch(() => {})
    } catch {}
  }

  // Views
  fastify.get(
    basePath,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      const tpl = await loadView("dashboard.html")
      const html = renderTemplate(tpl, {
        HAS_STORAGE: persistEnabled ? "true" : "false",
        BASE_PATH: JSON.stringify(basePath),
        BASE_PATH_ATTR: basePath,
        SLOW_MS: String(slowMs),
      })
      reply.type("text/html").send(html)
    }
  )

  fastify.get(
    `${basePath}/requests`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      reply.send(buffer.slice(-100))
    }
  )

  fastify.get(
    `${basePath}/status`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      const mongoConnected = isMongoReady()
      reply.send({
        persistEnabled,
        mongoConnected,
        modelInitialized: !!DevEntryModel,
        bufferLength: buffer.length,
        pendingCount: pending.size,
        sseClients: clients.size,
      })
    }
  )

  fastify.get(
    `${basePath}/store/requests`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      if (!persistEnabled) return reply.send([])
      ensureModel()
      if (!DevEntryModel) return reply.send([])
      if (!isMongoReady()) return reply.send([])
      const q = request.query as Record<string, string | string[] | undefined>
      const limit = Math.min(200, Math.max(1, parseInt(String(q.limit || "50"))))
      const beforeId = q.beforeId as string | undefined
      const filter: Record<string, any> = {}
      if (q.method) filter.method = String(q.method).toUpperCase()
      if (q.status) {
        const band = String(q.status)
        const map: Record<string, [number, number]> = {
          "2xx": [200, 300],
          "3xx": [300, 400],
          "4xx": [400, 500],
          "5xx": [500, 600],
        }
        const rng = map[band]
        if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] }
      }
      if (q.q) {
        try {
          filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }]
        } catch {}
      }
      if (q.from || q.to) {
        const r: Record<string, Date> = {}
        if (q.from) {
          const d = new Date(String(q.from))
          if (!isNaN(+d)) r.$gte = d
        }
        if (q.to) {
          const d = new Date(String(q.to))
          if (!isNaN(+d)) r.$lte = d
        }
        if (Object.keys(r).length) filter.tsDate = r
      }
      try {
        if (beforeId) {
          const OID = fastify.mongoose?.Types?.ObjectId
          if (OID) filter._id = { $lt: new OID(beforeId) }
        }
      } catch {}
      const docs = await DevEntryModel.find(filter)
        .sort({ _id: -1 })
        .limit(limit)
        .lean()
      reply.send(docs)
    }
  )

  fastify.get(
    `${basePath}/store/export.json`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      if (!persistEnabled) return reply.send([])
      ensureModel()
      if (!DevEntryModel) return reply.send([])
      if (!isMongoReady()) return reply.send([])
      const q = request.query as Record<string, string | string[] | undefined>
      const limit = Math.min(5000, Math.max(1, parseInt(String(q.limit || "1000"))))
      const filter: Record<string, any> = {}
      if (q.method) filter.method = String(q.method).toUpperCase()
      if (q.status) {
        const map: Record<string, [number, number]> = {
          "2xx": [200, 300],
          "3xx": [300, 400],
          "4xx": [400, 500],
          "5xx": [500, 600],
        }
        const rng = map[String(q.status)]
        if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] }
      }
      if (q.q) filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }]
      if (q.from || q.to) {
        const r: Record<string, Date> = {}
        if (q.from) {
          const d = new Date(String(q.from))
          if (!isNaN(+d)) r.$gte = d
        }
        if (q.to) {
          const d = new Date(String(q.to))
          if (!isNaN(+d)) r.$lte = d
        }
        if (Object.keys(r).length) filter.tsDate = r
      }
      const docs = await DevEntryModel.find(filter)
        .sort({ _id: -1 })
        .limit(limit)
        .lean()
      reply.header("Content-Type", "application/json")
      reply.send(docs)
    }
  )

  fastify.get(
    `${basePath}/store/export.ndjson`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      if (!persistEnabled) return reply.send("")
      ensureModel()
      if (!DevEntryModel) return reply.send("")
      if (!isMongoReady()) return reply.send("")
      const q = request.query as Record<string, string | string[] | undefined>
      const limit = Math.min(100000, Math.max(1, parseInt(String(q.limit || "10000"))))
      const filter: Record<string, any> = {}
      if (q.method) filter.method = String(q.method).toUpperCase()
      if (q.status) {
        const map: Record<string, [number, number]> = {
          "2xx": [200, 300],
          "3xx": [300, 400],
          "4xx": [400, 500],
          "5xx": [500, 600],
        }
        const rng = map[String(q.status)]
        if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] }
      }
      if (q.q) filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }]
      if (q.from || q.to) {
        const r: Record<string, Date> = {}
        if (q.from) {
          const d = new Date(String(q.from))
          if (!isNaN(+d)) r.$gte = d
        }
        if (q.to) {
          const d = new Date(String(q.to))
          if (!isNaN(+d)) r.$lte = d
        }
        if (Object.keys(r).length) filter.tsDate = r
      }
      reply.raw.setHeader("Content-Type", "application/x-ndjson")
      reply.raw.setHeader("Cache-Control", "no-cache")
      reply.raw.setHeader(
        "Content-Disposition",
        'attachment; filename="devtools-export.ndjson"'
      )
      reply.hijack()
      const cursor = DevEntryModel.find(filter)
        .sort({ _id: -1 })
        .limit(limit)
        .cursor()
      cursor.on("data", (doc: unknown) => {
        try {
          reply.raw.write(JSON.stringify(doc) + "\n")
        } catch {}
      })
      cursor.on("end", () => reply.raw.end())
      cursor.on("error", () => reply.raw.end())
    }
  )

  fastify.post(
    `${basePath}/store/clear`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      if (!persistEnabled) return reply.send({ ok: true, deleted: 0 })
      ensureModel()
      if (!DevEntryModel) return reply.send({ ok: true, deleted: 0 })
      if (!isMongoReady()) return reply.send({ ok: true, deleted: 0 })
      const res = await DevEntryModel.deleteMany({})
      reply.send({ ok: true, deleted: res.deletedCount || 0 })
    }
  )

  fastify.get(
    `${basePath}/requests/:id`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      const { id } = request.params as Record<string, string>
      let entry = buffer.find((x) => x.id === id) || pending.get(id)
      if (!entry && persistEnabled) {
        ensureModel()
        if (DevEntryModel) {
          const doc = await DevEntryModel.findOne({ id }).lean()
          if (doc) entry = doc as DevtoolsEntry
        }
      }
      if (!entry)
        return reply
          .code(404)
          .send({ error: "Not Found", message: "Entry not found" })
      reply.send(entry)
    }
  )

  fastify.get(
    `${basePath}/entry/:id`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      const { id } = request.params as Record<string, string>
      const tpl = await loadView("entry.html")
      const html = renderTemplate(tpl, {
        BASE_PATH: JSON.stringify(basePath),
        BASE_PATH_ATTR: basePath,
        ENTRY_ID: String(id),
        SLOW_MS: String(slowMs),
      })
      reply.type("text/html").send(html)
    }
  )

  fastify.get(
    `${basePath}/events`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      reply.raw.setHeader("Content-Type", "text/event-stream")
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform")
      reply.raw.setHeader("Connection", "keep-alive")
      reply.hijack()
      reply.raw.write("\n")
      clients.add(reply)

      request.raw.on("close", () => {
        clients.delete(reply)
        try {
          reply.raw.end()
        } catch {}
      })
    }
  )

  fastify.post(
    `${basePath}/clear`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      buffer.splice(0, buffer.length)
      reply.send({ success: true })
    }
  )

  fastify.post(
    `${basePath}/replay`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return
      try {
        const body = (request.body || {}) as Record<string, unknown>
        let source: DevtoolsEntry | null = null
        if (body.id) {
          const id = String(body.id)
          source = buffer.find((x) => x.id === id) || pending.get(id) || null
          if (!source && persistEnabled) {
            ensureModel()
            if (DevEntryModel) {
              const doc = await DevEntryModel.findOne({ id }).lean()
              source = doc ? (doc as DevtoolsEntry) : null
            }
          }
          if (!source)
            return reply.code(404).send({ ok: false, error: "Entry not found" })
        }
        const method = (body.method || source?.method || "GET").toString().toUpperCase()
        const urlPath = String(body.url || source?.url || "/")
        if (isDevtoolsRoute(urlPath))
          return reply
            .code(400)
            .send({ ok: false, error: "Cannot replay devtools URLs" })
        const hdrs: Record<string, unknown> = {
          ...(source?.headers || {}),
          ...(body.headers as Record<string, unknown> || {}),
        }
        delete hdrs["host"]
        delete hdrs["connection"]
        delete hdrs["content-length"]
        delete hdrs["transfer-encoding"]
        const headers: Record<string, string> = {}
        Object.keys(hdrs).forEach((k) => {
          if (hdrs[k] != null) headers[k.toLowerCase()] = String(hdrs[k])
        })
        let payload: unknown = body.body !== undefined ? body.body : source?.body
        try {
          if (typeof payload === "string") {
            const pr = parseJsonRelaxed(payload)
            if (pr.ok) payload = pr.value
          }
        } catch {}
        const res = await fastify.inject({
          method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
          url: urlPath,
          headers,
          payload: payload as string | object | Buffer | undefined,
        })
        
        // Type the response properly
        const response = res as {
          statusCode: number
          headers: Record<string, string | string[]>
          body: string | Buffer | object
        }
        
        reply.send({
          ok: true,
          statusCode: response.statusCode,
          headers: response.headers,
          body: typeof response.body === 'string' ? response.body.slice(0, 2048) : response.body,
        })
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        reply.code(500).send({ ok: false, error: errorMessage })
      }
    }
  )

  fastify.log.info({ basePath, bufferSize }, "DevTools enabled")
}

export default fp(devtoolsPlugin, { name: "fastify-devtools" })
