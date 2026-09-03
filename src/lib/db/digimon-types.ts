/**
 * The two row shapes the deck repository is written against.
 *
 * Their own file so `deck-repo/*` can name them without importing
 * `digimon.ts`, which imports the repo back. They used to be type parameters
 * — `createDeckRepo<TCard, TDeck>` — from when this site also carried Union
 * Arena; with one game the parameters only made every module harder to read.
 */

export type DigimonCard = {
  id: string;
  code: string;
  name: string;
  card_type: string;
  color: string | null;
  color2: string | null;
  level: number | null;
  play_cost: number | null;
  dp: number | null;
  attribute: string | null;
  form: string | null;
  stage: string | null;
  digi_types: string | null;
  rarity: string | null;
  main_effect: string | null;
  security_effect: string | null;
  inherited_effect: string | null;
  source_effect: string | null;
  evolution_cost: string | null;
  evolution_requirements: string | null;
  set_names: string | null;
  series: string | null;
  artist: string | null;
  image_url: string | null;
  source_url: string | null;
  /** ---- Dual cards (card_type 'Dual') ----------------------------------
   *  Two cards printed on one: everything above describes the Digimon half,
   *  these describe the Option half on the bottom. NULL on every other card.
   *  `dual_color` is a run of canonical colour names ("RedYellow"), the same
   *  shape as `evolution_cost`. */
  dual_name: string | null;
  dual_color: string | null;
  dual_cost: number | null;
  dual_effect: string | null;
  dual_rule: string | null;
  /** ---- Link cards -------------------------------------------------------
   *  What this card contributes while plugged sideways into another Digimon.
   *  `link_dp` is a number so the page reads the same in every language — the
   *  two official sites print it as "DP+2000" and "+2000 DP". */
  link_dp: number | null;
  link_requirement: string | null;
  link_effect: string | null;
  /** [特別ルール] — card-specific rules text (Overflow &c.). */
  special_rule: string | null;
};

export type DigimonDeck = {
  id: string;
  name: string;
  notes: string | null;
  accent_color: string;
  /** Optional secondary accent color for dual-color decks. NULL = single. */
  accent_color2: string | null;
  cover_card_id: string | null;
  sort_order: number;
  /** 1 = a deck the owner actually plays; floats to the top of the deck list. */
  pinned: number;
  /** Which printing of the cover card to show: '' = base art, else a
   *  `card_images.variant` key such as '_P1'. */
  cover_variant: string;
  /** Pack this list is built for, e.g. 'BT-26'. NULL = never set.
   *  See lib/deck-version — it's a label, nothing enforces it. */
  version: string | null;
  /** 1 = closed to edits. Enforced in the repo, not just the UI. */
  locked: number;
  /** JSON `ImportReport` from the import that made this deck: the cards it
   *  couldn't place. Shown in the deck's info bar until dismissed, then NULL
   *  forever. See lib/import-report. */
  import_report: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
};
