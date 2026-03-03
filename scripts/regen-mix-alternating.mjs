/**
 * regen-mix-alternating.mjs
 * Self-contained script: resets all MIX sessions and regenerates 16 new ones
 * using strict alternating AO/AJ mask (primary slot 0: AO-first, mirror slot 1: AJ-first).
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

// Template structure (same as server/db.ts)
const TEMPLATE_KEYS = ["T1","T2","T3","T4","T5","T6","T7","T8"];
const CELLS = ["TP","TN","FP","FN"];
// Quota matrix: TEMPLATE_KEYS × CELLS [TP,TN,FP,FN] → how many items from each cell per template
// Each cell has 10 items, each item appears in exactly 3 templates (10×3=30 total slots per cell)
const QUOTA_MATRIX = {
  T1: [3,4,4,4], T2: [3,4,4,4], T3: [4,3,4,4], T4: [4,3,4,4],
  T5: [4,4,4,3], T6: [4,4,4,3], T7: [4,4,3,4], T8: [4,4,3,4],
};

function assignCellToTemplates(items, quotas) {
  const MAX_RETRIES = 100;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const shuffledItems = shuffle(items);
    const remaining = [...quotas];
    const assignment = new Map(TEMPLATE_KEYS.map(k => [k, []]));
    let failed = false;
    for (const itemId of shuffledItems) {
      const eligible = TEMPLATE_KEYS.filter((_, i) => remaining[i] > 0);
      if (eligible.length < 3) { failed = true; break; }
      const sorted = shuffle(eligible).sort((a, b) => {
        return remaining[TEMPLATE_KEYS.indexOf(b)] - remaining[TEMPLATE_KEYS.indexOf(a)];
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

// ── Step 1: Reset MIX sessions ────────────────────────────────────────────────
// Delete item_responses for MIX sessions
const [mixSessions] = await conn.execute(`SELECT participantId FROM participant_sessions WHERE condition='MIX'`);
if (mixSessions.length > 0) {
  const pids = mixSessions.map(r => r.participantId);
  await conn.execute(`DELETE FROM item_responses WHERE participantId IN (${pids.map(() => "?").join(",")})`, pids);
  await conn.execute(`DELETE FROM violation_events WHERE participantId IN (${pids.map(() => "?").join(",")})`, pids);
}
await conn.execute(`DELETE FROM participant_sessions WHERE condition='MIX'`);
await conn.execute(`DELETE FROM mix_session_templates`);
console.log(`✓ Cleared ${mixSessions.length} existing MIX sessions`);

// ── Step 2: Fetch question bank (v1 only, same as server) ─────────────────────
const [allItems] = await conn.execute(
  `SELECT itemId, category FROM question_bank WHERE version='v3' AND category != 'GSM-CHECK'`
);
const cellItems = { TP: [], TN: [], FP: [], FN: [] };
for (const item of allItems) {
  if (item.category in cellItems) cellItems[item.category].push(item.itemId);
}
for (const cell of CELLS) {
  if (cellItems[cell].length !== 10) throw new Error(`Expected 10 ${cell} items, found ${cellItems[cell].length}`);
}
console.log("✓ Fetched question bank:", Object.entries(cellItems).map(([k,v]) => `${k}:${v.length}`).join(", "));

// ── Step 3: Assign items to templates ─────────────────────────────────────────
const templateItems = new Map(TEMPLATE_KEYS.map(k => [k, []]));
for (let ci = 0; ci < CELLS.length; ci++) {
  const cell = CELLS[ci];
  const quotas = TEMPLATE_KEYS.map(tk => QUOTA_MATRIX[tk][ci]);
  const assignment = assignCellToTemplates(cellItems[cell], quotas);
  if (!assignment) throw new Error(`Failed to assign ${cell} items`);
  for (const [tk, ids] of assignment.entries()) templateItems.get(tk).push(...ids);
}

// ── Step 4: Generate sessions with strict alternating mask ────────────────────
const GSM_CHECK_ID = "GSM-CHECK";
const createdIds = [];

for (let ti = 0; ti < TEMPLATE_KEYS.length; ti++) {
  const tk = TEMPLATE_KEYS[ti];
  const templateId = ti + 1;

  const shuffledItems = shuffle(templateItems.get(tk));
  if (shuffledItems.length !== 15) throw new Error(`Template ${tk} has ${shuffledItems.length} items`);

  // Strict alternating mask: AO,AJ,AO,AJ,... (15 items → 8 AO + 7 AJ)
  const mask = Array.from({ length: 15 }, (_, i) => i % 2 === 0 ? "AO" : "AJ");

  // Primary (slot 0): AO-first
  const primaryItems = shuffledItems.map((itemId, idx) => ({ itemId, condition: mask[idx] }));
  // Mirror (slot 1): invert → AJ-first
  const mirrorItems = shuffledItems.map((itemId, idx) => ({
    itemId, condition: mask[idx] === "AO" ? "AJ" : "AO",
  }));

  // Append GSM-CHECK at the end (position 16) for both slots
  // Slot 0: 15 math items (AO,AJ,AO,...,AO) + GSM-CHECK(AJ) = 8 AO + 8 AJ
  // Slot 1: 15 math items (AJ,AO,AJ,...,AJ) + GSM-CHECK(AJ) = 7 AO + 9 AJ
  const appendGsm = (items) => [...items, { itemId: GSM_CHECK_ID, condition: "AJ" }];

  const primaryFull = appendGsm(primaryItems);
  const mirrorFull  = appendGsm(mirrorItems);

  // Persist template
  await conn.execute(
    `INSERT INTO mix_session_templates (templateId, items) VALUES (?, ?)`,
    [templateId, JSON.stringify(primaryItems)]
  );

  // Create primary session (slot 0)
  const primaryId = nanoid();
  await conn.execute(
    `INSERT INTO participant_sessions (participantId, \`condition\`, assignedItems, status, currentIndex, violationCount, consentGiven, mixTemplateId, mixSlot)
     VALUES (?, 'MIX', ?, 'consent', 0, 0, 0, ?, 0)`,
    [primaryId, JSON.stringify(primaryFull), templateId]
  );
  createdIds.push(primaryId);

  // Create mirror session (slot 1)
  const mirrorId = nanoid();
  await conn.execute(
    `INSERT INTO participant_sessions (participantId, \`condition\`, assignedItems, status, currentIndex, violationCount, consentGiven, mixTemplateId, mixSlot)
     VALUES (?, 'MIX', ?, 'consent', 0, 0, 0, ?, 1)`,
    [mirrorId, JSON.stringify(mirrorFull), templateId]
  );
  createdIds.push(mirrorId);
}

console.log(`✓ Generated ${createdIds.length} MIX sessions`);

// ── Step 5: Verify ────────────────────────────────────────────────────────────
const [rows] = await conn.execute(
  `SELECT participantId, mixTemplateId, mixSlot, assignedItems 
   FROM participant_sessions WHERE condition='MIX' 
   ORDER BY mixTemplateId, mixSlot LIMIT 6`
);

console.log("\nSample verification (first 3 templates):");
for (const r of rows) {
  const items = JSON.parse(r.assignedItems);
  const seq = items.map(i => i.condition[0]).join(""); // A=AO, A=AJ → use first char
  const seqFull = items.map(i => i.condition).join(",");
  const aoCount = items.filter(i => i.condition === "AO").length;
  const ajCount = items.filter(i => i.condition === "AJ").length;
  console.log(`  T${r.mixTemplateId} Slot${r.mixSlot}: first=${items[0].condition}, AO=${aoCount}, AJ=${ajCount}`);
  console.log(`    Sequence: ${seqFull}`);
}

await conn.end();
console.log("\nDone.");
