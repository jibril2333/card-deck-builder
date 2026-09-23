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
  /**
   * What the keyword does, in each language. The Chinese is a translation of
   * the rules' own wording; the Japanese and English follow the same reading,
   * in the rules' own vocabulary (消滅 / delete, レスト / suspend, 進化元 /
   * digivolution sources).
   */
  explain: { zh: string; ja: string; en: string };
  /**
   * Carried by neither official dropdown. The site lists "keyword effects";
   * these are separate mechanics the rules define in their own sections, and
   * they are on the cards regardless — so the page shows them from here, and
   * the cross-check against the official list has to know to skip them.
   */
  offList?: true;
};

export const KEYWORDS: Keyword[] = [
  {
    official: "Security A.",
    ja: "セキュリティアタック",
    zhName: "安防攻击",
    aka: ["Security Attack"],
    display: "＜Security A. +N／−N＞",
    explain: {
      zh: "攻击安全区时,按指定数值增减检查的安全卡张数。旧版写作 ＜Security Attack＞。多个该效果按数值累加,但结果为负时实际检查 0 张。",
      ja: "アタック時にチェックするセキュリティの枚数を、指定の数値だけ増減します。旧称は ＜Security Attack＞。複数ある場合は数値を合計し、結果がマイナスならチェックは 0 枚です。",
      en: "Changes how many security cards this attack checks, by the printed number. Older cards spell it ＜Security Attack＞. Several of them add up, and a negative total checks none.",
    },
  },
  {
    official: "Blocker",
    ja: "ブロッカー",
    zhName: "阻挡者",
    display: "＜Blocker＞",
    explain: {
      zh: "允许该数码兽进行阻挡。同一只带多个 ＜Blocker＞,在阻挡时机也只能挡 1 次。",
      ja: "このデジモンがブロックできるようになります。1 体が ＜Blocker＞ を複数持っていても、ブロックできるのは 1 回だけです。",
      en: "Lets this Digimon block. Several copies on one Digimon still block only once per attack.",
    },
  },
  {
    official: "Recovery",
    ja: "リカバリー",
    zhName: "恢复",
    display: "＜Recovery +N（区域）＞",
    explain: {
      zh: "把指定区域的指定张数卡背面朝上放到安全区顶部。",
      ja: "指定のエリアから指定の枚数を裏向きのままセキュリティの上に置きます。",
      en: "Puts the printed number of cards from the named area face down on top of the security stack.",
    },
  },
  {
    official: "Piercing",
    ja: "貫通",
    zhName: "贯通",
    display: "＜Piercing＞",
    explain: {
      zh: "这只攻击中的数码兽在战斗中删除对方数码兽后,于攻击结束前立即进行一次安全检查。",
      ja: "アタック中のこのデジモンが戦闘で相手のデジモンを消滅させたとき、アタック終了前にセキュリティチェックを 1 回行います。",
      en: "If this attacking Digimon deletes the Digimon it battled, it checks security once before the attack ends.",
    },
  },
  {
    official: "Draw",
    ja: "ドロー",
    zhName: "抽卡",
    display: "＜Draw N＞",
    explain: {
      zh: "从牌库抽指定张数。",
      ja: "デッキから指定の枚数をドローします。",
      en: "Draw the printed number of cards.",
    },
  },
  {
    official: "Jamming",
    ja: "ジャミング",
    zhName: "干扰",
    display: "＜Jamming＞",
    explain: {
      zh: "与对方「安全区数码兽」战斗时不会被删除 —— 只对安全区数码兽生效,普通战斗不适用。",
      ja: "相手の「セキュリティデジモン」との戦闘では消滅しません。通常の戦闘には適用されません。",
      en: "Not deleted in battle with a security Digimon. Ordinary battles are unaffected.",
    },
  },
  {
    official: "Digisorption",
    ja: "吸収進化",
    zhName: "吸收进化",
    display: "＜Digisorption −N＞",
    explain: {
      zh: "从手牌进化成带此效果的卡时,可横置我方 1 只数码兽,按指定数值减少进化消费。",
      ja: "手札からこの効果を持つカードに進化するとき、自分のデジモン 1 体をレストして進化コストを指定の数値だけ減らせます。",
      en: "When digivolving into this card from the hand, you may suspend one of your Digimon to lower the cost by the printed number.",
    },
  },
  {
    official: "Reboot",
    ja: "再起動",
    zhName: "重启",
    display: "＜Reboot＞",
    explain: {
      zh: "在对手的解除休眠阶段也解除这只数码兽的休眠。",
      ja: "相手のアンサスペンドフェイズにも、このデジモンをアクティブにします。",
      en: "This Digimon also unsuspends during the opponent's unsuspend phase.",
    },
  },
  {
    official: "De-Digivolve",
    ja: "退化",
    zhName: "退化",
    display: "＜De-Digivolve N＞",
    explain: {
      zh: "让目标数码兽退化指定阶数(移除顶部的进化源)。",
      ja: "対象のデジモンを指定の段数だけ退化させます(上の進化元を取り除きます)。",
      en: "Removes the printed number of cards from the top of the target's digivolution sources, de-digivolving it.",
    },
  },
  {
    official: "Retaliation",
    ja: "道連れ",
    zhName: "同归于尽",
    display: "＜Retaliation＞",
    explain: {
      zh: "与数码兽战斗被删除时,把对方那只数码兽也删除。",
      ja: "デジモンとの戦闘で消滅するとき、相手のそのデジモンも消滅させます。",
      en: "When deleted in battle with a Digimon, that Digimon is deleted too.",
    },
  },
  {
    official: "Digi-Burst",
    ja: "デジバースト",
    zhName: "数码爆裂",
    display: "＜Digi-Burst N＞",
    explain: {
      zh: "废弃这只数码兽指定张数的进化源,发动该效果指定的另一个效果。",
      ja: "このデジモンの進化元を指定の枚数トラッシュして、＜Digi-Burst＞ に書かれた効果を発揮します。",
      en: "Trash the printed number of this Digimon's digivolution sources to use the effect written with it.",
    },
  },
  {
    official: "Rush",
    ja: "速攻",
    zhName: "速攻",
    display: "＜Rush＞",
    explain: {
      zh: "登场或进化的当回合即可攻击,不必等待一回合。",
      ja: "登場・進化したターンからアタックできます。1 ターン待つ必要はありません。",
      en: "Can attack the turn it is played or digivolves, without waiting a turn.",
    },
  },
  {
    official: "Blitz",
    ja: "進撃",
    zhName: "进击",
    display: "＜Blitz＞",
    explain: {
      zh: "在对手回合也可以攻击。",
      ja: "相手のターンにもアタックできます。",
      en: "Can attack during the opponent's turn.",
    },
  },
  {
    official: "Delay",
    ja: "ディレイ",
    zhName: "延迟",
    display: "＜Delay＞",
    explain: {
      zh: "带此效果的卡在战场上时,可废弃该卡以发动 ＜Delay＞ 中指定的效果。",
      ja: "このカードがフィールドにあるとき、そのカードをトラッシュして ＜Delay＞ に書かれた効果を発揮できます。",
      en: "While this card is in play, you may trash it to use the effect written with ＜Delay＞.",
    },
  },
  {
    official: "Decoy",
    ja: "デコイ",
    zhName: "诱饵",
    display: "＜Decoy（颜色／条件）＞",
    explain: {
      zh: "我方符合条件的其他数码兽将被对手效果删除时,可改为删除这张卡来代替。",
      ja: "条件に合う自分の他のデジモンが相手の効果で消滅するとき、代わりにこのカードを消滅させられます。",
      en: "When another of your Digimon matching the condition would be deleted by an opponent's effect, you may delete this card instead.",
    },
  },
  {
    official: "Armor Purge",
    ja: "アーマー解除",
    zhName: "装甲解除",
    display: "＜Armor Purge＞",
    explain: {
      zh: "将被删除时,可废弃顶部 1 张进化源来代替,从而存活。",
      ja: "消滅するとき、代わりに上の進化元 1 枚をトラッシュして生き残れます。",
      en: "When it would be deleted, you may trash the top digivolution source instead and keep it in play.",
    },
  },
  {
    official: "Save",
    ja: "セーブ",
    zhName: "保存",
    display: "＜Save＞",
    explain: {
      zh: "主要阶段可把这张卡放到安全区顶部。",
      ja: "メインフェイズに、このカードをセキュリティの上に置けます。",
      en: "During your main phase, you may put this card on top of the security stack.",
    },
  },
  {
    official: "Material Save",
    ja: "マテリアルセーブ",
    zhName: "素材保存",
    display: "＜Material Save N＞",
    explain: {
      zh: "进化时,把指定张数的进化源放到牌库底而不是叠入。",
      ja: "進化するとき、指定の枚数の進化元を重ねずにデッキの下に置きます。",
      en: "When digivolving, put the printed number of sources at the bottom of the deck instead of under the new card.",
    },
  },
  {
    official: "Evade",
    ja: "回避",
    zhName: "回避",
    display: "＜Evade＞",
    explain: {
      zh: "将被删除时,可横置这只数码兽来阻止该次删除。",
      ja: "消滅するとき、このデジモンをレストしてその消滅を防げます。",
      en: "When it would be deleted, you may suspend it to prevent that.",
    },
  },
  {
    official: "Raid",
    ja: "突進",
    zhName: "突进",
    display: "＜Raid＞",
    explain: {
      zh: "攻击时可把攻击目标改为对手 DP 最高的未休眠数码兽。",
      ja: "アタックするとき、アタック対象を相手の DP が最も高いアクティブなデジモンに変更できます。",
      en: "When attacking, you may change the target to the opponent's unsuspended Digimon with the highest DP.",
    },
  },
  {
    official: "Alliance",
    ja: "連携",
    zhName: "联协",
    display: "＜Alliance＞",
    explain: {
      zh: "攻击时叠合我方另一只未休眠数码兽,合并 DP 并追加 1 次攻击。",
      ja: "アタック時に自分の他のアクティブなデジモンを重ね、DP を合計してアタックを 1 回追加します。",
      en: "When attacking, stack another of your unsuspended Digimon onto it: the DP is added together and the attack happens once more.",
    },
  },
  {
    official: "Barrier",
    ja: "防壁",
    zhName: "屏障",
    display: "＜Barrier＞",
    explain: {
      zh: "在战斗中将被删除时,可废弃安全区顶部 1 张来阻止该次删除。",
      ja: "戦闘で消滅するとき、セキュリティの上 1 枚をトラッシュしてその消滅を防げます。",
      en: "When it would be deleted in battle, you may trash the top security card to prevent that.",
    },
  },
  {
    official: "Blast Digivolve",
    ja: "ブラスト進化",
    zhName: "突风进化",
    display: "＜Blast Digivolve＞",
    explain: {
      zh: "我方 1 只数码兽可无视消费,直接进化成手牌中带此效果的卡。",
      ja: "自分のデジモン 1 体を、コストを支払わずに手札のこの効果を持つカードへ進化させられます。",
      en: "One of your Digimon may digivolve into this card from your hand without paying the cost.",
    },
  },
  {
    official: "Fortitude",
    ja: "不屈",
    zhName: "不屈",
    display: "＜Fortitude＞",
    explain: {
      zh: "带有进化源的这只数码兽被删除时,无需支付消费即可将其登场。",
      ja: "進化元を持つこのデジモンが消滅したとき、コストを支払わずに登場させられます。",
      en: "When this Digimon with digivolution sources is deleted, you may play it again without paying the cost.",
    },
  },
  {
    official: "Mind Link",
    ja: "マインドリンク",
    zhName: "意识链接",
    display: "＜Mind Link＞",
    explain: {
      zh: "把带此效果的训练师放入某只进化源中没有训练师卡的数码兽的进化源。",
      ja: "この効果を持つテイマーを、進化元にテイマーがいないデジモン 1 体の進化元に置きます。",
      en: "Put this Tamer into the digivolution sources of one Digimon that has no Tamer among its sources.",
    },
  },
  {
    official: "Partition",
    ja: "パーティション",
    zhName: "分裂",
    display: "＜Partition（指定卡）＞",
    explain: {
      zh: "带此效果、且进化源中各有 1 张指定卡的数码兽,因非我方效果或战斗而离场时,可无视消费从进化源中各登场 1 张指定卡。",
      ja: "この効果を持ち、進化元に指定のカードを 1 枚ずつ持つデジモンが、自分の効果や戦闘以外で場を離れるとき、進化元からその指定のカードをコストなしで 1 枚ずつ登場させられます。",
      en: "When a Digimon with this effect and one of each named card in its sources leaves play other than by battle or your own effect, you may play one of each of those named cards from its sources without paying the cost.",
    },
  },
  {
    official: "Collision",
    ja: "衝突",
    zhName: "冲突",
    display: "＜Collision＞",
    explain: {
      zh: "这只数码兽攻击期间,对手全部数码兽获得 ＜Blocker＞,且对手在阻挡时机只要能挡就必须挡。",
      ja: "このデジモンのアタック中、相手のデジモンはすべて ＜Blocker＞ を得て、相手はブロックできるならブロックしなければなりません。",
      en: "While this Digimon attacks, every opposing Digimon gains ＜Blocker＞ and the opponent must block if able.",
    },
  },
  {
    official: "Blast DNA Digivolve",
    ja: "ブラストジョグレス",
    zhName: "突风合步",
    display: "＜Blast DNA Digivolve＞",
    explain: {
      zh: "我方指定的 1 只数码兽与手牌中 1 张卡,可无视消费合体进化成手牌中带此效果的卡。",
      ja: "自分の指定のデジモン 1 体と手札のカード 1 枚を、コストを支払わずに手札のこの効果を持つカードへジョグレス進化させられます。",
      en: "One named Digimon of yours plus one card in your hand may DNA digivolve into this card from your hand without paying the cost.",
    },
  },
  {
    official: "Scapegoat",
    ja: "スケープゴート",
    zhName: "替罪",
    display: "＜Scapegoat＞",
    explain: {
      zh: "因非我方效果将被删除时,可改为删除我方另 1 只数码兽来阻止该次删除。",
      ja: "自分の効果以外で消滅するとき、代わりに自分の他のデジモン 1 体を消滅させてその消滅を防げます。",
      en: "When it would be deleted other than by your own effect, you may delete another of your Digimon instead.",
    },
  },
  {
    official: "Vortex",
    ja: "ヴォルテクス",
    zhName: "旋风",
    display: "＜Vortex＞",
    explain: {
      zh: "可在我方回合结束时攻击对手的数码兽,并且登场当回合即可攻击。",
      ja: "自分のターンの終わりに相手のデジモンへアタックでき、登場したターンからアタックできます。",
      en: "May attack an opposing Digimon at the end of your turn, and may attack the turn it is played.",
    },
  },
  {
    official: "Overclock",
    ja: "オーバークロック",
    zhName: "超频",
    display: "＜Overclock（条件）＞",
    explain: {
      zh: "我方回合结束时,可删除我方 1 只衍生物或 1 只指定数码兽,让这只数码兽不横置地攻击玩家。",
      ja: "自分のターンの終わりに、自分のトークン 1 体または指定のデジモン 1 体を消滅させると、このデジモンはレストせずにプレイヤーへアタックできます。",
      en: "At the end of your turn, delete one of your tokens or one named Digimon to attack the player without suspending.",
    },
  },
  {
    official: "Iceclad",
    ja: "氷装",
    zhName: "冰装",
    display: "＜Iceclad＞",
    explain: {
      zh: "战斗时比较「进化源张数」而不是 DP。与安全区数码兽的战斗除外。",
      ja: "戦闘では DP ではなく「進化元の枚数」を比べます。セキュリティデジモンとの戦闘を除きます。",
      en: "Battles compare the number of digivolution sources instead of DP, except against a security Digimon.",
    },
  },
  {
    official: "Decode",
    ja: "デコード",
    zhName: "解码",
    display: "＜Decode（指定卡）＞",
    explain: {
      zh: "这只数码兽因战斗以外的原因离场时,可无视消费从它的进化源中登场 1 张指定的数码兽卡。",
      ja: "このデジモンが戦闘以外で場を離れるとき、その進化元から指定のデジモンカード 1 枚をコストなしで登場させられます。",
      en: "When this Digimon leaves play other than by battle, you may play one named Digimon card from its sources without paying the cost.",
    },
  },
  {
    official: "Fragment",
    ja: "フラグメント",
    zhName: "碎片",
    display: "＜Fragment（N）＞",
    explain: {
      zh: "将被删除时,可选择并废弃这只数码兽指定张数的进化源来阻止该次删除。",
      ja: "消滅するとき、このデジモンの進化元を指定の枚数選んでトラッシュし、その消滅を防げます。",
      en: "When it would be deleted, you may trash the printed number of its digivolution sources to prevent that.",
    },
  },
  {
    official: "Execute",
    ja: "エグゼキュート",
    zhName: "处决",
    display: "＜Execute＞",
    explain: {
      zh: "我方回合结束时可攻击,攻击结束后这只数码兽被删除。该效果也允许攻击对手未休眠的数码兽。",
      ja: "自分のターンの終わりにアタックでき、アタック終了後にこのデジモンは消滅します。この効果では相手のアクティブなデジモンにもアタックできます。",
      en: "May attack at the end of your turn, and is deleted when that attack ends. This attack may target the opponent's unsuspended Digimon.",
    },
  },
  {
    official: "Progress",
    ja: "プログレス",
    zhName: "进程",
    display: "＜Progress＞",
    explain: {
      zh: "攻击期间不受对手效果影响。",
      ja: "アタック中、相手の効果を受けません。",
      en: "Unaffected by the opponent's effects while attacking.",
    },
  },
  {
    official: "Link",
    ja: "リンク",
    zhName: "链接",
    display: "［Link］／＜Link +N＞",
    explain: {
      zh: "带 ［Link］ 的卡可按链接条件横向插入我方指定数码兽,主要阶段支付消费即可,已有插卡时新卡插在最下方。关键字 ＜Link +N＞ 则是把该数码兽的链接卡上限增加指定数值。",
      ja: "［Link］ を持つカードは、リンク条件に従って自分の指定のデジモンへ横向きに差し込めます。メインフェイズにコストを支払えば差し込め、すでにある場合は一番下に入ります。キーワード ＜Link +N＞ はそのデジモンのリンク上限を指定の数値だけ増やします。",
      en: "A card with ［Link］ plugs in sideways under one of your named Digimon: pay the cost in your main phase, and a new one goes underneath any already there. The keyword ＜Link +N＞ raises how many links that Digimon may hold.",
    },
  },
  {
    official: "Training",
    ja: "トレーニング",
    zhName: "训练",
    display: "＜Training＞",
    explain: {
      zh: "主要阶段横置这只数码兽,把牌库顶 1 张放到它进化源的最底部。在育成区也能发动。",
      ja: "メインフェイズにこのデジモンをレストし、デッキの上 1 枚を進化元の一番下に置きます。育成エリアでも使えます。",
      en: "In your main phase, suspend this Digimon and put the top card of your deck at the bottom of its digivolution sources. Works in the breeding area too.",
    },
  },
  {
    official: "Use Req.",
    ja: "使用条件",
    zhName: "使用条件",
    display: "＜Use Req.（指定卡）＞",
    explain: {
      zh: "满足指定卡的条件时,可无视颜色要求使用该卡。",
      ja: "指定のカードの条件を満たしているとき、色の条件を無視してそのカードを使えます。",
      en: "While the named requirement is met, you may use the card ignoring its color requirement.",
    },
  },
  {
    official: "Ascension",
    ja: "天昇",
    zhName: "升天",
    display: "＜Ascension＞",
    explain: {
      zh: "带此效果的卡被删除时,玩家可把它放到安全区顶部。",
      ja: "この効果を持つカードが消滅したとき、そのプレイヤーはセキュリティの上に置けます。",
      en: "When a card with this effect is deleted, its player may put it on top of the security stack.",
    },
  },
  {
    official: "Engage",
    ja: "急襲",
    zhName: "急袭",
    display: "＜Engage＞",
    explain: {
      zh: "可在我方回合结束时攻击。",
      ja: "自分のターンの終わりにアタックできます。",
      en: "May attack at the end of your turn.",
    },
  },
  {
    official: "Overflow",
    ja: "オーバーフロー",
    zhName: "溢出",
    display: "＜Overflow（−N）＞",
    explain: {
      zh: "ACE 卡上的规则。带 ＜Overflow＞ 的卡从场上或从某张卡下方移动到其他区域时,按指定数值移动记忆指示物。即使当时正在处理别的动作,这一步也立即执行;从别的区域移动到场上时不触发。",
      ja: "ACE カードのルールです。＜Overflow＞ を持つカードが場から、またはカードの下から他のエリアへ移動したとき、指定の数値だけメモリーを動かします。他の処理の途中でも即座に行い、他のエリアから場へ移動したときには発生しません。",
      en: "The ACE rule. When a card with ＜Overflow＞ moves from the field, or from under another card, to any other area, memory moves by the printed number — immediately, even in the middle of something else. Moving onto the field does not trigger it.",
    },
  },
  {
    official: "Arts Digivolve",
    ja: "アーツ進化",
    zhName: "技艺进化",
    display: "［Arts Digivolve］",
    explain: {
      zh: "DUAL 卡上的规则。使用选项卡后,原本要把它废弃,此时可改为让我方场上一张卡无视消费进化成那张 DUAL 卡 —— 它替换的正是「废弃选项卡」这一步。",
      ja: "DUAL カードのルールです。オプションを使った後、本来はトラッシュするところを、代わりに自分の場のカード 1 枚をコストなしでその DUAL カードへ進化させられます —— 置き換わるのは「オプションをトラッシュする」手順です。",
      en: "The DUAL rule. After the Option resolves, instead of trashing it you may digivolve one of your cards in play into that DUAL card without paying a cost — it replaces the step that would trash the Option.",
    },
  },
  {
    official: "DNA Digivolution",
    ja: "ジョグレス",
    zhName: "合步",
    display: "［DNA Digivolution］",
    explain: {
      zh: "公开 1 张带 ［DNA Digivolution］ 的数码兽卡,把满足其合体条件的多张我方卡按条件顺序叠起来,连同公开的那张一起进化成 1 只新的数码兽。卡面写法如「［DNA Digivolution］蓝 Lv.4 + 绿 Lv.4:消费 0」。",
      ja: "［DNA Digivolution］ を持つデジモンカード 1 枚を公開し、その条件を満たす自分のカードを条件の順に重ね、公開したカードとあわせて 1 体の新しいデジモンに進化します。カードには「［DNA Digivolution］青 Lv.4 + 緑 Lv.4:コスト 0」のように書かれます。",
      en: "Reveal one Digimon card with ［DNA Digivolution］, stack the cards of yours that meet its conditions in the order given, and digivolve all of it into one new Digimon. Cards print it as “［DNA Digivolution］Blue Lv.4 + Green Lv.4: Cost 0”.",
    },
  },
  {
    official: "Guard",
    ja: "守護",
    zhName: "守护",
    display: "＜Guard＞",
    explain: {
      zh: "我方其他数码兽将因对手效果离开战场时,可删除带此效果的数码兽来阻止其离场。",
      ja: "自分の他のデジモンが相手の効果でバトルエリアを離れるとき、この効果を持つデジモンを消滅させてそれを防げます。",
      en: "When another of your Digimon would leave the battle area by an opponent's effect, you may delete the Digimon with this effect to prevent it.",
    },
  },
  {
    // Not on any official keyword list — the rules file these as their own
    // mechanic, and the site's dropdown only carries "keyword effects". They
    // are on the cards all the same, in their own green line.
    official: "Assembly",
    ja: "アセンブリ",
    zhName: "组装",
    display: "组装-N:「A」×「B」",
    explain: {
      zh: "登场这张卡时,可把废弃区里指定的卡放到它下面作为进化源,每放 1 张登场费用 -N。写在进化条件下面,如「组装-4:「机械暴龙兽:奥特罗斯形态」×「暴龙兽」」。",
      ja: "このカードを登場させるとき、トラッシュの指定のカードを下に進化元として置けます。1 枚ごとに登場コストが -N されます。進化条件の下に「アセンブリ-4:「マシンドラモン:アルタラウス」×「グレイモン」」のように書かれます。",
      en: "When you play this card, you may put named cards from the trash underneath it as digivolution sources; each one lowers the play cost by N. Printed under the digivolve conditions, e.g. “Assembly-4: ‘Machinedramon: Ultheros’ × ‘Greymon’”.",
    },
  },
  {
    official: "DigiXros",
    offList: true,
    ja: "デジクロス",
    zhName: "数码合体",
    display: "数码合体-N:「A」×「B」",
    explain: {
      zh: "登场这张卡时,可把手牌或战斗区里指定的卡放到它下面,每放 1 张登场费用 -N。与组装的差别只在于取卡的区域。",
      ja: "このカードを登場させるとき、手札やバトルエリアの指定のカードを下に置けます。1 枚ごとに登場コストが -N されます。アセンブリとの違いは、どのエリアから取るかだけです。",
      en: "When you play this card, you may put named cards from your hand or the battle area underneath it; each one lowers the play cost by N. It differs from Assembly only in where the cards come from.",
    },
  },
  {
    official: "App Fusion",
    offList: true,
    ja: "アプ合体",
    zhName: "应用合体",
    display: "〔应用合体〕「A」＆「B」:费用N",
    explain: {
      zh: "指定的数种卡处于链接状态时,把这张卡叠在链接卡上进化,支付写明的费用。",
      ja: "指定の複数のカードがリンクしているとき、このカードをそのリンクカードに重ねて進化させ、書かれたコストを支払います。",
      en: "While the named cards are linked, stack this card onto them and digivolve, paying the printed cost.",
    },
  },
  {
    official: "Digivolve",
    offList: true,
    ja: "進化",
    zhName: "进化",
    display: "〔进化〕来源:费用N",
    explain: {
      zh: "把这张卡叠在满足写明条件的我方数码兽上并支付费用,原来那只连同它的进化源一起成为新数码兽的进化源。",
      ja: "書かれた条件を満たす自分のデジモンにこのカードを重ねてコストを支払います。元のデジモンはその進化元ごと、新しいデジモンの進化元になります。",
      en: "Stack this card onto one of your Digimon that meets the printed condition and pay the cost. That Digimon and its sources become the new Digimon's digivolution sources.",
    },
  },
  {
    official: "Detach",
    ja: "分離",
    zhName: "分离",
    display: "＜Detach（指定条件）＞",
    explain: {
      zh: "这只数码兽因我方效果以外的方式将要离开战斗区时,可丢弃它 1 张指定的链接卡牌,使其不离开。括号里写明算作指定的链接卡,如 ＜Detach（特征「七代码」）＞。",
      ja: "このデジモンが自分の効果以外でバトルエリアを離れるとき、指定のリンクカード 1 枚を捨てて離れないようにできます。括弧内が指定のリンクカードで、＜Detach(特徴「セブンコード」)＞ のように書かれます。",
      en: "When this Digimon would leave the battle area other than by your own effect, you may discard one of the named link cards to keep it there. The brackets say which count, e.g. ＜Detach (［Seven Code］ trait)＞.",
    },
  },
  {
    official: "Succession",
    ja: "継承",
    zhName: "继承",
    display: "＜Succession（指定卡）＞",
    explain: {
      zh: "获得这只数码兽进化源中指定卡牌最上方 1 张的全部效果,该卡自身的 ＜Succession＞ 除外。括号里写明哪些卡算作指定,如 ＜Succession（「朱庇特兽」）＞。",
      ja: "このデジモンの進化元にある指定のカードのうち、最も上の 1 枚の効果をすべて得ます(そのカード自身の ＜Succession＞ を除く)。括弧内がどのカードを指すかを示し、＜Succession(「ジュピターモン」)＞ のように書かれます。",
      en: "Gains every effect of the topmost named card among its digivolution sources, except that card's own ＜Succession＞. The brackets say which cards count, e.g. ＜Succession (‘Jupitermon’)＞.",
    },
  },
];
