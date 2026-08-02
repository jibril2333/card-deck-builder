/**
 * Hand-crafted HTML fixtures mirroring the official Digimon cardlist's
 * `<div class="popupCol">` structure.
 *
 * These are intentionally synthetic — not snapshots of one real page — so that
 * we can exercise specific branches of `parseCardBlock` (dual-mode normalization,
 * Digi-egg casing, color-cell scoping vs Digivolve-Cost color cells, etc.)
 * without depending on a 200KB HTML blob. When the official structure changes,
 * fixture changes here are isolated and reviewable.
 */

/** A normal Digimon with cost + DP + effect, base art. */
export const FIXTURE_DIGIMON_BASE = `
<div class="popupCol" id="BT25-001">
  <p class="cardNo">BT25-001</p>
  <p class="cardTitle">Greymon</p>
  <p class="cardRarity">C</p>
  <p class="cardType">Digimon</p>
  <p class="cardLv">Lv.4</p>
  <div class="cardImg"><img src="../images/cardlist/card/BT25-001.png?20250101" /></div>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Color</dt>
    <dd><span class="cardColor_red">Red</span></dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Cost</dt>
    <dd>4</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">DP</dt>
    <dd>3000</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Form</dt>
    <dd>Champion</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Attribute</dt>
    <dd>Vaccine</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Type</dt>
    <dd>Dinosaur</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Digivolve Cost 1</dt>
    <dd>2 from Lv.3 <span class="cardColor_red">Red</span></dd>
  </dl>
  <dl class="cardInfoBoxSmall">
    <dt class="cardInfoTitSmall">[Effect]</dt>
    <dd class="cardInfoData">When this Digimon attacks,<br>draw 1.</dd>
  </dl>
  <dl class="cardInfoBoxSmall">
    <dt class="cardInfoTitSmall">[Inherited Effect]</dt>
    <dd class="cardInfoData">+1000 DP.</dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Notes</dt>
    <dd>BT25 Booster
      <ul class="cardInfoLink"><li>CARD LIST</li><li>PRODUCTS</li></ul>
    </dd>
  </dl>
</div>
`;

/** Same code, alt-art printing (_P1). Same id so dedupe should keep the base. */
export const FIXTURE_DIGIMON_ALT_ART = `
<div class="popupCol" id="BT25-001">
  <p class="cardNo">BT25-001</p>
  <p class="cardTitle">Greymon</p>
  <p class="cardRarity">SR</p>
  <p class="cardType">Digimon</p>
  <p class="cardLv">Lv.4</p>
  <div class="cardImg"><img src="../images/cardlist/card/BT25-001_P1.png" /></div>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Color</dt>
    <dd><span class="cardColor_red">Red</span></dd>
  </dl>
</div>
`;

/** Dual-mode card (Digimon/Option) — should be normalized to "Dual". */
export const FIXTURE_DUAL = `
<div class="popupCol" id="BT12-050">
  <p class="cardNo">BT12-050</p>
  <p class="cardTitle">Stingmon ACE</p>
  <p class="cardRarity">R</p>
  <p class="cardType">Digimon/Option</p>
  <p class="cardLv">Lv.4</p>
  <div class="cardImg"><img src="../images/cardlist/card/BT12-050.png" /></div>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Color</dt>
    <dd><span class="cardColor_green">Green</span></dd>
  </dl>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Digivolve Cost 1</dt>
    <dd>2 from Lv.3 <span class="cardColor_blue">Blue</span></dd>
  </dl>
</div>
`;

/**
 * A REAL Dual card as the official sites render it (trimmed from
 * world.digimoncard.com's BT25-057 block). The second face lives in
 * `.dualCardCol` and re-uses every class name the main face uses — .cardTitle,
 * .cardInfoBox, .cardInfoBoxSmall — so the parser has to scope each lookup to
 * one half or the other. `DUAL Color` here is deliberately different from the
 * Digimon half's colour, and the DUAL Cost differs from Cost, so a leak in
 * either direction shows up as a wrong value rather than a coincidence.
 */
