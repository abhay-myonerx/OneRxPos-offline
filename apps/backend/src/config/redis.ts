import Redis, { RedisOptions } from "ioredis";
import { config } from "./index";
import { logger } from "../shared/utils/logger";

// ─── Connection Options ────────────────────────────────────────────────────────

const BASE_OPTIONS: RedisOptions = {
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times: number): number | null {
    if (times > 10) {
      logger.error("Redis: max reconnection attempts reached — giving up");
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000); // 100ms → 3s back-off
    logger.warn({ attempt: times, delayMs: delay }, "Redis: reconnecting");
    return delay;
  },
  reconnectOnError(err: Error): boolean {
    // Reconnect on READONLY errors (happens during Redis Sentinel failovers)
    return err.message.includes("READONLY");
  },
};

// ─── Singleton Client ──────────────────────────────────────────────────────────

type GlobalWithRedis = typeof globalThis & {
  redis?: Redis;
};

const globalForRedis = globalThis as GlobalWithRedis;

function createRedisClient(): Redis {
  const client = new Redis(config.REDIS_URL, BASE_OPTIONS);

  client.on("connect", () => logger.info("Redis: connection established"));

  client.on("ready", () => logger.info("Redis: client ready"));

  client.on("error", (err: Error) => logger.error({ err }, "Redis: client error"));

  client.on("close", () => logger.warn("Redis: connection closed"));

  client.on("reconnecting", () => logger.warn("Redis: reconnecting"));

  client.on("end", () => logger.warn("Redis: connection ended — no more retries"));

  return client;
}

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

// ─── Redis availability (SN-2 dependency-light store-node boot) ────────────────
// On the store-node (DATA_BACKEND=sqlite) Redis is OPTIONAL: the backend boots
// with only the local SQLite file and uses in-memory fallbacks (rate limiting,
// no pub/sub bridge). On the cloud (postgres) Redis is required and the boot
// fails fast without it. `server.ts` flips `redisReady` true after a successful
// connect; consumers that can degrade check `isRedisReady()`.
const REDIS_OPTIONAL = config.DATA_BACKEND === "sqlite";
let redisReady = false;

export function isRedisOptional(): boolean {
  return REDIS_OPTIONAL;
}
export function isRedisReady(): boolean {
  return redisReady;
}
export function setRedisReady(ready: boolean): void {
  redisReady = ready;
}

// ─── Subscriber Client ────────────────────────────────────────────────────────
// Redis pub/sub requires a dedicated connection — a subscribed client
// cannot issue regular commands. BullMQ creates its own internally,
// but expose one here for any manual pub/sub use.

type GlobalWithSubscriber = typeof globalThis & {
  redisSubscriber?: Redis;
};

const globalForSubscriber = globalThis as GlobalWithSubscriber;

function createSubscriberClient(): Redis {
  // Clone base options but allow unlimited retries for the subscriber
  const client = new Redis(config.REDIS_URL, {
    ...BASE_OPTIONS,
    maxRetriesPerRequest: null, // Required for blocking commands / pub-sub
  });

  client.on("error", (err: Error) => logger.error({ err }, "Redis subscriber: client error"));

  return client;
}

export const redisSubscriber: Redis =
  globalForSubscriber.redisSubscriber ?? createSubscriberClient();

if (process.env.NODE_ENV !== "production") {
  globalForSubscriber.redisSubscriber = redisSubscriber;
}

// ─── BullMQ Connection Helper ─────────────────────────────────────────────────
// BullMQ expects a plain connection options object, not an ioredis instance.
// Use this wherever BullMQ asks for `connection`.

export const bullMQConnection: RedisOptions = {
  ...BASE_OPTIONS,
  host: (() => {
    try {
      return new URL(config.REDIS_URL).hostname;
    } catch {
      return "localhost";
    }
  })(),
  port: (() => {
    try {
      return parseInt(new URL(config.REDIS_URL).port || "6379", 10);
    } catch {
      return 6379;
    }
  })(),
  password: (() => {
    try {
      return new URL(config.REDIS_URL).password || undefined;
    } catch {
      return undefined;
    }
  })(),
  maxRetriesPerRequest: null, // Required by BullMQ
};

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

export async function disconnectRedis(): Promise<void> {
  await Promise.all([
    redis.quit().catch(() => redis.disconnect()),
    redisSubscriber.quit().catch(() => redisSubscriber.disconnect()),
  ]);
  logger.info("Redis: all connections closed");
}
