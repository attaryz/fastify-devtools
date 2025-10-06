import type { FastifyInstance } from "fastify";
import type { DevtoolsEntry } from "../types";

type ModelLike = {
  find: (filter: unknown) => {
    sort: (arg: unknown) => {
      limit: (n: number) => { lean: () => Promise<unknown[]>; cursor?: () => unknown };
    };
  };
  findOne: (filter: unknown) => { lean: () => Promise<unknown | null> };
  deleteMany: (filter: unknown) => Promise<{ deletedCount?: number }>;
  create: (doc: unknown) => Promise<unknown>;
  createIndexes?: () => Promise<unknown>;
};

let DevEntryModel: ModelLike | null = null;

/**
 * Check if MongoDB is ready
 */
export function isMongoReady(fastify: FastifyInstance): boolean {
  try {
    const m = fastify.mongoose;
    return !!m && m.connection && m.connection.readyState === 1;
  } catch {
    return false;
  }
}

/**
 * Ensure the MongoDB model is created
 */
export function ensureModel(fastify: FastifyInstance, persistTtlDays: number): void {
  const m = fastify.mongoose;
  if (!m || DevEntryModel) return;

  type SchemaInstance = { index?: (...args: unknown[]) => unknown };
  type SchemaCtor = (new (...args: unknown[]) => SchemaInstance) & { Types: { Mixed: unknown } };
  const Schema = (m as unknown as { Schema: SchemaCtor }).Schema;
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
    { minimize: false, strict: false },
  );

  schema.index?.({ tsDate: -1, _id: -1 });

  try {
    schema.index?.(
      { tsDate: 1 },
      {
        name: "tsDate_ttl",
        expireAfterSeconds: Math.max(1, Math.floor(persistTtlDays * 86400)),
      },
    );
  } catch {}

  DevEntryModel =
    ((
      m as unknown as {
        models: Record<string, unknown>;
        model: (name: string, schema: unknown) => unknown;
      }
    ).models.DevtoolsEntry as unknown as ModelLike) ||
    ((m as unknown as { model: (name: string, schema: unknown) => unknown }).model(
      "DevtoolsEntry",
      schema,
    ) as unknown as ModelLike);

  try {
    DevEntryModel.createIndexes?.().catch(() => {});
  } catch {}
}

/**
 * Persist an entry to MongoDB
 */
export async function persistEntry(
  fastify: FastifyInstance,
  entry: DevtoolsEntry,
  persistTtlDays: number,
): Promise<void> {
  try {
    ensureModel(fastify, persistTtlDays);
    if (!DevEntryModel) return;
    if (!isMongoReady(fastify)) return;
    const doc = { ...entry, tsDate: new Date(entry.ts) };
    DevEntryModel.create(doc).catch(() => {});
  } catch {}
}

/**
 * Get the MongoDB model
 */
export function getModel(): ModelLike | null {
  return DevEntryModel;
}
