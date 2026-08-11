import { describe, it, expect } from "vitest";
import {
  splitCnModel,
  comparePrintings,
  groupCnArt,
  chooseCnTextRows,
} from "@/lib/scraper/digimon-cn";

// Real rows from dtcgweb-api.digimoncard.cn, trimmed to the two fields that
// matter. Filenames are verbatim, timestamp prefixes and all.
const HOST = "https://yugioh-1258002530.file.myqcloud.com/dtcg/Picture";
const HOST2 = "https://source.windoent.com/dtcg/Picture";
const OLD = "https://source.windoent.com/DTCG";

describe("splitCnModel", () => {
  it("leaves an ordinary code alone", () => {
    expect(splitCnModel("BT12-085")).toEqual({ code: "BT12-085", printing: null });
    expect(splitCnModel("ST1-01")).toEqual({ code: "ST1-01", printing: null });
    expect(splitCnModel("P-001")).toEqual({ code: "P-001", printing: null });
  });

  it("peels off every suffix shape the feed actually uses", () => {
    expect(splitCnModel("BT12-085_01")).toEqual({ code: "BT12-085", printing: "01" });
    expect(splitCnModel("BT12-085_LM06")).toEqual({ code: "BT12-085", printing: "LM06" });
    expect(splitCnModel("BT11-064_BT25")).toEqual({ code: "BT11-064", printing: "BT25" });
    expect(splitCnModel("BT13-012_AD01GP")).toEqual({
      code: "BT13-012",
      printing: "AD01GP",
    });
    expect(splitCnModel("EX8-037_FSWinner")).toEqual({
      code: "EX8-037",
      printing: "FSWinner",
    });
    // Splits on the FIRST underscore — `_BT-21` keeps its dash.
    expect(splitCnModel("BT9-071_BT-21")).toEqual({ code: "BT9-071", printing: "BT-21" });
  });
});

describe("comparePrintings", () => {
  it("numbers first, in numeric not string order", () => {
    expect(["10", "02", "01"].sort(comparePrintings)).toEqual(["01", "02", "10"]);
  });

  it("named printings come after numbered ones", () => {
    expect(["LM06", "01", "ST22"].sort(comparePrintings)).toEqual([
      "01",
      "LM06",
      "ST22",
    ]);
  });
});

