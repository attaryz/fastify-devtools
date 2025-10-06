/**
 * Tests storage filters and error handling with mocked mongoose:
 * - Status band filters, text query, from/to date ranges, beforeId pagination
 * - Export JSON/NDJSON success and error branches (hijacked response)
 */

import Fastify from "fastify";
import { test } from "tap";
import devtoolsPlugin from "../src/index";

// Reuse the mongoose mock shape from persistence.test but minimal for filters
class MockSchema {
  static Types = { Mixed: class Mixed {}, ObjectId: class ObjectId {} };
  index(_f: any, _o?: any) {}
}
const mockModel = {
  find: (_f?: any) => ({
    sort: (_s?: any) => ({
      limit: (_l?: number) => ({
        lean: () => Promise.resolve([]),
        cursor: () => {
          const { EventEmitter } = require("node:events");
          const ee = new EventEmitter();
          process.nextTick(() => ee.emit("end"));
          return ee;
        },
      }),
    }),
  }),
  createIndexes: () => Promise.resolve(),
};
const mockMongoose = {
  connection: { readyState: 1 },
  models: { DevtoolsEntry: mockModel },
  model: (_n: string, _s: any) => mockModel,
  Schema: MockSchema,
  Types: { Mixed: class Mixed {}, ObjectId: class ObjectId {} },
};

test("storage filters and branches", async (t) => {
  const fastify = Fastify({ logger: false });
  (fastify as any).mongoose = mockMongoose;

  await fastify.register(devtoolsPlugin, { enabled: true, persistEnabled: true });

  // Keep a handle to restore console.error in finally
  let originalConsoleError: ((...args: any[]) => void) | undefined;
  try {
    // Silence expected error logs emitted by storage export error-path tests
    originalConsoleError = console.error;
    console.error = () => {};
    // Exercise status bands and q/from/to
    const bands = ["2xx", "3xx", "4xx", "5xx"];
    for (const band of bands) {
      const res = await fastify.inject({
        method: "GET",
        url: `/__devtools/store/requests?status=${band}&q=test&from=2024-01-01&to=2024-12-31`,
      });
      t.equal(res.statusCode, 200);
    }

    // Exercise beforeId path (ObjectId)
    const res2 = await fastify.inject({
      method: "GET",
      url: `/__devtools/store/requests?limit=10&beforeId=65ff2b5ec0ffee0000000001`,
    });
    t.equal(res2.statusCode, 200);

    // Exercise JSON export error catch by making find throw
    const originalFind = (mockModel as any).find;
    (mockModel as any).find = () => {
      throw new Error("boom");
    };
    const expJson = await fastify.inject({ method: "GET", url: "/__devtools/store/export.json" });
    t.equal(expJson.statusCode, 200);
    (mockModel as any).find = originalFind;

    // Exercise NDJSON error catch with a cursor that emits error then end (clean close)
    (mockModel as any).find = () => ({
      sort: () => ({
        limit: () => ({
          cursor: () => {
            const { EventEmitter } = require("node:events");
            const ee = new EventEmitter();
            process.nextTick(() => {
              ee.emit("error", new Error("boom"));
              ee.emit("end");
            });
            return ee;
          },
        }),
      }),
    });
    const expNd = await fastify.inject({ method: "GET", url: "/__devtools/store/export.ndjson" });
    t.equal(expNd.statusCode, 200);
    // let handlers settle
    await new Promise((r) => setTimeout(r, 10));
    (mockModel as any).find = originalFind;
  } finally {
    // Restore console.error and close server (ensure no side-effects outside this test)
    if (originalConsoleError) console.error = originalConsoleError;
    await fastify.close();
  }
});
