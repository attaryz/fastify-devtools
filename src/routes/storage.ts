import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ensureModel, getModel, isMongoReady } from "../persistence/mongodb";

export function registerStorageRoutes(
  fastify: FastifyInstance,
  basePath: string,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>,
  persistEnabled: boolean,
  persistTtlDays: number,
) {
  // Get stored requests
  fastify.get(
    `${basePath}/store/requests`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!(await requireAuth(request, reply))) return;
        if (!persistEnabled) return reply.send([]);
        ensureModel(fastify, persistTtlDays);
        const DevEntryModel = getModel();
        if (!DevEntryModel) return reply.send([]);
        if (!isMongoReady(fastify)) return reply.send([]);
        const q = request.query as Record<string, string | string[] | undefined>;
        const limit = Math.min(200, Math.max(1, parseInt(String(q.limit || "50"), 10)));
        const beforeId = q.beforeId as string | undefined;
        const filter: Record<string, unknown> = {};
        if (q.method) filter.method = String(q.method).toUpperCase();
        if (q.status) {
          const band = String(q.status);
          const map: Record<string, [number, number]> = {
            "2xx": [200, 300],
            "3xx": [300, 400],
            "4xx": [400, 500],
            "5xx": [500, 600],
          };
          const rng = map[band];
          if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] };
        }
        if (q.q) {
          try {
            filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }];
          } catch {}
        }
        if (q.from || q.to) {
          const r: Record<string, Date> = {};
          if (q.from) {
            const d = new Date(String(q.from));
            if (!Number.isNaN(+d)) r.$gte = d;
          }
          if (q.to) {
            const d = new Date(String(q.to));
            if (!Number.isNaN(+d)) r.$lte = d;
          }
          if (Object.keys(r).length) filter.tsDate = r;
        }
        try {
          if (beforeId) {
            const OID = fastify.mongoose?.Types?.ObjectId;
            if (OID) filter._id = { $lt: new OID(beforeId) };
          }
        } catch {}
        const docs = await DevEntryModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
        return reply.send(docs);
      } catch (error) {
        console.error("Store requests error:", error);
        return reply.send([]);
      }
    },
  );

  // Export JSON
  fastify.get(
    `${basePath}/store/export.json`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!(await requireAuth(request, reply))) return;
        if (!persistEnabled) return reply.send([]);
        ensureModel(fastify, persistTtlDays);
        const DevEntryModel = getModel();
        if (!DevEntryModel) return reply.send([]);
        if (!isMongoReady(fastify)) return reply.send([]);
        const q = request.query as Record<string, string | string[] | undefined>;
        const limit = Math.min(5000, Math.max(1, parseInt(String(q.limit || "1000"), 10)));
        const filter: Record<string, unknown> = {};
        if (q.method) filter.method = String(q.method).toUpperCase();
        if (q.status) {
          const map: Record<string, [number, number]> = {
            "2xx": [200, 300],
            "3xx": [300, 400],
            "4xx": [400, 500],
            "5xx": [500, 600],
          };
          const rng = map[String(q.status)];
          if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] };
        }
        if (q.q) filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }];
        if (q.from || q.to) {
          const r: Record<string, Date> = {};
          if (q.from) {
            const d = new Date(String(q.from));
            if (!Number.isNaN(+d)) r.$gte = d;
          }
          if (q.to) {
            const d = new Date(String(q.to));
            if (!Number.isNaN(+d)) r.$lte = d;
          }
          if (Object.keys(r).length) filter.tsDate = r;
        }
        const docs = await DevEntryModel.find(filter).sort({ _id: -1 }).limit(limit).lean();
        reply.header("Content-Type", "application/json");
        return reply.send(docs);
      } catch (error) {
        console.error("Export JSON error:", error);
        return reply.status(200).send([]);
      }
    },
  );

  // Export NDJSON
  fastify.get(
    `${basePath}/store/export.ndjson`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!(await requireAuth(request, reply))) return;
        if (!persistEnabled) return reply.send("");
        ensureModel(fastify, persistTtlDays);
        const DevEntryModel = getModel();
        if (!DevEntryModel) return reply.send("");
        if (!isMongoReady(fastify)) return reply.send("");
        const q = request.query as Record<string, string | string[] | undefined>;
        const limit = Math.min(100000, Math.max(1, parseInt(String(q.limit || "10000"), 10)));
        const filter: Record<string, unknown> = {};
        if (q.method) filter.method = String(q.method).toUpperCase();
        if (q.status) {
          const map: Record<string, [number, number]> = {
            "2xx": [200, 300],
            "3xx": [300, 400],
            "4xx": [400, 500],
            "5xx": [500, 600],
          };
          const rng = map[String(q.status)];
          if (rng) filter["response.statusCode"] = { $gte: rng[0], $lt: rng[1] };
        }
        if (q.q) filter.$or = [{ url: { $regex: String(q.q), $options: "i" } }];
        if (q.from || q.to) {
          const r: Record<string, Date> = {};
          if (q.from) {
            const d = new Date(String(q.from));
            if (!Number.isNaN(+d)) r.$gte = d;
          }
          if (q.to) {
            const d = new Date(String(q.to));
            if (!Number.isNaN(+d)) r.$lte = d;
          }
          if (Object.keys(r).length) filter.tsDate = r;
        }
        reply.raw.setHeader("Content-Type", "application/x-ndjson");
        reply.raw.setHeader("Cache-Control", "no-cache");
        reply.raw.setHeader("Content-Disposition", 'attachment; filename="devtools-export.ndjson"');
        reply.hijack();
        const chain = DevEntryModel.find(filter).sort({ _id: -1 }).limit(limit);
        const cursorFn = (chain as unknown as { cursor?: () => unknown }).cursor;
        if (!cursorFn) {
          reply.raw.end();
          return;
        }
        const cursor = cursorFn() as {
          on: (event: "data" | "end" | "error", listener: (...args: unknown[]) => void) => void;
        };
        cursor.on("data", (doc: unknown) => {
          try {
            reply.raw.write(`${JSON.stringify(doc)}\n`);
          } catch {}
        });
        cursor.on("end", () => reply.raw.end());
        cursor.on("error", () => reply.raw.end());
      } catch (error) {
        console.error("Export NDJSON error:", error);
        reply.header("Content-Type", "application/x-ndjson");
        reply.header("Content-Disposition", 'attachment; filename="devtools-export.ndjson"');
      }
    },
  );

  // Clear storage
  fastify.post(`${basePath}/store/clear`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await requireAuth(request, reply))) return reply.send({ ok: true, deleted: 0 });
      if (!persistEnabled) return reply.send({ ok: true, deleted: 0 });
      ensureModel(fastify, persistTtlDays);
      const DevEntryModel = getModel();
      if (!DevEntryModel) return reply.send({ ok: true, deleted: 0 });
      if (!isMongoReady(fastify)) return reply.send({ ok: true, deleted: 0 });
      const res = await DevEntryModel.deleteMany({});
      return reply.send({ ok: true, deleted: res.deletedCount || 0 });
    } catch (error) {
      console.error("Store clear error:", error);
      return reply.send({ ok: true, deleted: 0 });
    }
  });
}
