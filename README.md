# Card Deck Builder

数码宝贝卡牌游戏(Digimon Card Game)和 UNION ARENA 的本地卡组构筑工具。卡牌数据存在本地 SQLite,用户数据(卡组、价格、收购状态)独立存放,通过浏览器使用。

## 主要功能

- **卡牌检索** — 多条件筛选(颜色、等级、费用、稀有度、卡包等);中日英搜索;异画版本切换。
- **卡组管理** — 三种模式:
  - **浏览** (browse):只读,看卡组成型。
  - **组建** (build):±/输入框改卡数,设置封面,即时响应(`useOptimistic`)。
  - **购买** (purchase):记录已买几张,显示缺口、进度条、凑齐徽标。
- **导入 / 导出** — 兼容 digimoncard.io / DCGO / Project Drasil 文本格式;digimoncard.io URL 格式导出。
- **价格追踪** — 每张卡可记录预期价格,卡组面板汇总未购卡总价。
- **多卡组缺卡汇总** — 选择多个卡组,合并显示还缺多少张哪些卡。
- **自动备份** — 每天第一次写入前自动 `VACUUM INTO` 用户数据到 `data/backups/<YYYY-MM-DD>.db`,保留 30 天。

## 技术栈

- **Next.js 16.2.6**(Turbopack)+ React 19 + App Router + Server Components + Server Actions
- **better-sqlite3** —— 同步本地 SQLite,WAL 模式,ATTACH DATABASE 跨库 join
- **Tailwind v4** —— 自定义 design tokens
- **TypeScript** strict —— 全代码库 type-check 干净
- **vitest** —— 单元测试(parser / sanity / format / utilities)
- **Playwright** —— e2e 烟测

## 数据库结构

每个游戏拆成两个 SQLite 文件,物理隔离 scraper 数据和用户数据:

| 文件 | 表 | 谁维护 |
|---|---|---|
| `<game>.db` | `cards`, `card_images` | scraper 脚本(可重抓,不需备份) |
| `user.db` | `decks`, `deck_cards`, `card_prices` | 用户输入(**每日自动备份**) |

跨库查询用 `ATTACH DATABASE`,在连接建立时一次 ATTACH,用户表通过 `user.decks` / `user.deck_cards` 限定名访问。

## 配置

复制 `.env.example` 到 `.env.local` 并调整路径:

```bash
CDB_DIGIMON_DB=/path/to/digimon.db
CDB_DIGIMON_USER_DB=/path/to/digimon-user.db
CDB_UA_DB=/path/to/unionarena.db
CDB_UA_USER_DB=/path/to/unionarena-user.db
```

默认路径在 `~/Desktop/workspace/<game>-deck-builder/data/<game>.db`。

## 开发

```bash
npm install
npm run dev              # dev 服务器,localhost:3000
npm run build            # 生产构建,distDir = .next/prod
npm start                # 启动生产服务器
npm run lint             # ESLint
npm test                 # vitest 单元测试
npm run test:watch       # vitest watch 模式
npm run e2e              # Playwright 烟测(用临时 DB,不污染真实数据)
npm run e2e:ui           # Playwright 调试界面
```

## 数据维护

### 更新卡数据(新卡包发售时)

数码宝贝:

```bash
# 抓特定卡包
npx tsx scripts/scrape-digimon-metadata.ts --only=BT25

# 全量(慢,~30 分钟)
npx tsx scripts/scrape-digimon-metadata.ts

# 只补空名行(scraper 之前漏抓的)
npx tsx scripts/scrape-digimon-metadata.ts --missing

# 异画图(从图床探测)
npx tsx scripts/scrape-digimon-alt-arts.ts
```

UNION ARENA:

```bash
# 抓特定卡包
npx tsx scripts/scrape-ua-metadata.ts --only=EX01BT

# 新卡包(不在 DB 中的)
npx tsx scripts/scrape-ua-metadata.ts --new=UA30BT

# 全量(~1 小时)
npx tsx scripts/scrape-ua-metadata.ts
```