describe("groupCnArt", () => {
  it("collects a card's suffixed printings as its alt arts", () => {
    // The bug this replaces: these four rows produced ONE image, because the
    // three suffixed models hashed to codes `cards` has never heard of.
    const got = groupCnArt([
      { model: "BT12-085", imageCover: `${HOST}/1691989757469BT12-085.png` },
      { model: "BT12-085_LM06", imageCover: `${HOST2}/1760411591739BT12-085_LM06.png` },
      { model: "BT12-085_01", imageCover: `${HOST}/1691989757469BT12-085_01.png` },
      { model: "BT12-085_02", imageCover: `${HOST}/1709782249616BT12-085_02.png` },
    ]);
    expect([...got.keys()]).toEqual(["BT12-085"]);
    const { base, alts } = got.get("BT12-085")!;
    expect(base).toBe(`${HOST}/1691989757469BT12-085.png`);
    expect(alts).toEqual([
      `${HOST}/1691989757469BT12-085_01.png`,
      `${HOST}/1709782249616BT12-085_02.png`,
      `${HOST2}/1760411591739BT12-085_LM06.png`,
    ]);
  });

  it("still handles the old sets, which repeat the BARE code instead", () => {
    // BT1-009's parallel comes back under the same `model`; only the filename
    // tells them apart.
    const got = groupCnArt([
      { model: "BT1-009", imageCover: `${OLD}/BT1-009C.png` },
      { model: "BT1-009", imageCover: `${OLD}/BT1-009_01.png` },
    ]);
    expect(got.get("BT1-009")).toEqual({
      base: `${OLD}/BT1-009C.png`,
      alts: [`${OLD}/BT1-009_01.png`],
    });
  });

  it("does not mistake a named printing's filename for a base print", () => {
    // `…BT11-064_BT25.png` has no trailing `_NN`, so the filename heuristic
    // alone called it a second BASE and dropped it. The model suffix decides.
    const got = groupCnArt([
      { model: "BT11-064", imageCover: `${HOST}/1691989757434BT11-064.png` },
      { model: "BT11-064_BT25", imageCover: `${HOST2}/1777626642707BT11-064_BT25.png` },
    ]);
    expect(got.get("BT11-064")).toEqual({
      base: `${HOST}/1691989757434BT11-064.png`,
      alts: [`${HOST2}/1777626642707BT11-064_BT25.png`],
    });
  });

  it("promotes a printing to base when the bare row is missing", () => {
    const got = groupCnArt([
      { model: "ZZ1-001_02", imageCover: "x/ZZ1-001_02.png" },
      { model: "ZZ1-001_01", imageCover: "x/ZZ1-001_01.png" },
    ]);
    expect(got.get("ZZ1-001")).toEqual({
      base: "x/ZZ1-001_01.png",
      alts: ["x/ZZ1-001_02.png"],
    });
  });

  it("is order-independent and idempotent", () => {
    const rows = [
      { model: "BT17-035_ST22", imageCover: "a/BT17-035_ST22.png" },
      { model: "BT17-035", imageCover: "a/BT17-035.png" },
      { model: "BT17-035_LM06", imageCover: "a/BT17-035_LM06.png" },
    ];
    const forward = groupCnArt(rows).get("BT17-035");
    const backward = groupCnArt([...rows].reverse()).get("BT17-035");
    // Feed order must not decide which art becomes _P1.
    expect(forward).toEqual(backward);
    expect(forward).toEqual({
      base: "a/BT17-035.png",
      alts: ["a/BT17-035_LM06.png", "a/BT17-035_ST22.png"],
    });

    // A duplicated row (the same printing on two pages) changes nothing.
    expect(groupCnArt([...rows, rows[0]]).get("BT17-035")).toEqual(forward);
  });

  it("skips rows with no image and cards with no image at all", () => {
    const got = groupCnArt([
      { model: "BT1-001", imageCover: null },
      { model: "BT1-002", imageCover: "  " },
      { model: "BT1-003", imageCover: "a/BT1-003.png" },
    ]);
    expect([...got.keys()]).toEqual(["BT1-003"]);
  });
});

describe("chooseCnTextRows", () => {
  const r = (model: string, name: string) => ({ model, name });

  it("takes the bare row when there is one", () => {
    const got = chooseCnTextRows([
      r("BT12-085_LM06", "别西卜兽X抗体(勘误措辞)"),
      r("BT12-085", "别西卜兽X抗体"),
      r("BT12-085_01", "别西卜兽X抗体"),
    ]);
    expect(got.get("BT12-085")?.name).toBe("别西卜兽X抗体");
    expect(got.size).toBe(1);
  });

  it("falls back to the only printing when the bare row never appears", () => {
    // The bug this fixes: the CN feed has LM-054 only as LM-054_LM07, so
    // skipping every suffixed row left the card with no Chinese at all.
    const got = chooseCnTextRows([r("LM-054_LM07", "跑步机·训练")]);
    expect(got.get("LM-054")?.name).toBe("跑步机·训练");
  });

  it("picks the same printing regardless of feed order", () => {
    const rows = [r("P-197_TSPR", "巴达兽"), r("P-197_01", "巴达兽A"), r("P-197_BT23", "巴达兽B")];
    const a = chooseCnTextRows(rows).get("P-197")?.model;
    const b = chooseCnTextRows([...rows].reverse()).get("P-197")?.model;
    expect(a).toBe(b);
    expect(a).toBe("P-197_01"); // numbered printings sort first
  });

  it("keeps cards apart", () => {
    const got = chooseCnTextRows([r("BT1-001", "滚球兽"), r("BT1-002_01", "菜芽兽")]);
    expect([...got.keys()].sort()).toEqual(["BT1-001", "BT1-002"]);
  });
});
