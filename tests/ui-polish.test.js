const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../styles.css"), "utf8");
const game = fs.readFileSync(require.resolve("../game.js"), "utf8");

test("all primary screens and overlays retain their expected UI hooks", () => {
  for (const id of ["home-screen", "game-screen", "board", "goals", "daily-card", "achievement-list", "shop-backdrop", "modal-backdrop", "toast"]) {
    assert.match(html, new RegExp('id="' + id + '"'), "missing UI hook: " + id);
  }
  assert.match(html, /aria-label="Home"/);
  assert.match(html, /aria-label="Game"/);
  assert.match(html, /role="dialog" aria-modal="true"/);
});

test("the visual polish pass covers the home, gameplay, shop and settings UI", () => {
  for (const selector of [
    ".home-screen", ".daily-card", ".achievement-card", ".home-play-button",
    ".game-hud", ".goal-chip", ".board-wrap", ".tile:focus-visible",
    ".powerup", ".modal", ".setting-row", ".shop-panel", ".shop-item", ".toast"
  ]) {
    assert.ok(css.includes(selector), "missing polished UI selector: " + selector);
  }
  assert.match(css, /--ui-panel-raised/);
  assert.match(css, /text-wrap:balance/);
});

test("interactive controls keep visible focus states and usable touch targets", () => {
  assert.match(css, /\.shop-buy:focus-visible/);
  assert.match(css, /\.powerup:focus-visible/);
  assert.match(css, /\.tile:focus-visible/);
  assert.match(css, /min-height:48px/);
  assert.match(css, /min-height:54px/);
  assert.match(css, /overscroll-behavior:contain/);
});

test("layout handles narrow phones, touch-only devices and reduced motion", () => {
  assert.match(css, /@media\(max-width:380px\)/);
  assert.match(css, /@media\(hover:none\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /max-width:calc\(100vw - 28px\)/);
});

test("settings and shop interactions remain wired to the existing saved game state", () => {
  assert.match(game, /function settings\(\)/);
  assert.match(game, /progress\.sound=\$\("setting-sound"\)\.checked/);
  assert.match(game, /progress\.vibration=\$\("setting-vibration"\)\.checked/);
  assert.match(game, /function buyShopBooster\(type\)/);
  assert.match(game, /save\(\);updateHud\(\);renderHome\(\);renderShop\(\)/);
});
