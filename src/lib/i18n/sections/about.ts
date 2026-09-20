/**
 * 游戏知识页的规则说明。
 *
 * 每段是一条完整的句子,不按加粗片段拆键 —— 译文要能整段读下来才好审。
 * `**…**` 在页面里渲染成加粗,`\n` 渲染成换行(见 about 页的 Rich)。
 */
import { section } from "../define";

export default section({
  zh: {
    intro:
      "Bandai 于 2020 年推出的集换式卡牌游戏，世界范围内同步发行英文版与日文版。核心系统围绕「记忆值」(Memory) 与「安全区」(Security Stack) 展开 —— 记忆值是双方共享的回合资源条，安全区则是攻击落地前的最后一道防线。",
    colors: "颜色",
    colorsText:
      "7 种颜色各有性格：红色擅长进攻、删除对方的数码兽；蓝色返手 / 防守；黄色靠安全区上的牌制造价值；绿色铺场速攻；黑色压记忆 / 阻断；紫色弃牌堆复用；白色补血与混色支援。",
    cardTypes: "卡片类型",
    cardTypesText:
      "**Digimon**：主力战斗单位，按 Lv.2–Lv.7 的等级链通过「进化」叠成。\n" +
      "**Digi-Egg**：进化的最底层（Lv.2），从单独的「蛋区」起手。\n" +
      "**Tamer**：训练师，提供持续效果，不会战斗。\n" +
      "**Option**：一次性效果牌，类似法术。\n" +
      "**Dual**：少见，同时具备多张卡的特性。",
    terms: "关键术语",
    termsText:
      "**Memory**：记忆条从 −10 到 +10，结束自己回合时把记忆推到对方一侧。\n" +
      "**Security Stack**：游戏开始时盖 5 张作为安全区，对方攻击穿透时翻一张结算。\n" +
      "**Inherited Effect**：继承效果，被进化覆盖后仍持续生效。\n" +
      "**DP**：战斗力，攻防比对值。",
    winning: "胜负条件",
    winningText:
      "当对手安全区已空（0 张），你的数码兽再对其发动一次成功的直接攻击，即获胜。另外：牌库抽空（需要抽牌却抽不出）的一方判负。",
    turn: "回合流程",
    turnText:
      "每回合按顺序进行 6 个阶段：\n" +
      "**1. Unsuspend（解除休眠）**：竖正自己所有横置的卡。\n" +
      "**2. Draw（抽牌）**：抽 1 张（先手第一回合跳过）。\n" +
      "**3. Breeding（育成）**：从育成区孵蛋 / 进化，或把成长的数码兽移到战场。\n" +
      "**4. Main（主要）**：花记忆值打出数码兽 / 训练师 / 选项卡、进化、发动效果。\n" +
      "**5. 攻击**：横置数码兽攻击对手数码兽或安全区。\n" +
      "**6. End（结束）**：把记忆推给对手，换手。",
    breeding: "育成区与进化",
    breedingText:
      "**育成区**是独立于战场的小区域，每次只能有 1 只。用蛋卡（Lv.2）起手，在育成阶段进化成 Lv.3，再“孵出”到战场参战。\n" +
      "**进化**：把高一阶的数码兽叠在低阶上、支付进化消费（记忆），下层卡成为「进化源」并提供继承效果。每次进化还能抽 1 张。",
    zones: "游戏区域",
    zonesText:
      "区域有:**牌库**、**蛋卡组**、**战场**、**手牌**、**废弃区**、**安全区**。\n" +
      "其中**公开区域**(如废弃区)双方随时可查看内容和顺序;**非公开区域**(手牌、牌库、安全区)则不可查看。安全区尤其要注意:它是非公开的,双方都不能偷看,只在检查时逐张翻开。",
    attackFlow: "攻击流程",
    attackFlowText:
      "只有回合玩家能攻击。一次攻击按固定顺序经过 5 个时机:\n" +
      "**宣言攻击 → 反击时机 → 阻挡时机 → 确认攻击是否成功 → 攻击结束**\n" +
      "当前时机的处理 **全部结算完** 才会进入下一个时机 —— 这是判断效果发动先后的依据。",
    blocking: "阻挡",
    blockingText:
      "阻挡是把攻击目标换成场上一只带 ＜Blocker＞ 的数码兽。规则要点:\n" +
      "· 每次攻击**只能阻挡 1 次**,不能多只同时阻挡\n" +
      "· 阻挡进行中不能再次宣言阻挡\n" +
      "· 无法横置的数码兽不能阻挡\n" +
      "· **被指定为攻击目标的那只数码兽不能自己阻挡**",
    securityCheck: "安全检查",
    securityCheckText:
      "安全检查是查看对手安全区的规则。**一次攻击只做 1 次安全检查**,但攻击者身上若有 ＜Security A. +N＞ 之类的效果,这一次检查会按修正后的张数进行。检查**逐张**进行。",
    ruleCheck: "规则检查",
    ruleCheckText:
      "在允许的时机,游戏会自动执行一些「该发生就发生」的处理 —— 比如 DP 归零的数码兽被删除、不符合条件的卡离场。它不需要玩家宣言,但在规则处理进行当中不会执行,要等当前处理结束。",
    battle: "战斗",
    battleText:
      "攻击时双方比 **DP**：DP 高的存活、低的被删除（destroy），相等则两败俱伤。攻击安全区时翻开顶部 1 张安全卡结算其效果，再和攻击者比 DP。",
    keywords: "关键字（Keywords）",
    keywordsNote: (n: number) =>
      `共 ${n} 个,取自官方卡表的关键字表,按名称排序,随卡表更新。每条给出英/中/日三种卡面写法。数值或指定卡不同的写法(＜Draw 1＞ 与 ＜Draw 2＞)按规则 16-2 视为同一个关键字,合并成一条。`,
    deckbuilding: "构筑规则",
    deckbuildingText:
      "主卡组恰好 **50** 张；蛋卡组 **0–5** 张（独立洗牌、独立堆叠）；同名卡（按卡名计）每副卡组最多 **4** 张。本工具不强制这些规则，超出会在卡组页给出红字提示。",
    resources: "资源",
    officialCardList: "官方卡表：",
    comprehensiveRules: "综合规则：",
    imageSource: "卡牌图片来源：world.digimoncard.com（已写入数据库 image_url）",
  },
  ja: {
    intro:
      "バンダイが 2020 年に発売したトレーディングカードゲームで、英語版と日本語版が世界同時に展開されています。中心となるのは「メモリー」と「セキュリティ」——メモリーは両プレイヤーが共有するターンの資源、セキュリティは攻撃が通る前の最後の防壁です。",
    colors: "色",
    colorsText:
      "7 色それぞれに性格があります:赤は攻めと相手デジモンの消滅、青は手札に戻す防御、黄はセキュリティを活かした展開、緑は展開と速攻、黒はメモリー圧迫と妨害、紫はトラッシュの再利用、白は回復と多色の補助。",
    cardTypes: "カードの種類",
    cardTypesText:
      "**Digimon**:主力となる戦闘ユニット。Lv.2–Lv.7 の段階を「進化」で重ねます。\n" +
      "**Digi-Egg**:進化の最下段(Lv.2)。専用の「育成エリア」から始めます。\n" +
      "**Tamer**:テイマー。継続的な効果を持ち、戦闘はしません。\n" +
      "**Option**:一度きりの効果カード。呪文のようなものです。\n" +
      "**Dual**:数は少なく、複数のカードの性質を併せ持ちます。",
    terms: "主な用語",
    termsText:
      "**Memory**:メモリーは −10 から +10 まで。自分のターンを終えるとき、相手側へ push します。\n" +
      "**Security Stack**:ゲーム開始時に 5 枚を裏向きで置き、攻撃が通るたびに 1 枚めくって処理します。\n" +
      "**Inherited Effect**:進化元効果。上に重ねられても効果は続きます。\n" +
      "**DP**:戦闘力。戦闘で比べる値です。",
    winning: "勝敗条件",
    winningText:
      "相手のセキュリティが 0 枚のとき、さらにプレイヤーへの攻撃を通せば勝ちです。また、ドローが必要なのにデッキが尽きたプレイヤーは負けになります。",
    turn: "ターンの流れ",
    turnText:
      "1 ターンは 6 つのフェイズを順に進みます:\n" +
      "**1. Unsuspend(アンサスペンド)**:自分のレスト状態のカードをすべてアクティブにします。\n" +
      "**2. Draw(ドロー)**:1 枚引きます(先攻の 1 ターン目はスキップ)。\n" +
      "**3. Breeding(育成)**:育成エリアで孵化・進化させるか、育ったデジモンをバトルエリアへ移します。\n" +
      "**4. Main(メイン)**:メモリーを払ってデジモン / テイマー / オプションを登場させ、進化し、効果を使います。\n" +
      "**5. アタック**:デジモンをレストして相手デジモンかセキュリティを攻撃します。\n" +
      "**6. End(エンド)**:メモリーを相手に渡し、手番を交代します。",
    breeding: "育成エリアと進化",
    breedingText:
      "**育成エリア**はバトルエリアとは別の小さな領域で、1 体しか置けません。デジタマ(Lv.2)から始め、育成フェイズで Lv.3 に進化させ、バトルエリアへ「孵化」させます。\n" +
      "**進化**:上の段階のデジモンを下の段階に重ね、進化コスト(メモリー)を払います。下のカードは「進化元」となり、進化元効果を与えます。進化するたびに 1 枚ドローできます。",
    zones: "ゲームの領域",
    zonesText:
      "領域は **デッキ**、**デジタマデッキ**、**バトルエリア**、**手札**、**トラッシュ**、**セキュリティ** です。\n" +
      "**公開領域**(トラッシュなど)は中身も順番もいつでも確認できます。**非公開領域**(手札・デッキ・セキュリティ)は確認できません。特にセキュリティは非公開で、どちらのプレイヤーも覗けず、チェックのときに 1 枚ずつめくります。",
    attackFlow: "アタックの流れ",
    attackFlowText:
      "アタックできるのはターンプレイヤーだけです。1 回のアタックは決まった順に 5 つのタイミングを通ります:\n" +
      "**アタック宣言 → カウンタータイミング → ブロックタイミング → アタックの成否確認 → アタック終了**\n" +
      "現在のタイミングの処理が **すべて終わって** から次に進みます —— 効果の発揮順はこれで決まります。",
    blocking: "ブロック",
    blockingText:
      "ブロックとは、アタック対象を場の ＜Blocker＞ を持つデジモンに変更することです。要点:\n" +
      "· 1 回のアタックにつき**ブロックは 1 回だけ**で、複数体が同時にブロックすることはできません\n" +
      "· ブロックの処理中にさらにブロックを宣言することはできません\n" +
      "· レストできないデジモンはブロックできません\n" +
      "· **アタック対象に指定されたデジモン自身はブロックできません**",
    securityCheck: "セキュリティチェック",
    securityCheckText:
      "セキュリティチェックは相手のセキュリティを確認するルールです。**1 回のアタックにつきチェックは 1 回**ですが、アタックしているデジモンが ＜Security A. +N＞ のような効果を持つ場合、その 1 回で修正後の枚数をチェックします。チェックは**1 枚ずつ**行います。",
    ruleCheck: "ルール処理",
    ruleCheckText:
      "許されたタイミングで、ゲームは「そうなるべきこと」を自動的に処理します —— DP が 0 になったデジモンの消滅や、条件を満たさなくなったカードの退場などです。宣言は不要ですが、別の処理の最中には行われず、その処理が終わるのを待ちます。",
    battle: "戦闘",
    battleText:
      "戦闘では **DP** を比べます:高い方が残り、低い方は消滅し、同じなら相打ちです。セキュリティへのアタックでは上の 1 枚をめくって効果を処理し、そのうえでアタック側と DP を比べます。",
    keywords: "キーワード(Keywords)",
    keywordsNote: (n) =>
      `全 ${n} 件。公式カードリストのキーワード一覧から取得し、名前順に並べ、カードリストの更新に追随します。各項目に英語・中国語・日本語のカード上の表記を載せています。数値や指定カードだけが違う表記(＜Draw 1＞ と ＜Draw 2＞)は、ルール 16-2 により同じキーワードとして 1 件にまとめています。`,
    deckbuilding: "構築ルール",
    deckbuildingText:
      "メインデッキはちょうど **50** 枚、デジタマデッキは **0–5** 枚(別々にシャッフルし、別々に置きます)。同名カード(カード名で判定)は 1 デッキに **4** 枚までです。このツールはこれらを強制せず、超えた場合はデッキページに赤字で表示します。",
    resources: "参考",
    officialCardList: "公式カードリスト:",
    comprehensiveRules: "総合ルール:",
    imageSource:
      "カード画像の出典:world.digimoncard.com(データベースの image_url に記録)",
  },
  en: {
    intro:
      "A trading card game Bandai launched in 2020, published in English and Japanese worldwide at the same time. Two things carry the design: memory, a single resource track both players share, and the security stack, the last line of defence before an attack lands.",
    colors: "Colors",
    colorsText:
      "Each of the seven colors plays differently: red attacks and deletes, blue bounces and defends, yellow builds value off the security stack, green floods the board and rushes, black squeezes memory and disrupts, purple reuses the trash, and white heals and supports multi-color decks.",
    cardTypes: "Card types",
    cardTypesText:
      "**Digimon**: the fighting units, stacked up the Lv.2–Lv.7 ladder by digivolving.\n" +
      "**Digi-Egg**: the bottom of that ladder (Lv.2), started from its own breeding area.\n" +
      "**Tamer**: a standing presence with ongoing effects; it never battles.\n" +
      "**Option**: a one-shot effect card, much like a spell.\n" +
      "**Dual**: rare cards that are two card types at once.",
    terms: "Key terms",
    termsText:
      "**Memory**: the track runs from −10 to +10; ending your turn pushes memory to the opponent's side.\n" +
      "**Security Stack**: five cards face down at the start; one is flipped and resolved each time an attack gets through.\n" +
      "**Inherited Effect**: keeps working after the card is covered by a digivolution.\n" +
      "**DP**: the number battles are decided by.",
    winning: "How you win",
    winningText:
      "With the opponent's security stack empty, one more successful attack on the player wins the game. A player who must draw from an empty deck loses.",
    turn: "The turn",
    turnText:
      "Every turn runs six phases in order:\n" +
      "**1. Unsuspend**: unsuspend all of your suspended cards.\n" +
      "**2. Draw**: draw one card (skipped on the first turn of the player going first).\n" +
      "**3. Breeding**: hatch or digivolve in the breeding area, or move the Digimon there into play.\n" +
      "**4. Main**: spend memory to play Digimon, Tamers and Options, digivolve, and use effects.\n" +
      "**5. Attack**: suspend a Digimon to attack a Digimon or the security stack.\n" +
      "**6. End**: push memory to the opponent; the turn passes.",
    breeding: "The breeding area and digivolving",
    breedingText:
      "**The breeding area** sits apart from the battle area and holds one Digimon at a time. Start with a Digi-Egg (Lv.2), digivolve it to Lv.3 during the breeding phase, then hatch it into play.\n" +
      "**Digivolving**: stack the next level onto the one below and pay the digivolve cost in memory. The card underneath becomes a digivolution source and lends its inherited effect. Each digivolution also draws a card.",
    zones: "Areas",
    zonesText:
      "The areas are the **deck**, the **egg deck**, the **battle area**, your **hand**, the **trash** and the **security stack**.\n" +
      "**Public areas** (the trash, for one) can be looked through at any time, in order. **Private areas** (hand, deck, security) cannot. The security stack especially: neither player may look, and it is turned over one card at a time when it is checked.",
    attackFlow: "How an attack runs",
    attackFlowText:
      "Only the turn player attacks. An attack passes five timings in a fixed order:\n" +
      "**declare the attack → counter timing → block timing → confirm whether it succeeds → the attack ends**\n" +
      "Everything at the current timing **resolves fully** before the next one begins — that is what decides which effect happens first.",
    blocking: "Blocking",
    blockingText:
      "Blocking changes the attack's target to one of your Digimon with ＜Blocker＞. The rules:\n" +
      "· **one block per attack** — several Digimon cannot block together\n" +
      "· no second block may be declared while one is resolving\n" +
      "· a Digimon that cannot suspend cannot block\n" +
      "· **the Digimon being attacked cannot block for itself**",
    securityCheck: "Checking security",
    securityCheckText:
      "A security check is the rule for looking at the opponent's security stack. **One attack checks security once**, but if the attacker carries something like ＜Security A. +N＞, that one check covers the adjusted number of cards. Cards are checked **one at a time**.",
    ruleCheck: "Rule processing",
    ruleCheckText:
      "At the timings that allow it, the game carries out what simply has to happen — a Digimon at 0 DP is deleted, a card that no longer meets its condition leaves play. Nobody declares it, and it waits for whatever is being resolved to finish.",
    battle: "Battle",
    battleText:
      "Battles compare **DP**: the higher one survives, the lower one is deleted, and equal DP deletes both. Attacking security flips the top card, resolves it, and then compares DP with the attacker.",
    keywords: "Keywords",
    keywordsNote: (n) =>
      `${n} in all, taken from the official card list's keyword table, sorted by name and updated with the card list. Each one is given as it is printed in English, Chinese and Japanese. Spellings that differ only in a number or a named card (＜Draw 1＞ and ＜Draw 2＞) are one keyword by rule 16-2 and share an entry.`,
    deckbuilding: "Deck building",
    deckbuildingText:
      "The main deck is exactly **50** cards; the egg deck is **0–5** (shuffled and kept separately); at most **4** cards with the same name per deck. This tool does not enforce any of it — it points the excess out in red on the deck page.",
    resources: "Sources",
    officialCardList: "Official card list: ",
    comprehensiveRules: "Comprehensive rules: ",
    imageSource:
      "Card images come from world.digimoncard.com (stored as image_url in the database)",
  },
});
