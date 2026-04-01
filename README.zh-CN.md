# cc-buddy-forge (ccbf)

[English](./README.md) | 中文

通过暴力搜索 salt 值，锻造你理想中的 Claude Code 宠物伴侣。

Claude Code 的 buddy 系统通过 `hash(userId + SALT)` 确定性地生成宠物属性。本工具可以搜索数百万个 salt 值，找到能产生你梦想宠物的组合，然后一键应用到本地 Claude Code 源码中。

## 快速开始

```bash
# 前置条件：Bun >= 1.0
# https://bun.sh

# 克隆并安装
git clone https://github.com/Snychng/cc-buddy-forge.git
cd cc-buddy-forge
bun install

# 注册全局 ccbf 命令
bun link

# 开始使用
ccbf --help
```

## 命令

### `ccbf preview` — 预览宠物

查看当前宠物，或预览使用其他 salt 后的效果。

```bash
# 查看当前宠物
ccbf preview

# 预览指定 salt 的宠物
ccbf preview --salt "friend-2026-401-6647"
```

### `ccbf search` — 搜索理想宠物

搜索符合目标属性的 salt 值。

```bash
# 搜索传说级龙（默认搜索 100 万次）
ccbf search --species dragon --rarity legendary

# 搜索任意闪光宠物
ccbf search --shiny

# 搜索高混乱值的史诗级猫
ccbf search --species cat --rarity epic --min-stat CHAOS:80

# 加大搜索量以寻找稀有组合
ccbf search --species dragon --rarity legendary --shiny --total 10000000

# 手动指定 userId
ccbf search --species owl --rarity rare --user-id "your-user-id"
```

**可用过滤条件：**

| 参数 | 可选值 |
|------|--------|
| `--species` | duck, goose, blob, cat, dragon, octopus, owl, penguin, turtle, snail, ghost, axolotl, capybara, cactus, robot, rabbit, mushroom, chonk |
| `--rarity` | common (60%), uncommon (25%), rare (10%), epic (4%), legendary (1%) |
| `--eye` | `·` `✦` `×` `◉` `@` `°` |
| `--hat` | none, crown, tophat, propeller, halo, wizard, beanie, tinyduck |
| `--shiny` | 1% 概率，无需传值 |
| `--min-stat` | DEBUGGING, PATIENCE, CHAOS, WISDOM, SNARK（格式：`名称:数值`） |
| `--total` | 搜索次数（默认：1000000） |

### `ccbf apply` — 应用 salt

将找到的 salt 值写入 Claude Code 源码。

```bash
# 应用 salt（会要求确认）
ccbf apply --salt "friend-2026-401-6647"

# 应用并自动重新构建
ccbf apply --salt "friend-2026-401-6647" --rebuild

# 指定自定义源码路径
ccbf apply --salt "friend-2026-401-6647" --source ~/my-claude-code
```

## 工作原理

1. Claude Code 通过 `mulberry32(hash(userId + SALT))` 生成宠物属性
2. SALT 硬编码在 `src/buddy/companion.ts` 中，值为 `'friend-2026-401'`
3. 本工具尝试 `friend-2026-401-0`、`friend-2026-401-1`、... 等 salt 变体
4. 每个不同的 salt 会产生完全不同的宠物 — 物种、稀有度、属性值全部重新生成
5. 找到满意的后，`apply` 命令替换源码中的 SALT 常量

## 性能

Apple Silicon 上典型搜索速度：约 1,000,000 次/秒。100 万次搜索约 1 秒完成。

| 目标 | 每 100 万次预期匹配数 |
|------|----------------------|
| 指定物种 | ~55,000 |
| 传说级 | ~10,000 |
| 传说级 + 指定物种 | ~550 |
| 闪光 | ~10,000 |
| 闪光 + 传说级 | ~100 |
| 闪光 + 传说级 + 指定物种 | ~5 |

## 项目结构

```
src/
  index.tsx          # CLI 入口（commander）
  core/
    types.ts         # 物种、稀有度、属性类型与常量
    roller.ts        # PRNG（mulberry32）+ 哈希 + roll 逻辑
    search.ts        # 暴力搜索引擎
    sprites.ts       # 18 种物种的 ASCII 艺术图
    apply.ts         # Salt 替换 + 重新构建
  tui/
    PetCard.tsx      # 宠物预览卡片（精灵图 + 属性）
    SearchView.tsx   # 搜索进度 + 结果展示
    PreviewView.tsx  # 当前 vs 预览对比
    ApplyView.tsx    # 应用确认界面
  utils/
    config.ts        # userId 自动检测
```

## 开发

```bash
# 直接运行
bun run src/index.tsx preview

# 通过 npm scripts 运行
bun run search    # 等同于：bun run src/index.tsx search
bun run preview   # 等同于：bun run src/index.tsx preview

# 类型检查
bun run tsc --noEmit
```

## 注意事项

- 需要 Bun（不支持 Node）— 哈希函数使用 `Bun.hash` 以确保与 Claude Code 完全一致
- userId 自动从 `~/.claude.json` 或 `~/.claude/.config.json` 读取
- 仅修改本地源码，不影响其他用户
- `apply` 命令修改 Claude Code 源码目录中的 `src/buddy/companion.ts`（默认路径：`~/Developer/claude-code-source-code`）
