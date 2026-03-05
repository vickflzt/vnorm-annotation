import mysql from 'mysql2/promise';
import fs from 'fs';

const u = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || "3306"),
  user: u.username, password: u.password,
  database: u.pathname.replace(/^\//, ""), ssl: { rejectUnauthorized: false },
});

// Load all 4 JSON files
const files = {
  FN: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_FN.json', 'utf8')),
  FP: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_FP.json', 'utf8')),
  TN: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TN.json', 'utf8')),
  TP: JSON.parse(fs.readFileSync('/home/ubuntu/upload/new_clean_TP.json', 'utf8')),
};

// Load all v3 questions from DB
const [v3rows] = await conn.execute(
  `SELECT itemId, category, question, extractedResponseAnswer FROM question_bank WHERE version = 'v3' ORDER BY category, itemId`
);

// Build v3 lookup by question keyword (first 80 chars)
const v3Map = new Map();
for (const r of v3rows) {
  const key = r.question.slice(0, 80).replace(/\s+/g, ' ').trim();
  v3Map.set(key, r);
}

// Also build by unique_id for cross-reference
const results = [];
let newItemCounter = { FN: 1, FP: 1, TN: 1, TP: 1 };

for (const [cat, fileData] of Object.entries(files)) {
  const examples = fileData.examples;
  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i];
    const qKey = ex.question.slice(0, 80).replace(/\s+/g, ' ').trim();
    
    // Try to find in v3 by question text
    let matchedV3 = null;
    for (const [k, v] of v3Map.entries()) {
      if (k === qKey || ex.question.slice(0, 60) === v.question.slice(0, 60)) {
        matchedV3 = v;
        break;
      }
    }
    
    // Expected v4 itemId (sequential within category)
    const expectedId = `${cat}${String(i + 1).padStart(2, '0')}`;
    
    results.push({
      v4_index: i + 1,
      v4_expected_id: expectedId,
      category: cat,
      question_preview: ex.question.slice(0, 80).replace(/\n/g, ' '),
      answer: ex.extracted_response_answer,
      correct: ex.gt_is_correct,
      unique_id: ex.unique_id,
      // v3 match info
      v3_match: matchedV3 ? matchedV3.itemId : null,
      v3_category: matchedV3 ? matchedV3.category : null,
      id_matches: matchedV3 ? (matchedV3.itemId === expectedId) : null,
      status: matchedV3 
        ? (matchedV3.itemId === expectedId ? '✅ 完全匹配' : `⚠️ 内容相同但ID不同(v3=${matchedV3.itemId})`)
        : '🆕 新题目',
    });
  }
}

await conn.end();

// Print comparison table
console.log('\n=== v4 题库 vs v3 题库 对比报告 ===\n');
console.log(`${'v4编号'.padEnd(8)} ${'分类'.padEnd(4)} ${'v3匹配'.padEnd(12)} ${'状态'.padEnd(30)} ${'题目预览(前60字)'.padEnd(60)}`);
console.log('-'.repeat(130));

for (const r of results) {
  const v3info = r.v3_match || '(无)';
  console.log(`${r.v4_expected_id.padEnd(8)} ${r.category.padEnd(4)} ${v3info.padEnd(12)} ${r.status.padEnd(30)} ${r.question_preview.slice(0, 60)}`);
}

// Summary
const matched = results.filter(r => r.v3_match && r.id_matches);
const sameContentDiffId = results.filter(r => r.v3_match && !r.id_matches);
const newItems = results.filter(r => !r.v3_match);

console.log('\n=== 汇总 ===');
console.log(`总题数: ${results.length}`);
console.log(`✅ 完全匹配 (ID和内容均相同): ${matched.length}`);
console.log(`⚠️ 内容相同但ID不同: ${sameContentDiffId.length}`);
if (sameContentDiffId.length > 0) {
  for (const r of sameContentDiffId) {
    console.log(`   - v4 ${r.v4_expected_id} → v3中是 ${r.v3_match} (${r.v3_category})`);
  }
}
console.log(`🆕 全新题目 (v3中不存在): ${newItems.length}`);
if (newItems.length > 0) {
  for (const r of newItems) {
    console.log(`   - ${r.v4_expected_id}: ${r.question_preview.slice(0, 60)}`);
  }
}

// Save to file
fs.writeFileSync('/home/ubuntu/v4_vs_v3_comparison.json', JSON.stringify(results, null, 2), 'utf8');
console.log('\n详细结果已保存到: /home/ubuntu/v4_vs_v3_comparison.json');
