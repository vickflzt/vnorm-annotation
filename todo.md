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
- [x] 单题超时改为弹窗警告，不自动提交，被试可继续作答
- [x] 修复解题过程中裸 LaTeX 环境（align*, pmatrix 等）未渲染问题（已通过代码审查和 tokenizer 逻辑验证）
- [x] 优化含图题占位提示文字 → 统一为纯英文："This problem originally contained a geometric diagram which has been omitted and cannot be displayed."

## 图形图片支持
- [x] 上传5张几何图片到S3，获取CDN URL
- [x] 数据库 question_bank 表新增 figureUrl 字段并迁移
- [x] 将各题图片URL写入数据库（FN01/FN04/FN09/FN10/TN07）
- [x] 前端 QuestionPage 在题目下方渲染图片（替换占位符文本）

## Bug 修复
- [x] 修复 MathRenderer 内联公式渲染问题：改进斜体正则，避免数学乘号 * 被误判为 Markdown 格式符
- [ ] 修复首页 "Failed to fetch" API Mutation 错误（发生在 /?from_webdev=1，管理员用户）
- [x] 从5道含图题（FN01/FN04/FN09/FN10/TN07）的 question 字段中删除图形占位符文本
- [x] 修复 MathRenderer：$$...$$ 块级公式与后续行内文字混排时未正确分割渲染（预处理拆分逻辑）
