import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

// Mock Redis client
class MockRedisClient {
  private store: Map<string, string> = new Map()
  
  async get(key: string) {
    return this.store.get(key) || null
  }
  
  async set(key: string, value: string, ...args: any[]) {
    this.store.set(key, value)
    return 'OK'
  }
  
  async del(key: string) {
    const existed = this.store.has(key)
    this.store.delete(key)
    return existed ? 1 : 0
  }
  
  async exists(key: string) {
    return this.store.has(key) ? 1 : 0
  }
}

test('Redis tracking', async (t) => {
  t.test('should detect Redis via fastify.redis', async (t) => {
    const fastify = Fastify({ logger: false })
    
    ;(fastify as any).redis = new MockRedisClient()
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    t.equal(statusData.detected, true)
    
    await fastify.close()
  })

  t.test('should detect Redis via fastify.ioredis', async (t) => {
    const fastify = Fastify({ logger: false })
    
    ;(fastify as any).ioredis = new MockRedisClient()
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    t.equal(statusData.detected, true)
    
    await fastify.close()
  })

  t.test('should provide redis/status endpoint', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    t.ok(typeof statusData === 'object')
    t.ok(typeof statusData.detected === 'boolean')
    
    await fastify.close()
  })

  t.test('should require authentication for redis/status when token is set', async (t) => {
    const fastify = Fastify({ logger: false })
    const testToken = 'test-token'
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true,
      token: testToken
    })
    
    // Without token
    const unauthorizedResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(unauthorizedResponse.statusCode, 401)
    
    // With token
    const authorizedResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status',
      headers: {
        'x-devtools-token': testToken
      }
    })
    
    t.equal(authorizedResponse.statusCode, 200)
    
    await fastify.close()
  })

  t.test('should work when Redis tracking is disabled', async (t) => {
    const fastify = Fastify({ logger: false })
    
    ;(fastify as any).redis = new MockRedisClient()
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: false
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    // Should still report detection status
    t.ok(typeof statusData.detected === 'boolean')
    
    await fastify.close()
  })

  t.test('should work without Redis installed', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    t.equal(statusData.detected, false)
    
    await fastify.close()
  })

  t.test('should track Redis operations in request entries', async (t) => {
    const fastify = Fastify({ logger: false })
    
    const redisClient = new MockRedisClient()
    ;(fastify as any).redis = redisClient
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    // Set up a route that uses Redis
    fastify.get('/cached-data/:id', async (request, reply) => {
      const { id } = request.params as { id: string }
      const cacheKey = `data:${id}`
      
      // Try to get from cache
      const cached = await (fastify as any).redis.get(cacheKey)
      
      if (cached) {
        return JSON.parse(cached)
      }
      
      // Simulate fetching data
      const data = { id, value: 'fresh data' }
      
      // Store in cache
      await (fastify as any).redis.set(cacheKey, JSON.stringify(data))
      
      return data
    })
    
    // Make request (cache miss)
    const response1 = await fastify.inject({
      method: 'GET',
      url: '/cached-data/123'
    })
    
    t.equal(response1.statusCode, 200)
    
    // Make request again (cache hit)
    const response2 = await fastify.inject({
      method: 'GET',
      url: '/cached-data/123'
    })
    
    t.equal(response2.statusCode, 200)
    
    // Check captured requests
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const cachedRequests = requests.filter((r: any) => r.url.includes('/cached-data'))
    
    t.ok(cachedRequests.length >= 2)
    
    await fastify.close()
  })

  t.test('should provide getRedisClient helper when Redis is detected', async (t) => {
    const fastify = Fastify({ logger: false })
    
    ;(fastify as any).redis = new MockRedisClient()
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    // Check if helper is available
    t.ok(typeof (fastify as any).getRedisClient === 'function')
    
    await fastify.close()
  })

  t.test('should handle Redis errors gracefully', async (t) => {
    const fastify = Fastify({ logger: false })
    
    // Create a Redis client that throws errors
    const errorClient = {
      get: async () => { throw new Error('Redis error') },
      set: async () => { throw new Error('Redis error') },
      info: async () => { throw new Error('Redis error') }
    }
    
    ;(fastify as any).redis = errorClient
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      trackRedisCache: true
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/redis/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    const statusData = JSON.parse(statusResponse.body)
    t.equal(statusData.detected, true)
    // Should include error information
    t.ok(statusData.error)
    
    await fastify.close()
  })
})
