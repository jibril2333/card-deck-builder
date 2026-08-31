import { describe, expect, it } from "vitest";
import { cardImageSrc, CARD_IMAGE_HOSTS } from "@/lib/card-image";

/**
 * Every card-art host the database actually holds has to be rewritten — an
 * unrewritten one is a silent hole in the "the browser never talks to the card
 * sites" claim — and everything else has to pass through untouched.
 */
describe("cardImageSrc", () => {
  it("rewrites each host the data uses, keeping the path and extension", () => {
    for (const host of CARD_IMAGE_HOSTS) {
      expect(cardImageSrc(`https://${host}/images/cardlist/card/BT1-001.png`)).toBe(
        `/card-img/${host}/images/cardlist/card/BT1-001.png`,
      );
    }
    expect(
      cardImageSrc("https://source.windoent.com/DTCG/BT1/BT1-001_P1.jpg"),
    ).toBe("/card-img/source.windoent.com/DTCG/BT1/BT1-001_P1.jpg");
  });

  it("leaves alone what it does not own", () => {
    // Somewhere else entirely: proxying it would make this an open relay.
    expect(cardImageSrc("https://example.com/a.png")).toBe(
      "https://example.com/a.png",
    );
    // Already ours, or already relative.
    expect(cardImageSrc("/card-img/digimoncard.com/x.png")).toBe(
      "/card-img/digimoncard.com/x.png",
    );
    // http, not https.
    expect(cardImageSrc("http://digimoncard.com/x.png")).toBe(
      "http://digimoncard.com/x.png",
    );
    expect(cardImageSrc(null)).toBeUndefined();
    expect(cardImageSrc("")).toBeUndefined();
    expect(cardImageSrc("not a url")).toBe("not a url");
  });
});
