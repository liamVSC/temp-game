"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { auditLevels, solveLevel } = require("./solver");
const outDir = path.resolve(__dirname, "../artifacts");
fs.mkdirSync(outDir, { recursive: true });
const started = Date.now();
const report = auditLevels({
  beamWidth: Number(process.env.SOLVER_BEAM_WIDTH) || 4,
  nodeLimit: Number(process.env.SOLVER_NODE_LIMIT) || 45,
  onProgress: p => process.stdout.write("Initial audit " + p.level + "/5000 — solved " + p.solved + ", inconclusive " + p.inconclusive + "\n")
});
const initialCounts = { ...report.counts };
const initialFailures = report.failures.slice();
const refined = [];
for (const failure of initialFailures) {
  const result = solveLevel(failure.level, { seed: failure.seed, beamWidth: 8, nodeLimit: 300 });
  report.results[result.level - 1] = result;
  refined.push(result);
}
report.counts = { solved: 0, inconclusive: 0 };
for (const result of report.results) report.counts[result.status]++;
report.failures = report.results.filter(result => result.status !== "solved");
report.refinement = {
  strategy: "beam search retry for first-pass inconclusive levels",
  beamWidth: 8,
  nodeLimit: 300,
  initialCounts,
  attempted: refined.length,
  solved: refined.filter(result => result.status === "solved").length,
  stillInconclusive: refined.filter(result => result.status !== "solved").length,
  results: refined
};
report.elapsedMs = Date.now() - started;
const failures = report.failures.map(({ level, seed, status, reason, remaining, expanded, deepest }) =>
  ({ level, seed, status, reason, remaining, expanded, deepest }));
fs.writeFileSync(path.join(outDir, "level-solvability.json"), JSON.stringify(report, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, "solver-failures.json"), JSON.stringify(failures, null, 2) + "\n");
console.log(JSON.stringify({ counts: report.counts, elapsedMs: report.elapsedMs, inconclusiveSeeds: failures.length, examples: failures.slice(0, 25) }, null, 2));
console.log("Bounded search failures are inconclusive, not proofs of unwinnability; inspect the attached report and rerun difficult seeds with a larger node limit.");
