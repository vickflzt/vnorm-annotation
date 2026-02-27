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
- [x] 修复 MathRenderer：含 \$ 转义字符的题目（如 superfactorial $n\$$ 和 $4\$$）渲染错误，\$$ 被误识别为块级公式分隔符（添加 findUnescapedDoubleDollar 跳过转义）
- [x] 修复 MathRenderer：response 中多行块级公式（$$\n\begin{vmatrix}...\end{vmatrix}\n$$）未正确渲染（修复多行块级公式收集逻辑：只有独立的 $$ 行才结束块）
- [x] 新增被试编号输入功能：知情同意后插入编号输入页面，保存到数据库 participantCode 字段，CSV/JSON 导出包含该字段，15/15 测试通过
- [x] 修复 LLM Response 区域行内/块级公式过长溢出容器、无法横向滚动的问题（CSS min-w-0 + overflow-x:auto + overflow-wrap:break-word）
- [x] 修复 FN05 渲染错误：直接修正数据库中 question（向量改为行内 $...$ 格式）和 response（align* 用 $$ 包裹，换行符修正）
- [x] FN05 数据库内容已正确（前端 React Query 缓存问题，被试刷新页面即可）
- [x] FP05 response 渲染错误：Step 2 的 underbrace 公式改为独立块级 $$...$$，消除不配对 $ 导致的文字粘连乱码
- [x] 修改判断区域英文副标题为 "Please judge based on the information shown above"
- [x] 删除 QuestionPage 中 QUESTION 旁边的蓝色类别标签（subject badge），所有题目均不显示
- [x] 强化知情同意页面复选框：视觉突出（amber 边框）+ 未勾选点击继续时红色闪烁 + 行内错误提示 + 整个区域可点击
- [x] 新增置信度评分功能：每道题判断后在同一页面内展示 1-5 分评分区块，所有题目所有实验组必填，数据保存到 confidenceRating 字段，CSV/JSON 导出包含，15/15 测试通过
- [x] 重构 QuestionPage 为两阶段：阶段一（题目+判断，3min计时）→ 继续按钮 → 阶段二（helpfulness/confidence，1min计时），判断区域冻结，两阶段反应时分别收集（rtSeconds / confidenceRtSeconds），15/15 测试通过
- [x] 修复阶段二提交失败无法跳转下一题的 bug（确认为测试时切换标签页触发反作弊终止会话导致，正式实验不会出现）
- [x] 新增练习模块：1道练习题（AO/AJ各版本）+ 两阶段流程 + 提醒横幅 + AJ Response 旁标注 + 练习完成确认界面，数据不写入数据库，15/15 测试通过
- [x] PracticeCompletePage 中两条提醒文字（判断锁定、无法回看）改为红色
- [x] 首页实验组标签简化为"AJ"/"AO"，弱化视觉样式（灰色圆角胶小标签）
- [x] 置信度评分选项去掉数字，直接显示中英文标签（英文在上中文在下），字号粗细颜色统一
- [x] 修改计时规则：超时后继续计时；阶段一180s弹窗+继续，240s自动fail跳题；阶段二60s弹窗+继续，90s自动fail提交
