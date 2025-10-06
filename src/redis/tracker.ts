import type { FastifyInstance } from "fastify";
import type { DevtoolsEntry } from "../types";

type RedisLike = {
  get?: (key: string, ...args: unknown[]) => Promise<unknown> | unknown;
  set?: (key: string, value: unknown, ...args: unknown[]) => Promise<unknown> | unknown;
  del?: (key: string, ...args: unknown[]) => Promise<unknown> | unknown;
  info?: () => Promise<unknown> | unknown;
  status?: string;
  __devtoolsWrapped?: boolean;
};

/**
 * Detect if Redis is available on the Fastify instance
 */
export function detectRedis(fastify: FastifyInstance): boolean {
  try {
    return !!(fastify.redis || fastify.ioredis);
  } catch {
    return false;
  }
}

/**
 * Wrap a Redis client to track operations for a specific request
 */
export function wrapRedisClient(client: unknown, _requestId?: string): unknown {
  if (!client) return client;

  const c = client as RedisLike;
  const originalGet = c.get?.bind(c);
  const originalSet = c.set?.bind(c);
  const originalDel = c.del?.bind(c);

  if (originalGet) {
    (c as RedisLike).get = async (key: string, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalGet(key, ...args);
      const _duration = Date.now() - start;

      // Track operation (implementation depends on context)

      return result;
    };
  }

  if (originalSet) {
    (c as RedisLike).set = async (key: string, value: unknown, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalSet(key, value, ...args);
      const _duration = Date.now() - start;

      // Track operation

      return result;
    };
  }

  if (originalDel) {
    (c as RedisLike).del = async (key: string, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalDel(key, ...args);
      const _duration = Date.now() - start;

      // Track operation

      return result;
    };
  }

  return c;
}

/**
 * Globally wrap Redis client for automatic tracking
 */
export function setupRedisTracking(
  fastify: FastifyInstance,
  pending: Map<string, DevtoolsEntry>,
): void {
  const client = (fastify.redis || fastify.ioredis) as RedisLike | undefined;
  if (!client || client.__devtoolsWrapped) return;

  const originalGet = client.get?.bind(client);
  const originalSet = client.set?.bind(client);
  const originalDel = client.del?.bind(client);

  if (originalGet) {
    client.get = async (key: string, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalGet(key, ...args);
      const duration = Date.now() - start;

      // Find the current request context
      const currentEntries = Array.from(pending.entries());
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1];
        if (entry) {
          if (!entry.redis) entry.redis = [];
          entry.redis.push({
            cacheHit: result !== null && result !== undefined,
            key,
            operation: "get",
            durationMs: duration,
          });
        }
      }

      return result;
    };
  }

  if (originalSet) {
    client.set = async (key: string, value: unknown, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalSet(key, value, ...args);
      const duration = Date.now() - start;

      const currentEntries = Array.from(pending.entries());
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1];
        if (entry) {
          if (!entry.redis) entry.redis = [];
          entry.redis.push({
            key,
            operation: "set",
            durationMs: duration,
          });
        }
      }

      return result;
    };
  }

  if (originalDel) {
    client.del = async (key: string, ...args: unknown[]) => {
      const start = Date.now();
      const result = await originalDel(key, ...args);
      const duration = Date.now() - start;

      const currentEntries = Array.from(pending.entries());
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1];
        if (entry) {
          if (!entry.redis) entry.redis = [];
          entry.redis.push({
            key,
            operation: "del",
            durationMs: duration,
          });
        }
      }

      return result;
    };
  }

  client.__devtoolsWrapped = true;
}
