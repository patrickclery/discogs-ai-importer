import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Durable job queue (D-12). Timestamps are epoch milliseconds. */
export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey(),
    lane: text('lane', { enum: ['anthropic', 'discogs'] }).notNull(),
    type: text('type').notNull(),
    payload: text('payload').notNull().default('{}'),
    status: text('status', {
      enum: ['queued', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    runAfter: integer('run_after').notNull(),
    dedupeKey: text('dedupe_key').unique(),
    lockedAt: integer('locked_at'),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    finishedAt: integer('finished_at'),
  },
  (t) => [index('jobs_claim_idx').on(t.lane, t.status, t.runAfter)],
);

/** Non-secret settings (D-08); value holds JSON. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Cross-process worker guard, used by Plan 01-02. */
export const workerLease = sqliteTable('worker_lease', {
  id: integer('id').primaryKey(),
  bootId: text('boot_id').notNull(),
  pid: integer('pid').notNull(),
  heartbeatAt: integer('heartbeat_at').notNull(),
  acquiredAt: integer('acquired_at').notNull(),
});

export type JobRow = typeof jobs.$inferSelect;
