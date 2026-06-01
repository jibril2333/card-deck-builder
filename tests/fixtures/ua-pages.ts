/**
 * Hand-crafted HTML fixtures for the UA parser tests.
 *
 * Built to mirror the shape of real responses captured from
 * `unionarena-tcg.com/jp/cardlist/`. We intentionally strip the page chrome
 * (header, footer, scripts) and keep only the markup the parser actually reads,
 * so a real site change that wouldn't affect our parser doesn't break tests.
 */

/** Detail (`detail_iframe.php`) — Character card (Yellow, BP 3500). */
export const FIXTURE_DETAIL_CHARACTER = `
<div class="cardDetailCol isFrame">
  <div class="cardNameNumCol">
    <h2 class="cardNameCol">
      アベンガネ                <span class="rubyData">あべんがね</span>
    </h2>
    <div class="cardNumCol">
      <span class="cardNumData">EX01BT/HTR-2-001</span>
      <span class="rareData">U</span>
    </div>
  </div>
  <div class="cardDetailContentsCol">
    <dl class="cardImgTitleCol">
      <dt>カード画像</dt>
      <dd class="cardDataImgCol"><img src="/jp/images/cardlist/card/EX01BT_HTR-2-001.png?v8" alt="EX01BT/HTR-2-001 アベンガネ"></dd>
      <dt>参戦タイトル</dt>
      <dd class="cardDataTitleCol cgh"><img src="/jp/images/common/logo/logo_htr.png?v2" alt="HUNTER×HUNTER"></dd>
    </dl>
    <div class="cardDataWrap">
      <div class="cardDataFlex">
        <dl class="cardDataCol needEnergyData">
          <dt class="cardDataTit">必要エナジー</dt>
          <dd class="cardDataContents"><img src="/jp/images/cardlist/icon/need/ico_character_energy_yellow3.png" alt="黄3"></dd>
        </dl>
        <dl class="cardDataCol apData">
          <dt class="cardDataTit">消費AP</dt>
          <dd class="cardDataContents">1</dd>
        </dl>
      </div>
      <div class="cardDataFlex">
        <dl class="cardDataCol categoryData">
          <dt class="cardDataTit">カード種類</dt>
          <dd class="cardDataContents">キャラクター</dd>
        </dl>
        <dl class="cardDataCol bpData">
          <dt class="cardDataTit">BP</dt>
          <dd class="cardDataContents">3500</dd>
        </dl>
      </div>
      <dl class="cardDataCol attributeData">
        <dt class="cardDataTit">特徴</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
      <dl class="cardDataCol generatedEnergyData">
        <dt class="cardDataTit">発生エナジー</dt>
        <dd class="cardDataContents"><img src="/jp/images/cardlist/icon/resource/ico_resource_energy_yellow1.png" alt="黄"></dd>
      </dl>
      <dl class="cardDataCol effectData">
        <dt class="cardDataTit">効果</dt>
        <dd class="cardDataContents"><img src="/jp/images/cardlist/icon/effect/ico_appearance.png" alt="登場時">以下から1つまで選ぶ。<br>・相手は自身の場外にあるカードを2枚リムーブエリアに置く。<br>・相手の場の発生エナジーが1以下のフィールドを1枚選び、退場させる。</dd>
      </dl>
      <dl class="cardDataCol triggerData">
        <dt class="cardDataTit">トリガー</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
    </div>
  </div>
</div>
`;

/** Detail — Event card (Blue, no BP). */
export const FIXTURE_DETAIL_EVENT = `
<div class="cardDetailCol isFrame">
  <div class="cardNameNumCol">
    <h2 class="cardNameCol">
      同行                <span class="rubyData">あかんぱにー</span>
    </h2>
    <div class="cardNumCol">
      <span class="cardNumData">EX01BT/HTR-1-030</span>
      <span class="rareData">C★</span>
    </div>
  </div>
  <div class="cardDetailContentsCol">
    <dl class="cardImgTitleCol">
      <dt>カード画像</dt>
      <dd class="cardDataImgCol"><img src="/jp/images/cardlist/card/EX01BT_HTR-1-030_p1.png?v8" alt="EX01BT/HTR-1-030 同行"></dd>
      <dt>参戦タイトル</dt>
      <dd class="cardDataTitleCol cgh"><img src="/jp/images/common/logo/logo_htr.png?v2" alt="HUNTER×HUNTER"></dd>
    </dl>
    <div class="cardDataWrap">
      <div class="cardDataFlex">
        <dl class="cardDataCol needEnergyData">
          <dt class="cardDataTit">必要エナジー</dt>
          <dd class="cardDataContents"><img src="/jp/images/cardlist/icon/need/ico_event_energy_blue2.png" alt="青2"></dd>
        </dl>
        <dl class="cardDataCol apData">
          <dt class="cardDataTit">消費AP</dt>
          <dd class="cardDataContents">1</dd>
        </dl>
      </div>
      <div class="cardDataFlex">
        <dl class="cardDataCol categoryData">
          <dt class="cardDataTit">カード種類</dt>
          <dd class="cardDataContents">イベント</dd>
        </dl>
        <dl class="cardDataCol bpData">
          <dt class="cardDataTit">BP</dt>
          <dd class="cardDataContents">-</dd>
        </dl>
      </div>
      <dl class="cardDataCol attributeData">
        <dt class="cardDataTit">特徴</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
      <dl class="cardDataCol generatedEnergyData">
        <dt class="cardDataTit">発生エナジー</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
      <dl class="cardDataCol effectData">
        <dt class="cardDataTit">効果</dt>
        <dd class="cardDataContents">自分の場のキャラを望む枚数選び、別のラインに移動させるか入れ替える。カードを1枚引く。</dd>
      </dl>
      <dl class="cardDataCol triggerData">
        <dt class="cardDataTit">トリガー</dt>
        <dd class="cardDataContents"><img src="/jp/images/cardlist/icon/trigger/ico_draw_trigger.png" alt="ドロー">カードを1枚引く。</dd>
      </dl>
    </div>
  </div>
</div>
`;

