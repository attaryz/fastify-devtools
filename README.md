# @attaryz/fastify-devtools

Fastify DevTools plugin: live request dashboard, entry details view, copy helpers (URL, cURL, fetch()), replay via `fastify.inject`, basic metrics, WebSocket message capture, Redis cache tracking, and optional Mongo persistence. Ships with zero dependencies at runtime (aside from Fastify) and can be plugged into any Fastify app.

## Requirements

- **Node.js**: 20.x or higher
- **Fastify**: 5.x (for Fastify v4 support, use `@attaryz/fastify-devtools@0.3.x`)


## Install

```sh
npm install @attaryz/fastify-devtools
```

Or with Yarn:

```sh
yarn add @attaryz/fastify-devtools
```

Peer dependencies:

- fastify (peer)
- fastify-plugin (peer)
- mongoose (optional, only if you enable persistence)

## Usage

Register the plugin in your Fastify app:

```ts
import Fastify from "fastify"
import fastifyDevtools from "@attaryz/fastify-devtools"

const app = Fastify({ logger: true })

app.register(fastifyDevtools, {
  enabled: true,
  basePath: "/__devtools",
  bufferSize: 200,
  token: process.env.DEVTOOLS_TOKEN, // optional access token
  maxBodyBytes: 10_000, // default 10KB truncation threshold
  persistEnabled: false, // set true to persist to Mongo (requires fastify.mongoose)
  persistTtlDays: 14, // TTL for persisted entries
  slowMs: 1000, // UI only, for SLOW badges
  captureWebSockets: true, // capture WebSocket messages (default: true)
  trackRedisCache: true, // track Redis cache hits/misses (default: true)
})

// Example routes ...

app.listen({ port: 3000 })
```

Browse to:

- Dashboard: `http://localhost:3000/__devtools`
- Entry view: `http://localhost:3000/__devtools/entry/:id`

If `token` is set, you can also pass it as a query param `?token=...` or header `x-devtools-token`.

## Persistence (optional)

If you want to persist entries in MongoDB, decorate Fastify with a connected Mongoose instance before registering this plugin. For example, with `@fastify/mongoose` or your own decoration:

```ts
import mongoose from "mongoose"

await mongoose.connect(process.env.MONGO_URI!)
;(app as any).mongoose = mongoose // decorate

app.register(fastifyDevtools, { persistEnabled: true, persistTtlDays: 7 })
```

The plugin will create a `DevtoolsEntry` model and manage TTL index on `tsDate`.

## WebSocket Support

The plugin automatically detects and captures WebSocket messages when using:
- `@fastify/websocket` - Captures raw WebSocket messages
- `socket.io` - Captures Socket.io events

**Important:** DevTools must be registered **after** the WebSocket plugin for tracking to work:

```ts
import Fastify from "fastify"
import websocket from "@fastify/websocket"
import fastifyDevtools from "@attaryz/fastify-devtools"

const app = Fastify({ logger: true })

// 1. Register WebSocket plugin FIRST
await app.register(websocket)

// 2. Register DevTools AFTER
await app.register(fastifyDevtools, {
  enabled: true,
  basePath: "/__devtools",
  captureWebSockets: true
})

// 3. Add your WebSocket routes
app.register(async function (fastify) {
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    connection.socket.on('message', message => {
      console.log('Received:', message.toString())
      connection.socket.send('Echo: ' + message)
    })
  })
})

await app.listen({ port: 3000 })
```

WebSocket messages are displayed in a separate tab in the dashboard with:
- Direction indicators (incoming ⬇ / outgoing ⬆)
- Connection ID tracking
- Message payload preview
- Size information
- Real-time updates via SSE

## Redis Cache Tracking

When Redis is detected (via `fastify.redis` or `fastify.ioredis` decorators), the plugin **automatically tracks all cache operations** without any code changes:

```ts
import Fastify from "fastify"
import redis from "@fastify/redis"
import fastifyDevtools from "@attaryz/fastify-devtools"

const app = Fastify({ logger: true })

// 1. Register Redis plugin
await app.register(redis, { 
  host: '127.0.0.1',
  port: 6379 
})

// 2. Register DevTools (will auto-wrap Redis client)
await app.register(fastifyDevtools, {
  enabled: true,
  basePath: "/__devtools",
  trackRedisCache: true
})

// 3. Use Redis normally - tracking happens automatically!
app.get('/data/:id', async (request, reply) => {
  // No special code needed - just use fastify.redis normally
  const cached = await app.redis.get(`data:${request.params.id}`)
  
  if (cached) {
    return JSON.parse(cached) // Automatically tracked as CACHE HIT ✓
  }
  
  const data = { id: request.params.id, value: 'fresh data' }
  await app.redis.set(
    `data:${request.params.id}`, 
    JSON.stringify(data), 
    'EX', 
    3600
  )
  
  return data // Automatically tracked as CACHE MISS ✗
})

await app.listen({ port: 3000 })
```

**Supported Redis operations:**
- `GET` - Tracked with cache hit/miss status
- `SET` - Tracked as cache write
- `DEL` - Tracked as cache deletion

The dashboard will show:
- ✓ Green badges for cache hits
- ✗ Red badges for cache misses
- Number of cache operations per request
- Redis connection status in metrics
- Operation duration in milliseconds

**No code changes required!** The plugin automatically wraps your Redis client when it detects `fastify.redis` or `fastify.ioredis`.

## Endpoints exposed

- `GET {basePath}` — Dashboard HTML
- `GET {basePath}/requests` — Last 100 in-memory entries (JSON)
- `GET {basePath}/status` — Status (buffer length, SSE clients, persistence state)
- `GET {basePath}/events` — Server-Sent Events stream for live updates
- `POST {basePath}/clear` — Clear in-memory buffer
- `GET {basePath}/requests/:id` — Single entry JSON
- `GET {basePath}/entry/:id` — Entry HTML view
- `GET {basePath}/websockets` — Last 100 WebSocket messages (JSON)
- `GET {basePath}/websockets/connections` — Active WebSocket connections
- `GET {basePath}/redis/status` — Redis detection and status
- Storage (if `persistEnabled`):
  - `GET {basePath}/store/requests?limit&method&status&q&from&to&beforeId`
  - `POST {basePath}/store/clear`
  - `GET {basePath}/store/export.json?method&status&q&from&to&limit`
  - `GET {basePath}/store/export.ndjson?method&status&q&from&to&limit`

## UI features

- Pretty/raw JSON rendering for request/response
- Copy helpers for JSON sections (headers/body/query/params), meta, URL, cURL, and fetch()
- Replay a captured request via `fastify.inject`
- Live SSE updates, pause and auto-scroll controls
- Basic metrics and route p95 summary
- Toast notifications for copy/replay actions
- **WebSocket message capture**: Real-time capture of incoming/outgoing WebSocket messages with support for `@fastify/websocket` and Socket.io
- **Redis cache tracking**: Automatic detection of Redis usage with cache hit/miss indicators per request
- Tabbed interface for HTTP requests and WebSocket messages

## Build

This package ships precompiled views in `dist/views`. When you run build locally:

```sh
yarn build
```

That will:

- Type-check and compile TS to `dist/`
- Copy `src/views/` to `dist/views/`

## Security notes

- Never enable DevTools in production without access control. Use `token` to require `x-devtools-token` or `?token=...`.
- The plugin masks common sensitive headers (`authorization`, `cookie`) and fields (`password`, `token`, `jwt`, `secret`). Review and extend as needed.

## License

MIT
