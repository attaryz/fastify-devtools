# @attaryz/fastify-devtools

Fastify DevTools plugin: live request dashboard, entry details view, copy helpers (URL, cURL, fetch()), replay via `fastify.inject`, basic metrics, and optional Mongo persistence. Ships with zero dependencies at runtime (aside from Fastify) and can be plugged into any Fastify app.

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

## Endpoints exposed

- `GET {basePath}` — Dashboard HTML
- `GET {basePath}/requests` — Last 100 in-memory entries (JSON)
- `GET {basePath}/status` — Status (buffer length, SSE clients, persistence state)
- `GET {basePath}/events` — Server-Sent Events stream for live updates
- `POST {basePath}/clear` — Clear in-memory buffer
- `GET {basePath}/requests/:id` — Single entry JSON
- `GET {basePath}/entry/:id` — Entry HTML view
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

## Development & Publishing

### GitHub Actions CI/CD

This project includes automated CI/CD via GitHub Actions:

- **Continuous Integration**: Builds and tests on Node.js 18.x and 20.x for all pushes to `main`/`develop` branches and pull requests
- **Automated Publishing**: Publishes to npm automatically when a GitHub release is created

#### Setup for Publishing

To enable automated npm publishing, add your npm token as a repository secret:

1. Generate an npm access token at [npmjs.com](https://www.npmjs.com/settings/tokens)
2. Go to your GitHub repository → Settings → Secrets and variables → Actions
3. Add a new repository secret named `NPM_TOKEN` with your npm token as the value

#### Manual Publishing

You can also publish manually:

```bash
npm run build
npm publish --access public
```

## License

MIT
