# Changelog

## [0.4.0] - 2025-10-05

### Breaking Changes
- **Fastify v5 Support**: Updated peer dependencies to require Fastify v5.0.0+
  - `fastify: >=5.0.0` (previously `>=4.0.0`)
  - `fastify-plugin: >=5.0.0` (previously `>=4.0.0`)
  - **Node.js 20+ is now required** (Fastify v5 requirement)

### Migration
- See [UPGRADE-TO-V5.md](./UPGRADE-TO-V5.md) for detailed migration guide
- The DevTools plugin code is already compatible with Fastify v5
- No code changes required in the plugin - only dependency updates

### Notes
- All existing features remain fully functional with Fastify v5
- For Fastify v4 support, use DevTools v0.3.x

## [0.3.0] - 2025-10-05

### Added
- **WebSocket Message Capture**: Real-time capture and display of WebSocket messages
  - Support for `@fastify/websocket` (raw WebSocket messages)
  - Support for `socket.io` (Socket.io events)
  - Separate tab in dashboard for WebSocket messages
  - Direction indicators (incoming/outgoing)
  - Connection ID tracking
  - Message payload preview with size information
  - Live updates via Server-Sent Events

- **Redis Cache Tracking**: Automatic detection and tracking of Redis cache operations
  - Auto-detection of Redis via `fastify.redis` or `fastify.ioredis` decorators
  - Cache hit/miss tracking for GET operations
  - Visual indicators in dashboard (green for hits, red for misses)
  - Redis connection status in metrics
  - `getRedisClient(requestId)` helper for wrapped Redis client with tracking

- **New Configuration Options**:
  - `captureWebSockets` (default: true) - Enable/disable WebSocket capture
  - `trackRedisCache` (default: true) - Enable/disable Redis tracking

- **New API Endpoints**:
  - `GET {basePath}/websockets` - Retrieve last 100 WebSocket messages
  - `GET {basePath}/websockets/connections` - Get active WebSocket connections
  - `GET {basePath}/redis/status` - Redis detection and status information

- **UI Enhancements**:
  - Tabbed interface for HTTP requests and WebSocket messages
  - Redis cache hit/miss badges on request rows
  - WebSocket and Redis metric cards in dashboard
  - Real-time WebSocket message updates

### Changed
- Updated dashboard to display 6 metric cards (added Redis and WebSocket)
- Enhanced SSE event handling to support WebSocket message streaming
- HTTP request table now includes Redis column

### Technical Details
- Added TypeScript interfaces for `WebSocketMessage` and Redis tracking
- Extended `DevtoolsEntry` interface with optional `redis` field
- WebSocket tracking hooks into connection events with minimal overhead
- Redis wrapper uses method interception for transparent tracking
