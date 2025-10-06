/**
 * Tests request lifecycle capture and metrics:
 * - Timing breakdown (preHandler/handler/send)
 * - Route/params capture and response size/content-type
 * - Error capture and multi-method handling
 * - Buffer size enforcement and request IDs
 */
import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('Lifecycle hooks', async (t) => {
  t.test('should capture request timing information', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/timed-route', async (request, reply) => {
      // Simulate some processing time
      await new Promise(resolve => setTimeout(resolve, 10))
      return { message: 'timed response' }
    })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/timed-route'
    })
    
    t.equal(response.statusCode, 200)
    
    // Get captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/timed-route')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.durationMs !== undefined)
    t.ok(capturedRequest.durationMs >= 0)
    t.ok(capturedRequest.timings)
    
    await fastify.close()
  })

  t.test('should capture route information', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/users/:id', async (request, reply) => {
      const { id } = request.params as { id: string }
      return { userId: id }
    })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/users/123'
    })
    
    t.equal(response.statusCode, 200)
    
    // Get captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/users/123')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.params)
    t.equal(capturedRequest.params.id, '123')
    t.ok(capturedRequest.route)
    
    await fastify.close()
  })

  t.test('should capture response size', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/large-response', async (request, reply) => {
      return { data: 'x'.repeat(1000) }
    })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/large-response'
    })
    
    t.equal(response.statusCode, 200)
    
    // Get captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/large-response')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.responseSizeBytes !== undefined)
    t.ok(capturedRequest.responseSizeBytes > 0)
    
    await fastify.close()
  })

  t.test('should capture content type', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/json-response', async (request, reply) => {
      return { type: 'json' }
    })
    
    fastify.get('/text-response', async (request, reply) => {
      reply.type('text/plain')
      return 'plain text'
    })
    
    // Test JSON response
    await fastify.inject({
      method: 'GET',
      url: '/json-response'
    })
    
    // Test text response
    await fastify.inject({
      method: 'GET',
      url: '/text-response'
    })
    
    // Get captured requests
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const jsonRequest = requests.find((r: any) => r.url === '/json-response')
    const textRequest = requests.find((r: any) => r.url === '/text-response')
    
    t.ok(jsonRequest)
    t.ok(jsonRequest.contentType)
    t.match(jsonRequest.contentType, /application\/json/)
    
    t.ok(textRequest)
    t.ok(textRequest.contentType)
    t.match(textRequest.contentType, /text\/plain/)
    
    await fastify.close()
  })

  t.test('should capture error information', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/error-route', async (request, reply) => {
      throw new Error('Test error')
    })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/error-route'
    })
    
    t.equal(response.statusCode, 500)
    
    // Get captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/error-route')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.response)
    t.equal(capturedRequest.response.statusCode, 500)
    
    await fastify.close()
  })

  t.test('should handle different HTTP methods', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/resource', async () => ({ method: 'GET' }))
    fastify.post('/resource', async () => ({ method: 'POST' }))
    fastify.put('/resource', async () => ({ method: 'PUT' }))
    fastify.delete('/resource', async () => ({ method: 'DELETE' }))
    fastify.patch('/resource', async () => ({ method: 'PATCH' }))
    
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    
    for (const method of methods) {
      const response = await fastify.inject({
        method: method as any,
        url: '/resource',
        payload: method !== 'GET' && method !== 'DELETE' ? {} : undefined
      })
      
      t.equal(response.statusCode, 200)
    }
    
    // Get captured requests
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const resourceRequests = requests.filter((r: any) => r.url === '/resource')
    
    t.equal(resourceRequests.length, methods.length)
    
    for (const method of methods) {
      const found = resourceRequests.find((r: any) => r.method === method)
      t.ok(found, `Should capture ${method} request`)
    }
    
    await fastify.close()
  })

  t.test('should respect bufferSize option', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      bufferSize: 5 // Small buffer for testing
    })
    
    fastify.get('/test', async () => ({ test: true }))
    
    // Make more requests than buffer size
    for (let i = 0; i < 10; i++) {
      await fastify.inject({
        method: 'GET',
        url: '/test'
      })
    }
    
    // Get captured requests
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const testRequests = requests.filter((r: any) => r.url === '/test')
    
    // Should not exceed buffer size
    t.ok(testRequests.length <= 5)
    
    await fastify.close()
  })

  t.test('should capture request ID', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/test', async (request) => {
      return { requestId: request.id }
    })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/test'
    })
    
    t.equal(response.statusCode, 200)
    
    // Get captured request
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/test')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.requestId)
    t.ok(capturedRequest.id) // DevTools internal ID
    
    await fastify.close()
  })
})
