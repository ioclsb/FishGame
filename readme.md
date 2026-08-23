# 推推消消乐（Push-Slide Match）- 海洋版

单机益智游戏，以**单文件 HTML5 页面**（`push-slide-match.html`）交付。
双击即可运行——无需服务器、无需构建步骤、无外部资源。界面文字为中文；
代码标识符为英文。

移动优先、面向正式发布：可适配任意视口的正方形棋盘、安全区适配布局、
设备像素比清晰的 SVG 美术、合成音效、震动反馈、连击反馈、可安装元信息
与「减弱动态效果」支持。

## 1. 玩法

- 按住方块（或一串相邻方块）沿四个正交方向拖动，即可整串推动。
- 松手时，被拖动的方块 **A** 沿其行/列射线检测。若任一方向命中的
  第一个方块为同款（**B**），则消除这一对；否则整组平滑回弹。
- 直接点击方块：当同款方块已沿一条无障碍直线与其相对时，直接消除。
- 当 A 在横竖两个方向都能匹配时，弹出「多选」暗色遮罩高亮所有目标；
  点选你想要的，或点空白处取消滑动。
- 消除全部 24 对（48 个方块、6 种海洋生物）即通关。

## 2. 运行与验证

```bash
# 用任意现代浏览器打开 push-slide-match.html（双击即可）

# 一次全部执行（任一回归即刻失败）：
node tests/run-all.mjs

# 核心逻辑回归套件（无需浏览器）：
node tests/run-core-tests.mjs          # 全部组（约 100+ 断言）
node tests/run-core-tests.mjs undo     # 按名称运行单组

# 完整 输入→视图→核心 交互冒烟套件（虚拟时钟、手动 rAF）：
node tests/smoke-interaction.mjs       # 5 个场景 / 24 项检查

# 极端视口、DPR 上限与旋转下的布局回归：
node tests/layout-viewport.mjs         # 8 个设备档 / 40 项检查

# 求解器模拟：通过 GameCore 完整玩 N 局（贪心提示追逐 + 死局洗牌），
# 统计可解率 / 死局率
node tests/solver-sim.mjs 300          # 100% 可解，约 0.06 次洗牌/局

# 无解正确性：findHint 与暴力移动 oracle 在中局状态交叉验证，
# 另含中间距离（点滑）与仅点击场景
node tests/find-hint.mjs
```

页面内还内置 `window.runSelfTest(which)`，断言推组构造、最大滑动距离、
射线消除、回弹恢复、洗牌空位守恒、提示可解性、进度/通关、多匹配检测、
成对消除、拖动提交/回退、点滑、点击匹配、幽灵一致性以及单步撤销。
`tests/run-core-tests.mjs` 在带浏览器桩的 Node VM 中执行该套件。

手动 QA 清单（手机）：

- [ ] 320px / 375px / 414px 屏宽下棋盘适配宽度；无页面滚动或回弹
- [ ] 旋转后棋盘重新适配；新 DPR 下精灵/背景重烘焙保持清晰
- [ ] 刘海屏设备安全区被尊重（上下留白）
- [ ] 棋盘无长按右键菜单；按钮无双击缩放
- [ ] 声音开关刷新后保持；静音态显示斜杠图标
- [ ] 首次访问只显示一次引导遮罩；「开始游戏」后永久关闭

## 3. 架构

单页内四层解耦：

```
App（装配 + HUD + 手感）
 ├─ GameCore          纯逻辑，不依赖 DOM/Canvas
 │    Grid(8x8) + 方块列表 + 物种表
 │    buildPushGroup / getMaxSlideDistance / checkMatch / resolve / revert
 │    shuffle / findHint / win 检测 / pushSnapshot / undo / resolvePair
 │    clickResolve / findMultiMatches / applySlide / revertSlide
 ├─ RenderView        Canvas 2D，连续 rAF 主循环
 │    烘焙深海背景（神光、焦散、沙滩光晕、暗角）
 │    按物种精灵：程序化高光糖果瓦片 + 异步 SVG 生物
 │    拖动跟随 / 消除残影 / 回弹 / 提示 / 多选遮罩 /
 │    同款脉冲 / 拖动十字遮罩 / 粒子 + 波纹 / 环境气泡
 ├─ InputController   鼠标 + 触屏指针事件 -> 网格坐标 -> core
 └─ HUD               进度环 + 进度条、磨砂图标按钮、toast 消息、
                     通关遮罩（统计 + 彩纸）、首访引导遮罩
```

