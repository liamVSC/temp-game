const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../game-core.js");

test("all 5,000 level configurations have non-empty objectives within the move budget", () => {
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const config = C.levelConfig(level);
    assert.ok(config.moves >= 18 && config.moves <= 25, `level ${level} move budget`);
    assert.ok(config.targets.every(target => target.count > 0), `level ${level} objective`);
    assert.ok(config.targets[0].colour !== config.targets[1].colour, `level ${level} objectives use distinct colours`);
  }
});

test("every generated level has a guaranteed two-move objective solution", () => {
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const config = C.levelConfig(level);
    const board = C.createBoard(level, level * 12345);
    const firstRows = Math.ceil(config.targets[0].count / C.COLS);
    const secondRows = Math.ceil(config.targets[1].count / C.COLS);
    const secondStart = firstRows * C.COLS;

    assert.ok(C.groupAt(board, 0).length >= config.targets[0].count,
      `level ${level}: first objective is one clearable group`);
    assert.ok(C.groupAt(board, secondStart).length >= config.targets[1].count,
      `level ${level}: second objective is one clearable group`);

    for (const index of C.groupAt(board, 0)) board[index] = null;
    const settled = C.refill(C.applyGravity(board), level, level * 98765);
    assert.ok(C.groupAt(settled, secondStart).length >= config.targets[1].count,
      `level ${level}: second objective remains clearable after the first clear`);
    assert.ok(config.moves >= 2, `level ${level}: enough moves to clear both objectives`);
  }
});

test("higher levels introduce crate, ice, and cracked-ice obstacles", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    for (const tile of C.createBoard(100, seed)) {
      if (tile === "crate" || tile === "ice" || tile === "cracked-ice") seen.add(tile);
    }
  }
  assert.ok(seen.has("crate"), "crate obstacle generated");
  assert.ok(seen.has("ice"), "ice obstacle generated");
  assert.ok(seen.has("cracked-ice"), "cracked ice obstacle generated");
});