export const FIXTURE_DUAL_FULL = `
<div class="popupCol" id="BT25-057">
  <div class="cardTitleCol">
    <p class="cardNo">BT25-057</p>
    <p class="cardRarity">UR</p>
    <p class="cardType">Digimon/Option</p>
    <p class="cardLv">Lv.5</p>
    <div class="cardTitle">Monarchlizamon</div>
  </div>
  <div class="cardImg"><img src="../images/cardlist/card/BT25-057.png?04" /></div>
  <div class="cardInfoCol">
    <dl class="cardInfoBox">
      <dt class="cardInfoTit">Color</dt>
      <dd><span class="cardColor_green">Green</span><span class="cardColor_black">Black</span></dd>
    </dl>
    <dl class="cardInfoBox">
      <dt class="cardInfoTit">Cost</dt>
      <dd class="cardInfoData">D</dd>
    </dl>
    <dl class="cardInfoBox">
      <dt class="cardInfoTit">DP</dt>
      <dd class="cardInfoData">8000</dd>
    </dl>
    <div class="cardInfoBox">
      <div class="cardInfoTitMedium">Card Text 1</div>
      <dl class="cardInfoBoxSmall">
        <dt class="cardInfoTitSmall">[Special Digivolution Condition]</dt>
        <dd class="cardInfoData">[Digivolve] Lv.4 w/[Glowing Dawn] trait: Cost 3</dd>
      </dl>
      <dl class="cardInfoBoxSmall">
        <dt class="cardInfoTitSmall">[Effect]</dt>
        <dd class="cardInfoData">[When Digivolving] Digimon-half effect.</dd>
      </dl>
    </div>
  </div>
  <div class="dualCardCol">
    <div class="cardTitleCol"><div class="cardTitle">Final Judgment</div></div>
    <div class="cardInfoCol">
      <dl class="cardInfoBox">
        <dt class="cardInfoTit">DUAL Color</dt>
        <dd class="cardInfoData cardColor"><span class="cardColor_red">Red</span><span class="cardColor_yellow">Yellow</span></dd>
      </dl>
      <dl class="cardInfoBox">
        <dt class="cardInfoTit">DUAL Cost</dt>
        <dd class="cardInfoData">4</dd>
      </dl>
      <div class="cardInfoBox">
        <div class="cardInfoTitMedium">Card Text 2</div>
        <dl class="cardInfoBoxSmall">
          <dt class="cardInfoTitSmall">[DUAL Effect]</dt>
          <dd class="cardInfoData">&lt;Use Req. ([Glowing Dawn] trait)&gt;<br>[Main] Option-half effect.</dd>
        </dl>
        <dl class="cardInfoBoxSmall">
          <dt class="cardInfoTitSmall">[DUAL Rule]</dt>
          <dd class="cardInfoData">&lt;Arts Digivolve&gt;</dd>
        </dl>
      </div>
    </div>
  </div>
</div>
`;

/** Lower-cased "Digi-egg" type (some promos) — should normalize to "Digi-Egg". */
export const FIXTURE_DIGI_EGG = `
<div class="popupCol" id="ST1-01">
  <p class="cardNo">ST1-01</p>
  <p class="cardTitle">Tokomon</p>
  <p class="cardRarity">U</p>
  <p class="cardType">Digi-egg</p>
  <p class="cardLv">Lv.2</p>
  <div class="cardImg"><img src="../images/cardlist/card/ST1-01.png" /></div>
  <dl class="cardInfoBox">
    <dt class="cardInfoTit">Color</dt>
    <dd><span class="cardColor_white">White</span></dd>
  </dl>
  <dl class="cardInfoBoxSmall">
    <dt class="cardInfoTitSmall">[Inherited Effect]</dt>
    <dd class="cardInfoData">+1000 DP.</dd>
  </dl>
</div>
`;

/** Empty cardNo — should return null. */
export const FIXTURE_BROKEN = `
<div class="popupCol">
  <p class="cardNo"></p>
  <p class="cardTitle">Should be skipped</p>
</div>
`;

/** Full page: base + alt-art for BT25-001, plus the dual and the digi-egg. */
export const FIXTURE_FULL_PAGE = `
<html><body>
  ${FIXTURE_DIGIMON_ALT_ART}
  ${FIXTURE_DIGIMON_BASE}
  ${FIXTURE_DUAL}
  ${FIXTURE_DIGI_EGG}
  ${FIXTURE_BROKEN}
</body></html>
`;
