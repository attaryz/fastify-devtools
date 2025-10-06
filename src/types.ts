/**
 * Extend Fastify types for DevTools properties
 */
declare module "fastify" {
  interface FastifyRequest {
    __devtoolsId?: string;
    __dev_t_onRequest?: number;
    __dev_t_preHandler?: number;
    __dev_t_onSend?: number;
  }

  interface FastifyInstance {
    mongoose?: {
      Schema: unknown;
      models: Record<string, unknown>;
      model: (name: string, schema: unknown) => unknown;
      connection: {
        readyState: number;
      };
      Types: {
        ObjectId: new (id?: string) => unknown;
      };
    };
    redis?: {
      status?: string;
      info?: () => Promise<unknown> | unknown;
      get?: (key: string, ...args: unknown[]) => Promise<unknown> | unknown;
      set?: (key: string, value: unknown, ...args: unknown[]) => Promise<unknown> | unknown;
      del?: (key: string, ...args: unknown[]) => Promise<unknown> | unknown;
      __devtoolsWrapped?: boolean;
    };
    io?: {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      emit?: (event: string, ...args: unknown[]) => unknown;
    };
    websocketServer?: {
      on: (event: string, listener: (...args: unknown[]) => void) => void;
    };
    // Some apps expose ioredis under this property
    ioredis?: unknown;
  }
}

/**
 * Configuration options for the Fastify DevTools plugin
 */
export interface DevtoolsOptions {
  /**
   * Whether the DevTools plugin is enabled
   * @default true
   */
  enabled?: boolean;

  /**
   * Base path for DevTools routes
   * @default "/__devtools"
   */
  basePath?: string;

  /**
   * Maximum number of requests to keep in memory buffer
   * @default 200
   */
  bufferSize?: number;

  /**
   * Authentication token required to access DevTools endpoints
   * If not provided, no authentication is required
   */
  token?: string;

  /**
   * Maximum size in bytes for request/response body capture
   * Bodies larger than this will be truncated
   * @default 10000
   */
  maxBodyBytes?: number;

  /**
   * Enable persistent storage of requests using MongoDB
   * Requires fastify.mongoose decoration by host application
   * @default false
   */
  persistEnabled?: boolean;

  /**
   * Number of days to keep persisted entries before automatic deletion
   * Only applies when persistEnabled is true
   * @default 14
   */
  persistTtlDays?: number;

  /**
   * Threshold in milliseconds to consider a request as "slow"
   * Used for UI labeling purposes only
   * @default 1000
   */
  slowMs?: number;

  /**
   * Enable WebSocket message capture
   * @default true
   */
  captureWebSockets?: boolean;

  /**
   * Enable Redis cache tracking
   * @default true
   */
  trackRedisCache?: boolean;
}

/**
 * Represents a captured HTTP request/response entry in the DevTools
 */
export interface DevtoolsEntry {
  /** Unique identifier for this entry */
  id: string;

  /** Timestamp when the request was received (milliseconds since epoch) */
  ts: number;

  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Request URL path */
  url: string;

  /** Matched route pattern (if available) */
  route?: string;

  /** Query parameters from the request */
  query?: Record<string, string | string[] | undefined>;

  /** Route parameters from the request */
  params?: Record<string, string | undefined>;

  /** Request headers (sensitive headers are masked) */
  headers?: Record<string, string>;

  /** Fastify request ID */
  requestId?: string;

  /** Request body (sensitive fields are masked, may be truncated) */
  body?: unknown;

  /** Response information */
  response?: {
    /** HTTP status code */
    statusCode: number;
    /** Response headers (sensitive headers are masked) */
    headers?: Record<string, string>;
    /** Response body (may be truncated) */
    body?: unknown;
  };

  /** Total request duration in milliseconds */
  durationMs?: number;

  /** Whether the request/response body was truncated due to size limits */
  truncated?: boolean;

  /** Error message if request processing failed */
  error?: string;

  /** Detailed timing breakdown for request lifecycle phases */
  timings?: {
    /** Time spent in preHandler hooks (milliseconds) */
    preHandlerMs?: number;
    /** Time spent in route handler (milliseconds) */
    handlerMs?: number;
    /** Time spent sending response (milliseconds) */
    sendMs?: number;
  };

  /** Size of the response body in bytes */
  responseSizeBytes?: number;

  /** Content-Type of the response */
  contentType?: string;

  /** Redis cache information */
  redis?: {
    /** Cache hit or miss */
    cacheHit?: boolean;
    /** Cache key accessed */
    key?: string;
    /** Redis operation (get, set, del, etc.) */
    operation?: string;
    /** Time spent on Redis operation (ms) */
    durationMs?: number;
  }[];
}

/**
 * Represents a captured WebSocket message
 */
export interface WebSocketMessage {
  /** Unique identifier for this message */
  id: string;

  /** Timestamp when the message was sent/received */
  ts: number;

  /** Direction: 'incoming' or 'outgoing' */
  direction: "incoming" | "outgoing";

  /** WebSocket connection ID */
  connectionId: string;

  /** Message payload */
  payload: unknown;

  /** Message size in bytes */
  sizeBytes?: number;

  /** Message type (text, binary, ping, pong, close) */
  type?: string;

  /** Associated request ID if available */
  requestId?: string;
}
