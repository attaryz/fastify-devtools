/**
 * Tests MongoDB persistence integration (mocked mongoose):
 * - Works with persistEnabled on/off and Mongo readiness
 * - Storage endpoints: list, clear, export JSON/NDJSON
 * - Auth protection for storage routes
 * - Date range and pagination filters, error handling paths
 */

import Fastify from "fastify";
import { test } from "tap";
import devtoolsPlugin from "../src/index";

// Mock mongoose for testing
class MockSchema {
  static Types = {
    Mixed: class Mixed {},
    ObjectId: class ObjectId {},
  };
  index(_fields: any, _options?: any) {}
}

const mockModel = {
  find: () => ({
    sort: () => ({
      limit: () => ({
        lean: () => Promise.resolve([]),
        cursor: () => {
          // Minimal EventEmitter that immediately ends
          const { EventEmitter } = require("node:events");
          const ee = new EventEmitter();
          // End on next tick to simulate async streaming
          process.nextTick(() => {
            ee.emit("end");
          });
          return ee;
        },
      }),
    }),
  }),
  findOne: () => ({
    lean: () => Promise.resolve(null),
  }),
  create: () => Promise.resolve({ _id: "test-id" }),
  deleteMany: () => Promise.resolve({ deletedCount: 0 }),
  createIndexes: () => Promise.resolve(),
  collection: {
    createIndex: () => Promise.resolve(),
  },
};

const mockMongoose = {
  connection: {
    readyState: 1,
    db: {
      collection: () => ({
        find: () => ({
          sort: () => ({
            limit: () => ({
              toArray: () => Promise.resolve([]),
            }),
          }),
        }),
        findOne: () => Promise.resolve(null),
        insertOne: () => Promise.resolve({ insertedId: "test-id" }),
        deleteMany: () => Promise.resolve({ deletedCount: 0 }),
        createIndex: () => Promise.resolve(),
      }),
    },
  },
  models: {
    DevtoolsEntry: mockModel,
  },
  model: (_name: string, _schema?: any) => mockModel,
  Schema: MockSchema,
  Types: {
    Mixed: class Mixed {},
    ObjectId: class ObjectId {},
  },
};

test("persistence", async (t) => {
  t.test("should work without persistence when not enabled", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: false,
    });

    fastify.get("/test", async () => ({ test: true }));

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
    });

    t.equal(response.statusCode, 200);

    await fastify.close();
  });

  t.test("should work with persistence when enabled", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    fastify.get("/test", async () => ({ test: true }));

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
    });

    t.equal(response.statusCode, 200);

    await fastify.close();
  });

  t.test("should handle store/requests endpoint", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const storeResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/requests",
    });

    t.equal(storeResponse.statusCode, 200);
    const storeData = JSON.parse(storeResponse.body);
    t.ok(Array.isArray(storeData));

    await fastify.close();
  });

  t.test("should handle store/clear endpoint", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const clearResponse = await fastify.inject({
      method: "POST",
      url: "/__devtools/store/clear",
    });

    t.equal(clearResponse.statusCode, 200);
    const clearData = JSON.parse(clearResponse.body);
    t.ok(clearData.ok);

    await fastify.close();
  });

  t.test("should handle store/export.json endpoint", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const exportResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/export.json",
    });

    t.equal(exportResponse.statusCode, 200);
    t.match(exportResponse.headers["content-type"], /application\/json/);

    await fastify.close();
  });

  t.test("should handle store/export.json with query filters", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const exportResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/export.json?method=GET&status=200&q=test&from=2023-01-01&to=2023-12-31",
    });

    t.equal(exportResponse.statusCode, 200);
    t.match(exportResponse.headers["content-type"], /application\/json/);

    await fastify.close();
  });

  t.test("should handle store/export.ndjson endpoint", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const exportResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/export.ndjson",
    });

    t.equal(exportResponse.statusCode, 200);
    t.match(exportResponse.headers["content-type"], /application\/x-ndjson/);
    t.match(exportResponse.headers["content-disposition"], /attachment/);

    await fastify.close();
  });

  t.test("should handle store requests with pagination", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const storeResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/requests?limit=50&beforeId=some-id",
    });

    t.equal(storeResponse.statusCode, 200);
    const storeData = JSON.parse(storeResponse.body);
    t.ok(Array.isArray(storeData));

    await fastify.close();
  });

  t.test("should require authentication for store endpoints when token is set", async (t) => {
    const fastify = Fastify({ logger: false });
    const testToken = "test-token";

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
      token: testToken,
    });

    const endpoints = [
      "/__devtools/store/requests",
      "/__devtools/store/export.json",
      "/__devtools/store/export.ndjson",
    ];

    for (const endpoint of endpoints) {
      // Without token
      const unauthorizedResponse = await fastify.inject({
        method: "GET",
        url: endpoint,
      });

      t.equal(unauthorizedResponse.statusCode, 401, `${endpoint} should require auth`);

      // With token
      const authorizedResponse = await fastify.inject({
        method: "GET",
        url: endpoint,
        headers: {
          "x-devtools-token": testToken,
        },
      });

      t.equal(authorizedResponse.statusCode, 200, `${endpoint} should work with token`);
    }

    // Test POST endpoint
    const unauthorizedClear = await fastify.inject({
      method: "POST",
      url: "/__devtools/store/clear",
    });

    t.equal(unauthorizedClear.statusCode, 401);

    const authorizedClear = await fastify.inject({
      method: "POST",
      url: "/__devtools/store/clear",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedClear.statusCode, 200);

    await fastify.close();
  });

  t.test("should handle date range filters in store queries", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const fromDate = new Date("2023-01-01").toISOString();
    const toDate = new Date("2023-12-31").toISOString();

    const storeResponse = await fastify.inject({
      method: "GET",
      url: `/__devtools/store/requests?from=${fromDate}&to=${toDate}`,
    });

    t.equal(storeResponse.statusCode, 200);

    await fastify.close();
  });

  t.test("should handle invalid date filters gracefully", async (t) => {
    const fastify = Fastify({ logger: false });

    (fastify as any).mongoose = mockMongoose;

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      persistEnabled: true,
    });

    const storeResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/store/requests?from=invalid-date&to=also-invalid",
    });

    t.equal(storeResponse.statusCode, 200);

    await fastify.close();
  });
});
