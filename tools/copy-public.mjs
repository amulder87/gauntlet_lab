import { mkdir, copyFile } from "node:fs/promises";
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
for (const name of ["index.html", "styles.css", "gauntlet_lab_config.default.json"]) {
  await copyFile(new URL(`../public/${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url));
}
