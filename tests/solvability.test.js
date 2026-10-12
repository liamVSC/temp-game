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
