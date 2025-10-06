import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { DevtoolsEntry } from "../types";
import { parseJsonRelaxed } from "../utils/json";
import { maskHeaders, maskObject } from "../utils/masking";

/**
 * Register onRequest hook to capture request start
 */
export function onRequestHook(
  request: FastifyRequest,
  isDevtoolsRoute: (url: string) => boolean,
  pending: Map<string, DevtoolsEntry>,
): void {
  if (isDevtoolsRoute(request.url)) return;

  const now = Date.now();
  const e: DevtoolsEntry = {
    id: randomUUID(),
    ts: now,
    method: request.method,
    url: request.url,
    route: request.routeOptions?.url,
    query: maskObject(request.query) as Record<string, string | string[] | undefined>,
    params: maskObject(request.params) as Record<string, string | undefined>,
    headers: maskHeaders(request.headers),
    requestId: request.id as string,
  };

  request.__devtoolsId = e.id;
  request.__dev_t_onRequest = now;
  pending.set(e.id, e);
}

/**
 * Register preHandler hook to capture request body
 */
export function preHandlerHook(
  request: FastifyRequest,
  isDevtoolsRoute: (url: string) => boolean,
  pending: Map<string, DevtoolsEntry>,
  maxBody: number,
): void {
  if (isDevtoolsRoute(request.url)) return;

  const id = request.__devtoolsId;
  const e = id && pending.get(id);
  if (!e) return;

  try {
    const body = request.body;
    if (body !== undefined) {
      const json = typeof body === "string" ? body : JSON.parse(JSON.stringify(body));
      const masked = maskObject(json);
      const serialized = typeof masked === "string" ? masked : JSON.stringify(masked);
      if (serialized.length > maxBody) {
        e.body = `${serialized.slice(0, maxBody)}... [truncated ${serialized.length - maxBody} bytes]`;
        e.truncated = true;
      } else {
        e.body = masked;
      }
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    e.error = `Failed to capture body: ${errorMessage}`;
  }

  request.__dev_t_preHandler = Date.now();
}

/**
 * Register onSend hook to capture response
 */
export function onSendHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  isDevtoolsRoute: (url: string) => boolean,
  pending: Map<string, DevtoolsEntry>,
  maxBody: number,
): unknown {
  if (isDevtoolsRoute(request.url)) return payload;

  const id = request.__devtoolsId;
  const e = id && pending.get(id);
  if (!e) return payload;

  try {
    let bodyText: string | undefined;
    if (Buffer.isBuffer(payload)) {
      bodyText = payload.toString("utf8");
    } else if (typeof payload === "string") {
      bodyText = payload;
    } else if (payload && typeof payload === "object") {
      bodyText = JSON.stringify(payload);
    }

    if (!e.response) {
      e.response = { statusCode: reply.statusCode };
    }
    const resp = e.response;

    if (bodyText) {
      try {
        e.responseSizeBytes = Buffer.byteLength(bodyText, "utf8");
      } catch {}
    }

    if (bodyText) {
      let parsed: unknown;
      let parsedOk = false;
      const pr = parseJsonRelaxed(bodyText);
      if (pr.ok) {
        parsed = pr.value;
        parsedOk = true;
      }

      if (parsedOk) {
        if (Array.isArray(parsed)) {
          const previewLimit = 50;
          if (bodyText.length > maxBody || parsed.length > previewLimit) {
            resp.body = parsed.slice(0, previewLimit);
            e.truncated = parsed.length > previewLimit || bodyText.length > maxBody;
          } else {
            resp.body = parsed;
          }
        } else {
          resp.body = parsed;
          if (bodyText.length > maxBody) e.truncated = true;
        }
      } else {
        if (bodyText.length > maxBody) {
          resp.body = `${bodyText.slice(0, maxBody)}... [truncated ${bodyText.length - maxBody} bytes]`;
          e.truncated = true;
        } else {
          resp.body = bodyText;
        }
      }
    }

    const hdrs = reply.getHeaders
      ? reply.getHeaders()
      : ({} as Record<string, string | string[] | number | undefined>);
    resp.headers = maskHeaders(hdrs);

    try {
      const headers = hdrs as Record<string, string | string[] | number | undefined>;
      const contentTypeHeader = headers["content-type"] || headers["Content-Type"];
      e.contentType = String(contentTypeHeader || "");
    } catch {}
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    e.error = `Failed to capture response: ${errorMessage}`;
  }

  request.__dev_t_onSend = Date.now();
  return payload;
}

/**
 * Register onResponse hook to finalize entry
 */
export function onResponseHook(
  request: FastifyRequest,
  reply: FastifyReply,
  isDevtoolsRoute: (url: string) => boolean,
  pending: Map<string, DevtoolsEntry>,
  push: (entry: DevtoolsEntry) => void,
  persistEntry: (entry: DevtoolsEntry) => void,
): void {
  if (isDevtoolsRoute(request.url)) return;

  const id = request.__devtoolsId;
  const e = id && pending.get(id);
  if (!e) return;

  const tResp = Date.now();
  e.durationMs = tResp - e.ts;

  const tReq = request.__dev_t_onRequest;
  const tPre = request.__dev_t_preHandler;
  const tSend = request.__dev_t_onSend;

  if (!e.timings) e.timings = {};
  if (tReq && tPre && tPre >= tReq) e.timings.preHandlerMs = tPre - tReq;
  if (tPre && tSend && tSend >= tPre) e.timings.handlerMs = tSend - tPre;
  if (tSend && tResp && tResp >= tSend) e.timings.sendMs = tResp - tSend;

  if (!e.response) e.response = { statusCode: reply.statusCode };

  push(e);
  persistEntry(e);
  pending.delete(id);
}
