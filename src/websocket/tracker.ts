import { randomUUID } from "node:crypto"
import type { FastifyInstance, FastifyReply } from "fastify"
import type { WebSocketMessage } from "../types"

/**
 * Capture a WebSocket message and broadcast to SSE clients
 */
export function captureWebSocketMessage(
  msg: WebSocketMessage,
  wsMessages: WebSocketMessage[],
  clients: Set<FastifyReply>,
  bufferSize: number
): void {
  wsMessages.push(msg)
  while (wsMessages.length > bufferSize) wsMessages.shift()
  
  // Broadcast to SSE clients
  const data = `data: ${JSON.stringify({ type: 'websocket', message: msg })}\n\n`
  for (const client of clients) {
    try {
      client.raw.write(data)
    } catch {}
  }
}

/**
 * Setup WebSocket tracking for @fastify/websocket and Socket.io
 */
export function setupWebSocketTracking(
  fastify: FastifyInstance,
  wsMessages: WebSocketMessage[],
  wsConnections: Map<string, { connectedAt: number; requestId?: string }>,
  clients: Set<FastifyReply>,
  bufferSize: number
): void {
  // Try to detect and hook into WebSocket implementations
  setTimeout(() => {
    // @fastify/websocket support
    if ((fastify as any).websocketServer) {
      try {
        const wss = (fastify as any).websocketServer
        wss.on('connection', (ws: any, req: any) => {
          const connectionId = randomUUID()
          wsConnections.set(connectionId, { 
            connectedAt: Date.now(),
            requestId: (req as any).__devtoolsId 
          })
          
          ws.on('message', (data: any) => {
            try {
              let payload: unknown = data
              if (Buffer.isBuffer(data)) {
                const text = data.toString('utf8')
                try {
                  payload = JSON.parse(text)
                } catch {
                  payload = text
                }
              }
              
              captureWebSocketMessage({
                id: randomUUID(),
                ts: Date.now(),
                direction: 'incoming',
                connectionId,
                payload,
                sizeBytes: Buffer.isBuffer(data) ? data.length : JSON.stringify(data).length,
                type: 'message'
              }, wsMessages, clients, bufferSize)
            } catch {}
          })
          
          const originalSend = ws.send?.bind(ws)
          if (originalSend) {
            ws.send = function(data: any, ...args: any[]) {
              try {
                let payload: unknown = data
                if (typeof data === 'string') {
                  try {
                    payload = JSON.parse(data)
                  } catch {
                    payload = data
                  }
                }
                
                captureWebSocketMessage({
                  id: randomUUID(),
                  ts: Date.now(),
                  direction: 'outgoing',
                  connectionId,
                  payload,
                  sizeBytes: typeof data === 'string' ? data.length : JSON.stringify(data).length,
                  type: 'message'
                }, wsMessages, clients, bufferSize)
              } catch {}
              
              return originalSend(data, ...args)
            }
          }
          
          ws.on('close', () => {
            wsConnections.delete(connectionId)
          })
        })
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        fastify.log.debug({ error: errorMsg }, 'Failed to setup WebSocket tracking')
      }
    }
    
    // Socket.io support
    if (fastify.io) {
      try {
        fastify.io.on('connection', (socket: any) => {
          const connectionId = randomUUID()
          wsConnections.set(connectionId, { connectedAt: Date.now() })
          
          const originalEmit = socket.emit?.bind(socket)
          if (originalEmit) {
            socket.emit = function(event: string, ...args: any[]) {
              captureWebSocketMessage({
                id: randomUUID(),
                ts: Date.now(),
                direction: 'outgoing',
                connectionId,
                payload: { event, data: args },
                sizeBytes: JSON.stringify({ event, data: args }).length,
                type: 'emit'
              }, wsMessages, clients, bufferSize)
              return originalEmit(event, ...args)
            }
          }
          
          socket.onAny((event: string, ...args: any[]) => {
            captureWebSocketMessage({
              id: randomUUID(),
              ts: Date.now(),
              direction: 'incoming',
              connectionId,
              payload: { event, data: args },
              sizeBytes: JSON.stringify({ event, data: args }).length,
              type: 'event'
            }, wsMessages, clients, bufferSize)
          })
          
          socket.on('disconnect', () => {
            wsConnections.delete(connectionId)
          })
        })
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        fastify.log.debug({ error: errorMsg }, 'Failed to setup Socket.io tracking')
      }
    }
  }, 100) // Small delay to ensure WebSocket server is initialized
}
