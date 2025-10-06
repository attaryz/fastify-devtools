const fs = require("node:fs");
const path = require("node:path");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const s = path.join(src, name);
    const d = path.join(dest, name);
    const st = fs.statSync(s);
    if (st.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const srcDir = path.resolve(__dirname, "..", "src", "views");
const destDir = path.resolve(__dirname, "..", "dist", "views");
copyDir(srcDir, destDir);
console.log("Copied views to", destDir);
