"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "dist");
const assets = ["index.html", "styles.css", "game.js", "game-core.js", "sw.js", "manifest.webmanifest", "icon.svg"];
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of assets) {
  const source = path.join(root, name);
  if (!fs.existsSync(source) || !fs.statSync(source).isFile()) throw new Error("Missing production asset: " + name);
  fs.copyFileSync(source, path.join(output, name));
}
const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
for (const reference of ["./styles.css", "./game-core.js", "./game.js", "./manifest.webmanifest"]) {
  if (!html.includes(reference)) throw new Error("Production HTML is missing asset reference: " + reference);
}
console.log("Production site built to dist/ (" + assets.length + " assets).");
