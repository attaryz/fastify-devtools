import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

test('plugin registration', async (t) => {
  t.test('should register plugin with default options', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin)
    
    t.ok(fastify.hasPlugin('fastify-devtools'))
    await fastify.close()
  })

  t.test('should register plugin with custom options', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, {
      enabled: true,
      basePath: '/custom-devtools',
      bufferSize: 100,
      maxBodyBytes: 5000,
      slowMs: 500
    })
    
    t.ok(fastify.hasPlugin('fastify-devtools'))
    await fastify.close()
  })

  t.test('should not register routes when disabled', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: false })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/__devtools'
    })
    
    t.equal(response.statusCode, 404)
    await fastify.close()
  })

  t.test('should register routes when enabled', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { enabled: true })
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/__devtools'
    })
    
    t.equal(response.statusCode, 200)
    t.match(response.headers['content-type'], /text\/html/)
    await fastify.close()
  })
})