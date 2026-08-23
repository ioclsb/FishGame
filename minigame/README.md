# 推推消消乐 - WeChat Mini Game

微信小游戏版移植自 `push-slide-match.html`（网页版）。核心逻辑
`GameCore` 与网页版完全一致；表现层（渲染 / UI / 输入 / 音效 / 存储）
针对小游戏 Canvas 运行时重写。网页版与其测试不受影响。

## 1. 在微信开发者工具中运行

前置：已完成小游戏账号注册并拿到 AppID（本工程 `project.config.json`
已填入 `wxdbc3429dae591e19`）。

1. 打开微信开发者工具（安装路径：
   `C:\Program Files (x86)\Tencent\微信web开发者工具\wechatdevtools.exe`）
2. 首次打开用**手机微信扫码**登录
3. 「新建项目」（或「导入项目」）：
   - 目录选择本仓库的 `minigame/` 文件夹
   - AppID 保持默认（自动读取 `project.config.json`）
   - 项目类型会自动识别为「小游戏」
4. 点击「导入」后，模拟器会立即运行游戏

> 提示：如果项目类型没识别为小游戏，手动检查 `project.config.json`
> 中 `"compileType": "game"` 是否正确。

## 2. 真机预览（可选）

- 工具栏点「预览」→ 生成二维码 → **手机微信扫码**即可在手机上试玩
- 首次真机预览需在手机上打开「开发调试」或添加为体验成员（在微信公众平台
  「成员管理 → 体验成员」中添加你的微信号）

## 3. 手动核对清单（模拟器 + 真机）

- [ ] 首次进入显示引导页，「开始游戏」后可开始
- [ ] 拖动方块 → 整排推动；松手有匹配则消除，无匹配则回弹
- [ ] 点击方块 → 直线相对同款直接消除
- [ ] 可同时横/竖消除时出现「多选」暗色遮罩，点选目标或点空白取消
- [ ] 提示 / 撤销 / 洗牌 / 重开 / 声音 五个按钮均可用；无解时洗牌按钮脉冲
- [ ] 连击 ≥2 显示「连击 ×N」，≥3 有屏幕震动
- [ ] 消除 24 对后出现通关结算（用时/提示/撤销/新纪录 + 彩纸）
- [ ] 声音开关状态重启后保持；声音在静音开关下不播放
- [ ] 旋转手机后棋盘重新适配
- [ ] 切后台再回来（wx.onShow）游戏恢复、音效可继续

## 4. 结构

```
minigame/
  game.js            # 入口：启动、触摸/生命周期事件绑定
  game.json          # 小游戏配置（竖屏）
  project.config.json# 开发者工具项目配置（AppID）
  js/
    core.js          # GameCore（与网页版一致，CommonJS 化）
    creatures.js     # 6 种海洋生物程序化 Canvas 绘制
    view.js          # 棋盘渲染、精灵缓存、特效
    ui.js            # HUD / 引导 / 结算 / 按钮（Canvas + 命中检测）
    sound.js         # 合成音效（wx.createWebAudioContext）
    app.js           # 装配、输入状态机、主循环、结算逻辑
    storage.js       # wx 存储封装
    debug.js         # 结构化调试日志
  tests/
    run-core.mjs     # 核心逻辑回归（111 断言）
    smoke-mg.mjs     # 集成冒烟（桩 wx/Canvas，全流程无异常）
```

## 5. 测试

```bash
node minigame/tests/run-core.mjs          # 核心逻辑（可选单组，如 undo）
node minigame/tests/smoke-mg.mjs          # 集成冒烟
```

网页版测试不受影响：`node tests/run-all.mjs`

## 5.1 远程诊断采集（debug 模式）

排查渲染/动画/输入类问题时可采集现场数据：

1. 开发者工具「编译模式」加自定义条件 `debug=1` 启动
2. 复现问题后**长按棋盘任意方块约 0.6 秒**（或控制台执行 `__captureDebug()`）
3. 采集内容写入 storage（控制台 `wx.getStorageSync('__debugState')` 等读取）：
   - `__debugState` — 棋盘/方块/视图状态 JSON（grid、blocks、view 的 bounce/drag/pick 等标志）
   - `__debugLogs` — 最近结构化日志
   - `__debugBoardPng` / `__debugScreenPng` — 棋盘/屏幕截图（jpg base64，可解码查看）
4. 也可在控制台 `wx.getStorageSync('__runtimeError')` 查看运行时报错

> 截图流程：`canvas.toTempFilePath` 生成临时文件 → `FileSystemManager.readFileSync(path, 'base64')`
> 存入 storage，base64 可拷出解码。线上问题可用 `wx.getLogManager`（用户反馈上传）或
> `wx.getRealtimeLogManager`（后台实时日志，真机生效）。

## 6. 与网页版的能力差异

| 能力 | 网页版 | 小游戏版 |
|------|--------|----------|
| 渲染 | Canvas + DOM HUD | 全 Canvas |
| 生物贴图 | 内联 SVG + Image | 程序化 Canvas 路径 |
| 音效 | Web Audio 合成 | `wx.createWebAudioContext` 合成 |
| 存储 | localStorage | wx storage（键名一致） |
| 震动 | navigator.vibrate | wx.vibrateShort |
| 降级动画 | prefers-reduced-motion | 关闭（小游戏无系统开关） |

## 7. 发布（正式上线前）

- 在微信公众平台完善小游戏名称、图标、类目
- 完成小游戏**备案**与《自审自查报告》等资质材料
- 开发者工具「上传」→ 后台「版本管理」提交审核

> 个人主体小游戏不支持虚拟支付内购，可正常发布免费游戏。