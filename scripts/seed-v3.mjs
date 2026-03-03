/**
 * seed-v3.mjs
 * Builds v3 question bank:
 *   - 34 items identical in v1 and v2 → copied from v1
 *   - 6 items that differ (FN06, FP02, FP05, TN01, TN07, TN09) → copied from v2
 *   - GSM-CHECK → copied from v1
 */
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
function parseUrl(url) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: parseInt(u.port || "3306"),
    user: u.username,
    password: u.password,
    database: u.pathname.replace(/^\//, ""),
    ssl: { rejectUnauthorized: false },
  };
}

const conn = await mysql.createConnection(parseUrl(DB_URL));

// The 6 items that are new in v2 (use v2 version for these)
const V2_REPLACEMENTS = new Set(["FN06", "FP02", "FP05", "TN01", "TN07", "TN09"]);

// Delete any existing v3 rows first
const [del] = await conn.execute(`DELETE FROM question_bank WHERE version = 'v3'`);
console.log(`Cleared ${del.affectedRows} existing v3 rows.`);

// Fetch all v1 rows (including GSM-CHECK)
const [v1Rows] = await conn.execute(`SELECT * FROM question_bank WHERE version = 'v1'`);
// Fetch all v2 rows for the 6 replacement items
const placeholders = [...V2_REPLACEMENTS].map(() => "?").join(",");
const [v2Rows] = await conn.execute(
  `SELECT * FROM question_bank WHERE version = 'v2' AND itemId IN (${placeholders})`,
  [...V2_REPLACEMENTS]
);

const v2Map = {};
for (const r of v2Rows) v2Map[r.itemId] = r;

let inserted = 0;
const insertFields = `(itemId, version, category, source, question, goldAnswer, extractedGoldAnswer,
  response, extractedResponseAnswer, gtIsCorrect, inferenceModel,
  difficultyLevel, subject, uniqueId, sourceCondition, figureUrl, countAO, countAJ, targetCount)`;

for (const v1 of v1Rows) {
  // Decide source row
  const src = V2_REPLACEMENTS.has(v1.itemId) ? v2Map[v1.itemId] : v1;
  if (!src) {
    console.warn(`⚠ No source found for ${v1.itemId}, skipping`);
    continue;
  }

  await conn.execute(
    `INSERT INTO question_bank ${insertFields} VALUES (?, 'v3', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [
      v1.itemId, // always use v1's itemId
      src.category,
      src.source,
      src.question,
      src.goldAnswer,
      src.extractedGoldAnswer,
      src.response,
      src.extractedResponseAnswer,
      src.gtIsCorrect,
      src.inferenceModel,
      src.difficultyLevel,
      src.subject,
      src.uniqueId,
      src.sourceCondition,
      src.figureUrl,
      src.targetCount,
    ]
  );

  const tag = V2_REPLACEMENTS.has(v1.itemId) ? "★ FROM v2" : "  from v1";
  console.log(`${tag} | ${v1.itemId} (v3) | ${src.category} | model=${src.inferenceModel} | ${src.subject}`);
  inserted++;
}

await conn.end();
console.log(`\nDone. Total inserted: ${inserted} rows.`);
