import type { FastifyInstance } from "fastify"
import type { DevtoolsEntry } from "../types"

/**
 * Detect if Redis is available on the Fastify instance
 */
export function detectRedis(fastify: FastifyInstance): boolean {
  try {
    return !!(fastify.redis || (fastify as any).ioredis)
  } catch {
    return false
  }
}

/**
 * Wrap a Redis client to track operations for a specific request
 */
export function wrapRedisClient(client: any, requestId?: string): any {
  if (!client) return client
  
  const originalGet = client.get?.bind(client)
  const originalSet = client.set?.bind(client)
  const originalDel = client.del?.bind(client)
  
  if (originalGet) {
    client.get = async function(key: string, ...args: any[]) {
      const start = Date.now()
      const result = await originalGet(key, ...args)
      const duration = Date.now() - start
      
      // Track operation (implementation depends on context)
      
      return result
    }
  }
  
  if (originalSet) {
    client.set = async function(key: string, value: any, ...args: any[]) {
      const start = Date.now()
      const result = await originalSet(key, value, ...args)
      const duration = Date.now() - start
      
      // Track operation
      
      return result
    }
  }
  
  if (originalDel) {
    client.del = async function(key: string, ...args: any[]) {
      const start = Date.now()
      const result = await originalDel(key, ...args)
      const duration = Date.now() - start
      
      // Track operation
      
      return result
    }
  }
  
  return client
}

/**
 * Globally wrap Redis client for automatic tracking
 */
export function setupRedisTracking(
  fastify: FastifyInstance,
  pending: Map<string, DevtoolsEntry>
): void {
  const client = fastify.redis || (fastify as any).ioredis
  if (!client || client.__devtoolsWrapped) return
  
  const originalGet = client.get?.bind(client)
  const originalSet = client.set?.bind(client)
  const originalDel = client.del?.bind(client)
  
  if (originalGet) {
    client.get = async function(key: string, ...args: any[]) {
      const start = Date.now()
      const result = await originalGet(key, ...args)
      const duration = Date.now() - start
      
      // Find the current request context
      const currentEntries = Array.from(pending.entries())
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1]
        if (entry) {
          if (!entry.redis) entry.redis = []
          entry.redis.push({
            cacheHit: result !== null && result !== undefined,
            key,
            operation: 'get',
            durationMs: duration
          })
        }
      }
      
      return result
    }
  }
  
  if (originalSet) {
    client.set = async function(key: string, value: any, ...args: any[]) {
      const start = Date.now()
      const result = await originalSet(key, value, ...args)
      const duration = Date.now() - start
      
      const currentEntries = Array.from(pending.entries())
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1]
        if (entry) {
          if (!entry.redis) entry.redis = []
          entry.redis.push({
            key,
            operation: 'set',
            durationMs: duration
          })
        }
      }
      
      return result
    }
  }
  
  if (originalDel) {
    client.del = async function(key: string, ...args: any[]) {
      const start = Date.now()
      const result = await originalDel(key, ...args)
      const duration = Date.now() - start
      
      const currentEntries = Array.from(pending.entries())
      if (currentEntries.length > 0) {
        const [, entry] = currentEntries[currentEntries.length - 1]
        if (entry) {
          if (!entry.redis) entry.redis = []
          entry.redis.push({
            key,
            operation: 'del',
            durationMs: duration
          })
        }
      }
      
      return result
    }
  }
  
  client.__devtoolsWrapped = true
}
