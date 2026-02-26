# V-Norm Annotation Platform TODO

## Database & Backend
- [x] Design and push DB schema: sessions, items, responses, violations
- [x] Seed question bank from merged_dataset.json (41 items: TP01-10, TN01-10, FP01-10, FN01-10, GSM-CHECK)
- [x] API: create participant session (assign condition AO/AJ, sample 16 questions)
- [x] API: submit single item response (judgment, rt, helpfulness)
- [x] API: record violation event
- [x] API: get session progress (resume support)
- [x] API: experimenter dashboard data (all sessions, stats)
- [x] API: export data as JSON/CSV

## Participant Interface
- [x] Consent page (bilingual CN/EN)
- [x] Instruction page (AO vs AJ condition-specific)
- [x] Question display: AO mode (question + final answer only)
- [x] Question display: AJ mode (question + full response + final answer)
- [x] KaTeX math formula rendering in question/answer/response
- [x] Markdown rendering for response text
- [x] 3-minute per-question countdown timer
- [x] Answer submission (Correct / Incorrect radio)
- [x] AJ extra: helpfulness rating (1-5 scale)
- [x] Progress indicator (Q X of 16)
- [x] Session completion page
- [x] Session terminated page

## Anti-Cheat
- [x] Disable copy/paste/right-click/text selection
- [x] Detect tab/window blur (visibility change)
- [x] Detect screenshot attempt (PrintScreen key)
- [x] Auto-terminate session after 3 serious violations (tab_switch, screenshot_attempt)
- [x] Warn on 1st and 2nd serious violation (2 chances before termination)
- [x] Warn on minor violation (right_click, devtools_open)
- [x] Record all violation events to DB

## Experimenter Dashboard
- [x] Protected route (admin only)
- [x] Session list with status, condition, progress, violations, attention check
- [x] Per-item coverage stats (AO/AJ count per item_id)
- [x] Export all responses as CSV
- [x] Export all responses as JSON
- [x] Manual refresh button
- [x] Coverage bar chart by category (TP/TN/FP/FN)

## Data & Quality
- [x] GSM-CHECK attention check validation
- [x] Quota tracking per item (count_AO, count_AJ toward target=3)
- [x] Unique participant ID generation (anonymous, nanoid)

## Tests
- [x] 13 vitest tests passing (createSession, getSession, consent, start, submit, violations, dashboard)
- [x] Fix math formula rendering (LaTeX format unified to $$...$$)
- [x] Helpfulness changed to 5-option radio (no default, must select to proceed)
- [x] Admin backend at /admin (separate link, role-gated)
- [x] Experiment config management (quota per condition, open/close toggle)
- [x] Per-condition invite tokens + share links
- [x] Token validation on landing page (auto-assign condition)

## Optional / Future
- [ ] Resume from last position (mid-session recovery)
- [ ] Real-time dashboard refresh (polling/WebSocket)
- [ ] Expand question bank
- [x] 翻题时自动滚动到页面顶部
