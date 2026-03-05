/**
 * Insert v4 question bank:
 * - 28 questions copied from v3 with new itemId/category per v4 standard
 * - 4 new questions from JSON files (FN05, TN05, TP01, TP03)
 * - figureUrl preserved where applicable
 */
import mysql from 'mysql2/promise';
import fs from 'fs';

const u = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || "3306"),
  user: u.username, password: u.password,
  database: u.pathname.replace(/^\//, ""), ssl: { rejectUnauthorized: false },
});

// ── 1. Load v3 questions from DB ──────────────────────────────────────────────
const [v3rows] = await conn.execute(
  `SELECT * FROM question_bank WHERE version = 'v3' ORDER BY itemId`
);
const v3ById = {};
for (const r of v3rows) v3ById[r.itemId] = r;

// ── 2. v4 itemId → v3 itemId mapping ─────────────────────────────────────────
// FN01-10 → TN01-10 (except FN05 is new)
// FP01-10 → FN01-10
// TN01-10 → FP01-10 (except TN05 is new)
// TP01-10 → TP01-10 (except TP01, TP03 are new)
const v4ToV3 = {};
for (let i = 1; i <= 10; i++) {
  const n = String(i).padStart(2, '0');
  if (i !== 5) v4ToV3[`FN${n}`] = `TN${n}`;
  v4ToV3[`FP${n}`] = `FN${n}`;
  if (i !== 5) v4ToV3[`TN${n}`] = `FP${n}`;
  if (i !== 1 && i !== 3) v4ToV3[`TP${n}`] = `TP${n}`;
}

// figureUrl mapping: after renaming, which v4 itemId gets which figureUrl
// v3 FN04 → v4 FP04, v3 FN09 → v4 FP09, v3 FN10 → v4 FP10
const figureUrlOverride = {};
for (const [v4Id, v3Id] of Object.entries(v4ToV3)) {
  const v3Item = v3ById[v3Id];
  if (v3Item && v3Item.figureUrl) {
    figureUrlOverride[v4Id] = v3Item.figureUrl;
  }
}
console.log('figureUrl will be carried over for:', Object.keys(figureUrlOverride));

// ── 3. Load new questions from JSON files ─────────────────────────────────────
const fnExamples = JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_FN.json', 'utf8')).examples;
const tnExamples = JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TN.json', 'utf8')).examples;
const tpExamples = JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TP.json', 'utf8')).examples;

// FN05 is index 4 (0-based) in FN file
const newFN05 = fnExamples[4];
// TN05 is index 4 in TN file
const newTN05 = tnExamples[4];
// TP01 is index 0 in TP file
const newTP01 = tpExamples[0];
// TP03 is index 2 in TP file
const newTP03 = tpExamples[2];

const newItems = {
  FN05: { ...newFN05, category: 'FN' },
  TN05: { ...newTN05, category: 'TN' },
  TP01: { ...newTP01, category: 'TP' },
  TP03: { ...newTP03, category: 'TP' },
};

// Verify new items
for (const [id, item] of Object.entries(newItems)) {
  console.log(`New ${id}: "${item.question.slice(0, 60)}" | correct=${item.gt_is_correct}`);
}

// ── 4. Delete existing v4 rows (clean slate) ──────────────────────────────────
const [delResult] = await conn.execute(`DELETE FROM question_bank WHERE version = 'v4'`);
console.log(`\nDeleted ${delResult.affectedRows} existing v4 rows`);

