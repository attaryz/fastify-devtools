/**
 * Tests auxiliary helpers & SSE-related setup without open handles:
 * - Verifies `getRedisClient()` decoration when Redis is detected
 */

import Fastify from "fastify";
import { test } from "tap";
import devtoolsPlugin from "../src/index";

test("getRedisClient helper is decorated when redis is present", async (t) => {
  const fastify = Fastify({ logger: false });

  // Provide a fake redis to trigger decoration of getRedisClient
  (fastify as any).redis = { get: async () => null };

  await fastify.register(devtoolsPlugin, { enabled: true, trackRedisCache: true });

  // Exercise getRedisClient helper path
  const client = (fastify as any).getRedisClient();
  t.ok(client);

  await fastify.close();
});
