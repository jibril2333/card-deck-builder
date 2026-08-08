/**
 * The game's keyword effects, from the official comprehensive rules.
 *
 * Source: world.digimoncard.com/rule/pdf/general_rule.pdf (revision dated
 * 2026-06-19). Most come from section 16 "Keyword Effects"; ＜Overflow＞,
 * ［Arts Digivolve］, ［DNA Digivolution］ and ［Link］ are defined in sections
 * 4-18, 4-19, 8-2 and 10 instead, which is exactly why reading only section 16
 * misses them. Every entry is a translation of the rules' own wording, not a
 * summary from memory — the hand-written list this replaces had 19 of them and
 * a couple of loose paraphrases.
 *
 * `official` is the English name exactly as the rules and the card text spell
 * it, which is also how it appears in `card_keywords` — the list scraped from
 * the official site's search dropdown. Keeping them identical is what lets a
 * test tell us when a new set adds a keyword we haven't documented.
 *
 * Numeric and card-name variants (<Draw 2>, <De-Digivolve 3>,
 * <Decoy (Black)>) are the same keyword by rule 16-2, so they get one entry.
 */
export type Keyword = {
  /** English name as printed, without the angle brackets. */
  official: string;
  /** Older spellings the official list still carries, e.g. the pre-rename
   *  <Security Attack>. Kept so the cross-check against `card_keywords`
   *  doesn't read a rename as a gap. */
  aka?: string[];
  /** How the card text writes it, for recognition. */
  display: string;
  zh: string;
};

