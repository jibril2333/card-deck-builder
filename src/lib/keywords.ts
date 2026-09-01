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
  /** The name as each language's card text prints it. Every one was read off
   *  the cards themselves — for each English keyword, the cards carrying it
   *  were looked up and the bracketed term in the same card's ja / zh text
   *  taken by frequency. Guessing at these is how you end up mapping Raid to
   *  進撃 (it's 突進; 進撃 is Blitz). */
  ja: string;
  zhName: string;
  /** How the card text writes it, for recognition. */
  display: string;
  zh: string;
};

export const KEYWORDS: Keyword[] = [
  {
    official: "Security A.",
    ja: "セキュリティアタック",
    zhName: "安防攻击",
    aka: ["Security Attack"],
    display: "＜Security A. +N／−N＞",
    zh: "攻击安全区时,按指定数值增减检查的安全卡张数。旧版写作 ＜Security Attack＞。多个该效果按数值累加,但结果为负时实际检查 0 张。",
  },
  {
    official: "Blocker",
    ja: "ブロッカー",
    zhName: "阻挡者",
    display: "＜Blocker＞",
    zh: "允许该数码兽进行阻挡。同一只带多个 ＜Blocker＞,在阻挡时机也只能挡 1 次。",
  },
  {
    official: "Recovery",
    ja: "リカバリー",
    zhName: "恢复",
    display: "＜Recovery +N（区域）＞",
    zh: "把指定区域的指定张数卡背面朝上放到安全区顶部。",
  },
  {
    official: "Piercing",
    ja: "貫通",
    zhName: "贯通",
    display: "＜Piercing＞",
    zh: "这只攻击中的数码兽在战斗中删除对方数码兽后,于攻击结束前立即进行一次安全检查。",
  },
  {
    official: "Draw",
    ja: "ドロー",
    zhName: "抽卡",
    display: "＜Draw N＞",
    zh: "从牌库抽指定张数。",
  },
  {
    official: "Jamming",
    ja: "ジャミング",
    zhName: "干扰",
    display: "＜Jamming＞",
    zh: "与对方「安全区数码兽」战斗时不会被删除 —— 只对安全区数码兽生效,普通战斗不适用。",
  },
  {
    official: "Digisorption",
    ja: "吸収進化",
    zhName: "吸收进化",
    display: "＜Digisorption −N＞",
    zh: "从手牌进化成带此效果的卡时,可横置我方 1 只数码兽,按指定数值减少进化消费。",
  },
  {
    official: "Reboot",
    ja: "再起動",
    zhName: "重启",
    display: "＜Reboot＞",
    zh: "在对手的解除休眠阶段也解除这只数码兽的休眠。",
  },
  {
    official: "De-Digivolve",
    ja: "退化",
    zhName: "退化",
    display: "＜De-Digivolve N＞",
    zh: "让目标数码兽退化指定阶数(移除顶部的进化源)。",
  },
  {
    official: "Retaliation",
    ja: "道連れ",
    zhName: "同归于尽",
    display: "＜Retaliation＞",
    zh: "与数码兽战斗被删除时,把对方那只数码兽也删除。",
  },
  {
    official: "Digi-Burst",
    ja: "デジバースト",
    zhName: "数码爆裂",
    display: "＜Digi-Burst N＞",
    zh: "废弃这只数码兽指定张数的进化源,发动该效果指定的另一个效果。",
  },
  {
    official: "Rush",
    ja: "速攻",
    zhName: "速攻",
    display: "＜Rush＞",
    zh: "登场或进化的当回合即可攻击,不必等待一回合。",
  },
  {
    official: "Blitz",
    ja: "進撃",
    zhName: "进击",
    display: "＜Blitz＞",
    zh: "在对手回合也可以攻击。",
  },
  {
    official: "Delay",
    ja: "ディレイ",
    zhName: "延迟",
    display: "＜Delay＞",
    zh: "带此效果的卡在战场上时,可废弃该卡以发动 ＜Delay＞ 中指定的效果。",
  },
  {
    official: "Decoy",
    ja: "デコイ",
    zhName: "诱饵",
    display: "＜Decoy（颜色／条件）＞",
    zh: "我方符合条件的其他数码兽将被对手效果删除时,可改为删除这张卡来代替。",
  },
  {
    official: "Armor Purge",
    ja: "アーマー解除",
    zhName: "装甲解除",
    display: "＜Armor Purge＞",
    zh: "将被删除时,可废弃顶部 1 张进化源来代替,从而存活。",
  },
  {
    official: "Save",
    ja: "セーブ",
    zhName: "保存",
    display: "＜Save＞",
    zh: "主要阶段可把这张卡放到安全区顶部。",
  },
  {
    official: "Material Save",
    ja: "マテリアルセーブ",
    zhName: "素材保存",
    display: "＜Material Save N＞",
    zh: "进化时,把指定张数的进化源放到牌库底而不是叠入。",
  },
  {
    official: "Evade",
    ja: "回避",
    zhName: "回避",
    display: "＜Evade＞",
    zh: "将被删除时,可横置这只数码兽来阻止该次删除。",
  },
  {
    official: "Raid",
    ja: "突進",
    zhName: "突进",
    display: "＜Raid＞",
    zh: "攻击时可把攻击目标改为对手 DP 最高的未休眠数码兽。",
  },
  {
    official: "Alliance",
    ja: "連携",
    zhName: "联协",
    display: "＜Alliance＞",
    zh: "攻击时叠合我方另一只未休眠数码兽,合并 DP 并追加 1 次攻击。",
  },
  {
    official: "Barrier",
    ja: "防壁",
    zhName: "屏障",
    display: "＜Barrier＞",
    zh: "在战斗中将被删除时,可废弃安全区顶部 1 张来阻止该次删除。",
  },
  {
    official: "Blast Digivolve",
    ja: "ブラスト進化",
    zhName: "突风进化",
    display: "＜Blast Digivolve＞",
    zh: "我方 1 只数码兽可无视消费,直接进化成手牌中带此效果的卡。",
  },
  {
    official: "Fortitude",
    ja: "不屈",
    zhName: "不屈",
    display: "＜Fortitude＞",
    zh: "带有进化源的这只数码兽被删除时,无需支付消费即可将其登场。",
  },
  {
    official: "Mind Link",
    ja: "マインドリンク",
    zhName: "意识链接",
    display: "＜Mind Link＞",
    zh: "把带此效果的训练师放入某只进化源中没有训练师卡的数码兽的进化源。",
  },
  {
    official: "Partition",
    ja: "パーティション",
    zhName: "分裂",
    display: "＜Partition（指定卡）＞",
    zh: "带此效果、且进化源中各有 1 张指定卡的数码兽,因非我方效果或战斗而离场时,可无视消费从进化源中各登场 1 张指定卡。",
  },
  {
    official: "Collision",
    ja: "衝突",
    zhName: "冲突",
    display: "＜Collision＞",
    zh: "这只数码兽攻击期间,对手全部数码兽获得 ＜Blocker＞,且对手在阻挡时机只要能挡就必须挡。",
  },
  {
    official: "Blast DNA Digivolve",
    ja: "ブラストジョグレス",
    zhName: "突风合步",
    display: "＜Blast DNA Digivolve＞",
    zh: "我方指定的 1 只数码兽与手牌中 1 张卡,可无视消费合体进化成手牌中带此效果的卡。",
  },
  {
    official: "Scapegoat",
    ja: "スケープゴート",
    zhName: "替罪",
    display: "＜Scapegoat＞",
    zh: "因非我方效果将被删除时,可改为删除我方另 1 只数码兽来阻止该次删除。",
  },
  {
    official: "Vortex",
    ja: "ヴォルテクス",
    zhName: "旋风",
    display: "＜Vortex＞",
    zh: "可在我方回合结束时攻击对手的数码兽,并且登场当回合即可攻击。",
  },
  {
    official: "Overclock",
    ja: "オーバークロック",
    zhName: "超频",
    display: "＜Overclock（条件）＞",
    zh: "我方回合结束时,可删除我方 1 只衍生物或 1 只指定数码兽,让这只数码兽不横置地攻击玩家。",
  },
  {
    official: "Iceclad",
    ja: "氷装",
    zhName: "冰装",
    display: "＜Iceclad＞",
    zh: "战斗时比较「进化源张数」而不是 DP。与安全区数码兽的战斗除外。",
  },
  {
    official: "Decode",
    ja: "デコード",
    zhName: "解码",
    display: "＜Decode（指定卡）＞",
    zh: "这只数码兽因战斗以外的原因离场时,可无视消费从它的进化源中登场 1 张指定的数码兽卡。",
  },
  {
    official: "Fragment",
    ja: "フラグメント",
    zhName: "碎片",
    display: "＜Fragment（N）＞",
    zh: "将被删除时,可选择并废弃这只数码兽指定张数的进化源来阻止该次删除。",
  },
  {
    official: "Execute",
    ja: "エグゼキュート",
    zhName: "处决",
    display: "＜Execute＞",
    zh: "我方回合结束时可攻击,攻击结束后这只数码兽被删除。该效果也允许攻击对手未休眠的数码兽。",
  },
  {
    official: "Progress",
    ja: "プログレス",
    zhName: "进程",
    display: "＜Progress＞",
    zh: "攻击期间不受对手效果影响。",
  },
  {
    official: "Link",
    ja: "リンク",
    zhName: "链接",
    display: "［Link］／＜Link +N＞",
    zh: "带 ［Link］ 的卡可按链接条件横向插入我方指定数码兽,主要阶段支付消费即可,已有插卡时新卡插在最下方。关键字 ＜Link +N＞ 则是把该数码兽的链接卡上限增加指定数值。",
  },
  {
    official: "Training",
    ja: "トレーニング",
    zhName: "训练",
    display: "＜Training＞",
    zh: "主要阶段横置这只数码兽,把牌库顶 1 张放到它进化源的最底部。在育成区也能发动。",
  },
  {
    official: "Use Req.",
    ja: "使用条件",
    zhName: "使用条件",
    display: "＜Use Req.（指定卡）＞",
    zh: "满足指定卡的条件时,可无视颜色要求使用该卡。",
  },
  {
    official: "Ascension",
    ja: "天昇",
    zhName: "升天",
    display: "＜Ascension＞",
    zh: "带此效果的卡被删除时,玩家可把它放到安全区顶部。",
  },
  {
    official: "Engage",
    ja: "急襲",
    zhName: "急袭",
    display: "＜Engage＞",
    zh: "可在我方回合结束时攻击。",
  },
  {
    official: "Overflow",
    ja: "オーバーフロー",
    zhName: "溢出",
    display: "＜Overflow（−N）＞",
    zh: "ACE 卡上的规则。带 ＜Overflow＞ 的卡从场上或从某张卡下方移动到其他区域时,按指定数值移动记忆指示物。即使当时正在处理别的动作,这一步也立即执行;从别的区域移动到场上时不触发。",
  },
  {
    official: "Arts Digivolve",
    ja: "アーツ進化",
    zhName: "技艺进化",
    display: "［Arts Digivolve］",
    zh: "DUAL 卡上的规则。使用选项卡后,原本要把它废弃,此时可改为让我方场上一张卡无视消费进化成那张 DUAL 卡 —— 它替换的正是「废弃选项卡」这一步。",
  },
  {
    official: "DNA Digivolution",
    ja: "ジョグレス",
    zhName: "合步",
    display: "［DNA Digivolution］",
    zh: "公开 1 张带 ［DNA Digivolution］ 的数码兽卡,把满足其合体条件的多张我方卡按条件顺序叠起来,连同公开的那张一起进化成 1 只新的数码兽。卡面写法如「［DNA Digivolution］蓝 Lv.4 + 绿 Lv.4:消费 0」。",
  },
  {
    official: "Guard",
    ja: "守護",
    zhName: "守护",
    display: "＜Guard＞",
    zh: "我方其他数码兽将因对手效果离开战场时,可删除带此效果的数码兽来阻止其离场。",
  },
  {
    official: "Detach",
    ja: "分離",
    zhName: "分离",
    display: "＜Detach（指定条件）＞",
    zh: "这只数码兽因我方效果以外的方式将要离开战斗区时,可丢弃它 1 张指定的链接卡牌,使其不离开。括号里写明算作指定的链接卡,如 ＜Detach（特征「七代码」）＞。",
  },
  {
    official: "Succession",
    ja: "継承",
    zhName: "继承",
    display: "＜Succession（指定卡）＞",
    zh: "获得这只数码兽进化源中指定卡牌最上方 1 张的全部效果,该卡自身的 ＜Succession＞ 除外。括号里写明哪些卡算作指定,如 ＜Succession（「朱庇特兽」）＞。",
  },
];
