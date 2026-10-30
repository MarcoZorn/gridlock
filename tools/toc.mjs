// Rewrites the table of contents of docs/NOTEBOOK.md (between the toc markers)
// from its ## and ### headings:  node tools/toc.mjs
import fs from "node:fs";
const f = "docs/NOTEBOOK.md", A = "<!-- toc -->", B = "<!-- /toc -->";
let s = fs.readFileSync(f, "utf8"), fence = false;
const slugs = new Map();
const rows = [];
for (const l of s.slice(s.includes(B) ? s.indexOf(B) + B.length : 0).split("\n")) {
  if (l.startsWith("```")) fence = !fence;
  const m = !fence && /^(##|###) (.+)/.exec(l);
  if (!m) continue;
  let slug = m[2].toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, "").replace(/ /g, "-");
  const n = slugs.get(slug) || 0; slugs.set(slug, n + 1);
  if (n) slug += "-" + n;   // GitHub's duplicate suffix
  rows.push(`${m[1] === "##" ? "" : "  "}- [${m[2]}](#${slug})`);
}
const toc = `${A}\n${rows.join("\n")}\n${B}`;
if (s.includes(A)) s = s.replace(new RegExp(`${A}[\\s\\S]*?${B}`), () => toc);
else s = s.replace(/\n\n/, () => `\n\n${toc}\n\n`);   // after the title line
fs.writeFileSync(f, s);
console.log(rows.length, "entries");
