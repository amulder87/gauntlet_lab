import { mkdir, copyFile } from "node:fs/promises";

const publicDir = new URL("../public/", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);

await mkdir(distDir, { recursive: true });

for (const name of ["index.html", "styles.css", "gauntlet_lab_config.default.json"]) {
  await copyFile(new URL(name, publicDir), new URL(name, distDir));
}
