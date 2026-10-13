"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "../dist");
const mime = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json" };
async function main() {
  assert.ok(fs.existsSync(path.join(root, "index.html")), "run npm run build before browser smoke checks");
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    const relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
    const file = path.resolve(root, "." + relative);
    if (!file.startsWith(root + path.sep) && file !== path.join(root, "index.html")) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, data) => {
      if (error) { res.writeHead(404).end("Not found"); return; }
      res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width:390, height:844 }, deviceScaleFactor:3, isMobile:true, hasTouch:true });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("http://127.0.0.1:" + address.port + "/", { waitUntil:"networkidle" });
    await page.waitForSelector("#play-level-button");
    await page.click("#shop-button");
    await page.waitForSelector("#shop-backdrop:not(.hidden)");
    await page.click('[data-buy-booster="rocket"]');
    assert.equal(await page.locator("#shop-coins").innerText(), "25", "one purchase must deduct 25 coins");
    assert.equal(await page.locator("#shop-rocket-owned").innerText(), "3", "one purchase must add one rocket");
    await page.click("#shop-close");
    await page.click("#play-level-button");
    await page.waitForSelector("#game-screen:not(.hidden)");
    assert.equal(await page.locator("#board .tile").count(), 72, "the board must render all 72 tiles");
    assert.ok(await page.locator(".goal-chip").count() >= 2, "objectives must be visible");
    const widthCheck = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, board: document.querySelector("#board").getBoundingClientRect().toJSON() }));
    assert.ok(widthCheck.document <= widthCheck.viewport + 1, "390px viewport must not have horizontal overflow");
    assert.ok(widthCheck.board.left >= 0 && widthCheck.board.right <= widthCheck.viewport + 1, "board must fit within the mobile viewport");
    await page.click('[data-power="rocket"]');
    await page.waitForSelector("#board .tile.power-rocket");
    await page.reload({ waitUntil:"networkidle" });
    await page.waitForSelector("#game-screen:not(.hidden)");
    assert.ok(await page.locator("#board .tile.power-rocket").count() >= 1, "placed booster must survive reload");
    assert.equal(await page.locator("#coin-count").innerText(), "25", "coin balance must survive reload");
    assert.equal(await page.locator("#rocket-count").innerText(), "2", "placement must consume exactly one rocket");
    const movesBeforeActivation = Number(await page.locator("#moves-left").innerText());
    await page.locator("#board .tile.power-rocket").first().click();
    await page.waitForFunction(previous => Number(document.querySelector("#moves-left").textContent) === previous - 1
      && document.querySelectorAll("#board .tile.power-rocket").length === 0, movesBeforeActivation);
    assert.equal(await page.locator("#rocket-count").innerText(), "2", "activating a placed rocket must not consume a second booster");
    await page.reload({ waitUntil:"networkidle" });
    await page.waitForSelector("#game-screen:not(.hidden)");
    assert.equal(Number(await page.locator("#moves-left").innerText()), movesBeforeActivation - 1, "rocket activation move must survive reload");
    assert.equal(await page.locator("#rocket-count").innerText(), "2", "rocket inventory must remain stable after activation and reload");
    await context.close();
    const narrow = await browser.newContext({ viewport:{width:320,height:740}, deviceScaleFactor:2, isMobile:true, hasTouch:true, reducedMotion:"reduce" });
    const narrowPage = await narrow.newPage();
    narrowPage.on("pageerror", error => errors.push(error.message));
    await narrowPage.goto("http://127.0.0.1:" + address.port + "/", { waitUntil:"networkidle" });
    await narrowPage.click("#play-level-button");
    const narrowLayout = await narrowPage.evaluate(() => ({ viewport:innerWidth, document:document.documentElement.scrollWidth, board:document.querySelector("#board").getBoundingClientRect().toJSON() }));
    assert.ok(narrowLayout.document <= narrowLayout.viewport + 1, "320px viewport must not have horizontal overflow");
    assert.ok(narrowLayout.board.left >= 0 && narrowLayout.board.right <= narrowLayout.viewport + 1, "board must fit on narrow phones");
    await narrow.close();
    // Exercise terminal transitions through the real browser boot/restore path.
    const baseProgress = {
      unlocked: 1, coins: 50, levels: {}, boosters: { rocket: 2, bomb: 1, shuffle: 1 },
      sound: true, vibration: true,
      daily: { date: "", completed: false, streak: 0, lastCompleted: "", bestScore: 0 },
      achievements: {}, stats: { pops: 0, wins: 0, levelsCompleted: 0, tilesCleared: 0 }
    };
    const settledBoard = Array(72).fill(0);
    const winningContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const winningPage = await winningContext.newPage();
    winningPage.on("pageerror", error => errors.push(error.message));
    await winningPage.addInitScript(({ savedProgress, savedRun }) => {
      localStorage.setItem("pop-party-save-v1", JSON.stringify(savedProgress));
      localStorage.setItem("pop-party-run-v1", JSON.stringify(savedRun));
    }, {
      savedProgress: baseProgress,
      savedRun: { level: 1, board: settledBoard, moves: 12, score: 300,
        collected: { 0: 8, 3: 5 }, seed: 12345, mode: "level", dailyDate: "" }
    });
    await winningPage.goto("http://127.0.0.1:" + address.port + "/", { waitUntil: "networkidle" });
    await winningPage.waitForFunction(() => !document.querySelector("#modal-backdrop").classList.contains("hidden"));
    assert.equal(await winningPage.locator("#modal-title").innerText(), "LEVEL COMPLETE!", "restored completed objectives must trigger one win");
    assert.equal(await winningPage.locator("#coin-count").innerText(), "63", "first-clear reward must be credited once");
    assert.equal(await winningPage.locator("#home-level-number").innerText(), "2", "winning must unlock the next level");
    await winningPage.reload({ waitUntil: "networkidle" });
    await winningPage.waitForSelector("#home-screen:not(.hidden)");
    assert.equal(await winningPage.locator("#coin-count").innerText(), "63", "reloading after a win must not duplicate the reward");
    assert.ok(await winningPage.locator("#modal-backdrop.hidden").count() === 1, "completed run must not reopen the win modal");
    await winningContext.close();

    const losingContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const losingPage = await losingContext.newPage();
    losingPage.on("pageerror", error => errors.push(error.message));
    await losingPage.addInitScript(({ savedProgress, savedRun }) => {
      localStorage.setItem("pop-party-save-v1", JSON.stringify(savedProgress));
      localStorage.setItem("pop-party-run-v1", JSON.stringify(savedRun));
    }, {
      savedProgress: baseProgress,
      savedRun: { level: 1, board: settledBoard, moves: 0, score: 120,
        collected: { 0: 0, 3: 0 }, seed: 54321, mode: "level", dailyDate: "" }
    });
    await losingPage.goto("http://127.0.0.1:" + address.port + "/", { waitUntil: "networkidle" });
    await losingPage.waitForFunction(() => !document.querySelector("#modal-backdrop").classList.contains("hidden"));
    assert.equal(await losingPage.locator("#modal-title").innerText(), "OUT OF MOVES", "restored exhausted run must trigger loss");
    assert.equal(await losingPage.locator("#coin-count").innerText(), "50", "loss must not grant a level reward");
    await losingPage.reload({ waitUntil: "networkidle" });
    await losingPage.waitForSelector("#home-screen:not(.hidden)");
    assert.equal(await losingPage.locator("#coin-count").innerText(), "50", "reloading after a loss must not alter coins");
    assert.ok(await losingPage.locator("#modal-backdrop.hidden").count() === 1, "finished losing run must not reopen the loss modal");
    await losingContext.close();

    assert.deepEqual(errors, [], "browser pages must not throw JavaScript errors");
    console.log("Mobile browser smoke passed at 390px and 320px: shop purchase, booster placement, reload persistence, objectives, board fit, win/loss restore and reward idempotency, and no page errors.");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
