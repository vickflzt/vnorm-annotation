/**
 * regen-mix-alternating.mjs
 * Self-contained script: resets all MIX sessions and regenerates 15 new ones.
 * New design (v2):
 *   - 15 sessions, each with 16 math questions (8 AJ + 8 AO, AJ-first) + 1 GSM-CHECK = 17 total
 *   - All sessions start with AJ: AJ,AO,AJ,AO,...
 *   - GSM-CHECK randomly inserted at any AJ position (extra item, does not replace math)
 *   - Each math question appears 3 times as AJ + 3 times as AO across all 15 sessions
 */
import mysql from "mysql2/promise";

const u = new URL(process.env.DATABASE_URL);
const conn = await mysql.createConnection({
  host: u.hostname, port: parseInt(u.port || "3306"),
  user: u.username, password: u.password,
  database: u.pathname.replace(/^\//, ""), ssl: { rejectUnauthorized: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function nanoid(size = 12) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < size; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Assign items to sessions with balanced coverage.
 * Each item appears exactly perItem times total, each session gets perSession items.
 * Uses greedy least-used-first approach with randomization.
 */
function assignCategoryToSessions(items, nSessions, perSession, perItem, maxRetries = 500) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const counts = new Map(items.map(id => [id, 0]));
    const sessions = [];
    let valid = true;
    for (let si = 0; si < nSessions; si++) {
      const available = items.filter(id => counts.get(id) < perItem);
      const shuffled = shuffle(available);
      shuffled.sort((a, b) => counts.get(a) - counts.get(b));
      const chosen = shuffled.slice(0, perSession);
      if (chosen.length < perSession || new Set(chosen).size < perSession) {
        valid = false;
        break;
      }
      for (const id of chosen) counts.set(id, counts.get(id) + 1);
      sessions.push(chosen);
    }
    if (valid) return sessions;
  }
  return null;
}

const CELLS = ["TP", "TN", "FP", "FN"];
const N_SESSIONS = 15;
const MATH_PER_SESSION = 16; // 8 AJ + 8 AO
const version = 'v3';

// ── Step 1: Reset MIX sessions ────────────────────────────────────────────────
const [mixSessions] = await conn.execute(`SELECT participantId FROM participant_sessions WHERE \`condition\`='MIX'`);
if (mixSessions.length > 0) {
  const pids = mixSessions.map(r => r.participantId);
  await conn.execute(`DELETE FROM item_responses WHERE participantId IN (${pids.map(() => "?").join(",")})`, pids);
  await conn.execute(`DELETE FROM violation_events WHERE participantId IN (${pids.map(() => "?").join(",")})`, pids);
}
await conn.execute(`DELETE FROM participant_sessions WHERE \`condition\`='MIX'`);
await conn.execute(`DELETE FROM mix_session_templates`);
console.log(`✓ Cleared ${mixSessions.length} existing MIX sessions`);

// ── Step 2: Fetch question bank ───────────────────────────────────────────────
const [allItems] = await conn.execute(
  `SELECT itemId, category FROM question_bank WHERE version=? AND category != 'GSM-CHECK'`,
  [version]
);
const cellItems = { TP: [], TN: [], FP: [], FN: [] };
for (const item of allItems) {
  if (item.category in cellItems) cellItems[item.category].push(item.itemId);
}
for (const cell of CELLS) {
  if (cellItems[cell].length !== 10) throw new Error(`Expected 10 ${cell} items, found ${cellItems[cell].length}`);
}
console.log("✓ Fetched question bank:", Object.entries(cellItems).map(([k,v]) => `${k}:${v.length}`).join(", "));

// ── Step 3: Assign items to sessions ──────────────────────────────────────────
// 4 items per session per category, each item appears 6 times (3 AJ + 3 AO)
// 15 sessions × 4 = 60 = 10 items × 6 appearances ✓
const sessionCategoryItems = Array.from({ length: N_SESSIONS }, () => ({ TP: [], TN: [], FP: [], FN: [] }));

for (const cell of CELLS) {
  const assignment = assignCategoryToSessions(cellItems[cell], N_SESSIONS, 4, 6);
  if (!assignment) throw new Error(`Failed to assign ${cell} items to sessions`);
  for (let si = 0; si < N_SESSIONS; si++) {
    sessionCategoryItems[si][cell] = assignment[si];
  }
}

// ── Step 4: Generate sessions ─────────────────────────────────────────────────
const GSM_CHECK_ID = "GSM-CHECK";
const createdIds = [];

for (let si = 0; si < N_SESSIONS; si++) {
  const mathItems = [];
  for (const cell of CELLS) mathItems.push(...sessionCategoryItems[si][cell]);
  if (mathItems.length !== MATH_PER_SESSION) throw new Error(`Session ${si} has ${mathItems.length} items`);

  const shuffled = shuffle(mathItems);
  // AJ-first alternating: even indices = AJ, odd = AO
  const mathAssigned = shuffled.map((itemId, idx) => ({
    itemId,
    condition: idx % 2 === 0 ? "AJ" : "AO",
  }));

  // Insert GSM-CHECK at a random AJ position (even index 0,2,4,...,14)
  const ajPositions = [0, 2, 4, 6, 8, 10, 12, 14];
  const gsmInsertPos = ajPositions[Math.floor(Math.random() * ajPositions.length)];
  const fullItems = [
    ...mathAssigned.slice(0, gsmInsertPos),
    { itemId: GSM_CHECK_ID, condition: "AJ" },
    ...mathAssigned.slice(gsmInsertPos),
  ];

  const templateId = si + 1;
  await conn.execute(
    `INSERT INTO mix_session_templates (templateId, items) VALUES (?, ?)`,
    [templateId, JSON.stringify(mathAssigned)]
  );

  const participantId = nanoid();
  await conn.execute(
    `INSERT INTO participant_sessions (participantId, \`condition\`, assignedItems, status, currentIndex, violationCount, consentGiven, mixTemplateId, mixSlot)
     VALUES (?, 'MIX', ?, 'consent', 0, 0, 0, ?, 0)`,
    [participantId, JSON.stringify(fullItems), templateId]
  );
  createdIds.push(participantId);
}

console.log(`✓ Generated ${createdIds.length} MIX sessions`);

// ── Step 5: Verify ────────────────────────────────────────────────────────────
const [rows] = await conn.execute(
  `SELECT participantId, mixTemplateId, assignedItems 
   FROM participant_sessions WHERE \`condition\`='MIX' 
   ORDER BY mixTemplateId LIMIT 5`
);

console.log("\nSample verification (first 5 sessions):");
for (const r of rows) {
  const items = typeof r.assignedItems === 'string' ? JSON.parse(r.assignedItems) : r.assignedItems;
  const aoCount = items.filter(i => i.condition === "AO").length;
  const ajCount = items.filter(i => i.condition === "AJ").length;
  const gsmIdx = items.findIndex(i => i.itemId === "GSM-CHECK");
  const gsmCondition = items[gsmIdx]?.condition;
  console.log(`  T${r.mixTemplateId}: total=${items.length}, AO=${aoCount}, AJ=${ajCount}, first=${items[0].condition}, GSM@idx=${gsmIdx}(${gsmCondition})`);
}

// Verify each math item appears exactly 6 times across all sessions
const [allSessions] = await conn.execute(
  `SELECT assignedItems FROM participant_sessions WHERE \`condition\`='MIX'`
);
const itemCounts = {};
for (const s of allSessions) {
  const items = typeof s.assignedItems === 'string' ? JSON.parse(s.assignedItems) : s.assignedItems;
  for (const item of items) {
    if (item.itemId !== GSM_CHECK_ID) {
      itemCounts[item.itemId] = (itemCounts[item.itemId] || 0) + 1;
    }
  }
}
const counts = Object.values(itemCounts);
const minCount = Math.min(...counts);
const maxCount = Math.max(...counts);
console.log(`\n✓ Math item coverage: min=${minCount}, max=${maxCount} (expected 6 each)`);
if (minCount === 6 && maxCount === 6) {
  console.log("✓ All 40 math items appear exactly 6 times (3 AJ + 3 AO)");
} else {
  console.log("⚠ Coverage mismatch!");
}

await conn.end();
console.log("\nDone.");
