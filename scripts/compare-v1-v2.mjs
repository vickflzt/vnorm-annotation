/**
 * compare-v1-v2.mjs
 * Detailed comparison of v1 vs v2 question bank.
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

const [rows] = await conn.execute(`
  SELECT itemId, version, category, gtIsCorrect, inferenceModel, subject,
         uniqueId, question
  FROM question_bank
  WHERE category != 'GSM-CHECK'
  ORDER BY itemId, version
`);

// Group by itemId
const byItem = {};
for (const r of rows) {
  if (!byItem[r.itemId]) byItem[r.itemId] = {};
  byItem[r.itemId][r.version] = r;
}

const results = [];

for (const [itemId, versions] of Object.entries(byItem)) {
  const v1 = versions["v1"];
  const v2 = versions["v2"];
  if (!v1 || !v2) continue;

  const sameQuestion = v1.uniqueId === v2.uniqueId;
  const sameModel = v1.inferenceModel === v2.inferenceModel;
  const sameSubject = v1.subject === v2.subject;

  // Classify change type
  let changeType;
  if (sameQuestion && sameModel) {
    changeType = "完全相同";
  } else if (sameQuestion && !sameModel) {
    changeType = "同题换模型";
  } else {
    changeType = "全新题目";
  }

  results.push({ itemId, changeType, v1, v2, sameQuestion, sameModel, sameSubject });
}

// Summary counts
const byType = {};
for (const r of results) {
  byType[r.changeType] = (byType[r.changeType] || 0) + 1;
}

console.log("\n========================================");
console.log("v1 vs v2 题库对比汇总");
console.log("========================================");
for (const [type, cnt] of Object.entries(byType)) {
  console.log(`  ${type}: ${cnt} 道`);
}
console.log(`  总计: ${results.length} 道`);

// Print all items in a table
console.log("\n========================================");
console.log("逐题对比明细");
console.log("========================================");
console.log("itemId | 类别 | 变化类型 | v1模型 | v2模型 | v1学科 | v2学科 | v1题目ID | v2题目ID");
console.log("-".repeat(120));

for (const { itemId, changeType, v1, v2 } of results) {
  const flag = changeType === "完全相同" ? "  " : changeType === "同题换模型" ? "△ " : "★ ";
  console.log(
    `${flag}${itemId.padEnd(6)} | ${v1.category.padEnd(4)} | ${changeType.padEnd(8)} | ` +
    `${(v1.inferenceModel || "").padEnd(12)} | ${(v2.inferenceModel || "").padEnd(12)} | ` +
    `${(v1.subject || "").padEnd(24)} | ${(v2.subject || "").padEnd(24)} | ` +
    `${(v1.uniqueId || "").padEnd(36)} | ${(v2.uniqueId || "")}`
  );
}

// Print full new questions
const newItems = results.filter(r => r.changeType === "全新题目");
if (newItems.length > 0) {
  console.log("\n========================================");
  console.log(`全新题目详情 (${newItems.length} 道)`);
  console.log("========================================");
  for (const { itemId, v1, v2 } of newItems) {
    console.log(`\n[${itemId}] 类别: ${v1.category}`);
    console.log(`  v1 | model=${v1.inferenceModel} | ${v1.subject}`);
    console.log(`     题目: ${v1.question.substring(0, 150)}`);
    console.log(`  v2 | model=${v2.inferenceModel} | ${v2.subject}`);
    console.log(`     题目: ${v2.question.substring(0, 150)}`);
  }
}

await conn.end();
