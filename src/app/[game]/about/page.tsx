import { notFound } from "next/navigation";
import { isGameId, type GameId, colorHex } from "@/lib/games";
import { KEYWORDS } from "@/lib/keywords";
import * as digimon from "@/lib/db/digimon";
import { KEYWORD_CHIP } from "@/components/effect-text";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  if (!isGameId(game)) notFound();
  return (
    <>
      <main className="w-full mx-auto max-w-3xl px-4 py-8 prose prose-sm">
        <DigimonAbout keywords={keywordRows()} />
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

/**
 * One row per keyword: the name in all three card languages, then the Chinese
 * explanation.
 *
 * All three names are shown rather than only the reader's own, because the
 * point of this table is recognising a keyword on a card — and the cards
 * you're holding, the ones on the site and the ones in an English article
 * won't agree on which language that is.
 */
/** Simple term/definition list, for sections that aren't the Digimon keyword
 *  table (UA's triggers, which have no three-language mapping behind them). */
function TermList({ items }: { items: [string, string][] }) {
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

type KeywordRow = {
  official: string;
  ja: string | null;
  zhName: string | null;
  /** How card text writes it, e.g. ＜Blocker＞. */
  display: string;
  /** The Chinese explanation, where one has been written. */
  zh: string | null;
};

/**
 * The rows the table prints: the official keyword list, with our own write-up
 * merged in where there is one.
 *
 * The list comes from the database — it is scraped on every 关键词 refresh —
 * so a keyword introduced by a new set shows up here with its three spellings
 * the day the set ships, and only the explanation waits for a person. Before
 * the first scrape there is nothing to read from, so the hand-written list is
 * the whole table.
 */
function keywordRows(): KeywordRow[] {
  const byName = new Map<string, (typeof KEYWORDS)[number]>();
  for (const k of KEYWORDS) {
    byName.set(k.official, k);
    for (const a of k.aka ?? []) byName.set(a, k);
  }
  const official = digimon.listKeywordGlossary();
  if (official.length === 0) {
    return KEYWORDS.map((k) => ({
      official: k.official,
      ja: k.ja,
      zhName: k.zhName,
      display: k.display,
      zh: k.zh,
    }));
  }
  return official.map(({ official: name, ja, zh }) => {
    const k = byName.get(name);
    return {
      official: name,
      ja: k?.ja ?? ja,
      zhName: k?.zhName ?? zh,
      display: k?.display ?? `＜${name}＞`,
      zh: k?.zh ?? null,
    };
  });
}

/**
 * How the three languages print this keyword. English carries its own
 * brackets (they encode the numeric form, ＜Security A. +N／−N＞); the other
 * two are stored bare and are wrapped here in the brackets their cards use —
 * ≪…≫ in Japanese, 《…》 in Chinese, or ［…］ for the few keywords that are
 * written that way in every language.
 */
function printedForms(k: KeywordRow): string[] {
  const square = k.display.startsWith("［");
  const wrap = (name: string, open: string, close: string) =>
    square ? `［${name}］` : `${open}${name}${close}`;
  return [
    k.display,
    k.zhName ? wrap(k.zhName, "《", "》") : null,
    k.ja ? wrap(k.ja, "≪", "≫") : null,
  ].filter((x): x is string => Boolean(x));
}

function KeywordList({ items }: { items: KeywordRow[] }) {
  return (
    <dl className="not-prose grid grid-cols-1 gap-y-2.5 text-sm">
      {items.map((k) => (
        <div key={k.official}>
          {/* All three spellings wear the card's own keyword chip: the table's
              job is recognising a keyword on a card, and it reads faster when
              it looks like the thing being recognised. */}
          <dt className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
            {printedForms(k).map((form) => (
              <span key={form} className={KEYWORD_CHIP}>
                {form}
              </span>
            ))}
          </dt>
          {k.zh ? (
            <dd className="text-[var(--color-fg)] leading-relaxed mt-0.5">
              {k.zh}
            </dd>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

function DigimonAbout({ keywords }: { keywords: KeywordRow[] }) {
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

      <H>游戏区域</H>
      <P>
        区域有:<b>牌库</b>、<b>蛋卡组</b>、<b>战场</b>、<b>手牌</b>、<b>废弃区</b>、<b>安全区</b>。
        <br />
        其中<b>公开区域</b>(如废弃区)双方随时可查看内容和顺序;<b>非公开区域</b>(手牌、牌库、安全区)则不可查看。
        安全区尤其要注意:它是非公开的,双方都不能偷看,只在检查时逐张翻开。
      </P>

      <H>攻击流程</H>
      <P>
        只有回合玩家能攻击。一次攻击按固定顺序经过 5 个时机:
        <br />
        <b>宣言攻击 → 反击时机 → 阻挡时机 → 确认攻击是否成功 → 攻击结束</b>
        <br />
        当前时机的处理 <b>全部结算完</b> 才会进入下一个时机 —— 这是判断效果发动先后的依据。
      </P>

      <H>阻挡</H>
      <P>
        阻挡是把攻击目标换成场上一只带 ＜Blocker＞ 的数码兽。规则要点:
        <br />
        · 每次攻击<b>只能阻挡 1 次</b>,不能多只同时阻挡
        <br />
        · 阻挡进行中不能再次宣言阻挡
        <br />
        · 无法横置的数码兽不能阻挡
        <br />
        · <b>被指定为攻击目标的那只数码兽不能自己阻挡</b>
      </P>

      <H>安全检查</H>
      <P>
        安全检查是查看对手安全区的规则。<b>一次攻击只做 1 次安全检查</b>,但攻击者身上若有 ＜Security A. +N＞ 之类的效果,这一次检查会按修正后的张数进行。检查<b>逐张</b>进行。
      </P>

      <H>规则检查</H>
      <P>
        在允许的时机,游戏会自动执行一些「该发生就发生」的处理 —— 比如 DP 归零的数码兽被删除、不符合条件的卡离场。它不需要玩家宣言,但在规则处理进行当中不会执行,要等当前处理结束。
      </P>

      <H>战斗</H>
      <P>
        攻击时双方比 <b>DP</b>：DP 高的存活、低的被删除（destroy），相等则两败俱伤。攻击安全区时翻开顶部 1 张安全卡结算其效果，再和攻击者比 DP。
      </P>

      <H>关键字（Keywords）</H>
      <P className="!mt-0 text-xs">
        共 {keywords.length} 个,取自官方卡表的关键字表,按名称排序,随卡表更新。每条给出英/中/日三种卡面写法。数值或指定卡不同的写法(＜Draw 1＞ 与 ＜Draw 2＞)按规则 16-2 视为同一个关键字,合并成一条。
      </P>
      <KeywordList items={keywords} />

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
