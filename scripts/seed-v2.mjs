/**
 * seed-v2.mjs
 * Inserts all 40 questions from the new JSON datasets as version='v2'.
 * Also copies the existing GSM-CHECK item from v1 into v2.
 * itemId format: FP01–FP10, TN01–TN10, FN01–FN10, TP01–TP10
 * (0-based index in JSON → 1-based suffix, zero-padded)
 */

import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

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

function loadExamples(cat) {
  const raw = JSON.parse(readFileSync(`/home/ubuntu/upload/new_clean_v_${cat}.json`, "utf8"));
  return raw.examples;
}

const data = {
  FP: loadExamples("FP"),
  TN: loadExamples("TN"),
  FN: loadExamples("FN"),
  TP: loadExamples("TP"),
};

// Verify each category has exactly 10 items
for (const [cat, items] of Object.entries(data)) {
  if (items.length !== 10) throw new Error(`Expected 10 ${cat} items, got ${items.length}`);
}

console.log("Inserting v2 question bank (40 items)...\n");

let inserted = 0;

for (const cat of ["FP", "TN", "FN", "TP"]) {
  const examples = data[cat];
  for (let idx = 0; idx < examples.length; idx++) {
    const e = examples[idx];
    const itemId = `${cat}${String(idx + 1).padStart(2, "0")}`; // FP01, FP02, ...
    const gtIsCorrect = e.gt_is_correct === true || e.gt_is_correct === 1 || e.gt_is_correct === "true";
    const source = e.unique_id ? "MATH500" : "GSM8K";

    const [result] = await conn.execute(
      `INSERT INTO question_bank
        (itemId, version, category, source, question, goldAnswer, extractedGoldAnswer,
         response, extractedResponseAnswer, gtIsCorrect, inferenceModel,
         difficultyLevel, subject, uniqueId, sourceCondition,
         figureUrl, countAO, countAJ, targetCount)
       VALUES (?, 'v2', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 0, 3)`,
      [
        itemId,
        cat,
        source,
        e.question,
        e.gold_answer ?? null,
        e.extracted_gold_answer ?? null,
        e.response ?? null,
        e.extracted_response_answer ?? null,
        gtIsCorrect ? 1 : 0,
        e.inference_model ?? null,
        e.difficulty_level ?? null,
        e.subject ?? null,
        e.unique_id ?? null,
        cat, // sourceCondition
      ]
    );

    inserted++;
    console.log(`✓ ${itemId} (v2) | ${cat} | gtIsCorrect=${gtIsCorrect} | model=${e.inference_model} | ${e.subject}`);
  }
}

// Copy GSM-CHECK from v1 to v2
console.log("\nCopying GSM-CHECK from v1 to v2...");
const [gsmRows] = await conn.execute(
  `SELECT * FROM question_bank WHERE itemId = 'GSM-CHECK' AND version = 'v1'`
);
if (gsmRows.length > 0) {
  const g = gsmRows[0];
  await conn.execute(
    `INSERT INTO question_bank
      (itemId, version, category, source, question, goldAnswer, extractedGoldAnswer,
       response, extractedResponseAnswer, gtIsCorrect, inferenceModel,
       difficultyLevel, subject, uniqueId, sourceCondition,
       figureUrl, countAO, countAJ, targetCount)
     VALUES ('GSM-CHECK', 'v2', 'GSM-CHECK', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    [
      g.source, g.question, g.goldAnswer, g.extractedGoldAnswer,
      g.response, g.extractedResponseAnswer, g.gtIsCorrect,
      g.inferenceModel, g.difficultyLevel, g.subject, g.uniqueId,
      g.sourceCondition, g.figureUrl, g.targetCount,
    ]
  );
  console.log("✓ GSM-CHECK (v2) copied from v1");
  inserted++;
}

await conn.end();
console.log(`\nDone. Total inserted: ${inserted} rows (40 questions + 1 GSM-CHECK).`);
