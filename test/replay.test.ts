import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('request replay', async (t) => {
  t.test('should replay GET request', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    let requestCount = 0
    fastify.get('/api/test', async (request, reply) => {
      requestCount++
      return { message: 'test response', count: requestCount }
    })
    
    // Make original request
    const originalResponse = await fastify.inject({
      method: 'GET',
      url: '/api/test?param=value',
      headers: {
        'x-custom-header': 'custom-value'
      }
    })
    
    t.equal(originalResponse.statusCode, 200)
    t.equal(requestCount, 1)
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/test?param=value')
    
    // Replay the request
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(replayResult.statusCode, 200)
    t.equal(requestCount, 2) // Should have been called again
    
    await fastify.close()
  })

  t.test('should replay POST request with body', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const receivedBodies: any[] = []
    fastify.post('/api/users', async (request, reply) => {
      receivedBodies.push(request.body)
      return { id: receivedBodies.length, ...(request.body as object) }
    })
    
    const testBody = { name: 'John', email: 'john@example.com' }
    
    // Make original request
    await fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: testBody,
      headers: {
        'content-type': 'application/json'
      }
    })
    
    t.equal(receivedBodies.length, 1)
    t.same(receivedBodies[0], testBody)
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/users')
    
    // Replay the request
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(replayResult.statusCode, 200)
    t.equal(receivedBodies.length, 2) // Should have been called again
    t.same(receivedBodies[1], testBody) // Same body should be replayed
    
    await fastify.close()
  })

  t.test('should allow custom body in replay', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const receivedBodies: any[] = []
    fastify.post('/api/users', async (request, reply) => {
      receivedBodies.push(request.body)
      return { id: receivedBodies.length, ...(request.body as object) }
    })
    
    const originalBody = { name: 'John', email: 'john@example.com' }
    const customBody = { name: 'Jane', email: 'jane@example.com' }
    
    // Make original request
    await fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: originalBody,
      headers: {
        'content-type': 'application/json'
      }
    })
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/users')
    
    // Replay with custom body
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: {
        id: capturedRequest.id,
        body: customBody
      },
      headers: {
        'content-type': 'application/json'
      }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(receivedBodies.length, 2)
    t.same(receivedBodies[0], originalBody)
    t.same(receivedBodies[1], customBody) // Custom body should be used
    
    await fastify.close()
  })

  t.test('should allow custom headers in replay', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const receivedHeaders: any[] = []
    fastify.get('/api/test', async (request, reply) => {
      receivedHeaders.push(request.headers)
      return { message: 'test' }
    })
    
    // Make original request
    await fastify.inject({
      method: 'GET',
      url: '/api/test',
      headers: {
        'x-original': 'original-value'
      }
    })
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/test')
    
    // Replay with custom headers
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: {
        id: capturedRequest.id,
        headers: {
          'x-custom': 'custom-value'
        }
      },
      headers: {
        'content-type': 'application/json'
      }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(receivedHeaders.length, 2)
    t.ok(receivedHeaders[1]['x-custom'])
    t.equal(receivedHeaders[1]['x-custom'], 'custom-value')
    
    await fastify.close()
  })

  t.test('should handle replay of non-existent request', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: 'non-existent-id' }
    })
    
    t.equal(replayResponse.statusCode, 404)
    
    await fastify.close()
  })

  t.test('should handle replay errors gracefully', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/api/error', async (request, reply) => {
      throw new Error('Test error')
    })
    
    // Make original request (which will error)
    await fastify.inject({
      method: 'GET',
      url: '/api/error'
    })
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/error')
    
    // Replay the request (should handle error)
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(replayResult.statusCode, 500) // The replayed request should have a 500 status
    
    await fastify.close()
  })

  t.test('should preserve query parameters in replay', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const receivedQueries: any[] = []
    fastify.get('/api/search', async (request, reply) => {
      receivedQueries.push(request.query)
      return { query: request.query }
    })
    
    // Make original request with query params
    await fastify.inject({
      method: 'GET',
      url: '/api/search?q=test&limit=10'
    })
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/search?q=test&limit=10')
    
    // Replay the request
    const replayResponse = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id }
    })
    
    t.equal(replayResponse.statusCode, 200)
    const replayResult = JSON.parse(replayResponse.body)
    t.ok(replayResult.ok)
    t.equal(receivedQueries.length, 2)
    t.same(receivedQueries[0], receivedQueries[1]) // Query params should be preserved
    
    await fastify.close()
  })

  t.test('should require authentication for replay when token is set', async (t) => {
    const fastify = Fastify({ logger: false })
    const testToken = 'test-token'
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      token: testToken
    })
    
    fastify.get('/api/test', async () => ({ test: true }))
    
    // Make original request with auth
    await fastify.inject({
      method: 'GET',
      url: '/api/test',
      headers: {
        'x-devtools-token': testToken
      }
    })
    
    // Get the captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests',
      headers: {
        'x-devtools-token': testToken
      }
    })
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/test')
    
    // Try replay without auth
    const unauthorizedReplay = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id }
    })
    
    t.equal(unauthorizedReplay.statusCode, 401)
    
    // Try replay with auth
    const authorizedReplay = await fastify.inject({
      method: 'POST',
      url: '/__devtools/replay',
      payload: { id: capturedRequest.id },
      headers: {
        'x-devtools-token': testToken
      }
    })
    
    t.equal(authorizedReplay.statusCode, 200)
    
    await fastify.close()
  })
})