`GameCore` 只暴露纯数据与函数；`RenderView` 和输入代码依赖它，
绝不会反向依赖。

## 4. 数据模型

- `grid[8][8]`：值为物种 id 1..6，`0` 表示空。每个方块对其他方块而言
  都是障碍；空单元格提供滑动空间。
- `blocks: [{ id, pattern, r, c }]`：方块实体表；`grid` 为保持同步的
  空间索引（`consistencyCheck()` 校验）。
- 6 种 × 8 个 = 48 个方块、16 个空单元格、24 对。
- 进度 = `clearedPairs / totalPairs`。消除后不补充、无重力下落。

## 5. 几何与响应式

- 所有棋盘运算读取可变 `G = { cell, gap, pitch, size, dpr }`。
- `computeLayout()` 将正方形棋盘适配进 `#boardWrap`（固定 body 列中
  flex: 1），瓦片取整到整像素。
- 后备缓冲密度上限 `DPR_CAP = 2`（手机 GPU 最大杠杆）；canvas CSS 尺寸
  恒等于逻辑尺寸，指针运算保持精确。
- 精灵缓存为数字几何桶（`cell*16 + dpr*4`）——逐帧查找路径零字符串
  分配；绝对棋盘上限（`BOARD_MAX_PX = 760`）让超大桌面显示器保持理性。
- resize/orientationchange/visualViewport 事件做 120ms 防抖 +
  滞回过滤（`maybeRelayout`，忽略 <24px 抖动）——从而打散手机地址栏
  缩放的反馈风暴。`resize()` 在尺寸未变化时是空操作，冗余事件绝不
  重新分配 canvas 缓冲。

## 5b. 渲染预算

- 一条连续 rAF 主循环驱动全部特效。标签页隐藏或有模态遮罩时完全跳过
  （`RenderView.setPaused`）；空闲时降到约 30fps（只有环境气泡在动）；
  拖动、粒子、提示与多选遮罩恢复全帧率（`isBusyFrame()`）。
- 动画 canvas 上方没有 `backdrop-filter`（#msg toast 与 HUD 按钮用
  实色半透明）——背景变化上的模糊层会让手机 GPU 每帧整体重新合成。
- 彩纸节点通过 animationend 加上 4s 超时兜底自动移除。

## 6. 美术管线

- 物种：小丑鱼 clownfish、蓝倒吊 blue tang、绿海龟 turtle、河豚 pufferfish、
  紫水母 jellyfish、小红蟹 crab（`PATTERN_NAMES`）。
- 每个精灵 = 程序化绘制的高光圆角瓦片（渐变、斜面、光泽、投影——同步）
  叠加手工内联 SVG 生物，经 data-URI -> Image -> 离屏 canvas 异步合成。
- 背景将水波渐变、神光、焦散光斑、暖沙光晕、圆角半透明瓦片与暗角
  烘焙进一张缓存位图。
- 运行时生成的 512px PNG 图标供给 apple-touch-icon 与 blob manifest
  （`ensurePwaIcons()`）；静态 SVG favicon 位于 `<head>`。

## 7. 手感（juice）

- 连续 rAF 主循环驱动特效；隐藏时低耗空闲、模态遮罩下完全冻结
  （`RenderView.setPaused`）。
- **停顿（hit-stop）**：消除使棋盘冻结 70–115ms（随连击缩放）；真实时间戳
  动画器跨冻结平移，每个特效精确续接停止处。
- **编排**（按各平台震动引导的多模态时序）：音效 + 震动与冲击波纹同时
  触发；气泡粒子 +30ms 迸发；连击浮字 +110ms 上浮。
- **屏幕震动**：仅连击 x3+ 触发，按档缩放幅度/时长，快速衰减，
  「减弱动态效果」下跳过。
- **连击浮字**：`连击 ×N` 在消除对上方弹出（取代旧 toast），
  ease-out-back 缩放；整个动画期间布局硬钳制在可见棋盘内，
  边缘消除也不会画到屏幕外。
