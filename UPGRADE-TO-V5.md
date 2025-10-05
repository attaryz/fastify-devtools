# Fastify DevTools - Upgrade to Fastify v5

This guide covers upgrading `@attaryz/fastify-devtools` to support Fastify v5.

## Overview

Fastify v5 introduces several breaking changes, but the good news is that **fastify-devtools is already compatible** with most of them. This guide will help you upgrade your host application and the devtools plugin.

## Quick Start

### 1. Update Dependencies

Update your `package.json` to use Fastify v5:

```bash
yarn add fastify@^5.0.0 fastify-plugin@^5.0.0
```

Or if using npm:

```bash
npm install fastify@^5.0.0 fastify-plugin@^5.0.0
```

### 2. Update DevTools Plugin

```bash
yarn upgrade @attaryz/fastify-devtools
```

The plugin's peer dependencies now require:
- `fastify: >=5.0.0`
- `fastify-plugin: >=5.0.0`

## Code Changes Required in Your Application

### ✅ Already Compatible

The following Fastify v5 features are **already working** in fastify-devtools:

- ✅ **`reply.hijack()`** - Already using the correct v5 API for SSE and streaming
- ✅ **Request lifecycle hooks** - All hooks are v5 compatible
- ✅ **Plugin registration** - Using async/await pattern correctly
- ✅ **`fastify.inject()`** - Already using the correct method signature

### ⚠️ Breaking Changes in Fastify v5 (Your App May Need Updates)

#### 1. JSON Schema Requirements

**What changed:** Fastify v5 requires full JSON schemas with explicit `type` property.

```javascript
// ❌ v4 - Shorthand no longer works
fastify.get('/route', {
  schema: {
    querystring: {
      name: { type: 'string' }
    }
  }
}, handler)

// ✅ v5 - Full JSON schema required
fastify.get('/route', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    }
  }
}, handler)
```

**Impact on DevTools:** None - DevTools doesn't define route schemas.

#### 2. Logger Constructor Signature

**What changed:** Custom loggers must use `loggerInstance` option.

```javascript
// ❌ v4
const logger = require('pino')()
const fastify = require('fastify')({ logger })

// ✅ v5
const loggerInstance = require('pino')()
const fastify = require('fastify')({ loggerInstance })
```

**Impact on DevTools:** None - DevTools uses the Fastify instance's logger.

#### 3. Request Properties: `hostname`, `host`, and `port`

**What changed:** `req.hostname` now excludes port number. New `req.host` and `req.port` properties added.

```javascript
// v4: req.hostname = "localhost:3000"
// v5: req.host = "localhost:3000"
//     req.hostname = "localhost"
//     req.port = "3000"
```

**Impact on DevTools:** DevTools captures headers and request data correctly. No changes needed.

#### 4. Removed `request.connection`

**What changed:** Use `request.socket` instead.

```javascript
// ❌ v4
req.connection.remoteAddress

// ✅ v5
req.socket.remoteAddress
```

**Impact on DevTools:** Not used in DevTools code.

#### 5. `reply.redirect()` Signature Changed

**What changed:** Arguments are now `(url, code)` instead of `(code, url)`.

```javascript
// ❌ v4
reply.redirect(301, '/new-route')

// ✅ v5
reply.redirect('/new-route', 301)
```

**Impact on DevTools:** DevTools doesn't use redirects.

#### 6. Semicolon Delimiter in Query Strings

**What changed:** Semicolons as query delimiters are now disabled by default.

```javascript
// If you need semicolons (non-standard):
const fastify = Fastify({
  useSemicolonDelimiter: true
})
```

**Impact on DevTools:** None - DevTools uses standard query parsing.

#### 7. Plugin API - No More Mixed Callback/Promise

**What changed:** Plugins cannot mix async/promise and callback patterns.

```javascript
// ❌ v4 - Mixed style (no longer allowed)
fastify.register(async function (instance, opts, done) {
  done()
})

// ✅ v5 - Choose one style
fastify.register(async function (instance, opts) {
  return
})

// OR

fastify.register(function (instance, opts, done) {
  done()
})
```

**Impact on DevTools:** Already using pure async/await. ✅

#### 8. Parameters Object Has No Prototype

