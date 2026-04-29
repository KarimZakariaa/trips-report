const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

copyFile(path.join(root, "index.html"), path.join(dist, "index.html"));
copyFile(path.join(root, "styles.css"), path.join(dist, "styles.css"));
copyFile(path.join(root, "src", "app.js"), path.join(dist, "src", "app.js"));
copyFile(path.join(root, "src", "processor.js"), path.join(dist, "src", "processor.js"));
copyFile(
  path.join(root, "node_modules", "xlsx", "dist", "xlsx.full.min.js"),
  path.join(dist, "vendor", "xlsx.full.min.js")
);

fs.writeFileSync(path.join(dist, ".nojekyll"), "");

console.log(`GitHub Pages artifact created at ${dist}`);
