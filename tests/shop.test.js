const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync(require.resolve("../index.html"), "utf8");
const css = fs.readFileSync(require.resolve("../styles.css"), "utf8");
const game = fs.readFileSync(require.resolve("../game.js"), "utf8");
const C = require("../game-core.js");

test("home wallet opens an accessible in-game shop dialog", () => {
  assert.match(html, /id="shop-button"[^>]*aria-label="Open shop/);
  assert.match(html, /class="shop-backdrop hidden" id="shop-backdrop"/);
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="shop-title"/);
  assert.match(html, /id="shop-title">Pop Shop/);
  assert.match(game, /\$\("shop-button"\)\?\.addEventListener\("click",openShop\)/);
  assert.match(game, /\$\("shop-close"\)\?\.addEventListener\("click",closeShop\)/);
  assert.match(game, /event\.key==="Escape"/);
});

test("shop offers all supported boosters at a consistent 25-coin price", () => {
  for (const type of ["rocket", "bomb", "shuffle"]) {
    assert.match(html, new RegExp('data-buy-booster="' + type + '"'));
    assert.match(html, new RegExp('id="shop-' + type + '-owned"'));
  }
  assert.equal((html.match(/🪙 25/g) || []).length, 3);
  assert.match(html, /id="shop-coins"/);
  assert.match(html, /id="shuffle-count"/);
  assert.match(game, /\["rocket","bomb","shuffle"\]\.forEach\(type=>/);
});

test("booster purchases check the balance and update saved inventory exactly once", () => {
  assert.match(game, /function buyShopBooster\(type\)/);
  assert.match(game, /if\(!\["rocket","bomb","shuffle"\]\.includes\(type\)\)return/);
  assert.match(game, /if\(\(progress\.coins\|\|0\)<25\)\{toast\("You need 25 coins for a booster\."\);return;\}progress\.coins-=25;progress\.boosters\[type\]=\(progress\.boosters\[type\]\|\|0\)\+1;save\(\)/);
  assert.match(game, /button\.disabled=\(progress\.coins\|\|0\)<25/);
  assert.match(game, /function renderShop\(\)/);
});

test("shop purchases use existing local coin progression and do not claim real-money support", () => {
  const progress = C.newProgress();
  const originalCoins = progress.coins;
  assert.equal(originalCoins, 50);
  progress.coins -= 25;
  progress.boosters.rocket += 1;
  assert.equal(progress.coins, 25);
  assert.equal(progress.boosters.rocket, 3);
  assert.deepEqual(C.sanitiseProgress(progress).boosters, progress.boosters);
  assert.match(html, /No real-money purchases are enabled/);
  assert.match(html, /daily puzzle/);
});

test("shop layout remains scrollable and usable on narrow mobile screens", () => {
  assert.match(css, /\.shop-backdrop\{position:fixed/);
  assert.match(css, /overflow-y:auto/);
  assert.match(css, /@media\(max-width:380px\)\{\.shop-panel/);
  assert.match(css, /\.shop-buy:disabled/);
  assert.match(css, /button:focus-visible/);
});
