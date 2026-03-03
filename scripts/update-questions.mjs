/**
 * update-questions.mjs
 * Updates 10 question_bank rows from new JSON datasets.
 * Mapping: C_<CAT>_<0based_idx>  →  <CAT><1based_idx> (zero-padded to 2 digits)
 */

import { readFileSync } from "fs";
import mysql from "mysql2/promise";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

// Parse mysql://user:pass@host:port/db
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

// Load all four JSON files
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

// Targets: [category, 0-based index, itemId to update]
const targets = [
  ["FP", 0, "FP01"],
  ["FP", 5, "FP06"],
  ["TN", 1, "TN02"],
  ["TN", 4, "TN05"],
  ["FN", 0, "FN01"],
  ["FN", 6, "FN07"],
  ["FN", 8, "FN09"],
  ["TP", 5, "TP06"],
  ["TP", 8, "TP09"],
  ["TP", 3, "TP04"],
];

console.log("Starting question bank update...\n");

for (const [cat, idx, itemId] of targets) {
  const e = data[cat][idx];

  // Determine gtIsCorrect boolean
  const gtIsCorrect = e.gt_is_correct === true || e.gt_is_correct === 1 || e.gt_is_correct === "true";

  // sourceCondition: derived from category
  // FP/FN = AI answer wrong; TP/TN = AI answer right (from gtIsCorrect perspective)
  // But sourceCondition in original schema stores the category string
  const sourceCondition = cat;

  // Determine source dataset from unique_id
  const source = e.unique_id ? "MATH500" : "GSM8K";

  const [result] = await conn.execute(
    `UPDATE question_bank SET
      question = ?,
      goldAnswer = ?,
      extractedGoldAnswer = ?,
      response = ?,
      extractedResponseAnswer = ?,
      gtIsCorrect = ?,
      inferenceModel = ?,
      difficultyLevel = ?,
      subject = ?,
      uniqueId = ?,
      sourceCondition = ?,
      source = ?,
      figureUrl = NULL,
      countAO = 0,
      countAJ = 0
    WHERE itemId = ?`,
    [
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
      sourceCondition,
      source,
      itemId,
    ]
  );

  const affected = result.affectedRows;
  console.log(`✓ ${itemId} (C_${cat}_${idx}) → affected=${affected}`);
  console.log(`  question: ${e.question.substring(0, 80)}...`);
  console.log(`  gtIsCorrect: ${gtIsCorrect} | model: ${e.inference_model} | subject: ${e.subject}`);
  console.log();
}

await conn.end();
console.log("Done. All 10 questions updated.");
