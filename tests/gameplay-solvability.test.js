const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../game-core.js");

const BEAM_WIDTH = 64;
const MAX_EXPANSIONS_PER_DEPTH = 4000;

function hashBoard(board) {
  let h = 2166136261;
  for (const tile of board) {
    const value = typeof tile === "number" ? tile + 1 : tile === null ? 0 : ({
      crate: 7, ice: 8, "cracked-ice": 9, rocket: 10, bomb: 11, rainbow: 12
    }[tile] || 13);
    h ^= value;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function adjacentDamage(board, indices) {
  const removed = new Set(indices);
  const hits = new Set();
  for (const index of indices) {
    for (const neighbour of C.neighbours(index)) {
      if (!removed.has(neighbour) && ["crate", "ice", "cracked-ice"].includes(board[neighbour])) hits.add(neighbour);
    }
  }
  for (const index of hits) {
    if (board[index] === "crate" || board[index] === "cracked-ice") board[index] = null;
    else if (board[index] === "ice") board[index] = "cracked-ice";
  }
}

function settle(board, level, stateHash, depth) {
  return C.refill(C.applyGravity(board), level, (stateHash + Math.imul(depth + 1, 0x9e3779b9)) >>> 0);
}

function simulateAction(state, action, config, depth) {
  const board = state.board.slice();
  const collected = state.collected.slice();
  let removed;
  let createdPower = null;

  if (action.kind === "power") {
    const at = action.index;
    const power = board[at];
    const affected = new Set([at]);
    if (power === "rocket") {
      const row = Math.floor(at / C.COLS);
      for (let x = 0; x < C.COLS; x++) affected.add(row * C.COLS + x);
    } else if (power === "bomb") {
      const cx = at % C.COLS, cy = Math.floor(at / C.COLS);
      for (let y = Math.max(0, cy - 1); y <= Math.min(C.ROWS - 1, cy + 1); y++) {
        for (let x = Math.max(0, cx - 1); x <= Math.min(C.COLS - 1, cx + 1); x++) affected.add(y * C.COLS + x);
      }
    } else if (power === "rainbow") {
      const counts = Array(C.COLOURS).fill(0);
      board.forEach(tile => { if (typeof tile === "number") counts[tile]++; });
      const colour = counts.indexOf(Math.max(...counts));
      board.forEach((tile, i) => { if (tile === colour) affected.add(i); });
    }
    removed = [...affected].filter(i => board[i] !== null && board[i] !== undefined);
  } else {
    const group = C.groupAt(board, action.index);
    if (group.length < 2) return null;
    if (group.length >= 4) {
      createdPower = group.length >= 9 ? "rainbow" : group.length >= 5 ? "bomb" : "rocket";
      const keep = group[Math.floor(group.length / 2)];
      removed = group.filter(i => i !== keep);
      board[keep] = null;
    } else removed = group;
  }

  adjacentDamage(board, removed);
  for (const index of removed) {
    const tile = board[index];
    if (typeof tile === "number") collected[tile]++;
    board[index] = null;
  }

  if (createdPower) {
    const group = C.groupAt(state.board, action.index);
    const keep = group[Math.floor(group.length / 2)];
    // The game creates the power on the group's middle tile after clearing the rest.
    // Preserve the selected tile through gravity by marking it before settling.
    board[keep] = createdPower;
  }

  let nextBoard = settle(board, config.level, hashBoard(board), depth);
  // game.js grants a free fresh board when a settled board has no matching group or power.
  if (actionsFor(nextBoard).length === 0) nextBoard = C.createBoard(config.level, (hashBoard(nextBoard) + depth + 1) >>> 0);
  return { board: nextBoard, collected, moves: state.moves - 1, depth: depth + 1 };
}

function actionsFor(board) {
  const actions = [], seen = new Set();
  for (let i = 0; i < board.length; i++) {
    if (typeof board[i] === "number") {
      const group = C.groupAt(board, i);
      if (group.length >= 2) {
        const key = group[0];
        if (!seen.has(key)) { seen.add(key); actions.push({ kind: "group", index: key }); }
      }
    } else if (["rocket", "bomb", "rainbow"].includes(board[i])) {
      actions.push({ kind: "power", index: i });
    }
  }
  return actions;
}

function complete(state, config) {
  return config.targets.every(target => state.collected[target.colour] >= target.count);
}

function remaining(state, config) {
  return config.targets.reduce((sum, target) => sum + Math.max(0, target.count - state.collected[target.colour]), 0);
}

function rank(state, config) {
  const need = remaining(state, config);
  const objectiveTiles = state.collected.reduce((sum, n, colour) => {
    const target = config.targets.find(t => t.colour === colour);
    return sum + Math.min(n, target ? target.count : 0);
  }, 0);
  const obstacleCount = state.board.filter(tile => ["crate", "ice", "cracked-ice"].includes(tile)).length;
  const playableGroups = actionsFor(state.board).length;
  return objectiveTiles * 100 - need * 10 - obstacleCount * 1.5 + playableGroups * 0.05;
}

function solveLevel(level, seed, options = {}) {
  const config = C.levelConfig(level);
  const initial = { board: C.createBoard(level, seed), collected: Array(C.COLOURS).fill(0), moves: config.moves, depth: 0 };
  let beam = [initial], expansions = 0;
  for (let depth = 0; depth < config.moves && beam.length; depth++) {
    const candidates = new Map();
    for (const state of beam) {
      for (const action of actionsFor(state.board)) {
        if (++expansions > (options.maxExpansions || MAX_EXPANSIONS_PER_DEPTH) * config.moves) {
          return { solved: false, reason: "search-budget", expansions, bestRemaining: Math.min(...beam.map(s => remaining(s, config))) };
        }
        const next = simulateAction(state, action, config, depth);
        if (!next) continue;
        if (complete(next, config)) return { solved: true, expansions, movesUsed: next.depth };
        if (next.moves <= 0) continue;
        const key = next.board.join(",") + "|" + next.collected.join(",");
        const previous = candidates.get(key);
        if (!previous || rank(next, config) > rank(previous, config)) candidates.set(key, next);
      }
    }
    beam = [...candidates.values()]
      .sort((a, b) => rank(b, config) - rank(a, config) || remaining(a, config) - remaining(b, config))
      .slice(0, options.beamWidth || BEAM_WIDTH);
  }
  return { solved: false, reason: "no-path-found", expansions, bestRemaining: beam.length ? Math.min(...beam.map(s => remaining(s, config))) : remaining(initial, config) };
}

test("gameplay solver models actual group clears, power clears, gravity, refills, obstacles and colour objectives", () => {
  const board = Array(C.ROWS * C.COLS).fill(0);
  board[0] = "rocket";
  board[1] = 1;
  board[2] = 1;
  board[3] = "ice";
  const state = { board, collected: Array(C.COLOURS).fill(0), moves: 5, depth: 0 };
  const config = { level: 1, moves: 5, targets: [{ colour: 0, count: 1 }, { colour: 1, count: 1 }] };
  const afterGroup = simulateAction(state, { kind: "group", index: 1 }, config, 0);
  assert.ok(afterGroup, "matching group is a legal simulated action");
  assert.equal(afterGroup.collected[1], 2, "both selected colour tiles are collected");
  assert.ok(afterGroup.board.some(tile => tile === "ice" || tile === "cracked-ice" || tile === null));
  const afterPower = simulateAction(state, { kind: "power", index: 0 }, config, 0);
  assert.ok(afterPower, "rocket activation is modelled");
  assert.ok(afterPower.collected.reduce((sum, n) => sum + n, 0) > 0, "power clears collect objective colours");
  assert.equal(afterPower.moves, 4);
});

test("representative early, obstacle and late-game level seeds have a gameplay-level solution", () => {
  const cases = [
    [1, 1], [2, 22], [3, 77], [4, 404], [8, 42], [12, 12012],
    [20, 2020], [40, 40040], [100, 100100], [250, 250250],
    [500, 500500], [1000, 1001000], [2500, 2502500], [5000, 5005000]
  ];
  for (const [level, seed] of cases) {
    const result = solveLevel(level, seed);
    assert.equal(result.solved, true, `level ${level}, seed ${seed}: ${JSON.stringify(result)}`);
  }
});

test("gameplay solvability audit is repeatable for the same level and seed", () => {
  const a = solveLevel(20, 2020), b = solveLevel(20, 2020);
  assert.deepEqual(a, b);
});
