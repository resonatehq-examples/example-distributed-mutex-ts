import type { Context } from "@resonatehq/sdk";

// ---------------------------------------------------------------------------
// Distributed Mutex — serialized access to a shared resource
// ---------------------------------------------------------------------------
//
// Multiple workers need exclusive access to an API that can't handle
// concurrent calls (e.g., a payment processor, a legacy database, a
// rate-limited third-party service).
//
// Temporal's mutex requires a dedicated lock workflow with signals,
// signalWithStart, dynamic signal names, condition timeouts for deadlock
// prevention, and continueAsNew for history management (~130 LOC).
//
// Resonate's approach: the generator IS the mutex. Sequential yield* calls
// are serialized by the runtime. Each ctx.run() is an independent checkpoint.
// No signals, no dynamic UUIDs, no deadlock prevention needed.

export interface MutexResult {
  resource: string;
  processed: WorkResult[];
  totalMs: number;
}

export interface WorkResult {
  workerId: string;
  action: string;
  duration: number;
}

export function* exclusiveResourceAccess(
  ctx: Context,
  resource: string,
  workers: string[],
  shouldCrash: boolean,
): Generator<any, MutexResult, any> {
  const results: WorkResult[] = [];
  const start = Date.now();

  // Sequential processing — the generator IS the lock.
  // Each yield* blocks until the previous one completes.
  // No two workers touch the resource at the same time.
  for (let i = 0; i < workers.length; i++) {
    const worker = workers[i]!;
    const crashThis = shouldCrash && i === 2; // crash the 3rd worker

    const result = yield* ctx.run(
      accessResource,
      resource,
      worker,
      crashThis,
    );
    results.push(result);
  }

  return { resource, processed: results, totalMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Critical section — the actual exclusive work
// ---------------------------------------------------------------------------

const attemptMap = new Map<string, number>();

async function accessResource(
  _ctx: Context,
  resource: string,
  workerId: string,
  shouldCrash: boolean,
): Promise<WorkResult> {
  const key = `${resource}:${workerId}`;
  const attempt = (attemptMap.get(key) ?? 0) + 1;
  attemptMap.set(key, attempt);

  const startMs = Date.now();

  console.log(`  [${workerId}] Acquired lock on "${resource}"...`);

  // Simulate work on the shared resource
  await sleep(100 + Math.floor(pseudoRandom(workerId) * 100));

  if (shouldCrash && attempt === 1) {
    console.log(`  [${workerId}] FAILED — resource timeout (lock released, retrying...)`);
    throw new Error(`Resource "${resource}" timeout for ${workerId}`);
  }

  const duration = Date.now() - startMs;
  const retryTag = attempt > 1 ? ` (retry ${attempt})` : "";
  const action = `updated-${resource}`;

  console.log(`  [${workerId}] Done — ${duration}ms, lock released${retryTag}`);

  return { workerId, action, duration };
}

// Deterministic pseudo-random based on worker ID (for consistent demo output)
function pseudoRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
