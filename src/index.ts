import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import type { DevtoolsEntry, DevtoolsOptions, WebSocketMessage } from "./types";
import "./types"; // Import module augmentation

// Re-export types for consumers
export type { DevtoolsEntry, DevtoolsOptions, WebSocketMessage } from "./types";

// Hooks
import { onRequestHook, onResponseHook, onSendHook, preHandlerHook } from "./hooks/lifecycle";
// Persistence
import { persistEntry } from "./persistence/mongodb";
// Redis
import { detectRedis, setupRedisTracking, wrapRedisClient } from "./redis/tracker";
// Routes
import { registerRoutes } from "./routes";
import { registerStorageRoutes } from "./routes/storage";
// WebSocket
import { setupWebSocketTracking } from "./websocket/tracker";

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
 * - WebSocket message capture
 * - Redis cache tracking
 *
 * @param fastify - The Fastify instance to register the plugin with
 * @param opts - Configuration options for the DevTools plugin
 * @returns Promise that resolves when the plugin is fully registered
 */
const devtoolsPlugin: FastifyPluginAsync<DevtoolsOptions> = async (
  fastify: FastifyInstance,
  opts: DevtoolsOptions = {},
) => {
  const enabled = opts.enabled !== false;
  if (!enabled) {
    fastify.log.info("DevTools disabled");
    return;
  }

  const basePath = opts.basePath || "/__devtools";
  const bufferSize = Number(opts.bufferSize ?? 200);
  const token = opts.token;
  const maxBody = Number(opts.maxBodyBytes ?? 10_000);
  const persistEnabled = !!opts.persistEnabled;
  const persistTtlDays = Number(opts.persistTtlDays ?? 14);
  const slowMs = Number(opts.slowMs ?? 1000);
  const captureWebSockets = opts.captureWebSockets !== false;
  const trackRedisCache = opts.trackRedisCache !== false;

  const isDevtoolsRoute = (url: string) => url.startsWith(basePath);

  const buffer: DevtoolsEntry[] = [];
  const pending = new Map<string, DevtoolsEntry>();
  const clients = new Set<FastifyReply>();
  const wsMessages: WebSocketMessage[] = [];
  const wsConnections = new Map<string, { connectedAt: number; requestId?: string }>();

  function push(entry: DevtoolsEntry) {
    buffer.push(entry);
    while (buffer.length > bufferSize) buffer.shift();
    const data = `data: ${JSON.stringify(entry)}\n\n`;
    for (const client of clients) {
      try {
        client.raw.write(data);
      } catch {}
    }
  }

  async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
    if (!token) return true;
    const provided =
      (request.headers["x-devtools-token"] as string) ||
      (request.query as Record<string, string | string[] | undefined>)?.token;
    if (provided !== token) {
      reply.code(401).send({ error: "Unauthorized", message: "Invalid devtools token" });
      return false;
    }
    return true;
  }

  const urlParams = new URLSearchParams();
  if (token) urlParams.set("token", token);
  const tokenQs = urlParams.toString() ? `?${urlParams.toString()}` : "";

  // Setup Redis tracking
  if (trackRedisCache && detectRedis(fastify)) {
    setupRedisTracking(fastify, pending);

    // Provide helper for manual use
    fastify.decorate("getRedisClient", function (this: FastifyInstance, requestId?: string) {
      const client = this.redis ?? (this as FastifyInstance & { ioredis?: unknown }).ioredis;
      return wrapRedisClient(client, requestId);
    });
  }

  // Setup WebSocket tracking
  if (captureWebSockets) {
    setupWebSocketTracking(fastify, wsMessages, wsConnections, clients, bufferSize);
  }

  // Register lifecycle hooks
  fastify.addHook("onRequest", async (request: FastifyRequest) => {
    onRequestHook(request, isDevtoolsRoute, pending);
  });

  fastify.addHook("preHandler", async (request: FastifyRequest) => {
    preHandlerHook(request, isDevtoolsRoute, pending, maxBody);
  });

  fastify.addHook(
    "onSend",
    async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      return onSendHook(request, reply, payload, isDevtoolsRoute, pending, maxBody);
    },
  );

  fastify.addHook("onResponse", async (request: FastifyRequest, reply: FastifyReply) => {
    onResponseHook(request, reply, isDevtoolsRoute, pending, push, (entry) =>
      persistEntry(fastify, entry, persistTtlDays),
    );
  });

  // Register routes
  registerRoutes(
    fastify,
    basePath,
    buffer,
    pending,
    clients,
    wsMessages,
    wsConnections,
    requireAuth,
    () => detectRedis(fastify),
    persistEnabled,
    slowMs,
    isDevtoolsRoute,
    tokenQs,
  );

  // Register storage routes
  if (persistEnabled) {
    registerStorageRoutes(fastify, basePath, requireAuth, persistEnabled, persistTtlDays);
  }

  fastify.log.info(
    {
      basePath,
      bufferSize,
      captureWebSockets,
      trackRedisCache,
      redisDetected: detectRedis(fastify),
    },
    "DevTools enabled",
  );
};

export default fp(devtoolsPlugin, { name: "fastify-devtools" });
