import mysql from 'mysql2/promise';
import fs from 'fs';

const u = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || "3306"),
  user: u.username, password: u.password,
  database: u.pathname.replace(/^\//, ""), ssl: { rejectUnauthorized: false },
});

// Load all 4 v4 JSON files
const files = {
  FN: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_FN.json', 'utf8')).examples,
  FP: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_FP.json', 'utf8')).examples,
  TN: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TN.json', 'utf8')).examples,
  TP: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TP.json', 'utf8')).examples,
};

// v4 itemId → v3 itemId mapping
const v4ToV3Map = {};
for (let i = 1; i <= 10; i++) {
  const n = String(i).padStart(2, '0');
  if (i !== 5) v4ToV3Map[`FN${n}`] = `TN${n}`;
  v4ToV3Map[`FP${n}`] = `FN${n}`;
  if (i !== 5) v4ToV3Map[`TN${n}`] = `FP${n}`;
  if (i !== 1 && i !== 3) v4ToV3Map[`TP${n}`] = `TP${n}`;
}

// Load all v3 questions from DB (all fields)
const [v3rows] = await conn.execute(
  `SELECT itemId, category, question, goldAnswer, extractedGoldAnswer, response, 
          extractedResponseAnswer, gtIsCorrect, inferenceModel, difficultyLevel, 
          subject, uniqueId, sourceCondition, figureUrl
   FROM question_bank WHERE version = 'v3' ORDER BY itemId`
);
const v3ById = {};
for (const r of v3rows) v3ById[r.itemId] = r;

await conn.end();

// Build v4 items list
const v4Items = {};
for (const [cat, examples] of Object.entries(files)) {
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const v4Id = `${cat}${String(i + 1).padStart(2, '0')}`;
    v4Items[v4Id] = { ...ex, v4Id, category: cat };
  }
}

// Fields to compare (DB field → JSON field)
const fieldMap = [
  { db: 'extractedResponseAnswer', json: 'extracted_response_answer', label: 'extractedResponseAnswer' },
  { db: 'extractedGoldAnswer',     json: 'extracted_gold_answer',     label: 'extractedGoldAnswer' },
  { db: 'gtIsCorrect',             json: 'gt_is_correct',             label: 'gtIsCorrect' },
  { db: 'inferenceModel',          json: 'inference_model',           label: 'inferenceModel' },
  { db: 'difficultyLevel',         json: 'difficulty_level',          label: 'difficultyLevel' },
  { db: 'subject',                 json: 'subject',                   label: 'subject' },
  { db: 'uniqueId',                json: 'unique_id',                 label: 'uniqueId' },
  { db: 'figureUrl',               json: null,                        label: 'figureUrl (DB only)' },
];

const results = [];
const newItems = [];

for (const [v4Id, v4Item] of Object.entries(v4Items)) {
  const v3Id = v4ToV3Map[v4Id];
  if (!v3Id) { newItems.push(v4Id); continue; }
  const v3Item = v3ById[v3Id];
  if (!v3Item) { newItems.push(v4Id); continue; }

  const fieldDiffs = [];

  for (const f of fieldMap) {
    if (f.json === null) continue; // figureUrl is DB-only, skip comparison
    const v3Val = v3Item[f.db];
    const v4Val = v4Item[f.json];
    
    // Normalize for comparison
    const v3Str = v3Val === null || v3Val === undefined ? '' : String(v3Val).trim();
    const v4Str = v4Val === null || v4Val === undefined ? '' : String(v4Val).trim();
    
    if (v3Str !== v4Str) {
      fieldDiffs.push({ field: f.label, v3: v3Str, v4: v4Str });
    }
  }

  results.push({ v4Id, v3Id, hasDiff: fieldDiffs.length > 0, fieldDiffs });
}

// Print report
console.log('\n=== v3 vs v4 全字段对比报告（非 question/response 字段）===\n');

const noDiff = results.filter(r => !r.hasDiff);
const hasDiff = results.filter(r => r.hasDiff);

console.log(`✅ 所有字段完全相同: ${noDiff.length} 道`);
if (noDiff.length > 0) {
  console.log('   ' + noDiff.map(d => `${d.v4Id}(v3:${d.v3Id})`).join(', '));
}

console.log(`\n⚠️  有字段差异: ${hasDiff.length} 道`);
for (const d of hasDiff) {
  console.log(`\n  [${d.v4Id} ← v3:${d.v3Id}]`);
  for (const f of d.fieldDiffs) {
    console.log(`    ${f.field}: v3="${f.v3}" | v4="${f.v4}"`);
  }
}

console.log(`\n🆕 全新题目: ${newItems.length} 道: ${newItems.join(', ')}`);

// Also show figureUrl for all v3 items that have one
console.log('\n=== v3 中有 figureUrl 的题目 ===');
for (const r of v3rows) {
  if (r.figureUrl) {
    console.log(`  ${r.itemId}: ${r.figureUrl.slice(0, 80)}`);
  }
}

// Save
fs.writeFileSync('/home/ubuntu/v3_v4_all_fields_comparison.json', JSON.stringify({ noDiff, hasDiff, newItems }, null, 2));
console.log('\n详细结果已保存到: /home/ubuntu/v3_v4_all_fields_comparison.json');
