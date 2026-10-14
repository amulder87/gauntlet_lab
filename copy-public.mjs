import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";

const publicDir = new URL("../public/", import.meta.url);
const distDir = new URL("../dist/", import.meta.url);

await mkdir(distDir, { recursive: true });

for (const name of ["index.html", "gauntlet_lab_config.default.json"]) {
  await copyFile(new URL(name, publicDir), new URL(name, distDir));
}

function minifyCss(css) {
  let out = "";
  let quote = null;
  let pendingSpace = false;
  const punctuation = new Set(["{", "}", ":", ";", ","]);

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    const next = css[i + 1];

    if (!quote && ch === "/" && next === "*") {
      i += 2;
      while (i < css.length && !(css[i] === "*" && css[i + 1] === "/")) i += 1;
      i += 1;
      pendingSpace = true;
      continue;
    }

    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < css.length) {
        out += css[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      if (pendingSpace && out && !punctuation.has(out[out.length - 1])) out += " ";
      pendingSpace = false;
      quote = ch;
      out += ch;
      continue;
    }

    if (/\s/.test(ch)) {
      pendingSpace = true;
      continue;
    }

    if (punctuation.has(ch)) {
      while (out.endsWith(" ")) out = out.slice(0, -1);
      out += ch;
      pendingSpace = false;
      continue;
    }

    if (pendingSpace && out && !punctuation.has(out[out.length - 1])) out += " ";
    pendingSpace = false;
    out += ch;
  }

  return out.trim();
}

const css = await readFile(new URL("styles.css", publicDir), "utf8");
await writeFile(new URL("styles.css", distDir), minifyCss(css));
