# cc-buddy-forge (ccbf)

[English](./README.md) | 中文

通过暴力搜索 salt 值，锻造你理想中的 Claude Code 宠物伴侣。

Claude Code 的 buddy 系统通过 `hash(userId + SALT)` 确定性地生成宠物属性。本工具可以搜索数百万个 salt 值，找到能产生你梦想宠物的组合，然后一键应用到本地 Claude Code 二进制文件中。

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

### `ccbf search` — 搜索理想宠物

搜索符合目标属性的 salt 值。Salt 长度会自动从已安装的 Claude Code 二进制文件中检测。

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

### `ccbf patch` — 直接修补二进制

直接修补已安装的 Claude Code 二进制文件，无需源码或重新构建。适用于通过 `install.sh` 安装的用户。
在 macOS 上，`ccbf` 会在修改后二进制自动执行 ad-hoc 重签名，避免 Claude Code 因 `SIGKILL (Code Signature Invalid)` 无法启动。
首次运行或首次修补时，`ccbf` 会自动记录该二进制的原始 salt，后续可直接用 `ccbf restore` 一键恢复。

```bash
# 使用搜索结果中的 salt 进行修补
ccbf patch --salt "ccbf-0000000088"

# 指定自定义二进制路径
ccbf patch --salt "ccbf-0000000088" --binary /path/to/claude
```

### `ccbf restore` — 恢复原始 salt

使用首次运行或首次修补时保存的快照，自动恢复 Claude Code 二进制文件中的原始 salt。
在 macOS 上，恢复后的二进制同样会自动重新签名。

```bash
# 自动恢复原来的宠物
ccbf restore

# 恢复指定 Claude 二进制
ccbf restore --binary /path/to/claude
```

### `ccbf preview` — 预览宠物

查看当前宠物，或预览使用其他 salt 后的效果。

```bash
# 查看当前宠物
ccbf preview

# 预览指定 salt 的宠物
ccbf preview --salt "ccbf-0000000088"
```

## 工作原理

1. Claude Code 通过 `mulberry32(hash(userId + SALT))` 生成宠物属性
2. SALT 硬编码在 Claude Code 二进制文件中
3. `ccbf search` 自动检测当前 salt 长度，生成完全等长的候选 salt
4. 每个不同的 salt 会产生完全不同的宠物 — 物种、稀有度、属性值全部重新生成
5. `ccbf patch` 在二进制中进行安全的逐字节替换（等长 = 不破坏结构）
6. `ccbf` 会将原始 salt 保存到 `~/.ccbf.json`，因此后续恢复只需要一条命令

## 二进制修补

适用于通过 `curl -fsSL https://claude.ai/install.sh | bash` 安装的用户：

- `ccbf search` 自动从已安装的二进制文件中检测 salt 并生成匹配长度的 salt
- `ccbf patch` 原地替换 salt — 无需源码、无需重新构建、无需重新编译
- `ccbf restore` 随时恢复已记录的原始 salt
- 安全的逐字节替换：新 salt 始终与原始 salt 完全等长
- 在 macOS 上，修补/恢复后二进制会自动执行 ad-hoc 重签名

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
    apply.ts         # Salt 替换（二进制修补）
  tui/
    PetCard.tsx      # 宠物预览卡片（精灵图 + 属性）
    SearchView.tsx   # 搜索进度 + 结果展示
    PreviewView.tsx  # 当前 vs 预览对比
  utils/
    config.ts        # userId 自动检测
    state.ts         # 原始 salt 快照存储
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
- 原始二进制 salt 会保存在 `~/.ccbf.json`
- 仅修改本地安装，不影响其他用户
- `patch` 命令修改 `~/.local/share/claude/versions/` 下的 Claude Code 二进制文件