// ── 5. Insert 28 copied questions ─────────────────────────────────────────────
let inserted = 0;
for (const [v4Id, v3Id] of Object.entries(v4ToV3)) {
  const v3 = v3ById[v3Id];
  if (!v3) {
    console.warn(`WARNING: v3 item ${v3Id} not found in DB!`);
    continue;
  }

  // Determine v4 category from v4Id prefix
  const v4Cat = v4Id.replace(/\d+$/, '');

  await conn.execute(
    `INSERT INTO question_bank 
     (itemId, category, source, question, goldAnswer, extractedGoldAnswer, response, 
      extractedResponseAnswer, gtIsCorrect, inferenceModel, difficultyLevel, subject, 
      uniqueId, sourceCondition, countAO, countAJ, targetCount, figureUrl, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 3, ?, 'v4')`,
    [
      v4Id,
      v4Cat,
      v3.source || 'v3_renamed',
      v3.question,
      v3.goldAnswer,
      v3.extractedGoldAnswer,
      v3.response,
      v3.extractedResponseAnswer,
      v3.gtIsCorrect,  // keep 0/1 as-is
      v3.inferenceModel,
      v3.difficultyLevel,
      v3.subject,
      v3.uniqueId,
      v3.sourceCondition,
      figureUrlOverride[v4Id] || null,
    ]
  );
  inserted++;
}
console.log(`\nInserted ${inserted} copied questions from v3`);

// ── 6. Insert 4 new questions ─────────────────────────────────────────────────
for (const [v4Id, item] of Object.entries(newItems)) {
  const v4Cat = v4Id.replace(/\d+$/, '');
  await conn.execute(
    `INSERT INTO question_bank 
     (itemId, category, source, question, goldAnswer, extractedGoldAnswer, response,
      extractedResponseAnswer, gtIsCorrect, inferenceModel, difficultyLevel, subject,
      uniqueId, sourceCondition, countAO, countAJ, targetCount, figureUrl, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 3, NULL, 'v4')`,
    [
      v4Id,
      v4Cat,
      'v4_new',
      item.question,
      item.gold_answer || null,
      item.extracted_gold_answer || null,
      item.response,
      item.extracted_response_answer || null,
      item.gt_is_correct ? 1 : 0,
      item.inference_model || null,
      item.difficulty_level || null,
      item.subject || null,
      item.unique_id || null,
      item.sourceCondition || null,
    ]
  );
  inserted++;
}
console.log(`Inserted 4 new questions`);

// ── 7. Verify ─────────────────────────────────────────────────────────────────
const [v4rows] = await conn.execute(
  `SELECT itemId, category, gtIsCorrect, difficultyLevel, subject, 
          CASE WHEN figureUrl IS NOT NULL THEN 'YES' ELSE 'no' END as hasFigure
   FROM question_bank WHERE version = 'v4' ORDER BY category, itemId`
);

console.log(`\n=== v4 题库验证 (${v4rows.length} 道题) ===`);
console.log(`${'itemId'.padEnd(8)} ${'cat'.padEnd(4)} ${'correct'.padEnd(8)} ${'diff'.padEnd(5)} ${'figure'.padEnd(7)} subject`);
console.log('-'.repeat(70));
for (const r of v4rows) {
  console.log(`${r.itemId.padEnd(8)} ${r.category.padEnd(4)} ${String(r.gtIsCorrect).padEnd(8)} ${String(r.difficultyLevel).padEnd(5)} ${r.hasFigure.padEnd(7)} ${r.subject || ''}`);
}

// Category counts
const catCounts = {};
for (const r of v4rows) catCounts[r.category] = (catCounts[r.category] || 0) + 1;
console.log('\nCategory counts:', catCounts);

// gtIsCorrect distribution by category
const correctBycat = {};
for (const r of v4rows) {
  if (!correctBycat[r.category]) correctBycat[r.category] = { correct: 0, wrong: 0 };
  if (r.gtIsCorrect) correctBycat[r.category].correct++;
  else correctBycat[r.category].wrong++;
}
console.log('\ngtIsCorrect by category:');
for (const [cat, counts] of Object.entries(correctBycat)) {
  console.log(`  ${cat}: correct=${counts.correct}, wrong=${counts.wrong}`);
}

await conn.end();
console.log('\n✅ v4 题库插入完成！');
