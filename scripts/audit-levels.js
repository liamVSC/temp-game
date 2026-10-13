"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { auditLevels } = require("./solver");
const outDir = path.resolve(__dirname, "../artifacts");
fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
const report = auditLevels({
  beamWidth: Number(process.env.SOLVER_BEAM_WIDTH) || 4,
  nodeLimit: Number(process.env.SOLVER_NODE_LIMIT) || 45,
  onProgress: p => process.stdout.write("Audited " + p.level + "/5000 — solved " + p.solved + ", inconclusive " + p.inconclusive + "\n")
});
report.elapsedMs = Date.now() - started;
const failures = report.failures.map(({ level, seed, status, reason, remaining, expanded, deepest }) =>
  ({ level, seed, status, reason, remaining, expanded, deepest }));
fs.writeFileSync(path.join(outDir, "level-solvability.json"), JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "solver-failures.json"), JSON.stringify(failures, null, 2) + "\n");
console.log(JSON.stringify({ counts: report.counts, elapsedMs: report.elapsedMs, inconclusiveSeeds: failures.length, examples: failures.slice(0, 25) }, null, 2));
console.log("Bounded search failures are inconclusive, not proofs of unwinnability; inspect the attached report and rerun difficult seeds with a larger node limit.");
