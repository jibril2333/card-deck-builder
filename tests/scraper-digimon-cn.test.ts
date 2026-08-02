import { describe, expect, it } from "vitest";
import {
  cleanEffect,
  splitCnDual,
  splitCnRequirements,
} from "@/lib/scraper/digimon-cn";

// Strings below are copied verbatim out of dtcgweb-api.digimoncard.cn
// responses, "enter" line-break tokens and all.

describe("cleanEffect", () => {
  it("turns the literal 'enter' token into newlines and collapses blanks", () => {
    expect(cleanEffect("A效果enter\n\nB效果enter\nC效果")).toBe(
      "A效果\nB效果\nC效果",
    );
  });

  it("treats '-' and blank as absent", () => {
    expect(cleanEffect("-")).toBeNull();
    expect(cleanEffect("   ")).toBeNull();
    expect(cleanEffect(null)).toBeNull();
  });
});

describe("splitCnRequirements", () => {
  it("peels a leading 〔进化〕 line into the requirement field", () => {
    const { main, req } = splitCnRequirements(
      "〔进化〕拥有“光辉黎明”特征的Lv.4：费用3\n" +
        "【进化时】【攻击时】[每回合1次]可丢弃我方驯兽师下方正面朝下的卡牌中最下方的1张。",
    );
    expect(req).toBe("〔进化〕拥有“光辉黎明”特征的Lv.4：费用3");
    expect(main).toBe(
      "【进化时】【攻击时】[每回合1次]可丢弃我方驯兽师下方正面朝下的卡牌中最下方的1张。",
    );
  });

  it("takes several consecutive requirement lines (BT18-041 has 进化 + 合步)", () => {
    const { main, req } = splitCnRequirements(
      "〔进化〕拥有“NSp”特征的Lv.5：费用3\n" +
        "〔合步〕蓝色/黄色Lv.5+绿色/黑色Lv.5：费用0 将指定的2只数码宝贝重叠\n" +
        "【登场时】直到对方的回合结束为止。",
    );
    expect(req?.split("\n")).toHaveLength(2);
    expect(main).toBe("【登场时】直到对方的回合结束为止。");
  });

  it("also peels a leading 数码合体 line (EX6-031 puts it above 〔进化〕)", () => {
    const { main, req } = splitCnRequirements(
      "数码合体-2：“三藏兽”×“悟空兽”；\n" +
        "〔进化〕“三藏兽”/“悟空兽”：费用6\n" +
        "【登场时】【进化时】给与所有的数码宝贝《安防攻击-1》效果。",
    );
    expect(req?.split("\n")).toHaveLength(2);
    expect(main).toBe("【登场时】【进化时】给与所有的数码宝贝《安防攻击-1》效果。");
  });

  it("stops at the first line it doesn't recognize", () => {
    const { main, req } = splitCnRequirements(
      "〔进化〕费用3\n【登场时】做事\n〔进化〕这一行不在开头",
    );
    expect(req).toBe("〔进化〕费用3");
    expect(main).toBe("【登场时】做事\n〔进化〕这一行不在开头");
  });

  it("leaves an ordinary effect body completely alone", () => {
    const body = "【登场时】可以从我方手牌登场1张“拉布拉兽”。\n【我方的回合】…";
    expect(splitCnRequirements(body)).toEqual({ main: body, req: null });
    expect(splitCnRequirements(null)).toEqual({ main: null, req: null });
  });
});

describe("splitCnDual", () => {
  it("lifts the Option half out of the inherited-effect field", () => {
    const r = splitCnDual(
      "选项：最终审判\n" +
        "《使用条件《特征“光辉黎明”》》（我方存在指定的卡牌也可以无视颜色条件）\n" +
        "【主要】直到回合结束为止，我方的1只数码宝贝获得《速攻》效果。",
    );
    expect(r.inherited).toBeNull();
    expect(r.dualName).toBe("最终审判");
    expect(r.dualEffect).toBe(
      "《使用条件《特征“光辉黎明”》》（我方存在指定的卡牌也可以无视颜色条件）\n" +
        "【主要】直到回合结束为止，我方的1只数码宝贝获得《速攻》效果。",
    );
  });

  it("leaves a genuine inherited effect untouched", () => {
    const inherited =
      "【双方的回合】此数码宝贝获得进化源中名称包含“伽马兽”的卡牌的所有效果。";
    expect(splitCnDual(inherited)).toEqual({
      inherited,
      dualName: null,
      dualEffect: null,
    });
    expect(splitCnDual(null)).toEqual({
      inherited: null,
      dualName: null,
      dualEffect: null,
    });
  });
});
