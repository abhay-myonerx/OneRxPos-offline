// HTTP server entry point — starts Express, verifies connections, handles graceful shutdown

import http from "http";
import app from "./app";
import { config } from "./config";
import { logger } from "./shared/utils/logger";
import { prisma } from "./config/database";
import { redis } from "./config/redis";
import { disconnectRedis, setRedisReady, isRedisReady, isRedisOptional } from "./config/redis";
import { closeQueues, demoStockRefillQueue, demoResetQueue, licenseQueue } from "./config/queue";
import { initSocketIO, closeSocketIO } from "./socket";
import { setAttendanceIO } from "./socket/attendance.handler";
import { shouldScheduleDrain, startDrainScheduler } from "./sync/store-node/drain-scheduler";
import {
  shouldScheduleMessaging,
  startMessagingScheduler,
  defaultTenantResolver,
} from "./modules/messaging/messaging.scheduler";

const PORT = config.PORT;

async function main(): Promise<void> {
  // ── Verify database connection ──────────────────────────────────────────
  try {
    await prisma.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.fatal({ err: error }, "Failed to connect to database");
    process.exit(1);
  }

  // ── Verify Redis connection ─────────────────────────────────────────────
  // On the store-node (DATA_BACKEND=sqlite) Redis is OPTIONAL: if it's absent
  // the backend still boots and runs on in-memory fallbacks (rate limiting; no
  // pub/sub bridge or background jobs). On the cloud Redis is required.
  try {
    await redis.connect();
    await redis.ping();
    setRedisReady(true);
    logger.info("Redis connected successfully");
  } catch (error) {
    if (isRedisOptional()) {
      logger.warn(
        { err: error },
        "Redis unavailable — store-node mode: continuing with in-memory fallbacks",
      );
      // Stop background reconnection attempts so a dead Redis doesn't spam logs.
      redis.disconnect();
    } else {
      logger.fatal({ err: error }, "Failed to connect to Redis");
      process.exit(1);
    }
  }

  // ── Schedule demo jobs (only in demo mode; needs Redis/BullMQ) ─────────────
  if (config.DEMO_MODE && isRedisReady()) {
    // Stock refill: every 5 minutes
    await demoStockRefillQueue.upsertJobScheduler(
      "demo-stock-refill",
      { every: 5 * 60 * 1000 },
      { name: "refill", data: { triggeredAt: new Date().toISOString() } },
    );
    logger.info("Demo mode: stock refill job scheduled (every 5 minutes)");

    // Data reset: every 2 hours
    await demoResetQueue.upsertJobScheduler(
      "demo-reset",
      { every: 2 * 60 * 60 * 1000 },
      { name: "reset", data: { triggeredAt: new Date().toISOString() } },
    );
    logger.info("Demo mode: data reset job scheduled (every 2 hours)");

    // Trigger an immediate reset on every server start so fresh data is
    // always available from first request, even after a cold deploy.
    await demoResetQueue.add(
      "reset-on-start",
      { triggeredAt: new Date().toISOString() },
      { removeOnComplete: true, removeOnFail: true },
    );
    logger.info("Demo mode: immediate data reset job queued");
  }

  // ── Schedule licensing daily re-validation (needs a key + Redis/BullMQ) ──
  if (config.LICENSE_KEY && isRedisReady()) {
    await licenseQueue.upsertJobScheduler(
      "license-validate",
      { every: 24 * 60 * 60 * 1000 },
      { name: "validate", data: { triggeredAt: new Date().toISOString() } },
    );
    // Kick one validation immediately so a fresh boot activates/validates now.
    await licenseQueue.add(
      "validate-on-start",
      { triggeredAt: new Date().toISOString() },
      { removeOnComplete: true, removeOnFail: true },
    );
    logger.info("Licensing: daily validation scheduled");
  }

  // ── Start HTTP server with Socket.IO ──────────────────────────────────
  const server = http.createServer(app);
  const io = initSocketIO(server);
  // Wire the live attendance emitter singleton.
  setAttendanceIO(io);

  server.listen(PORT, () => {
    logger.info(
      { port: PORT, env: config.NODE_ENV, demoMode: config.DEMO_MODE },
      `Server started on port ${PORT}`,
    );

    if (config.DEMO_MODE) {
      console.log("");
      console.log("╔══════════════════════════════════════════╗");
      console.log("║          🎮 DEMO MODE ACTIVE             ║");
      console.log("║  Data resets every 2 hours               ║");
      console.log("║  Stock refills every 5 minutes           ║");
      console.log("║  Delete/password operations blocked      ║");
      console.log("╚══════════════════════════════════════════╝");
      console.log("");
    }
  });

  // ── Schedule the store-node outbox drainer (best-effort) ────────────────
  // Only when DATA_BACKEND=sqlite AND a cloud URL + local DB master key are
  // configured — otherwise the sync_outbox just accumulates offline (see
  // src/sync/store-node/drain-scheduler.ts). Never let this block or crash
  // boot: scheduling is wrapped defensively even though `shouldScheduleDrain`
  // already guards the config it needs.
  let stopDrainScheduler: (() => void) | undefined;
  try {
    if (shouldScheduleDrain()) {
      stopDrainScheduler = startDrainScheduler(prisma);
      logger.info("Store-node: outbox drain scheduler started");
    } else if (config.DATA_BACKEND === "sqlite") {
      logger.info(
        "Store-node: outbox drain scheduler skipped (no SYNC_CLOUD_URL configured — outbox will accumulate offline)",
      );
    }
  } catch (error) {
    logger.error({ err: error }, "Store-node: failed to start outbox drain scheduler — continuing without it");
  }

  // ── Schedule the outbound-message (email) drainer ───────────────────────
  // Redis-free and correct on both cloud and store-node, so it always runs.
  // Never let it block or crash boot.
  let stopMessagingScheduler: (() => void) | undefined;
  try {
    if (shouldScheduleMessaging()) {
      stopMessagingScheduler = startMessagingScheduler(prisma, defaultTenantResolver(prisma));
      logger.info("Messaging: outbound email drain scheduler started");
    }
  } catch (error) {
    logger.error({ err: error }, "Messaging: failed to start email drain scheduler — continuing without it");
  }

  // ── Graceful shutdown ───────────────────────────────────────────────────
  // On SIGTERM/SIGINT: stop accepting new connections, drain existing ones,
  // close DB + Redis, then exit cleanly.

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return; // Prevent double-shutdown
    isShuttingDown = true;

    logger.info({ signal }, "Shutdown signal received — closing gracefully");

    // 1. Stop accepting new connections
    server.close(async () => {
      try {
        // 2. Stop the outbox drain schedulers, if they were started
        stopDrainScheduler?.();
        stopMessagingScheduler?.();

        // 3. Close Socket.IO
        await closeSocketIO();

        // 4. Close BullMQ queues (stops scheduling new jobs)
        await closeQueues();
        logger.info("BullMQ queues closed");

        // 5. Close Redis connections
        await disconnectRedis();

        // 6. Disconnect Prisma
        await prisma.$disconnect();
        logger.info("Database disconnected");

        logger.info("Server shut down gracefully");
        process.exit(0);
      } catch (error) {
        logger.error({ err: error }, "Error during shutdown");
        process.exit(1);
      }
    });

    // Force-kill if graceful shutdown takes too long
    setTimeout(() => {
      logger.error("Could not close connections in time — forcing shutdown");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // ── Catch unhandled errors ──────────────────────────────────────────────
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "Unhandled promise rejection");
    process.exit(1);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Uncaught exception");
    process.exit(1);
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, "Unhandled error during startup");
  process.exit(1);
});