**What changed:** `req.params` no longer inherits from Object.

```javascript
// ❌ v4
req.params.hasOwnProperty('id')

// ✅ v5
Object.hasOwn(req.params, 'id')
```

**Impact on DevTools:** DevTools doesn't use prototype methods on params.

#### 9. Removed Non-Standard HTTP Methods

**What changed:** Methods like `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`, `TRACE`, `SEARCH` are removed.

To add them back:

```javascript
fastify.addHttpMethod('PROPFIND')
fastify.addHttpMethod('MKCOL', { hasBody: true })
```

**Impact on DevTools:** DevTools supports all standard HTTP methods.

#### 10. Decorator Reference Types Not Allowed

**What changed:** Cannot decorate with reference types (Array, Object) directly.

```javascript
// ❌ v4
fastify.decorateRequest('myObject', { hello: 'world' })

// ✅ v5 - Use a function
fastify.decorateRequest('myObject', () => ({ hello: 'world' }))

// OR use a getter
fastify.decorateRequest('myObject', {
  getter() {
    return { hello: 'world' }
  }
})

// OR initialize in a hook
fastify.decorateRequest('myObject')
fastify.addHook('onRequest', async (req, reply) => {
  req.myObject = { hello: 'world' }
})
```

**Impact on DevTools:** Not applicable - DevTools doesn't decorate with objects.

## Node.js Version Requirements

Fastify v5 requires:
- **Node.js 20.x or higher** (v18 is no longer supported)

Update your Node.js version if needed:

```bash
node --version  # Should be >= 20.0.0
```

## Testing Your Upgrade

After upgrading, test your application:

### 1. Run Tests

```bash
yarn test
```

### 2. Check DevTools Dashboard

1. Start your Fastify server
2. Navigate to `http://localhost:3000/__devtools` (or your configured `basePath`)
3. Verify all features work:
   - Request capture
   - WebSocket tracking (if enabled)
   - Redis tracking (if enabled)
   - Request replay
   - Storage/persistence (if enabled)

### 3. Verify SSE Events

Open the DevTools dashboard and make some requests. Verify that new requests appear in real-time via Server-Sent Events.

## Migration Checklist

- [ ] Update Node.js to v20 or higher
- [ ] Update `fastify` to v5.x
- [ ] Update `fastify-plugin` to v5.x
- [ ] Update `@attaryz/fastify-devtools` to latest
- [ ] Update all route schemas to use full JSON schema format
- [ ] Replace `logger` option with `loggerInstance` for custom loggers
- [ ] Update `reply.redirect()` calls to new signature
- [ ] Replace `req.connection` with `req.socket`
- [ ] Update `req.hostname` usage if you need port number (use `req.host`)
- [ ] Fix any mixed callback/promise plugin patterns
- [ ] Replace `req.params.hasOwnProperty()` with `Object.hasOwn()`
- [ ] Run all tests
- [ ] Test DevTools dashboard functionality

## Breaking Changes in DevTools Plugin

**None!** The DevTools plugin is fully compatible with Fastify v5. The only change is the peer dependency requirement.

## Additional Resources

- [Official Fastify v5 Migration Guide](https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/)
- [Fastify v5 Release Notes](https://github.com/fastify/fastify/releases/tag/v5.0.0)
- [Fastify v5 Codemods](https://github.com/fastify/fastify-codemods) - Automated migration tool

## Rollback Plan

If you encounter issues:

1. **Revert package.json:**
   ```json
   {
     "dependencies": {
       "fastify": "^4.0.0",
       "fastify-plugin": "^4.0.0"
     }
   }
   ```

2. **Reinstall dependencies:**
   ```bash
   yarn install
   ```

3. **DevTools will continue to work** with Fastify v4 (previous versions support `>=4.0.0`)

## Support

If you encounter any issues with the DevTools plugin after upgrading:

1. Check the [GitHub Issues](https://github.com/attaryz/fastify-devtools/issues)
2. Create a new issue with:
   - Fastify version
   - DevTools version
   - Error messages/logs
   - Minimal reproduction

---

**Last Updated:** October 2025
**DevTools Version:** 0.3.0+
**Fastify Version:** 5.0.0+
