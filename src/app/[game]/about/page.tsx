import { notFound } from "next/navigation";
import { isGameId, type GameId, colorHex } from "@/lib/games";
import { TopNav } from "@/components/top-nav";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <>
      <TopNav game={game as GameId} active="about" />
      <main className="w-full mx-auto max-w-3xl px-4 py-8 prose prose-sm">
        {game === "digimon" ? <DigimonAbout /> : <UAAbout />}
      </main>
    </>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold mt-7 mb-2 pb-1 border-b border-[var(--color-border)]">
      {children}
    </h2>
  );
}

function P({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm leading-relaxed mb-3 ${className ?? ""}`}>
      {children}
    </p>
  );
}

function ColorList({ colors }: { colors: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 not-prose">
      {colors.map((c) => (
        <span key={c} className="chip">
          <span className="chip-dot" style={{ background: colorHex(c) }} />
          {c}
        </span>
      ))}
    </div>
  );
}

function KeywordList({ items }: { items: [string, string][] }) {
  return (
    <dl className="not-prose grid grid-cols-1 gap-y-1.5 text-sm">
      {items.map(([term, def]) => (
        <div
          key={term}
          className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 items-baseline"
        >
          <dt className="font-mono text-xs font-semibold text-[var(--color-accent)] whitespace-nowrap">
            {term}
          </dt>
          <dd className="text-[var(--color-fg)] leading-relaxed">{def}</dd>
        </div>
      ))}
    </dl>
  );
}

function DigimonAbout() {
  return (
    <>
      <h1 className="text-2xl font-bold">Digimon Card Game</h1>
      <P>
        Bandai 于 2020 年推出的集换式卡牌游戏，世界范围内同步发行英文版与日文版。核心系统围绕「记忆值」(Memory) 与「安全区」(Security
        Stack) 展开 —— 记忆值是双方共享的回合资源条，安全区则是攻击落地前的最后一道防线。
      </P>

      <H>颜色</H>
      <ColorList colors={["Red", "Blue", "Yellow", "Green", "Black", "Purple", "White"]} />
      <P className="mt-3">
        7 种颜色各有性格：红色擅长进攻、删除对方的数码兽；蓝色返手 / 防守；黄色靠安全区上的牌制造价值；绿色铺场速攻；黑色压记忆 / 阻断；紫色弃牌堆复用；白色补血与混色支援。
      </P>

      <H>卡片类型</H>
      <P>
        <b>Digimon</b>：主力战斗单位，按 Lv.2–Lv.7 的等级链通过「进化」叠成。
        <br />
        <b>Digi-Egg</b>：进化的最底层（Lv.2），从单独的「蛋区」起手。
        <br />
        <b>Tamer</b>：训练师，提供持续效果，不会战斗。
        <br />
        <b>Option</b>：一次性效果牌，类似法术。
        <br />
        <b>Dual</b>：少见，同时具备多张卡的特性。
      </P>

      <H>关键术语</H>
      <P>
        <b>Memory</b>：记忆条从 −10 到 +10，结束自己回合时把记忆推到对方一侧。
        <br />
        <b>Security Stack</b>：游戏开始时盖 5 张作为安全区，对方攻击穿透时翻一张结算。
        <br />
        <b>Inherited Effect</b>：继承效果，被进化覆盖后仍持续生效。
        <br />
        <b>DP</b>：战斗力，攻防比对值。
      </P>

      <H>胜负条件</H>
      <P>
        当对手安全区已空（0 张），你的数码兽再对其发动一次成功的直接攻击，即获胜。
        另外：牌库抽空（需要抽牌却抽不出）的一方判负。
      </P>

      <H>回合流程</H>
      <P>
        每回合按顺序进行 6 个阶段：
        <br />
        <b>1. Unsuspend（解除休眠）</b>：竖正自己所有横置的卡。
        <br />
        <b>2. Draw（抽牌）</b>：抽 1 张（先手第一回合跳过）。
        <br />
        <b>3. Breeding（育成）</b>：从育成区孵蛋 / 进化，或把成长的数码兽移到战场。
        <br />
        <b>4. Main（主要）</b>：花记忆值打出数码兽 / 训练师 / 选项卡、进化、发动效果。
        <br />
        <b>5. 攻击</b>：横置数码兽攻击对手数码兽或安全区。
        <br />
        <b>6. End（结束）</b>：把记忆推给对手，换手。
      </P>

      <H>育成区与进化</H>
      <P>
        <b>育成区</b>是独立于战场的小区域，每次只能有 1 只。用蛋卡（Lv.2）起手，在育成阶段进化成 Lv.3，再&ldquo;孵出&rdquo;到战场参战。
        <br />
        <b>进化</b>：把高一阶的数码兽叠在低阶上、支付进化消费（记忆），下层卡成为「进化源」并提供继承效果。每次进化还能抽 1 张。
      </P>

      <H>战斗</H>
      <P>
        攻击时双方比 <b>DP</b>：DP 高的存活、低的被删除（destroy），相等则两败俱伤。攻击安全区时翻开顶部 1 张安全卡结算其效果，再和攻击者比 DP。
      </P>

      <H>关键字（Keywords）</H>
      <KeywordList
        items={[
          ["＜Blocker＞", "对手攻击时可横置此卡，把攻击转移到它身上拦截。"],
          ["＜Security Attack +N／−N＞", "攻击安全区时多翻 / 少翻 N 张安全卡。"],
          ["＜Rush＞", "登场或进化的当回合即可攻击（不必等一回合）。"],
          ["＜Piercing＞", "战斗删除对手数码兽后，继续对其安全区造成攻击。"],
          ["＜Jamming＞", "与数码兽战斗时，此数码兽不会被对方删除。"],
          ["＜Reboot＞", "在对手回合开始时也解除此数码兽的休眠。"],
          ["＜Draw N＞", "从牌库抽 N 张。"],
          ["＜Recovery +N（牌库）＞", "把牌库顶 N 张放到安全区上方。"],
          ["＜De-Digivolve N＞", "让目标数码兽退化 N 阶（移除顶部进化源）。"],
          ["＜Decoy（色）＞", "我方该色数码兽将被删除时，可改删此卡代替。"],
          ["＜Save＞", "主要阶段可把此卡（通常是 Tamer）放到安全区。"],
          ["＜Retaliation＞", "与数码兽战斗被删除时，把对方数码兽也一起删除。"],
          ["＜Alliance＞", "攻击时叠合另一只未休眠数码兽，合并 DP 并多攻 1 次。"],
          ["＜Blitz＞", "对手回合也可以发动攻击。"],
          ["＜Raid＞", "攻击时可把攻击目标改为对手 DP 最高的未休眠数码兽。"],
          ["＜Material Save＞", "进化时把进化源卡放到牌库底而非堆叠。"],
          ["＜Armor Purge＞", "被删除时可移除 1 张顶部进化源来代替（存活）。"],
          ["DNA 进化", "把两只指定数码兽合体进化成一只。"],
          ["Burst / Blast 进化", "满足条件时从手牌 / 进化源直接爆发进化。"],
        ]}
      />

      <H>构筑规则</H>
      <P>
        主卡组恰好 <b>50</b> 张；蛋卡组 <b>0–5</b> 张（独立洗牌、独立堆叠）；同名卡（按卡名计）每副卡组最多 <b>4</b> 张。本工具不强制这些规则，超出会在卡组页给出红字提示。
      </P>

      <H>资源</H>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>
          官方卡表：
          <a
            href="https://world.digimoncard.com/cardlist/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            world.digimoncard.com ↗
          </a>
        </li>
        <li>
          综合规则：
          <a
            href="https://world.digimoncard.com/rule/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            world.digimoncard.com/rule ↗
          </a>
        </li>
        <li>
          卡牌图片来源：world.digimoncard.com（已写入数据库 image_url）
        </li>
      </ul>
    </>
  );
}

function UAAbout() {
  return (
    <>
      <h1 className="text-2xl font-bold">UNION ARENA</h1>
      <P>
        Bandai 在 2023 年推出的跨 IP 集换式卡牌游戏，把鬼灭、咒术、咒术回战、HUNTER×HUNTER、BLEACH、Code Geass、进击的巨人、偶像大师等热门作品分别做成独立「作品 (Series)」体系，玩家用单一作品 + 单一颜色构筑卡组，作品间不能混。
      </P>

      <H>颜色</H>
      <ColorList colors={["Red", "Blue", "Yellow", "Green", "Purple"]} />
      <P className="mt-3">
        每种作品通常对应 1–2 个主色。颜色和作品共同决定卡牌的可用性。
      </P>

      <H>卡片类型</H>
      <P>
        <b>Character</b>：主战角色，有 BP（战斗力）与 AP / Energy 消耗，可上场战斗。
        <br />
        <b>Event</b>：一次性效果。
        <br />
        <b>Field (フィールド)</b>：留场环境牌，提供持续增益。
      </P>

      <H>资源系统</H>
      <P>
        <b>Energy Cost</b>：登场所需能量。
        <br />
        <b>AP Cost</b>：行动 / 攻击点数消耗。
        <br />
        <b>BP</b>：Battle Point，战斗力，攻防比对值。
        <br />
        <b>Trigger</b>：被击穿生命区时触发的卡面效果，是 UA 的核心机制 ——「色 / 特效 / 抽卡 / 起手」等不同 trigger 决定了卡组节奏。
      </P>

      <H>胜负条件</H>
      <P>
        把对手的<b>生命区（Life）</b>打到 0 之后，再对其造成一次伤害即获胜。生命区起始通常为 7 张（不同规则可能有差异）。牌库抽空的一方判负。
      </P>

      <H>场区结构</H>
      <P>
        <b>Front Line（前线）</b>：可直接攻击对手生命的位置。
        <br />
        <b>Energy Line（能量线）</b>：后排，提供能量、不能直接攻击对手。
        <br />
        <b>Life（生命区）</b>：受到伤害时从这里翻牌，可能触发 Trigger。
        <br />
        <b>Outside Area / Remove</b>：移出区。
      </P>

      <H>回合流程</H>
      <P>
        <b>1. Start（开始）</b>：竖正自己的卡、抽 1 张（先手首回合不抽）、放置能量。
        <br />
        <b>2. Move（移动）</b>：把后排角色移到前线（每回合限制）。
        <br />
        <b>3. Main（主要）</b>：花能量登场角色 / 打事件 / 用 AP 行动。
        <br />
        <b>4. Attack（攻击）</b>：前线角色横置攻击对手角色或生命。
        <br />
        <b>5. End（结束）</b>：回合结束，换手。
      </P>

      <H>战斗</H>
      <P>
        攻击时比 <b>BP</b>：攻击方 BP ≥ 防守方则击倒对方角色；攻击没有被拦截而打到玩家时，对手从生命区翻 1 张（可能触发 Trigger）作为伤害。AP 用于发动行动 / 二次攻击等。
      </P>

      <H>Trigger 类型</H>
      <P className="mb-2">
        卡牌右上角的 trigger 图标，在该卡作为生命被翻开时发动：
      </P>
      <KeywordList
        items={[
          ["［Color］色", "把这张卡作为能量放入能量区。"],
          ["［Draw］抽卡", "抽 1 张。"],
          ["［Active］活性", "竖正（unsuspend）我方 1 张卡。"],
          ["［Special］特殊", "发动卡面写明的特殊 trigger 效果。"],
          ["［Final］终结", "仅当生命已为 0 时可发动的强力效果（翻盘点）。"],
          ["［Get］获得", "把这张卡加入手牌。"],
          ["［Raid］突袭", "可立刻把这张卡叠放登场。"],
        ]}
      />

      <H>关键字（Keywords）</H>
      <KeywordList
        items={[
          ["＜Impact N＞", "突破对手前线打到玩家时，额外造成 N 点生命伤害。"],
          ["＜Block＞", "对手攻击时可横置此角色拦截，改为与它战斗。"],
          ["＜Raid（卡名）＞", "可把这张卡叠在指定角色上登场，省去登场费用 / 继承状态。"],
          ["＜Step＞", "可在攻击后或特定时点追加行动。"],
          ["［On Play］登场时", "角色登场时发动。"],
          ["［When Attacking］攻击时", "该角色宣告攻击时发动。"],
          ["［Activate Main］主要时", "主要阶段花 AP 主动发动。"],
        ]}
      />

      <H>构筑规则</H>
      <P>
        主卡组恰好 <b>50</b> 张；同名卡最多 <b>4</b> 张；卡组必须为<b>单一作品 + 单一颜色</b>（部分推广卡例外）。
      </P>

      <H>稀有度</H>
      <P>
        从低到高大致：C → U → R → SR → SR★ → SR★★ → SR★★★ → UR / SP（含特殊画框）。带「Pc」前缀（PcC / PcR / PcSR）的是「Punch」系列特殊处理卡面，含 ★ 是 parallel / alt-art。
      </P>

      <H>资源</H>
      <ul className="text-sm space-y-1 list-disc pl-5">
        <li>
          官方网站：
          <a
            href="https://www.unionarena-tcg.com/jp/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            unionarena-tcg.com ↗
          </a>
        </li>
        <li>
          官方卡表：
          <a
            href="https://www.unionarena-tcg.com/jp/cardlist/"
            target="_blank"
            rel="noreferrer"
            className="underline ml-1"
          >
            unionarena-tcg.com/cardlist ↗
          </a>
        </li>
        <li>
          卡牌图片来源：www.unionarena-tcg.com（已写入数据库 image_url）
        </li>
      </ul>
    </>
  );
}
