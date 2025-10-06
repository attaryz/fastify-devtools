import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getModel, isMongoReady } from "../persistence/mongodb";
import type { DevtoolsEntry, WebSocketMessage } from "../types";
import { parseJsonRelaxed } from "../utils/json";
import { loadView, renderTemplate } from "../utils/views";

export function registerRoutes(
  fastify: FastifyInstance,
  basePath: string,
  buffer: DevtoolsEntry[],
  pending: Map<string, DevtoolsEntry>,
  clients: Set<FastifyReply>,
  wsMessages: WebSocketMessage[],
  wsConnections: Map<string, { connectedAt: number; requestId?: string }>,
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<boolean>,
  detectRedis: () => boolean,
  persistEnabled: boolean,
  slowMs: number,
  isDevtoolsRoute: (url: string) => boolean,
  _tokenQs: string,
) {
  // Dashboard
  fastify.get(basePath, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    const tpl = await loadView("dashboard.html");
    const html = renderTemplate(tpl, {
      HAS_STORAGE: persistEnabled ? "true" : "false",
      BASE_PATH: JSON.stringify(basePath),
      BASE_PATH_ATTR: basePath,
      SLOW_MS: String(slowMs),
    });
    return reply.type("text/html").send(html);
  });

  // Get requests
  fastify.get(`${basePath}/requests`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    return reply.send(buffer.slice(-100));
  });

  // Status
  fastify.get(`${basePath}/status`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    const mongoConnected = isMongoReady(fastify);
    const DevEntryModel = getModel();
    return reply.send({
      persistEnabled,
      mongoConnected,
      modelInitialized: !!DevEntryModel,
      bufferLength: buffer.length,
      pendingCount: pending.size,
      sseClients: clients.size,
    });
  });

  // SSE events
  fastify.get(`${basePath}/events`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await requireAuth(request, reply))) return;
      reply.raw.setHeader("Content-Type", "text/event-stream");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.hijack();
      reply.raw.write("\n");
      clients.add(reply);

      request.raw.on("close", () => {
        clients.delete(reply);
        try {
          reply.raw.end();
        } catch {}
      });
    } catch (error) {
      console.error("SSE events error:", error);
      return reply.code(500).send("Internal server error");
    }
  });

  // Clear buffer
  fastify.post(`${basePath}/clear`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    buffer.splice(0, buffer.length);
    return reply.send({ success: true });
  });

  // Get single request
  fastify.get(`${basePath}/requests/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await requireAuth(request, reply))) return;
      const { id } = request.params as Record<string, string>;
      let entry = buffer.find((x) => x.id === id) || pending.get(id);
      if (!entry && persistEnabled) {
        const DevEntryModel = getModel();
        if (DevEntryModel) {
          const doc = await DevEntryModel.findOne({ id }).lean();
          if (doc) entry = doc as DevtoolsEntry;
        }
      }
      if (!entry) return reply.code(404).send({ error: "Not Found", message: "Entry not found" });
      return reply.send(entry);
    } catch (error) {
      console.error("Get request error:", error);
      return reply.code(404).send({ error: "Not Found", message: "Entry not found" });
    }
  });

  // Entry view
  fastify.get(`${basePath}/entry/:id`, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!(await requireAuth(request, reply))) return;
      const { id } = request.params as Record<string, string>;

      let entry = buffer.find((x) => x.id === id) || pending.get(id);
      if (!entry && persistEnabled) {
        const DevEntryModel = getModel();
        if (DevEntryModel) {
          const doc = await DevEntryModel.findOne({ id }).lean();
          if (doc) entry = doc as DevtoolsEntry;
        }
      }

      if (!entry) {
        return reply.code(404).send("Entry not found");
      }

      const tpl = await loadView("entry.html");
      const html = renderTemplate(tpl, {
        BASE_PATH: JSON.stringify(basePath),
        BASE_PATH_ATTR: basePath,
        ENTRY_ID: String(id),
        SLOW_MS: String(slowMs),
      });
      return reply.type("text/html").send(html);
    } catch (error) {
      console.error("Get entry view error:", error);
      return reply.code(500).send("Internal server error");
    }
  });

  // Replay request
  fastify.post(`${basePath}/replay`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    try {
      const body = (request.body || {}) as Record<string, unknown>;
      let source: DevtoolsEntry | null = null;
      if (body.id) {
        const id = String(body.id);
        source = buffer.find((x) => x.id === id) || pending.get(id) || null;
        if (!source && persistEnabled) {
          const DevEntryModel = getModel();
          if (DevEntryModel) {
            const doc = await DevEntryModel.findOne({ id }).lean();
            source = doc ? (doc as DevtoolsEntry) : null;
          }
        }
        if (!source) return reply.code(404).send({ ok: false, error: "Entry not found" });
      }
      const method = (body.method || source?.method || "GET").toString().toUpperCase();
      const urlPath = String(body.url || source?.url || "/");
      if (isDevtoolsRoute(urlPath))
        return reply.code(400).send({ ok: false, error: "Cannot replay devtools URLs" });
      const hdrs: Record<string, unknown> = {
        ...(source?.headers || {}),
        ...((body.headers as Record<string, unknown>) || {}),
      };
      delete hdrs.host;
      delete hdrs.connection;
      delete hdrs["content-length"];
      delete hdrs["transfer-encoding"];
      const headers: Record<string, string> = {};
      Object.keys(hdrs).forEach((k) => {
        if (hdrs[k] != null) headers[k.toLowerCase()] = String(hdrs[k]);
      });
      let payload: unknown = body.body !== undefined ? body.body : source?.body;
      try {
        if (typeof payload === "string") {
          const pr = parseJsonRelaxed(payload);
          if (pr.ok) payload = pr.value;
        }
      } catch {}
      const res = await fastify.inject({
        method: method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS",
        url: urlPath,
        headers,
        payload: payload as string | object | Buffer | undefined,
      });

      const response = res as {
        statusCode: number;
        headers: Record<string, string | string[]>;
        body: string | Buffer | object;
      };

      return reply.send({
        ok: true,
        statusCode: response.statusCode,
        headers: response.headers,
        body: typeof response.body === "string" ? response.body.slice(0, 2048) : response.body,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return reply.code(500).send({ ok: false, error: errorMessage });
    }
  });

  // WebSocket endpoints
  fastify.get(`${basePath}/websockets`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    return reply.send(wsMessages.slice(-100));
  });

  fastify.get(
    `${basePath}/websockets/connections`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!(await requireAuth(request, reply))) return;
      const connections = Array.from(wsConnections.entries()).map(([id, info]) => ({
        id,
        ...info,
      }));
      return reply.send(connections);
    },
  );

  // Redis status
  fastify.get(`${basePath}/redis/status`, async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireAuth(request, reply))) return;
    const redisDetected = detectRedis();
    const redisInfo: { detected: boolean; status?: string; info?: unknown; error?: string } = {
      detected: redisDetected,
    };

    if (redisDetected) {
      try {
        const client = (fastify.redis ?? fastify.ioredis) as
          | { status?: string; info?: () => Promise<unknown> | unknown }
          | undefined;
        if (client?.status) redisInfo.status = client.status;
        if (typeof client?.info === "function") redisInfo.info = await client.info();
      } catch (err) {
        redisInfo.error = err instanceof Error ? err.message : String(err);
      }
    }

    return reply.send(redisInfo);
  });
}
