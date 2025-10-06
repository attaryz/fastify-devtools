/**
 * Tests WebSocket tracking utilities:
 * - captureWebSocketMessage() buffer and SSE broadcast
 * - setupWebSocketTracking() for @fastify/websocket and socket.io paths
 */
import { test } from 'tap'
import { EventEmitter } from 'events'
import type { FastifyReply } from 'fastify'
import { captureWebSocketMessage, setupWebSocketTracking } from '../src/websocket/tracker'

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

test('websocket tracker - captureWebSocketMessage', async (t) => {
  const msgs: any[] = []
  const writes: string[] = []
  const clients = new Set<FastifyReply>()
  const fakeReply = { raw: { write: (s: string) => writes.push(s) } } as unknown as FastifyReply
  clients.add(fakeReply)

  captureWebSocketMessage(
    {
      id: '1', ts: Date.now(), direction: 'incoming', connectionId: 'abc', payload: { a: 1 }, sizeBytes: 5, type: 'message'
    },
    msgs,
    clients,
    2
  )
  captureWebSocketMessage(
    {
      id: '2', ts: Date.now(), direction: 'incoming', connectionId: 'abc', payload: { b: 2 }, sizeBytes: 5, type: 'message'
    },
    msgs,
    clients,
    2
  )
  // This should evict the first
  captureWebSocketMessage(
    {
      id: '3', ts: Date.now(), direction: 'incoming', connectionId: 'abc', payload: { c: 3 }, sizeBytes: 5, type: 'message'
    },
    msgs,
    clients,
    2
  )

  t.same(msgs.map(m => m.id), ['2', '3'])
  t.ok(writes.length >= 3)
})

test('websocket tracker - @fastify/websocket path', async (t) => {
  const wsMessages: any[] = []
  const wsConnections = new Map<string, { connectedAt: number; requestId?: string }>()
  const writes: string[] = []
  const clients = new Set<FastifyReply>()
  clients.add({ raw: { write: (s: string) => writes.push(s) } } as any)

  // Fake ws server and ws connection
  const wss = new EventEmitter()
  const ws = new EventEmitter() as any
  ws.send = (data: any) => { /* no-op */ }

  const fastify: any = {
    websocketServer: wss,
    log: { debug: () => {} }
  }

  setupWebSocketTracking(fastify, wsMessages as any, wsConnections, clients, 100)

  // wait for setup (tracker uses setTimeout)
  await delay(120)

  // Simulate connection
  wss.emit('connection', ws, { __devtoolsId: 'req-1' })

  // Simulate incoming message (Buffer)
  const buf = Buffer.from('{"x":1}', 'utf8')
  ws.emit('message', buf)

  // Simulate outgoing send (string)
  const originalSend = ws.send
  ws.send('"hello"')
  // Allow any async processing
  await delay(10)

  // Close connection
  ws.emit('close')

  t.ok(wsMessages.length >= 2)
  t.ok(writes.length >= 2)
})

test('websocket tracker - socket.io path', async (t) => {
  const wsMessages: any[] = []
  const wsConnections = new Map<string, { connectedAt: number; requestId?: string }>()
  const writes: string[] = []
  const clients = new Set<FastifyReply>()
  clients.add({ raw: { write: (s: string) => writes.push(s) } } as any)

  // Fake socket.io server
  const io = new EventEmitter()
  const socket = new EventEmitter() as any
  // capture onAny handler
  let anyHandler: ((event: string, ...args: any[]) => void) | undefined
  socket.onAny = (handler: (event: string, ...args: any[]) => void) => { anyHandler = handler }
  // outgoing emit is no-op but exists
  socket.emit = (..._args: any[]) => { /* no-op */ }

  const fastify: any = {
    io,
    log: { debug: () => {} }
  }

  setupWebSocketTracking(fastify, wsMessages as any, wsConnections, clients, 100)

  await delay(120)

  io.emit('connection', socket)

  // Simulate incoming event via captured onAny handler
  if (anyHandler) anyHandler('event-a', { foo: 'bar' })
  // Outgoing emit
  socket.emit('event-b', { x: 1 })

  await delay(10)

  // Disconnect
  socket.emit('disconnect')

  t.ok(wsMessages.length >= 2)
  t.ok(writes.length >= 2)
})
