import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('request capture', async (t) => {
  t.test('should capture GET request', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/test', async (request, reply) => {
      return { message: 'test response' }
    })
    
    // Make a test request
    const response = await fastify.inject({
      method: 'GET',
      url: '/test?param=value'
    })
    
    t.equal(response.statusCode, 200)
    
    // Check if request was captured
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    t.equal(requestsResponse.statusCode, 200)
    const requests = JSON.parse(requestsResponse.body)
    t.ok(Array.isArray(requests))
    t.ok(requests.length > 0)
    
    const capturedRequest = requests.find((r: any) => r.url === '/test?param=value')
    t.ok(capturedRequest)
    t.equal(capturedRequest.method, 'GET')
    t.ok(capturedRequest.query)
    t.equal(capturedRequest.query.param, 'value')
    t.ok(capturedRequest.response)
    t.equal(capturedRequest.response.statusCode, 200)
    
    await fastify.close()
  })

  t.test('should capture POST request with body', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.post('/api/users', async (request, reply) => {
      return { id: 1, ...(request.body as object) }
    })
    
    const testBody = { name: 'John', email: 'john@example.com' }
    
    // Make a test request
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/users',
      payload: testBody,
      headers: {
        'content-type': 'application/json'
      }
    })
    
    t.equal(response.statusCode, 200)
    
    // Check if request was captured
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/api/users')
    
    t.ok(capturedRequest)
    t.equal(capturedRequest.method, 'POST')
    t.ok(capturedRequest.body)
    t.same(capturedRequest.body, testBody)
    t.ok(capturedRequest.headers)
    t.equal(capturedRequest.headers['content-type'], 'application/json')
    
    await fastify.close()
  })

  t.test('should mask sensitive headers', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    fastify.get('/secure', async (request, reply) => {
      return { message: 'secure endpoint' }
    })
    
    // Make a request with sensitive headers
    await fastify.inject({
      method: 'GET',
      url: '/secure',
      headers: {
        'authorization': 'Bearer secret-token',
        'cookie': 'session=abc123',
        'x-api-key': 'secret-key'
      }
    })
    
    // Check if sensitive headers are masked
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/secure')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.headers)
    t.equal(capturedRequest.headers.authorization, '[REDACTED]')
    t.equal(capturedRequest.headers.cookie, '[REDACTED]')
    
    await fastify.close()
  })

  t.test('should truncate large request bodies', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      maxBodyBytes: 100 // Small limit for testing
    })
    
    fastify.post('/large-body', async (request, reply) => {
      return { received: true }
    })
    
    const largeBody = { data: 'x'.repeat(200) } // Larger than maxBodyBytes
    
    await fastify.inject({
      method: 'POST',
      url: '/large-body',
      payload: largeBody,
      headers: {
        'content-type': 'application/json'
      }
    })
    
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const capturedRequest = requests.find((r: any) => r.url === '/large-body')
    
    t.ok(capturedRequest)
    t.ok(capturedRequest.truncated)
    t.ok(typeof capturedRequest.body === 'string')
    // The body might be slightly larger than maxBodyBytes due to JSON serialization
    t.ok((capturedRequest.body as string).length <= 150)
    
    await fastify.close()
  })

  t.test('should not capture devtools routes', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    // Make requests to devtools endpoints
    await fastify.inject({
      method: 'GET',
      url: '/__devtools'
    })
    
    await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    // Check that devtools routes are not captured
    const requestsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
    
    const requests = JSON.parse(requestsResponse.body)
    const devtoolsRequests = requests.filter((r: any) => r.url.startsWith('/__devtools'))
    
    t.equal(devtoolsRequests.length, 0)
    
    await fastify.close()
  })
})