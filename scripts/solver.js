"use strict";
const C = require("../game-core.js");
const GOLDEN = 0x9e3779b9;
const DEFAULT_INVENTORY = Object.freeze({ rocket: 2, bomb: 1, shuffle: 1 });
const OBSTACLES = new Set(["crate", "ice", "cracked-ice"]);
const POWERS = new Set(["rocket", "bomb", "rainbow"]);

function cloneState(state) {
  return { board: state.board.slice(), collected: state.collected.slice(), moves: state.moves,
    boosters: { ...state.boosters }, coins: state.coins, rngStep: state.rngStep, shuffles: state.shuffles || 0 };
}
function components(board) {
  const seen = new Uint8Array(board.length), groups = [];
  for (let start = 0; start < board.length; start++) {
    const colour = board[start];
    if (seen[start] || !Number.isInteger(colour) || colour < 0 || colour >= C.COLOURS) continue;
    const stack = [start], group = [];
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop();
      group.push(at);
      for (const next of C.neighbours(at)) if (!seen[next] && board[next] === colour) { seen[next] = 1; stack.push(next); }
    }
    if (group.length >= 2) groups.push(group.sort((a, b) => a - b));
  }
  return groups;
}
function damageObstacles(board, indices) {
  const cleared = new Set(indices), hits = new Set();
  for (const at of indices) for (const next of C.neighbours(at))
    if (!cleared.has(next) && OBSTACLES.has(board[next])) hits.add(next);
  for (const at of hits) {
    if (board[at] === "crate" || board[at] === "cracked-ice") board[at] = null;
    else if (board[at] === "ice") board[at] = "cracked-ice";
  }
}
function collectAndRemove(board, indices, collected) {
  for (const at of indices) {
    const value = board[at];
    if (Number.isInteger(value) && value >= 0 && value < C.COLOURS) collected[value]++;
    board[at] = null;
  }
}
function settle(state, level, seedBase) {
  const seed = (seedBase + Math.imul(state.rngStep, GOLDEN)) >>> 0;
  state.rngStep++;
  state.board = C.refill(C.applyGravity(state.board), level, seed);
  return state;
}
function usePower(state, index, level, seedBase) {
  const board = state.board, type = board[index];
  if (!POWERS.has(type)) return null;
  const all = new Set([index]);
  if (type === "rocket") {
    const row = Math.floor(index / C.COLS);
    for (let x = 0; x < C.COLS; x++) all.add(row * C.COLS + x);
  } else if (type === "bomb") {
    const cx = index % C.COLS, cy = Math.floor(index / C.COLS);
    for (let y = Math.max(0, cy - 1); y <= Math.min(C.ROWS - 1, cy + 1); y++)
      for (let x = Math.max(0, cx - 1); x <= Math.min(C.COLS - 1, cx + 1); x++) all.add(y * C.COLS + x);
  } else {
    const counts = Array(C.COLOURS).fill(0);
    for (const value of board) if (Number.isInteger(value) && value >= 0 && value < C.COLOURS) counts[value]++;
    const colour = counts.indexOf(Math.max(...counts));
    board.forEach((value, at) => { if (value === colour) all.add(at); });
  }
  const valid = [...all].filter(at => board[at] !== null && board[at] !== undefined);
  if (!valid.length) return null;
  damageObstacles(board, valid);
  collectAndRemove(board, valid, state.collected);
  state.moves--;
  return settle(state, level, seedBase);
}
function popGroup(state, group, level, seedBase) {
  const board = state.board;
  if (group.length >= 4) {
    const power = group.length >= 9 ? "rainbow" : group.length >= 5 ? "bomb" : "rocket";
    const keep = group[Math.floor(group.length / 2)];
    const cleared = group.filter(at => at !== keep);
    damageObstacles(board, cleared);
    collectAndRemove(board, cleared, state.collected);
    board[keep] = power;
  } else {
    damageObstacles(board, group);
    collectAndRemove(board, group, state.collected);
  }
  state.moves--;
  return settle(state, level, seedBase);
}
function objectivesComplete(state, config) {
  return config.targets.every(target => state.collected[target.colour] >= target.count);
}
function remaining(state, config) {
  return config.targets.reduce((sum, target) => sum + Math.max(0, target.count - state.collected[target.colour]), 0);
}
function heuristic(state, config) {
  const left = remaining(state, config);
  if (!left) return -100000;
  const targetColours = new Set(config.targets.map(t => t.colour));
  let targetOnBoard = 0, adjacentTargetPairs = 0, obstacleCount = 0, powerCount = 0;
  for (let at = 0; at < state.board.length; at++) {
    const value = state.board[at];
    if (targetColours.has(value)) {
      targetOnBoard++;
      for (const next of C.neighbours(at)) if (next > at && state.board[next] === value) adjacentTargetPairs++;
    }
    if (OBSTACLES.has(value)) obstacleCount++;
    if (POWERS.has(value)) powerCount++;
  }
  const movesUsed = config.moves - state.moves;
  return left * 100 + movesUsed * 2 - targetOnBoard * 2 - adjacentTargetPairs * 1.5 - powerCount * 5 + obstacleCount * .1;
}
function signature(state) {
  return state.board.join(",") + "|" + state.collected.join(",") + "|" + state.moves + "|" +
    state.boosters.rocket + "," + state.boosters.bomb + "," + state.boosters.shuffle + "|" + state.coins + "|" + state.rngStep;
}
function bestBoosterCandidates(state, config) {
  const board = state.board;
  const targetColours = new Set(config.targets.filter(t => state.collected[t.colour] < t.count).map(t => t.colour));
  const choices = [];
  if (state.boosters.rocket > 0 || state.coins >= 25) {
    let best = null, bestValue = -Infinity;
    for (let row = 0; row < C.ROWS; row++) {
      let value = 0;
      for (let x = 0; x < C.COLS; x++) {
        const tile = board[row * C.COLS + x];
        if (targetColours.has(tile)) value += 2;
        else if (OBSTACLES.has(tile)) value += tile === "ice" ? 1 : .5;
      }
      if (value > bestValue) {
        const candidates = Array.from({ length: C.COLS }, (_, x) => row * C.COLS + x)
          .filter(at => Number.isInteger(board[at]) && board[at] >= 0 && board[at] < C.COLOURS)
          .sort((a, b) => Math.abs((a % C.COLS) - (C.COLS / 2)) - Math.abs((b % C.COLS) - (C.COLS / 2)));
        if (candidates.length) { bestValue = value; best = candidates[0]; }
      }
    }
    if (best !== null) choices.push({ type: "rocket", index: best });
  }
  if (state.boosters.bomb > 0 || state.coins >= 25) {
    let best = null, bestValue = -Infinity;
    for (let at = 0; at < board.length; at++) {
      if (!Number.isInteger(board[at]) || board[at] < 0 || board[at] >= C.COLOURS) continue;
      const cx = at % C.COLS, cy = Math.floor(at / C.COLS);
      let value = 0;
      for (let y = Math.max(0, cy - 1); y <= Math.min(C.ROWS - 1, cy + 1); y++)
        for (let x = Math.max(0, cx - 1); x <= Math.min(C.COLS - 1, cx + 1); x++) {
          const tile = board[y * C.COLS + x];
          if (targetColours.has(tile)) value += 2;
          else if (OBSTACLES.has(tile)) value += tile === "ice" ? 1 : .5;
        }
      if (value > bestValue) { bestValue = value; best = at; }
    }
    if (best !== null) choices.push({ type: "bomb", index: best });
  }
  if (state.boosters.shuffle > 0 || state.coins >= 25) choices.push({ type: "shuffle" });
  return choices;
}
function applyAction(source, action, level, config, seedBase) {
  const state = cloneState(source);
  if (action.type === "group") return popGroup(state, action.group, level, seedBase);
  if (action.type === "power") return usePower(state, action.index, level, seedBase);
  if (action.type === "booster") {
    const type = action.booster;
    if (state.boosters[type] > 0) state.boosters[type]--;
    else if (state.coins >= 25) state.coins -= 25;
    else return null;
    if (type === "shuffle") {
      const seed = (seedBase + Math.imul(state.rngStep, GOLDEN)) >>> 0;
      state.rngStep++;
      state.shuffles++;
      state.board = C.createBoard(level, seed);
      return state;
    }
    // Placement is a free setup action in the real game. Activation is a
    // separate tap and consumes a move, so leave the power on the board.
    if (!Number.isInteger(action.index) || action.index < 0 || action.index >= state.board.length) return null;
    if (!Number.isInteger(state.board[action.index]) || state.board[action.index] < 0 || state.board[action.index] >= C.COLOURS) return null;
    state.board[action.index] = type;
    return state;
  }
  return null;
}
function actionsFor(state, config) {
  const actions = components(state.board).map(group => ({ type: "group", group }));
  state.board.forEach((tile, index) => { if (POWERS.has(tile)) actions.push({ type: "power", index }); });
  for (const booster of bestBoosterCandidates(state, config)) {
    if (booster.type === "shuffle") actions.push({ type: "booster", booster: "shuffle" });
    else actions.push({ type: "booster", booster: booster.type, index: booster.index });
  }
  return actions;
}
function solveLevel(level, options = {}) {
  const config = C.levelConfig(level);
  const seed = (options.seed === undefined ? Math.imul(level, 997) : options.seed) >>> 0;
  const beamWidth = Math.max(1, Math.min(20, options.beamWidth || 4));
  const nodeLimit = Math.max(1, options.nodeLimit || 45);
  const initial = { board: C.createBoard(level, seed), collected: Array(C.COLOURS).fill(0),
    moves: config.moves, boosters: { ...DEFAULT_INVENTORY, ...(options.boosters || {}) },
    coins: options.coins === undefined ? 50 : Math.max(0, options.coins), rngStep: 1, shuffles: 0 };
  let beam = [initial], expanded = 0, deepest = 0;
  const seen = new Set([signature(initial)]);
  while (beam.length && expanded < nodeLimit) {
    const next = [];
    for (const state of beam) {
      if (objectivesComplete(state, config)) return { status: "solved", level, seed, movesUsed: config.moves - state.moves, expanded, remaining: 0 };
      if (state.moves <= 0) continue;
      for (const action of actionsFor(state, config)) {
        const child = applyAction(state, action, level, config, seed);
        if (!child || child.moves < 0) continue;
        if (objectivesComplete(child, config)) return { status: "solved", level, seed, movesUsed: config.moves - child.moves, expanded, remaining: 0 };
        const key = signature(child);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(child);
      }
      expanded++;
      deepest = Math.max(deepest, config.moves - state.moves);
      if (expanded >= nodeLimit) break;
    }
    next.sort((a, b) => heuristic(a, config) - heuristic(b, config));
    beam = next.slice(0, beamWidth);
  }
  // Beam pruning means a failed bounded search is never a proof of impossibility.
  return { status: "inconclusive", level, seed, movesUsed: deepest, expanded,
    remaining: beam.length ? Math.min(...beam.map(s => remaining(s, config))) : remaining(initial, config),
    reason: expanded >= nodeLimit ? "node-limit" : "beam-exhausted", deepest };
}
function auditLevels(options = {}) {
  const results = [], counts = { solved: 0, inconclusive: 0 };
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const result = solveLevel(level, { ...options, seed: options.seedForLevel ? options.seedForLevel(level) : Math.imul(level, 997) });
    counts[result.status]++;
    results.push(result);
    if (options.onProgress && level % 100 === 0) options.onProgress({ level, ...counts });
  }
  return { version: 1, levels: C.MAX_LEVEL, counts, failures: results.filter(r => r.status !== "solved"), results };
}
module.exports = { components, damageObstacles, objectivesComplete, remaining, heuristic, applyAction, solveLevel, auditLevels };
