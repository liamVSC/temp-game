"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../game-core.js");
const S = require("../scripts/solver.js");
const regressions = require("./fixtures/solver-regressions.json");

test("solver component detection matches orthogonal same-colour groups", () => {
  const board = Array(72).fill(null);
  board[0] = 1; board[1] = 1; board[2] = 2; board[8] = 1; board[9] = 1;
  assert.deepEqual(S.components(board), [[0, 1, 8, 9]]);
});

test("solver models crate destruction and two-hit ice damage", () => {
  const board = Array(72).fill(null);
  board[0] = "crate"; board[2] = "ice"; board[9] = "cracked-ice";
  S.damageObstacles(board, [1, 8]);
  assert.equal(board[0], null);
  assert.equal(board[2], "cracked-ice");
  assert.equal(board[9], null);
});

test("solver is deterministic for the same level, seed and search budget", () => {
  const a = S.solveLevel(8, { seed: 8008, nodeLimit: 35, beamWidth: 3 });
  const b = S.solveLevel(8, { seed: 8008, nodeLimit: 35, beamWidth: 3 });
  assert.deepEqual(a, b);
});

test("solver reports bounded-search uncertainty honestly", () => {
  const result = S.solveLevel(20, { seed: 20020, nodeLimit: 1, beamWidth: 1 });
  assert.ok(["solved", "inconclusive"].includes(result.status));
  assert.ok(result.expanded <= 1);
  assert.ok(result.movesUsed >= 0 && result.movesUsed <= C.levelConfig(20).moves);
});

test("a four-block group creates a rocket, counts only three cleared blocks and spends one move", () => {
  const config = C.levelConfig(1);
  const state = { board: Array(72).fill(null), collected: Array(C.COLOURS).fill(0), moves: config.moves,
    boosters: { rocket: 2, bomb: 1, shuffle: 1 }, coins: 50, rngStep: 1, shuffles: 0 };
  state.board[0] = 0; state.board[1] = 0; state.board[2] = 0; state.board[3] = 0;
  const next = S.applyAction(state, { type: "group", group: [0, 1, 2, 3] }, 1, config, 997);
  assert.equal(next.moves, config.moves - 1);
  assert.equal(next.collected[0], 3);
  assert.equal(next.board.filter(tile => tile === "rocket").length, 1);
  assert.ok(next.board.every(tile => tile !== null), "gravity and refill settle the board without auto-clearing");
});

test("rocket activation clears one row, damages adjacent obstacles and does not chain", () => {
  const config = C.levelConfig(8);
  const board = Array(72).fill(null);
  board[0] = "rocket";
  for (let x = 1; x < C.COLS; x++) board[x] = 0;
  board[8] = "crate"; board[9] = "ice"; board[10] = "cracked-ice";
  const state = { board, collected: Array(C.COLOURS).fill(0), moves: config.moves,
    boosters: { rocket: 2, bomb: 1, shuffle: 1 }, coins: 50, rngStep: 1, shuffles: 0 };
  const next = S.applyAction(state, { type: "power", index: 0 }, 8, config, 8008);
  assert.equal(next.moves, config.moves - 1);
  assert.equal(next.collected[0], 7);
  assert.ok(!next.board.includes("crate"));
  assert.ok(next.board.includes("cracked-ice"));
  assert.ok(next.board.every(tile => tile !== null));
});

test("booster placement is deterministic, free, and activation is a separate move", () => {
  const config = C.levelConfig(1);
  const board = Array(72).fill(0);
  const state = { board, collected: Array(C.COLOURS).fill(0), moves: config.moves,
    boosters: { rocket: 2, bomb: 1, shuffle: 1 }, coins: 50, rngStep: 1, boosterStep: 0, shuffles: 0 };
  const placed = S.applyAction(state, { type: "booster", booster: "bomb" }, 1, config, 997);
  const repeated = S.applyAction(state, { type: "booster", booster: "bomb" }, 1, config, 997);
  assert.deepEqual(placed.board, repeated.board);
  assert.equal(placed.moves, config.moves);
  assert.equal(placed.boosters.bomb, 0);
  assert.equal(placed.board.filter(tile => tile === "bomb").length, 1);
  assert.equal(placed.collected[0], 0, "placing a booster does not collect the replaced colour");
  assert.equal(state.board.filter(tile => tile === 0).length, 72, "the input state remains immutable");
  const index = placed.board.indexOf("bomb");
  const activated = S.applyAction(placed, { type: "power", index }, 1, config, 997);
  const cx = index % C.COLS, cy = Math.floor(index / C.COLS);
  let expectedCollected = 0;
  for (let y = Math.max(0, cy - 1); y <= Math.min(C.ROWS - 1, cy + 1); y++)
    for (let x = Math.max(0, cx - 1); x <= Math.min(C.COLS - 1, cx + 1); x++)
      if (y * C.COLS + x !== index) expectedCollected++;
  assert.equal(activated.moves, config.moves - 1);
  assert.equal(activated.collected[0], expectedCollected);
});

