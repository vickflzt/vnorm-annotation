/**
 * Seed script: import merged_dataset.json into question_bank table.
 * Run: node scripts/seed-questions.mjs
 */
import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const DATA_PATH = "/home/ubuntu/merged_dataset_fixed.json";

async function main() {
  const db = await createConnection(process.env.DATABASE_URL);
  console.log("Connected to database");

  const raw = readFileSync(DATA_PATH, "utf-8");
  const dataset = JSON.parse(raw);
  const examples = dataset.examples;

  console.log(`Seeding ${examples.length} questions...`);

  for (const ex of examples) {
    const sql = `
      INSERT INTO question_bank
        (itemId, category, source, question, goldAnswer, extractedGoldAnswer,
         response, extractedResponseAnswer, gtIsCorrect, inferenceModel,
         difficultyLevel, subject, uniqueId, sourceCondition, countAO, countAJ, targetCount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 3)
      ON DUPLICATE KEY UPDATE
        question = VALUES(question),
        response = VALUES(response),
        extractedResponseAnswer = VALUES(extractedResponseAnswer)
    `;

    await db.execute(sql, [
      ex.item_id,
      ex.category,
      ex.source,
      ex.question,
      ex.gold_answer ?? null,
      ex.extracted_gold_answer ?? null,
      ex.response ?? null,
      ex.extracted_response_answer ?? null,
      ex.gt_is_correct ? 1 : 0,
      ex.inference_model ?? null,
      ex.difficulty_level ?? null,
      ex.subject ?? null,
      ex.unique_id ?? null,
      ex.source_condition ?? null,
    ]);

    process.stdout.write(`  ✓ ${ex.item_id}\n`);
  }

  await db.end();
  console.log(`\nSeeding complete: ${examples.length} items inserted/updated.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
