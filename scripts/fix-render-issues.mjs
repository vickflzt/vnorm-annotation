/**
 * fix-render-issues.mjs
 * 1. Strip [asy]...[/asy] blocks from FN09 (v1, v3), FN04 (v2), FN10 (v2)
 * 2. Convert \begin{tabular} to Markdown table in TN07 (v2, v3)
 */
import mysql from "mysql2/promise";

const u = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || "3306"),
  user: u.username, password: u.password,
  database: u.pathname.replace(/^\//, ""), ssl: { rejectUnauthorized: false },
});

function stripAsy(text) {
  return text.replace(/\s*\[asy\][\s\S]*?\[\/asy\]/gi, "").trim();
}

// ── Fix 1: FN09 (v1, v3) ──
const [[fn09v1]] = await conn.execute(
  `SELECT question, figureUrl FROM question_bank WHERE itemId='FN09' AND version='v1'`
);
const fn09Clean = stripAsy(fn09v1.question);
await conn.execute(
  `UPDATE question_bank SET question=? WHERE itemId='FN09' AND version IN ('v1','v3')`,
  [fn09Clean]
);
console.log("✓ FN09 (v1, v3): [asy] stripped. figureUrl:", fn09v1.figureUrl || "NULL");
console.log("  Clean question:", fn09Clean.substring(0, 120));

// ── Fix 2: FN04 (v2) ──
const [[fn04v2]] = await conn.execute(
  `SELECT question FROM question_bank WHERE itemId='FN04' AND version='v2'`
);
const fn04Clean = stripAsy(fn04v2.question);
await conn.execute(
  `UPDATE question_bank SET question=? WHERE itemId='FN04' AND version='v2'`,
  [fn04Clean]
);
console.log("✓ FN04 (v2): [asy] stripped.");
console.log("  Clean question:", fn04Clean.substring(0, 120));

// ── Fix 3: FN10 (v2) ──
const [[fn10v2]] = await conn.execute(
  `SELECT question FROM question_bank WHERE itemId='FN10' AND version='v2'`
);
const fn10Clean = stripAsy(fn10v2.question);
await conn.execute(
  `UPDATE question_bank SET question=? WHERE itemId='FN10' AND version='v2'`,
  [fn10Clean]
);
console.log("✓ FN10 (v2): [asy] stripped.");
console.log("  Clean question:", fn10Clean.substring(0, 120));

// ── Fix 4: TN07 (v2, v3) ──
const tn07Markdown = `For the eight counties listed below, what was the median number of students in $2005?$

| County | 2001 | 2002 | 2003 | 2004 | 2005 |
|---|---|---|---|---|---|
| Aiken | 124 | 141 | 130 | 143 | 136 |
| Bamberg | 17 | 15 | 15 | 14 | 11 |
| Barnwell | 25 | 22 | 26 | 28 | 29 |
| Berkeley | 583 | 557 | 554 | 553 | 524 |
| Calhoun | 15 | 12 | 10 | 18 | 11 |
| Cherokee | 19 | 13 | 18 | 13 | 19 |
| Chesterfield | 46 | 18 | 13 | 22 | 29 |
| Colleton | 64 | 49 | 52 | 46 | 41 |`;

await conn.execute(
  `UPDATE question_bank SET question=? WHERE itemId='TN07' AND version IN ('v2','v3')`,
  [tn07Markdown]
);
console.log("✓ TN07 (v2, v3): \\begin{tabular} → Markdown table");

// ── Verify: re-scan all questions ──
console.log("\n── Post-fix scan ──");
const [rows] = await conn.execute(
  `SELECT itemId, version, question FROM question_bank WHERE category != 'GSM-CHECK'`
);
const patterns = [
  { name: "[asy]",              re: /\[asy\]/i },
  { name: "\\begin{tabular}",   re: /\\begin\{tabular\}/i },
  { name: "size()/defaultpen()",re: /\bsize\s*\(|defaultpen\s*\(/ },
  { name: "\\includegraphics",  re: /\\includegraphics/i },
  { name: "\\begin{tikzpicture}",re: /\\begin\{tikzpicture\}/i },
];
let issues = 0;
for (const r of rows) {
  for (const p of patterns) {
    if (p.re.test(r.question || "")) {
      console.log(`  ⚠ ${p.name} still in ${r.itemId} (${r.version})`);
      issues++;
    }
  }
}
if (issues === 0) console.log("  ✓ All question texts are clean.");

await conn.end();