所有 scraper 在写入前先做 sanity check(姓名 / 类型 / 图 URL 等阈值检查),不通过直接 abort,避免静默写入空数据。

### 备份恢复

每日自动备份在 `data/backups/<YYYY-MM-DD>.db`(只含 user 表)。手动恢复:

```bash
# 先 dry-run 看看会发生什么
npx tsx scripts/restore-user-db.ts \
  --source data/backups/2026-05-26.db \
  --game digimon \
  --dry-run

# 确认无误后,如果当前 user.db 是空的就直接恢复
npx tsx scripts/restore-user-db.ts \
  --source data/backups/2026-05-26.db \
  --game digimon

# 如果当前 user.db 已经有数据,需要选择策略
npx tsx scripts/restore-user-db.ts ... --force   # 覆盖
npx tsx scripts/restore-user-db.ts ... --merge   # 合并(已存在的行不动)
```

脚本能自动识别拆库前(`*.pre-split.db`,含 cards 表)和拆库后(只含 user 表)两种备份格式。

## 项目结构

```
src/
  app/
    [game]/
      page.tsx          # 卡牌检索
      decks/            # 卡组列表 + 详情
      card/[...code]/   # 单卡详情(catch-all 处理 UA 含 / 的 code)
      about/            # 游戏知识页
      actions.ts        # 所有 Server Actions
      error.tsx         # 错误边界(带 native binding 等已知错误诊断)
      loading.tsx
  components/           # 客户端 + 服务端组件
  lib/
    db/
      connection.ts     # better-sqlite3 connection 缓存 + ATTACH
      migrations.ts     # 版本化迁移(PRAGMA user_version)
      backup.ts         # 每日自动备份
      deck-shared.ts    # 两游戏共享的 deck repo factory
      digimon.ts        # Digimon 专属查询 + 抽 deckRepo
      unionarena.ts     # UA 专属查询 + 抽 deckRepo
    scraper/
      digimon.ts        # pure HTML parser
      ua.ts             # pure HTML parser
      sanity.ts         # Digimon 抓取批次 sanity 规则
      sanity-ua.ts      # UA 抓取批次 sanity 规则
    alt-art.ts          # 异画后缀字符串处理
    games.ts            # GameId 注册 + 默认路径 + env 覆盖
    deck-formats.ts     # 文本格式 import/export
    search-params.ts    # URL 查询参数 ↔ filter state
scripts/
  scrape-digimon-metadata.ts
  scrape-digimon-alt-arts.ts
  scrape-ua-metadata.ts
  fill-missing-digimon-cards.ts
  restore-user-db.ts
  rebuild-prod.sh
tests/
  *.test.ts             # vitest 单元测试
  e2e/
    *.spec.ts           # Playwright e2e
    fixtures/           # 测试用 fixture DB seeder
```

## 关键设计决定

1. **dev / prod distDir 隔离** — `next.config.ts` 的 phase-function 让 prod build 输出到 `.next/prod`,避免和 dev 的 `.next/dev/` 共享缓存导致 chunk 错位。
2. **每日备份是 write-before** — 在每个 Server Action 入口调 `backupBeforeWrite(game)`,O(1) 后续命中缓存,首次写入时才触发 `VACUUM INTO`。
3. **scraper sanity 阻断写入** — 抓到的批次先过 `checkSanity`,阈值不达标(<95% 有名 / <99% 有类型 / 图 URL 非 https 等)直接 throw,避免静默把 DB 写成空白。
4. **Server Action 都先备份**,然后修改用户表。备份是 user.db 的快照,scraper 重抓 cards 不会影响,反过来也是。
5. **e2e 用临时 fixture DB**,设 `CDB_*_DB` env 指向 OS tmp 目录的迷你 DB,绝对不污染真实卡组数据。
