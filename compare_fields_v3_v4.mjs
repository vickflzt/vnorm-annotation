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

// v4 itemId → v3 itemId mapping (from previous comparison)
// v4 FN01-10 → v3 TN01-10 (except FN05 is new)
// v4 FP01-10 → v3 FN01-10
// v4 TN01-10 → v3 FP01-10 (except TN05 is new)
// v4 TP01-10 → v3 TP01-10 (TP01, TP03 are new)
const v4ToV3Map = {};
for (let i = 1; i <= 10; i++) {
  const n = String(i).padStart(2, '0');
  if (i !== 5) v4ToV3Map[`FN${n}`] = `TN${n}`; // FN05 is new
  v4ToV3Map[`FP${n}`] = `FN${n}`;
  if (i !== 5) v4ToV3Map[`TN${n}`] = `FP${n}`; // TN05 is new
  if (i !== 1 && i !== 3) v4ToV3Map[`TP${n}`] = `TP${n}`; // TP01, TP03 are new
}

// Load all v3 questions from DB
const [v3rows] = await conn.execute(
  `SELECT itemId, category, question, response, extractedResponseAnswer, difficultyLevel, subject 
   FROM question_bank WHERE version = 'v3' ORDER BY itemId`
);
const v3ById = {};
for (const r of v3rows) v3ById[r.itemId] = r;

await conn.end();

// Build v4 items list (40 items, indexed by v4 itemId)
const v4Items = {};
for (const [cat, examples] of Object.entries(files)) {
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const v4Id = `${cat}${String(i + 1).padStart(2, '0')}`;
    v4Items[v4Id] = { ...ex, v4Id, category: cat };
  }
}

// Compare fields for matched items
const diffs = [];
const newItems = [];

for (const [v4Id, v4Item] of Object.entries(v4Items)) {
  const v3Id = v4ToV3Map[v4Id];
  if (!v3Id) {
    newItems.push(v4Id);
    continue;
  }
  const v3Item = v3ById[v3Id];
  if (!v3Item) {
    newItems.push(v4Id);
    continue;
  }

  const fieldDiffs = [];

  // Compare question text
  const v4Q = v4Item.question.replace(/\s+/g, ' ').trim();
  const v3Q = v3Item.question.replace(/\s+/g, ' ').trim();
  if (v4Q !== v3Q) {
    fieldDiffs.push({
      field: 'question',
      v3: v3Q.slice(0, 100),
      v4: v4Q.slice(0, 100),
      same_start: v3Q.slice(0, 50) === v4Q.slice(0, 50),
    });
  }

  // Compare response
  const v4R = v4Item.response.replace(/\s+/g, ' ').trim();
  const v3R = v3Item.response.replace(/\s+/g, ' ').trim();
  if (v4R !== v3R) {
    fieldDiffs.push({
      field: 'response',
      v3_preview: v3R.slice(0, 80),
      v4_preview: v4R.slice(0, 80),
      same_start: v3R.slice(0, 50) === v4R.slice(0, 50),
    });
  }

  // Compare extracted answer
  const v4A = (v4Item.extracted_response_answer || '').trim();
  const v3A = (v3Item.extractedResponseAnswer || '').trim();
  if (v4A !== v3A) {
    fieldDiffs.push({ field: 'extractedAnswer', v3: v3A, v4: v4A });
  }

  // Compare difficulty level
  if (v4Item.difficulty_level !== v3Item.difficultyLevel) {
    fieldDiffs.push({ field: 'difficultyLevel', v3: v3Item.difficultyLevel, v4: v4Item.difficulty_level });
  }

  // Compare subject
  if ((v4Item.subject || '') !== (v3Item.subject || '')) {
    fieldDiffs.push({ field: 'subject', v3: v3Item.subject, v4: v4Item.subject });
  }

  diffs.push({
    v4Id,
    v3Id,
    hasDiff: fieldDiffs.length > 0,
    fieldDiffs,
  });
}

// Print summary
console.log('\n=== v3 vs v4 字段对比报告（28道匹配题目）===\n');

const noDiff = diffs.filter(d => !d.hasDiff);
const hasDiff = diffs.filter(d => d.hasDiff);

console.log(`✅ 字段完全相同（仅 itemId/category 不同）: ${noDiff.length} 道`);
if (noDiff.length > 0) {
  console.log('   ' + noDiff.map(d => `${d.v4Id}(←v3:${d.v3Id})`).join(', '));
}

console.log(`\n⚠️  有字段差异: ${hasDiff.length} 道`);
for (const d of hasDiff) {
  console.log(`\n  [${d.v4Id} ← v3:${d.v3Id}]`);
  for (const f of d.fieldDiffs) {
    if (f.field === 'question' || f.field === 'response') {
      console.log(`    字段: ${f.field}`);
      console.log(`      v3: ${f.v3_preview || f.v3}`);
      console.log(`      v4: ${f.v4_preview || f.v4}`);
      console.log(`      开头相同: ${f.same_start}`);
    } else {
      console.log(`    字段: ${f.field} | v3=${f.v3} | v4=${f.v4}`);
    }
  }
}

console.log(`\n🆕 全新题目 (v3中不存在): ${newItems.length} 道: ${newItems.join(', ')}`);

// Save detailed results
fs.writeFileSync('/home/ubuntu/v3_v4_field_comparison.json', JSON.stringify({ noDiff, hasDiff, newItems }, null, 2));
console.log('\n详细结果已保存到: /home/ubuntu/v3_v4_field_comparison.json');
