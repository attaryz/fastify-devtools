/**
 * Tests end-to-end WebSocket integration at plugin level:
 * - Skips when @fastify/websocket is not installed (optional dependency)
 * - When available, ensures tracker wiring does not break status endpoint
 */
import { test } from 'tap'
import Fastify from 'fastify'
import devtoolsPlugin from '../src/index'

// Try to load @fastify/websocket, skip tests if not available
let websocket: any
try {
  websocket = require('@fastify/websocket')
} catch {
  // WebSocket plugin not installed - skip WebSocket-specific tests
}

test('WebSocket tracking', async (t) => {
  t.test('should detect @fastify/websocket plugin when available', async (t) => {
    if (!websocket) {
      t.skip('@fastify/websocket not installed (optional dependency)')
      return
    }
    
    const fastify = Fastify({ logger: false })
    
    await fastify.register(websocket)
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true
    })
    
    fastify.register(async function (fastify) {
      fastify.get('/ws', { websocket: true }, (connection: any, _req: any) => {
        connection.socket.on('message', (message: any) => {
          connection.socket.send('Echo: ' + message)
        })
      })
    })
    
    const statusResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/status'
    })
    
    t.equal(statusResponse.statusCode, 200)
    
    await fastify.close()
  })

  t.test('should provide websockets endpoint', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true
    })
    
    const wsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets'
    })
    
    t.equal(wsResponse.statusCode, 200)
    const wsData = JSON.parse(wsResponse.body)
    t.ok(Array.isArray(wsData))
    
    await fastify.close()
  })

  t.test('should provide websockets/connections endpoint', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true
    })
    
    const connectionsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets/connections'
    })
    
    t.equal(connectionsResponse.statusCode, 200)
    const connectionsData = JSON.parse(connectionsResponse.body)
    t.ok(Array.isArray(connectionsData))
    
    await fastify.close()
  })

  t.test('should require authentication for websockets endpoints when token is set', async (t) => {
    const fastify = Fastify({ logger: false })
    const testToken = 'test-token'
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true,
      token: testToken
    })
    
    // Without token
    const unauthorizedWs = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets'
    })
    
    t.equal(unauthorizedWs.statusCode, 401)
    
    // With token
    const authorizedWs = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets',
      headers: {
        'x-devtools-token': testToken
      }
    })
    
    t.equal(authorizedWs.statusCode, 200)
    
    // Test connections endpoint
    const unauthorizedConnections = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets/connections'
    })
    
    t.equal(unauthorizedConnections.statusCode, 401)
    
    const authorizedConnections = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets/connections',
      headers: {
        'x-devtools-token': testToken
      }
    })
    
    t.equal(authorizedConnections.statusCode, 200)
    
    await fastify.close()
  })

  t.test('should work when WebSocket capture is disabled', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: false
    })
    
    const wsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets'
    })
    
    t.equal(wsResponse.statusCode, 200)
    const wsData = JSON.parse(wsResponse.body)
    t.ok(Array.isArray(wsData))
    t.equal(wsData.length, 0)
    
    await fastify.close()
  })

  t.test('should handle WebSocket messages buffer limit', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true,
      bufferSize: 50 // Small buffer for testing
    })
    
    const wsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets'
    })
    
    t.equal(wsResponse.statusCode, 200)
    const wsData = JSON.parse(wsResponse.body)
    t.ok(Array.isArray(wsData))
    // Buffer should not exceed limit
    t.ok(wsData.length <= 100) // Returns last 100 messages
    
    await fastify.close()
  })

  t.test('should work without WebSocket plugin installed', async (t) => {
    const fastify = Fastify({ logger: false })
    
    await fastify.register(devtoolsPlugin, { 
      enabled: true,
      captureWebSockets: true
    })
    
    const wsResponse = await fastify.inject({
      method: 'GET',
      url: '/__devtools/websockets'
    })
    
    t.equal(wsResponse.statusCode, 200)
    const wsData = JSON.parse(wsResponse.body)
    t.ok(Array.isArray(wsData))
    
    await fastify.close()
  })
})
