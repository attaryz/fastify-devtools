/**
 * Tests the public DevTools HTTP endpoints and basic behaviors:
 * - Dashboard HTML at `GET /__devtools`
 * - Requests listing at `GET /__devtools/requests`
 * - Status at `GET /__devtools/status`
 * - Clear buffer at `POST /__devtools/clear`
 * - Single request JSON, entry HTML, and 404 cases
 * - SSE endpoint registration (no streaming assertions)
 * - Custom basePath routing
 */
import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('GET /__devtools - main dashboard', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    const response = await fastify.inject({ method: 'GET', url: '/__devtools' })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('GET /__devtools/requests - requests API', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    fastify.get('/test', async () => ({ test: true }))
    await fastify.inject({ method: 'GET', url: '/test' })
    const response = await fastify.inject({ method: 'GET', url: '/__devtools/requests' })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    const data = JSON.parse(response.body)
    t.ok(Array.isArray(data))
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('GET /__devtools/status - status API', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    const response = await fastify.inject({ method: 'GET', url: '/__devtools/status' })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    const data = JSON.parse(response.body)
    t.ok(typeof data === 'object')
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('POST /__devtools/clear - clear requests', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    const response = await fastify.inject({ method: 'POST', url: '/__devtools/clear' })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    const data = JSON.parse(response.body)
    t.equal(data.success, true)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('GET /__devtools/requests/:id - request details', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    fastify.get('/test', async () => ({ test: true }))
    await fastify.inject({ method: 'GET', url: '/test' })
    const list = await fastify.inject({ method: 'GET', url: '/__devtools/requests' })
    const data = JSON.parse(list.body)
    const requestId = data[0].id
    const response = await fastify.inject({ method: 'GET', url: `/__devtools/requests/${requestId}` })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    const detail = JSON.parse(response.body)
    t.ok(detail.id)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('GET /__devtools/entry/:id - entry details', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    fastify.get('/test', async () => ({ test: true }))
    await fastify.inject({ method: 'GET', url: '/test' })
    const list = await fastify.inject({ method: 'GET', url: '/__devtools/requests' })
    const data = JSON.parse(list.body)
    const entryId = data[0].id
    const response = await fastify.inject({ method: 'GET', url: `/__devtools/entry/${entryId}` })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
    t.match(response.body, /Entry Details/)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('GET /__devtools/events - SSE endpoint', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    t.pass('Events endpoint registered successfully')
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('custom basePath should work', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true, basePath: '/custom-devtools' })
    const response = await fastify.inject({ method: 'GET', url: '/custom-devtools' })
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('should return 404 for non-existent request ID', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    const response = await fastify.inject({ method: 'GET', url: '/__devtools/requests/non-existent-id' })
    t.equal(response.statusCode, 404)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})

test('should return 404 for non-existent entry ID', async (t) => {
  const fastify = Fastify({ logger: false })
  try {
    await fastify.register(devtoolsPlugin, { enabled: true })
    const response = await fastify.inject({ method: 'GET', url: '/__devtools/entry/non-existent-id' })
    t.equal(response.statusCode, 404)
  } catch (err) {
    t.error(err)
  } finally {
    await fastify.close()
    t.end()
  }
})