export const KEYWORDS: Keyword[] = [
  {
    official: "Security A.",
    aka: ["Security Attack"],
    display: "＜Security A. +N／−N＞",
    zh: "攻击安全区时,按指定数值增减检查的安全卡张数。旧版写作 ＜Security Attack＞。多个该效果按数值累加,但结果为负时实际检查 0 张。",
  },
  {
    official: "Blocker",
    display: "＜Blocker＞",
    zh: "允许该数码兽进行阻挡。同一只带多个 ＜Blocker＞,在阻挡时机也只能挡 1 次。",
  },
  {
    official: "Recovery",
    display: "＜Recovery +N（区域）＞",
    zh: "把指定区域的指定张数卡背面朝上放到安全区顶部。",
  },
  {
    official: "Piercing",
    display: "＜Piercing＞",
    zh: "这只攻击中的数码兽在战斗中删除对方数码兽后,于攻击结束前立即进行一次安全检查。",
  },
  {
    official: "Draw",
    display: "＜Draw N＞",
    zh: "从牌库抽指定张数。",
  },
  {
    official: "Jamming",
    display: "＜Jamming＞",
    zh: "与对方「安全区数码兽」战斗时不会被删除 —— 只对安全区数码兽生效,普通战斗不适用。",
  },
  {
    official: "Digisorption",
    display: "＜Digisorption −N＞",
    zh: "从手牌进化成带此效果的卡时,可横置我方 1 只数码兽,按指定数值减少进化消费。",
  },
  {
    official: "Reboot",
    display: "＜Reboot＞",
    zh: "在对手的解除休眠阶段也解除这只数码兽的休眠。",
  },
  {
    official: "De-Digivolve",
    display: "＜De-Digivolve N＞",
    zh: "让目标数码兽退化指定阶数(移除顶部的进化源)。",
  },
  {
    official: "Retaliation",
    display: "＜Retaliation＞",
    zh: "与数码兽战斗被删除时,把对方那只数码兽也删除。",
  },
  {
    official: "Digi-Burst",
    display: "＜Digi-Burst N＞",
    zh: "废弃这只数码兽指定张数的进化源,发动该效果指定的另一个效果。",
  },
  {
    official: "Rush",
    display: "＜Rush＞",
    zh: "登场或进化的当回合即可攻击,不必等待一回合。",
  },
  {
    official: "Blitz",
    display: "＜Blitz＞",
    zh: "在对手回合也可以攻击。",
  },
  {
    official: "Delay",
    display: "＜Delay＞",
    zh: "带此效果的卡在战场上时,可废弃该卡以发动 ＜Delay＞ 中指定的效果。",
  },
  {
    official: "Decoy",
    display: "＜Decoy（颜色／条件）＞",
    zh: "我方符合条件的其他数码兽将被对手效果删除时,可改为删除这张卡来代替。",
  },
  {
    official: "Armor Purge",
    display: "＜Armor Purge＞",
    zh: "将被删除时,可废弃顶部 1 张进化源来代替,从而存活。",
  },
  {
    official: "Save",
    display: "＜Save＞",
    zh: "主要阶段可把这张卡放到安全区顶部。",
  },
  {
    official: "Material Save",
    display: "＜Material Save N＞",
    zh: "进化时,把指定张数的进化源放到牌库底而不是叠入。",
  },
  {
    official: "Evade",
    display: "＜Evade＞",
    zh: "将被删除时,可横置这只数码兽来阻止该次删除。",
  },
  {
    official: "Raid",
    display: "＜Raid＞",
    zh: "攻击时可把攻击目标改为对手 DP 最高的未休眠数码兽。",
  },
  {
    official: "Alliance",
    display: "＜Alliance＞",
    zh: "攻击时叠合我方另一只未休眠数码兽,合并 DP 并追加 1 次攻击。",
  },
  {
    official: "Barrier",
    display: "＜Barrier＞",
    zh: "在战斗中将被删除时,可废弃安全区顶部 1 张来阻止该次删除。",
  },
  {
    official: "Blast Digivolve",
    display: "＜Blast Digivolve＞",
    zh: "我方 1 只数码兽可无视消费,直接进化成手牌中带此效果的卡。",
  },
  {
    official: "Fortitude",
    display: "＜Fortitude＞",
    zh: "带有进化源的这只数码兽被删除时,无需支付消费即可将其登场。",
  },
  {
    official: "Mind Link",
    display: "＜Mind Link＞",
    zh: "把带此效果的训练师放入某只进化源中没有训练师卡的数码兽的进化源。",
  },
  {
    official: "Partition",
    display: "＜Partition（指定卡）＞",
    zh: "带此效果、且进化源中各有 1 张指定卡的数码兽,因非我方效果或战斗而离场时,可无视消费从进化源中各登场 1 张指定卡。",
  },
  {
    official: "Collision",
    display: "＜Collision＞",
    zh: "这只数码兽攻击期间,对手全部数码兽获得 ＜Blocker＞,且对手在阻挡时机只要能挡就必须挡。",
  },
  {
    official: "Blast DNA Digivolve",
    display: "＜Blast DNA Digivolve＞",
    zh: "我方指定的 1 只数码兽与手牌中 1 张卡,可无视消费合体进化成手牌中带此效果的卡。",
  },
  {
    official: "Scapegoat",
    display: "＜Scapegoat＞",
    zh: "因非我方效果将被删除时,可改为删除我方另 1 只数码兽来阻止该次删除。",
  },
  {
    official: "Vortex",
    display: "＜Vortex＞",
    zh: "可在我方回合结束时攻击对手的数码兽,并且登场当回合即可攻击。",
  },
  {
    official: "Overclock",
    display: "＜Overclock（条件）＞",
    zh: "我方回合结束时,可删除我方 1 只衍生物或 1 只指定数码兽,让这只数码兽不横置地攻击玩家。",
  },
  {
    official: "Iceclad",
    display: "＜Iceclad＞",
    zh: "战斗时比较「进化源张数」而不是 DP。与安全区数码兽的战斗除外。",
  },
  {
    official: "Decode",
    display: "＜Decode（指定卡）＞",
    zh: "这只数码兽因战斗以外的原因离场时,可无视消费从它的进化源中登场 1 张指定的数码兽卡。",
  },
  {
    official: "Fragment",
    display: "＜Fragment（N）＞",
    zh: "将被删除时,可选择并废弃这只数码兽指定张数的进化源来阻止该次删除。",
  },
  {
    official: "Execute",
    display: "＜Execute＞",
    zh: "我方回合结束时可攻击,攻击结束后这只数码兽被删除。该效果也允许攻击对手未休眠的数码兽。",
  },
  {
    official: "Progress",
    display: "＜Progress＞",
    zh: "攻击期间不受对手效果影响。",
  },
  {
    official: "Link",
    display: "［Link］／＜Link +N＞",
    zh: "带 ［Link］ 的卡可按链接条件横向插入我方指定数码兽,主要阶段支付消费即可,已有插卡时新卡插在最下方。关键字 ＜Link +N＞ 则是把该数码兽的链接卡上限增加指定数值。",
  },
  {
    official: "Training",
    display: "＜Training＞",
    zh: "主要阶段横置这只数码兽,把牌库顶 1 张放到它进化源的最底部。在育成区也能发动。",
  },
  {
    official: "Use Req.",
    display: "＜Use Req.（指定卡）＞",
    zh: "满足指定卡的条件时,可无视颜色要求使用该卡。",
  },
  {
    official: "Ascension",
    display: "＜Ascension＞",
    zh: "带此效果的卡被删除时,玩家可把它放到安全区顶部。",
  },
  {
    official: "Engage",
    display: "＜Engage＞",
    zh: "可在我方回合结束时攻击。",
  },
  {
    official: "Overflow",
    display: "＜Overflow（−N）＞",
    zh: "ACE 卡上的规则。带 ＜Overflow＞ 的卡从场上或从某张卡下方移动到其他区域时,按指定数值移动记忆指示物。即使当时正在处理别的动作,这一步也立即执行;从别的区域移动到场上时不触发。",
  },
  {
    official: "Arts Digivolve",
    display: "［Arts Digivolve］",
    zh: "DUAL 卡上的规则。使用选项卡后,原本要把它废弃,此时可改为让我方场上一张卡无视消费进化成那张 DUAL 卡 —— 它替换的正是「废弃选项卡」这一步。",
  },
  {
    official: "DNA Digivolution",
    display: "［DNA Digivolution］",
    zh: "公开 1 张带 ［DNA Digivolution］ 的数码兽卡,把满足其合体条件的多张我方卡按条件顺序叠起来,连同公开的那张一起进化成 1 只新的数码兽。卡面写法如「［DNA Digivolution］蓝 Lv.4 + 绿 Lv.4:消费 0」。",
  },
  {
    official: "Guard",
    display: "＜Guard＞",
    zh: "我方其他数码兽将因对手效果离开战场时,可删除带此效果的数码兽来阻止其离场。",
  },
];
