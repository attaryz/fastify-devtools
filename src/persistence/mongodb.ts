import type { FastifyInstance } from "fastify"
import type { DevtoolsEntry } from "../types"

let DevEntryModel: any = null

/**
 * Check if MongoDB is ready
 */
export function isMongoReady(fastify: FastifyInstance): boolean {
  try {
    const m = fastify.mongoose
    return !!m && m.connection && m.connection.readyState === 1
  } catch {
    return false
  }
}

/**
 * Ensure the MongoDB model is created
 */
export function ensureModel(fastify: FastifyInstance, persistTtlDays: number): void {
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
          Math.floor(persistTtlDays * 86400)
        ),
      }
    )
  } catch {}
  
  DevEntryModel = m.models.DevtoolsEntry || m.model("DevtoolsEntry", schema)
  
  try {
    DevEntryModel.createIndexes?.().catch(() => {})
  } catch {}
}

/**
 * Persist an entry to MongoDB
 */
export async function persistEntry(
  fastify: FastifyInstance,
  entry: DevtoolsEntry,
  persistTtlDays: number
): Promise<void> {
  try {
    ensureModel(fastify, persistTtlDays)
    if (!DevEntryModel) return
    if (!isMongoReady(fastify)) return
    const doc = { ...entry, tsDate: new Date(entry.ts) }
    DevEntryModel.create(doc).catch(() => {})
  } catch {}
}

/**
 * Get the MongoDB model
 */
export function getModel(): any {
  return DevEntryModel
}
