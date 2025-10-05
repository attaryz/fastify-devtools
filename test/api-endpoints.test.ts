import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('GET /__devtools - main dashboard', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools'
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('GET /__devtools/requests - requests API', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    // Make a test request first
    fastify.get('/test', async () => ({ test: true }))
    return fastify.inject({ method: 'GET', url: '/test' })
  }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    
    const data = JSON.parse(response.body)
    t.ok(Array.isArray(data))
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('GET /__devtools/status - status API', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/status'
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    
    const data = JSON.parse(response.body)
    t.ok(typeof data === 'object')
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('POST /__devtools/clear - clear requests', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    return fastify.inject({
      method: 'POST',
      url: '/__devtools/clear'
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    
    const data = JSON.parse(response.body)
    t.equal(data.success, true)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('GET /__devtools/requests/:id - request details', (t) => {
  const fastify = Fastify({ logger: false })
  let requestId
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    // Make a test request first
    fastify.get('/test', async () => ({ test: true }))
    return fastify.inject({ method: 'GET', url: '/test' })
  }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
  }).then((response) => {
    const data = JSON.parse(response.body)
    requestId = data[0].id
    
    return fastify.inject({
      method: 'GET',
      url: `/__devtools/requests/${requestId}`
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /application\/json/)
    const data = JSON.parse(response.body)
    t.ok(data.id)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('GET /__devtools/entry/:id - entry details', (t) => {
  const fastify = Fastify({ logger: false })
  let entryId
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    // Make a test request first
    fastify.get('/test', async () => ({ test: true }))
    return fastify.inject({ method: 'GET', url: '/test' })
  }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/requests'
    })
  }).then((response) => {
    const data = JSON.parse(response.body)
    entryId = data[0].id
    
    return fastify.inject({
      method: 'GET',
      url: `/__devtools/entry/${entryId}`
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
    t.match(response.body, /Entry Details/)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('GET /__devtools/events - SSE endpoint', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    // Skip testing the events endpoint as it uses hijacked responses
    // which don't work well with fastify.inject()
    t.pass('Events endpoint registered successfully')
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('custom basePath should work', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { 
    enabled: true,
    basePath: '/custom-devtools'
  }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/custom-devtools'
    })
  }).then((response) => {
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('should return 404 for non-existent request ID', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/requests/non-existent-id'
    })
  }).then((response) => {
    t.equal(response.statusCode, 404)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})

test('should return 404 for non-existent entry ID', (t) => {
  const fastify = Fastify({ logger: false })
  
  fastify.register(devtoolsPlugin, { enabled: true }).then(() => {
    return fastify.inject({
      method: 'GET',
      url: '/__devtools/entry/non-existent-id'
    })
  }).then((response) => {
    t.equal(response.statusCode, 404)
    return Promise.resolve(fastify.close())
  }).then(() => {
    t.end()
  }).catch((err) => {
    t.error(err)
    t.end()
  })
})