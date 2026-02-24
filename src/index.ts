import { Resonate } from "@resonatehq/sdk";
import { exclusiveResourceAccess } from "./workflow";

// ---------------------------------------------------------------------------
// Resonate setup
// ---------------------------------------------------------------------------

const resonate = new Resonate();
resonate.register(exclusiveResourceAccess);

// ---------------------------------------------------------------------------
// Simulate 5 workers competing for exclusive access
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const shouldCrash = args.includes("--crash");

const resource = "payment-gateway";
const workers = ["worker-A", "worker-B", "worker-C", "worker-D", "worker-E"];

const modeDescriptions = {
  normal: "HAPPY PATH  (5 workers, serialized access, no conflicts)",
  crash: "CRASH DEMO  (worker-C fails, retries; A,B not re-run; D,E unaffected)",
};

console.log("=== Distributed Mutex Demo ===");
console.log(`Mode: ${modeDescriptions[shouldCrash ? "crash" : "normal"]}`);
console.log(`Resource: ${resource}`);
console.log(`Workers: ${workers.join(", ")}\n`);

const wallStart = Date.now();

const result = await resonate.run(
  `mutex/${resource}/${Date.now()}`,
  exclusiveResourceAccess,
  resource,
  workers,
  shouldCrash,
);

const wallMs = Date.now() - wallStart;

console.log("\n=== Result ===");
console.log(
  JSON.stringify(
    {
      resource: result.resource,
      workersProcessed: result.processed.length,
      totalMs: wallMs,
    },
    null,
    2,
  ),
);

console.log("\nExecution order (serialized — no overlap):");
for (const r of result.processed) {
  console.log(`  ${r.workerId}: ${r.action} (${r.duration}ms)`);
}

if (shouldCrash) {
  console.log(
    "\nNotice: worker-A and worker-B each ran once (cached before crash).",
    "\nworker-C failed → retried → succeeded. Others were not affected.",
    "\nThe mutex ensured no two workers touched the resource simultaneously.",
  );
}