- 匹配音效是清脆的玻璃碎裂：一声尖锐宽带「碎裂」（玻璃崩开），随后几声
  清晰高音「叮」——短正弦、近瞬态起音、轻微下行音高弯曲、快速衰减、
  间隔干净，每声都清晰可辨（锚定在 `SoundManager.MATCH_BASE` 之上）。
  密度随连击缩放，达到上限后锁定（`_registerMatch`）：连击 ≥ 3 均播放
  完全相同的最高档反馈，不再增加里程碑层。连击基于失误而非时间：
  任意长的思考停顿都会延续连击，只有真正失误（一次触发了全局同款
  弹跳的点击，或一次回退的拖动）或撤销/洗牌/重开才会打断。
- Web Audio 合成：清脆玻璃碎裂的匹配命中（一声尖锐碎裂 + 清脆高音
  「叮」）、噪音扫描洗牌、下行回退滑动、轻柔失误 blip、UI 滴答、
  通关琶音。主音量静音持久化于 `localStorage('psm.sound')`；
  DynamicsCompressorNode 防削波；首次 pointerdown 执行 iOS 静音解锁；
  标签页重新可见时上下文自动恢复。
- 通过 `navigator.vibrate`（有防护）在匹配/多选/洗牌/通关时震动。
- 通关遮罩：用时、消除对数、提示/撤销次数、DOM 彩纸。
- `prefers-reduced-motion` 禁用粒子、气泡、彩纸、震动、浮字与 CSS 动画，
  同时保留全部功能。

## 8. 持久化

| 键            | 含义                              |
|----------------|-----------------------------------|
| `psm.sound`    | `'on'` / `'off'` 声音偏好         |
| `psm.coached`  | 引导遮罩完成一次后为 `'1'`        |
| `psm.bestTime` | 最快通关用时（秒）                |

死局处理：每次棋盘变化后 app 探测 `findHint()`；无任何可消除时洗牌
按钮脉冲并弹 toast 建议重洗。`findHint()` 是精确的：它检查每个可达的
滑动距离（1..maxDist，中间距离点滑也算），并回退到点击匹配，因此
「无提示」真的意味着没有任何合法移动。

## 9. 调试

- `?debug=1` URL 标志启用页内遮罩（网格值、悬停单元格、fps/P95 帧时与
  烘焙计数）以及经 `dbg()`/`dbgStep()` 写入 `window.__LOGS` 的结构化日志；
  未捕获异常也会被捕获。
- `SMOKE_DEBUG=1 node tests/smoke-interaction.mjs` 在拖动结果偏离纯逻辑
  预测时，输出完整的逐次拖动时间线（打开帧、消除帧、core 变更调用、
  网格状态）。

### 值得一提的 bug 修复史

- **精灵缓存擦除风暴**：早期 spriteFor() 任何未命中都清空整个缓存；
  逐块渲染循环于是每帧重新烘焙每张瓦片 + 重新解码每个 SVG（内存爬升、
  卡顿、无限转圈）。缓存现为数字几何桶，且 S6 断言烘焙计数保持平稳。
- **手机端 resize 反馈风暴**：地址栏切换反复重设 canvas.width（整个缓冲
  重新分配）。以防抖 + 滞回（`maybeRelayout`）+ 空操作 resize 防护修复。
- **连锁推动损坏**：applySlide 中途按坐标查找成员；连锁推动（成员 N
  的终点 == 成员 N+1 的起点）会重新捕获已移动方块，破坏 blocks[]，
  使后续多选静默失败。现改为按 id 移动；由内嵌 `chainPick` 测试守护。
- `GameCore.consistencyCheck()` 在每次变更后校验 grid<->block 一致性；
  结果随调试日志条目附带。

## 10. 交接给下一位开发者的备注

- 一切都在 `push-slide-match.html` 内；保持自包含（无外部资源、
  无任何网络调用）。
- 保持 `GameCore` 不依赖 DOM；每次改动后在页内扩展 `selfTests` 并重跑
  `node tests/run-core-tests.mjs`。由于 `group` 测试遍历随机布局，
  各次运行断言数会有差异。
- 几何：绝不重新引入硬编码像素常量；一律从 `G` 读取。
- 音效回调/特效在 `App._wireView`（构造与重开时调用）中重新接到每个
  新的 RenderView。
- 撤销将拖动方块恢复到其**原始**单元格（快照先于滑动提交）；
  洗牌刻意不可撤销。