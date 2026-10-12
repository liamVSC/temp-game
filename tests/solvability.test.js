const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../game-core.js");

test("all 5,000 level configurations have valid, distinct objectives and a viable move budget", () => {
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const config = C.levelConfig(level);
    assert.ok(config.moves >= 18 && config.moves <= 25, `level ${level} move budget`);
    assert.ok(config.targets.every(target => target.count > 0 && target.count <= 24), `level ${level} objective range`);
    assert.notEqual(config.targets[0].colour, config.targets[1].colour, `level ${level} objectives use distinct colours`);
  }
});

test("all 5,000 deterministic starting boards contain valid tiles and at least one playable move", () => {
  for (let level = 1; level <= C.MAX_LEVEL; level++) {
    const board = C.createBoard(level, level * 12345);
    assert.equal(board.length, C.ROWS * C.COLS, `level ${level} board dimensions`);
    assert.ok(board.every(tile => (Number.isInteger(tile) && tile >= 0 && tile < C.COLOURS) ||
      tile === "crate" || tile === "ice" || tile === "cracked-ice"), `level ${level} contains only supported tiles`);
    assert.ok(C.hasPlayableMove(board), `level ${level} has at least one playable move`);
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
