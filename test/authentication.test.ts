/**
 * Tests authentication and access control for DevTools endpoints:
 * - Unprotected access when no token configured
 * - 401 responses when token is required but missing/empty/wrong
 * - Header vs query token precedence
 * - Protection of requests/status/clear/events endpoints
 */

import Fastify from "fastify";
import { test } from "tap";
import devtoolsPlugin from "../src/index";

const testToken = "test-token-123";

test("authentication", async (t) => {
  t.test("should allow access without token when disabled", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, { enabled: true });

    const response = await fastify.inject({
      method: "GET",
      url: "/__devtools",
    });

    t.equal(response.statusCode, 200);
    await fastify.close();
  });

  t.test("should require token when enabled", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    // Without token
    const unauthorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools",
    });

    t.equal(unauthorizedResponse.statusCode, 401);

    // With token in header
    const authorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedResponse.statusCode, 200);
    await fastify.close();
  });

  t.test("should accept token via query parameter", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const response = await fastify.inject({
      method: "GET",
      url: `/__devtools?token=${testToken}`,
    });

    t.equal(response.statusCode, 200);
    await fastify.close();
  });

  t.test("should protect API endpoints with token", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    // Without token
    const unauthorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/requests",
    });

    t.equal(unauthorizedResponse.statusCode, 401);

    // With token
    const authorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/requests",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedResponse.statusCode, 200);
    await fastify.close();
  });

  t.test("should protect clear endpoint with token", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const unauthorizedResponse = await fastify.inject({
      method: "POST",
      url: "/__devtools/clear",
    });

    t.equal(unauthorizedResponse.statusCode, 401);

    const authorizedResponse = await fastify.inject({
      method: "POST",
      url: "/__devtools/clear",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedResponse.statusCode, 200);
    await fastify.close();
  });

  t.test("should protect status endpoint with token", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const unauthorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/status",
    });

    t.equal(unauthorizedResponse.statusCode, 401);

    const authorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/status",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedResponse.statusCode, 200);
    await fastify.close();
  });

  t.test("should protect events endpoint with token", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const unauthorizedResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools/events",
    });

    t.equal(unauthorizedResponse.statusCode, 401, "/__devtools/events should require auth");
    t.pass("Events endpoint auth protection verified");
    await fastify.close();
  });

  t.test("should protect POST endpoints with token", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const unauthorizedResponse = await fastify.inject({
      method: "POST",
      url: "/__devtools/clear",
    });

    t.equal(unauthorizedResponse.statusCode, 401);

    const authorizedResponse = await fastify.inject({
      method: "POST",
      url: "/__devtools/clear",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(authorizedResponse.statusCode, 200);
    await fastify.close();
  });

  t.test("header token should take precedence over query param", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/__devtools?token=wrong-token",
      headers: {
        "x-devtools-token": testToken,
      },
    });

    t.equal(response.statusCode, 200, "Header token should take precedence");
    await fastify.close();
  });

  t.test("should handle empty token gracefully", async (t) => {
    const fastify = Fastify({ logger: false });

    await fastify.register(devtoolsPlugin, {
      enabled: true,
      token: testToken,
    });

    const emptyHeaderResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools",
      headers: {
        "x-devtools-token": "",
      },
    });

    t.equal(emptyHeaderResponse.statusCode, 401);

    const emptyQueryResponse = await fastify.inject({
      method: "GET",
      url: "/__devtools?token=",
    });

    t.equal(emptyQueryResponse.statusCode, 401);
    await fastify.close();
  });
});