/** Detail — Action Point card (no rarity, no needEnergy, no BP). */
export const FIXTURE_DETAIL_AP = `
<div class="cardDetailCol isFrame">
  <div class="cardNameNumCol">
    <h2 class="cardNameCol">アクションポイント</h2>
    <div class="cardNumCol">
      <span class="cardNumData">EX01BT/HTR-1-AP</span>
      <span class="rareData"></span>
    </div>
  </div>
  <div class="cardDetailContentsCol">
    <dl class="cardImgTitleCol">
      <dt>カード画像</dt>
      <dd class="cardDataImgCol"><img src="/jp/images/cardlist/card/EX01BT_HTR-1-AP.png?v8" alt="EX01BT/HTR-1-AP アクションポイント"></dd>
      <dt>参戦タイトル</dt>
      <dd class="cardDataTitleCol cgh"><img src="/jp/images/common/logo/logo_htr.png?v2" alt="HUNTER×HUNTER"></dd>
    </dl>
    <div class="cardDataWrap">
      <div class="cardDataFlex">
        <dl class="cardDataCol needEnergyData">
          <dt class="cardDataTit">必要エナジー</dt>
          <dd class="cardDataContents">-</dd>
        </dl>
        <dl class="cardDataCol apData">
          <dt class="cardDataTit">消費AP</dt>
          <dd class="cardDataContents">-</dd>
        </dl>
      </div>
      <div class="cardDataFlex">
        <dl class="cardDataCol categoryData">
          <dt class="cardDataTit">カード種類</dt>
          <dd class="cardDataContents">アクションポイント</dd>
        </dl>
        <dl class="cardDataCol bpData">
          <dt class="cardDataTit">BP</dt>
          <dd class="cardDataContents">-</dd>
        </dl>
      </div>
      <dl class="cardDataCol generatedEnergyData">
        <dt class="cardDataTit">発生エナジー</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
      <dl class="cardDataCol effectData">
        <dt class="cardDataTit">効果</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
      <dl class="cardDataCol triggerData">
        <dt class="cardDataTit">トリガー</dt>
        <dd class="cardDataContents">-</dd>
      </dl>
    </div>
  </div>
</div>
`;

/** Empty page — selector regression simulation. */
export const FIXTURE_DETAIL_EMPTY = `
<html><body><div class="errorMessage">no data</div></body></html>
`;

/** List page snippet — 4 entries including one alt-art (_p1). */
export const FIXTURE_LIST = `
<div class="cardlistWrap">
  <ul class="cardlistCol">
    <li class="cardImgCol"><a class="modalCardDataOpen" data-fancybox="group_1" data-type="iframe" href="./detail_iframe.php?card_no=EX01BT/HTR-1-030_p1">
      <img class="lazy" src="/jp/images/cardlist/parts/dummy.gif" data-src="/jp/images/cardlist/card/EX01BT_HTR-1-030_p1.png?v8" alt="EX01BT/HTR-1-030 同行">
    </a></li>
    <li class="cardImgCol"><a class="modalCardDataOpen" data-fancybox="group_1" data-type="iframe" href="./detail_iframe.php?card_no=EX01BT/HTR-2-001">
      <img class="lazy" src="/jp/images/cardlist/parts/dummy.gif" data-src="/jp/images/cardlist/card/EX01BT_HTR-2-001.png?v8" alt="EX01BT/HTR-2-001 アベンガネ">
    </a></li>
    <li class="cardImgCol"><a class="modalCardDataOpen" data-fancybox="group_1" data-type="iframe" href="./detail_iframe.php?card_no=EX01BT/HTR-2-008">
      <img class="lazy" src="/jp/images/cardlist/parts/dummy.gif" data-src="/jp/images/cardlist/card/EX01BT_HTR-2-008.png?v8" alt="EX01BT/HTR-2-008 レイザー">
    </a></li>
    <li class="cardImgCol"><a class="modalCardDataOpen" data-fancybox="group_1" data-type="iframe" href="./detail_iframe.php?card_no=EX01BT/HTR-2-008_p1">
      <img class="lazy" src="/jp/images/cardlist/parts/dummy.gif" data-src="/jp/images/cardlist/card/EX01BT_HTR-2-008_p1.png?v8" alt="EX01BT/HTR-2-008 レイザー">
    </a></li>
  </ul>
</div>
`;
