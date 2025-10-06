/**
 * Tests Redis tracker utilities:
 * - detectRedis() for redis/ioredis detection
 * - wrapRedisClient() no-op behavior and partial client support
 * - setupRedisTracking() wrapping get/set/del and recording into pending entry
 */
import { test } from 'tap'
import type { FastifyInstance } from 'fastify'
import { detectRedis, wrapRedisClient, setupRedisTracking } from '../src/redis/tracker'

function createFastifyLike(redis?: any, ioredis?: any): any {
  return {
    redis,
    ioredis,
    log: { debug: () => {} }
  }
}

test('detectRedis', async (t) => {
  const f1 = createFastifyLike()
  t.equal(detectRedis(f1 as any), false)

  const f2 = createFastifyLike({})
  t.equal(detectRedis(f2 as any), true)

  const f3 = createFastifyLike(undefined, {})
  t.equal(detectRedis(f3 as any), true)
})

test('wrapRedisClient - no client and partial client', async (t) => {
  t.equal(wrapRedisClient(undefined as any), undefined)

  const client: any = {
    get: async (_k: string) => 'v'
  }
  const wrapped = wrapRedisClient(client)
  t.equal(await wrapped.get('k'), 'v')
  // set/del not defined should remain undefined
  t.equal(typeof (wrapped as any).set, 'undefined')
  t.equal(typeof (wrapped as any).del, 'undefined')
})

test('setupRedisTracking - tracks get/set/del into pending entry', async (t) => {
  const pending = new Map<string, any>()
  const entry: any = { id: 'e1', ts: Date.now(), method: 'GET', url: '/' }
  pending.set('e1', entry)

  // Client with get/set/del
  const client: any = {
    get: async (_k: string) => null, // cache miss
    set: async (_k: string, _v: any) => 'OK',
    del: async (_k: string) => 1
  }
  const fastify = createFastifyLike(client) as FastifyInstance as any

  setupRedisTracking(fastify, pending)

  // After setup, methods are wrapped
  await fastify.redis.get('key1')
  await fastify.redis.set('key1', 'v')
  await fastify.redis.del('key1')

  t.ok(Array.isArray(entry.redis))
  const ops = entry.redis.map((r: any) => r.operation)
  t.same(ops.sort(), ['del','get','set'])
  // cacheHit should be false for null result
  const getOp = entry.redis.find((r: any) => r.operation === 'get')
  t.equal(getOp.cacheHit, false)

  // Idempotent wrapping
  setupRedisTracking(fastify, pending)
  t.equal(fastify.redis.__devtoolsWrapped, true)
})
