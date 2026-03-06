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
- [x] 计时器显示改为正计时（显示已用时间），不显示倒计时
- [x] 所有页面中英文顺序统一：英文在前（上），中文在后（下）
- [x] 更新知情同意书页面中英文内容为最新版本
- [x] 新增 MIX 实验组：schema 更新（MIX condition、assignedItems 改为对象数组）
- [x] MIX 模板生成算法：8模板配额矩阵+受约束随机分配+AO/AJ掩码
- [x] MIX session 创建逻辑：预先生成 16个固定 session，题目级 condition 传递
- [x] 前端 QuestionPage 支持题目级 itemCondition
- [x] 管理后台 MIX 组配额管理、手动触发生成、刷新配额功能
- [x] 后台看板新增 MIX 组专属区域（覆盖率统计、session 列表）
- [x] MIX 组生成独立邀请链接（token 机制）
- [x] 修复 MIX 组点击知情同意书"同意并开始"后无反应的 bug（claimMixSession 原子操作）
## V3 题库迁移
- [x] MIX session 严格交替 AO/AJ 顺序（Slot0 AO开头，Slot1 AJ开头），GSM-CHECK 固定第16题
- [x] 删除 FN04/FN09/FN10 中的 Asymptote [asy] 绘图代码，TN07 tabular 转 Markdown 表格
- [x] 上传 FN09 三角形图片到 CDN，更新 figureUrl（v1/v2/v3）
- [x] 插入 v3 题库（41道：34道来自v1，6道来自v2替换，1道GSM-CHECK）
- [x] experiment_config 表新增 questionVersion 字段（默认 v1）
- [x] db.ts 所有题目查询函数加 version 参数过滤
- [x] routers.ts 读取 questionVersion 并传递给查询函数
- [x] 将三个条件（AO/AJ/MIX）的 questionVersion 设为 v3
- [x] 用 v3 题库重新生成 16 个 MIX sessions（15/15 测试通过）
## MIX 组重构（AJ开头 + GSM随机插入 + 动态配额）
- [x] 重新设计配额矩阵：15套×16道数学题（8 AJ + 8 AO），满足每题每条件 3 次重复
- [x] generateMixSessions：所有session均AJ开头（AJ,AO,AJ,AO...），GSM-CHECK随机插入任意AJ位置，每套17题
- [x] 移除 slot 取反逻辑，mixSlot 保留但语义为 0
- [x] 实现 generateExtraMixSessions：超出15套后可继续生成额外session（使用当前最低count的题目）
- [x] 更新管理后台：添加“+5 额外 Session”按钮实现动态扩展
- [x] 更新 vitest 测试覆盖新逻辑，17/17 测试通过
- [x] 重新生成数据库中 15 个 MIX sessions，验证所有 40 题各出现 6 次（3 AJ + 3 AO）
## MathRenderer 修复
- [x] 修复 \[...\] 和 \(...\) 块级/行内公式未渲染问题（转换为 $$...$$ 和 $...$），17/17 测试通过
## UI 细节修复
- [x] 隐藏被试界面题目卡片右上角的题目编号（如 FP05）
## V4 题库生成
- [x] 全字段对比 v3 与 v4 JSON 文件（question/response/extractedAnswer/difficulty/subject/gtIsCorrect 等）
- [x] 确认 v3 与 v4 除 itemId/category 和 gtIsCorrect 格式外无实质差异
- [x] 插入 v4 题库（28道从v3复制重命名 + 4道新题 FN05/TN05/TP01/TP03）
- [x] figureUrl 正确转移到 FP04/FP09/FP10
- [x] 切换 experiment_config 三个条件到 v4
- [x] 重新生成 15 套 MIX sessions（v4题库，全部验证通过）
## MIX 组 Bug 修复
- [x] 修复 MIX 组第 15 题后白屏问题（mix_session_templates 存储 fullItems 而非 mathAssigned）
- [x] 修复 GSM-CHECK 题目未出现问题（插入 GSM-CHECK v4 题库记录）
## MathRenderer 裸 LaTeX 环境修复
- [x] 修复 \begin{align*}...\end{align*} 等裸 LaTeX 环境未渲染问题（在 normalizeLatexDelimiters 中自动包裹为 $$...$$）
## GSM-CHECK 注意力检测逻辑修复
- [x] 修复 GSM-CHECK 通过判断逻辑：选 false（AI 回答错误）才算通过，而非选 true
## MIX 套题单独管理功能
- [x] 后端 API：releaseMixSession（清空记录+分配新 participantId，可供新被试认领）
- [x] 后端 API：resetMixSession（清空记录+保留被试ID，被试可用原链接重新作答）
- [x] 管理后台 UI：MIX 套题列表每行显示“重置”和“释放”按钮，带确认对话框和操作说明
## LaTeX pmatrix 渲染错误修复
- [x] 修复 tokeniseInline 中行内公式跨单行换行被截断的问题（仅在空行 \n\n 时才中断）
- [x] 从 BLOCK_ENVS 移除 pmatrix/bmatrix/matrix/array 等矩阵环境，防止行内公式中的矩阵被错误升级为块级
## LaTeX 渲染错误修复（第二批）
- [x] 修复 \( \) 正则匹配错误：使用 /\\\\\(((?:[^\\\\]|\\\\[^)])*?)\\\\\)/g 正确匹配单反斜杠+括号
- [x] 修复 align* 等块级环境后紧跟非数学内容（如 #### 2.0）被包进 $$ 导致 KaTeX 报错的问题
## LaTeX 渲染错误修复（第三批）
- [x] 重构 buildHtml 预处理：先全局提取所有 $$...$$ 块（包括跨行的 pmatrix）为占位符，再按行处理，解决行内文本中嵌入跨行 $$ 块无法渲染的问题
- [x] #### 标题已由之前的 align* trailing 修复处理（分离到新行）
## 渲染测试组（PREVIEW）
- [x] 后端 API：preview.getAllQuestions 公开接口，返回所有题目 AJ 数据，支持按 version 过滤
- [x] 前端渲染测试页面 /preview：展示题目 AJ 格式，点击下一题翻页，可按类型/版本过滤，无数据收集
- [x] 管理后台实验配置 Tab 添加渲染测试组入口卡片，支持直接打开和复制链接
## LaTeX 渲染错误修复（第四批）
- [x] 修复 normalizeLatexDelimiters：新增 Step A 处理 "$$\n\begin{env}...\end{env}\n$$" 格式（LLM 输出中 $$ 和 \begin{env} 分行存储），防止 Step B 重复包裹导致 $$$$ 嵌套渲染失败
## LaTeX 渲染错误修复（第五批）
- [x] 修复 isMathOnly 模式：先经过 normalizeLatexDelimiters 转换 \( \) 和 \[ \]，再判断是否含 $，解决 extractedResponseAnswer 字段 \([-2, 7]\) 未渲染的问题
