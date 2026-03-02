/**
 * Script to initialize MIX group:
 * 1. Generate a valid invite token for MIX condition
 * 2. Generate 16 MIX sessions
 *
 * Run: node scripts/init-mix.mjs
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, sql, asc, and } from "drizzle-orm";
import { customAlphabet } from "nanoid";

const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 12);
const tokenId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 24);

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is not set");
  process.exit(1);
}

const db = drizzle(DATABASE_URL);

// Import schema inline (can't use TypeScript imports in .mjs)
// We'll use raw SQL queries instead

async function main() {
  console.log("Connecting to database...");
  
  // Check current state
  const [configs] = await db.execute(sql`SELECT condition, inviteToken, isOpen FROM experiment_config ORDER BY condition`);
  console.log("Current experiment_config:", configs);
  
  // Check MIX sessions
  const [mixCount] = await db.execute(sql`SELECT COUNT(*) as count FROM participant_sessions WHERE condition = 'MIX'`);
  console.log("Current MIX session count:", mixCount);
  
  // Step 1: Generate MIX invite token if empty
  const mixConfig = configs.find(c => c.condition === 'MIX');
  if (!mixConfig || !mixConfig.inviteToken) {
    const newToken = tokenId();
    console.log(`Generating MIX invite token: ${newToken}`);
    await db.execute(sql`UPDATE experiment_config SET inviteToken = ${newToken} WHERE condition = 'MIX'`);
    console.log("✓ MIX invite token generated");
  } else {
    console.log(`MIX invite token already exists: ${mixConfig.inviteToken}`);
  }
  
  // Step 2: Check if MIX sessions already exist
  const count = Number(mixCount[0]?.count ?? 0);
  if (count > 0) {
    console.log(`MIX sessions already exist (${count}). Skipping generation.`);
    console.log("To regenerate, use the admin dashboard with force=true.");
  } else {
    console.log("Generating 16 MIX sessions...");
    await generateMixSessions();
    console.log("✓ MIX sessions generated");
  }
  
  // Show final state
  const [finalConfigs] = await db.execute(sql`SELECT condition, inviteToken, isOpen FROM experiment_config ORDER BY condition`);
  console.log("\nFinal experiment_config:");
  for (const c of finalConfigs) {
    console.log(`  ${c.condition}: token=${c.inviteToken || '(empty)'}, isOpen=${c.isOpen}`);
  }
  
  const [finalMixCount] = await db.execute(sql`SELECT COUNT(*) as count FROM participant_sessions WHERE condition = 'MIX'`);
  console.log(`\nFinal MIX session count: ${finalMixCount[0]?.count}`);
  
  process.exit(0);
}

// ─── MIX Session Generation Logic ────────────────────────────────────────────
const CELLS = ["TP", "TN", "FP", "FN"];
const TEMPLATE_KEYS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
const QUOTA_MATRIX = {
  T1: [3, 4, 4, 4],
  T2: [3, 4, 4, 4],
  T3: [4, 3, 4, 4],
  T4: [4, 3, 4, 4],
  T5: [4, 4, 4, 3],
  T6: [4, 4, 4, 3],
  T7: [4, 4, 3, 4],
  T8: [4, 4, 3, 4],
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignCellToTemplates(items, quotas) {
  const MAX_RETRIES = 100;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shuffledItems = shuffle(items);
    const remaining = [...quotas];
    const assignment = new Map(TEMPLATE_KEYS.map((k) => [k, []]));
    let failed = false;
    for (const itemId of shuffledItems) {
      const eligible = TEMPLATE_KEYS.filter((_, i) => remaining[i] > 0);
      if (eligible.length < 3) { failed = true; break; }
      const sorted = shuffle(eligible).sort((a, b) => {
        const ia = TEMPLATE_KEYS.indexOf(a);
        const ib = TEMPLATE_KEYS.indexOf(b);
        return remaining[ib] - remaining[ia];
      });
      const chosen = sorted.slice(0, 3);
      for (const tk of chosen) {
        assignment.get(tk).push(itemId);
        remaining[TEMPLATE_KEYS.indexOf(tk)]--;
      }
    }
    if (!failed) return assignment;
  }
  return null;
}

async function generateMixSessions() {
  // Fetch all MATH500 items grouped by cell
  const [allItems] = await db.execute(sql`SELECT itemId, category FROM question_bank WHERE category != 'GSM-CHECK'`);
  const cellItems = { TP: [], TN: [], FP: [], FN: [] };
  for (const item of allItems) {
    if (item.category in cellItems) {
      cellItems[item.category].push(item.itemId);
    }
  }
  
  // Validate
  for (const cell of CELLS) {
    if (cellItems[cell].length !== 10) {
      throw new Error(`Expected 10 ${cell} items, found ${cellItems[cell].length}`);
    }
  }
  
  // Assign items to templates
  const templateItems = new Map(TEMPLATE_KEYS.map((k) => [k, []]));
  for (let ci = 0; ci < CELLS.length; ci++) {
    const cell = CELLS[ci];
    const quotas = TEMPLATE_KEYS.map((tk) => QUOTA_MATRIX[tk][ci]);
    const assignment = assignCellToTemplates(cellItems[cell], quotas);
    if (!assignment) throw new Error(`Failed to assign ${cell} items to templates`);
    for (const [tk, ids] of assignment.entries()) {
      templateItems.get(tk).push(...ids);
    }
  }
  
  const GSM_CHECK_ID = "GSM-CHECK";
  const createdIds = [];
  
  for (let ti = 0; ti < TEMPLATE_KEYS.length; ti++) {
    const tk = TEMPLATE_KEYS[ti];
    const templateId = ti + 1;
    const shuffledItems = shuffle(templateItems.get(tk));
    if (shuffledItems.length !== 15) {
      throw new Error(`Template ${tk} has ${shuffledItems.length} items, expected 15`);
    }
    
    // Generate AO/AJ mask: 8 AO + 7 AJ
    const maskArray = [...Array(8).fill("AO"), ...Array(7).fill("AJ")];
    const shuffledMask = shuffle(maskArray);
    
    const primaryItems = shuffledItems.map((itemId, idx) => ({ itemId, condition: shuffledMask[idx] }));
    const mirrorItems = shuffledItems.map((itemId, idx) => ({ itemId, condition: shuffledMask[idx] === "AO" ? "AJ" : "AO" }));
    
    const insertGsm = (items) => {
      const before = items.slice(0, 7);
      const after = items.slice(7);
      return [...before, { itemId: GSM_CHECK_ID, condition: "AJ" }, ...after];
    };
    
    const primaryFull = insertGsm(primaryItems);
    const mirrorFull = insertGsm(mirrorItems);
    
    // Insert template record
    await db.execute(sql`
      INSERT INTO mix_session_templates (templateId, items) 
      VALUES (${templateId}, ${JSON.stringify(primaryItems)})
    `);
    
    // Create primary session (slot 0)
    const primaryId = nanoid();
    await db.execute(sql`
      INSERT INTO participant_sessions 
      (participantId, \`condition\`, assignedItems, status, currentIndex, violationCount, consentGiven, mixTemplateId, mixSlot)
      VALUES (${primaryId}, 'MIX', ${JSON.stringify(primaryFull)}, 'consent', 0, 0, 0, ${templateId}, 0)
    `);
    createdIds.push(primaryId);
    
    // Create mirror session (slot 1)
    const mirrorId = nanoid();
    await db.execute(sql`
      INSERT INTO participant_sessions 
      (participantId, \`condition\`, assignedItems, status, currentIndex, violationCount, consentGiven, mixTemplateId, mixSlot)
      VALUES (${mirrorId}, 'MIX', ${JSON.stringify(mirrorFull)}, 'consent', 0, 0, 0, ${templateId}, 1)
    `);
    createdIds.push(mirrorId);
    
    // Update countAO/countAJ for items
    for (const item of primaryFull) {
      if (item.itemId === GSM_CHECK_ID) continue;
      if (item.condition === "AO") {
        await db.execute(sql`UPDATE question_bank SET countAO = countAO + 1 WHERE itemId = ${item.itemId}`);
      } else {
        await db.execute(sql`UPDATE question_bank SET countAJ = countAJ + 1 WHERE itemId = ${item.itemId}`);
      }
    }
    for (const item of mirrorFull) {
      if (item.itemId === GSM_CHECK_ID) continue;
      if (item.condition === "AO") {
        await db.execute(sql`UPDATE question_bank SET countAO = countAO + 1 WHERE itemId = ${item.itemId}`);
      } else {
        await db.execute(sql`UPDATE question_bank SET countAJ = countAJ + 1 WHERE itemId = ${item.itemId}`);
      }
    }
    
    console.log(`  Template T${templateId}: primary=${primaryId.slice(0,8)}, mirror=${mirrorId.slice(0,8)}`);
  }
  
  return createdIds;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