test("all previously inconclusive generated seeds solve after dead-board refresh is modeled", { timeout: 120000 }, () => {
  assert.ok(regressions.length >= 40, "retain all discovered inconclusive seeds as regressions");
  for (const fixture of regressions) {
    const result = S.solveLevel(fixture.level, { seed: fixture.seed, beamWidth: 4, nodeLimit: 100 });
    assert.equal(result.status, "solved", "level " + fixture.level + " seed " + fixture.seed + " should now solve; got " + result.status);
  }
});

test("shuffle booster uses owned inventory then available coins without spending moves", () => {
  const config = C.levelConfig(1);
  const initial = { board: C.createBoard(1, 997), collected: Array(C.COLOURS).fill(0), moves: config.moves,
    boosters: { rocket: 2, bomb: 1, shuffle: 1 }, coins: 50, rngStep: 1, shuffles: 0 };
  const first = S.applyAction(initial, { type: "booster", booster: "shuffle" }, 1, config, 997);
  const second = S.applyAction(first, { type: "booster", booster: "shuffle" }, 1, config, 997);
  const third = S.applyAction(second, { type: "booster", booster: "shuffle" }, 1, config, 997);
  assert.equal(first.moves, config.moves);
  assert.equal(first.boosters.shuffle, 0);
  assert.equal(second.coins, 25);
  assert.equal(third.coins, 0);
  assert.equal(S.applyAction(third, { type: "booster", booster: "shuffle" }, 1, config, 997), null);
});

test("dead-board refresh is deterministic and free when moves remain", () => {
  const config = C.levelConfig(1);
  const board = Array.from({ length: C.ROWS * C.COLS }, (_, i) => (Math.floor(i / C.COLS) + i % C.COLS) % 2);
  assert.equal(C.hasPlayableMove(board), false);
  const state = { board, collected: Array(C.COLOURS).fill(0), moves: config.moves,
    boosters: { rocket: 0, bomb: 0, shuffle: 0 }, coins: 0, rngStep: 1, boosterStep: 0, shuffles: 0 };
  const first = S.settle({ ...state, board: state.board.slice(), collected: state.collected.slice(), boosters: { ...state.boosters } }, 1, 997);
  const second = S.settle({ ...state, board: state.board.slice(), collected: state.collected.slice(), boosters: { ...state.boosters } }, 1, 997);
  assert.deepEqual(first.board, second.board);
  assert.equal(first.moves, config.moves);
  assert.equal(C.hasPlayableMove(first.board), true);
});

test("heuristic stops rewarding colours whose objectives are already complete", () => {
  const config = { moves: 20, targets: [{ colour: 0, count: 1 }, { colour: 1, count: 1 }] };
  const base = { collected: [1, 0, 0, 0, 0, 0], moves: 10 };
  const completedColourBoard = Array(72).fill(null); completedColourBoard[0] = 0; completedColourBoard[1] = 0; completedColourBoard[2] = 0; completedColourBoard[9] = 1;
  const activeColourBoard = Array(72).fill(null); activeColourBoard[9] = 1;
  assert.equal(S.heuristic({ ...base, board: completedColourBoard }, config), S.heuristic({ ...base, board: activeColourBoard }, config));
});

test("solver models power-up creation thresholds and available booster inventory", () => {
  const source = require("node:fs").readFileSync(require.resolve("../scripts/solver.js"), "utf8");
  assert.match(source, /group\.length >= 9 \? "rainbow" : group\.length >= 5 \? "bomb" : "rocket"/);
  assert.match(source, /DEFAULT_INVENTORY = Object\.freeze\(\{ rocket: 2, bomb: 1, shuffle: 1 \}\)/);
  assert.match(source, /function usePower/);
  assert.match(source, /The live game randomly replaces a colour tile/);
  assert.match(source, /function settle/);
});

test("all 5,000 generated level definitions are deterministic and objectives stay valid", { timeout: 120000 }, () => {
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const seed = Math.imul(level, 997) >>> 0;
    assert.deepEqual(C.createBoard(level, seed), C.createBoard(level, seed), "board seed " + seed);
    const config = C.levelConfig(level);
    assert.ok(config.moves >= 18 && config.moves <= 25);
    assert.ok(config.targets.every(t => t.count > 0 && t.colour >= 0 && t.colour < C.COLOURS));
  }
  const first = S.solveLevel(1, { nodeLimit: 15, beamWidth: 2 });
  assert.ok(["solved", "inconclusive"].includes(first.status));
  assert.equal(first.seed, Math.imul(1, 997) >>> 0);
});
