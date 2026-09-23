/** 设置页的账号部分:Passkey 与数据搬运。 */
import { section } from "../define";

type Counts = {
  decks: number;
  cards: number;
  groups: number;
  collection: number;
  prices: number;
};

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

export default section({
  zh: {
    passkeyHeading: "Passkey 登录",
    nameOptional: "名称(可选)",
    passkeyNamePlaceholder: "如:Mac Touch ID / iPhone",
    addPasskey: "＋ 添加 Passkey",
    working: "处理中…",
    noPasskeys: "暂无 Passkey。",
    addedOn: (date: string) => `添加于 ${date}`,
    lastUsed: (date: string) => `· 上次使用 ${date}`,
    neverUsed: " · 未使用",
    delete: "删除",
    confirmDeletePasskey: "确认删除这个 Passkey?之后必须用其它方式登录。",
    passkeyRegisterFailed: "Passkey 注册失败",
    /** Stored with the credential, so written in the language of the moment. */
    thisDevice: "本设备",
    dataHeading: "数据搬运",
    export: "导出",
    import: "导入",
    importing: "导入中…",
    replaceImport: "清空并导入",
    mergeImport: "合并导入",
    clearFirst: "先清空本站数据",
    cancel: "取消",
    notAnExport: "这个文件不是本站导出的数据",
    importFailed: "导入失败",
    importDone: "导入完成",
    counts: (c: Counts) =>
      [
        `${c.decks} 副卡组`,
        `${c.cards} 条卡片记录`,
        c.groups ? `${c.groups} 个卡池` : "",
        c.collection ? `${c.collection} 条收藏` : "",
        c.prices ? `${c.prices} 条价格` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    reportDecks: (created: number, updated: number) =>
      `卡组 +${created}${updated ? ` · 更新 ${updated}` : ""}`,
    reportRest: (r: Omit<Counts, "decks">) =>
      [
        `${r.cards} 条卡片记录`,
        r.groups ? `${r.groups} 个卡池` : "",
        r.collection ? `${r.collection} 条收藏` : "",
        r.prices ? `${r.prices} 条价格` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    missingCards: (n: number) => `本站没有的卡 ${n}:`,
    conflicts: (ids: string[]) => `属于别的账号,已跳过:${ids.join("、")}`,
    loginFirst: "请先登录",
    notJson: "文件不是有效的 JSON",
    notOurExport: "这不像是本站导出的数据文件",
    newerVersion: (file: number, supported: number) =>
      `文件版本 ${file} 比这个站点支持的 ${supported} 新,请先更新站点`,
    importFailedUnchanged: "导入失败,数据没有改动",
  },
  ja: {
    passkeyHeading: "パスキーでのログイン",
    nameOptional: "名前(任意)",
    passkeyNamePlaceholder: "例:Mac Touch ID / iPhone",
    addPasskey: "＋ パスキーを追加",
    working: "処理中…",
    noPasskeys: "パスキーはありません。",
    addedOn: (date) => `${date} 追加`,
    lastUsed: (date) => `· 最終使用 ${date}`,
    neverUsed: " · 未使用",
    delete: "削除",
    confirmDeletePasskey:
      "このパスキーを削除しますか?以後は別の方法でログインする必要があります。",
    passkeyRegisterFailed: "パスキーの登録に失敗しました",
    thisDevice: "このデバイス",
    dataHeading: "データの移行",
    export: "エクスポート",
    import: "インポート",
    importing: "インポート中…",
    replaceImport: "消去してインポート",
    mergeImport: "統合してインポート",
    clearFirst: "先にこのサイトのデータを消去する",
    cancel: "キャンセル",
    notAnExport: "このファイルはこのサイトのエクスポートデータではありません",
    importFailed: "インポートに失敗しました",
    importDone: "インポートが完了しました",
    counts: (c) =>
      [
        `デッキ ${c.decks} 件`,
        `カード記録 ${c.cards} 件`,
        c.groups ? `共有プール ${c.groups} 件` : "",
        c.collection ? `コレクション ${c.collection} 件` : "",
        c.prices ? `価格 ${c.prices} 件` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    reportDecks: (created, updated) =>
      `デッキ +${created}${updated ? ` · 更新 ${updated}` : ""}`,
    reportRest: (r) =>
      [
        `カード記録 ${r.cards} 件`,
        r.groups ? `共有プール ${r.groups} 件` : "",
        r.collection ? `コレクション ${r.collection} 件` : "",
        r.prices ? `価格 ${r.prices} 件` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    missingCards: (n) => `このサイトにないカード ${n} 件:`,
    conflicts: (ids) => `別のアカウントのためスキップ:${ids.join("、")}`,
    loginFirst: "ログインしてください",
    notJson: "有効な JSON ファイルではありません",
    notOurExport: "このサイトのエクスポートファイルではないようです",
    newerVersion: (file, supported) =>
      `ファイルのバージョン ${file} はこのサイトが対応する ${supported} より新しいです。先にサイトを更新してください`,
    importFailedUnchanged: "インポートに失敗しました。データは変更されていません",
  },
  en: {
    passkeyHeading: "Passkey login",
    nameOptional: "Name (optional)",
    passkeyNamePlaceholder: "e.g. Mac Touch ID / iPhone",
    addPasskey: "＋ Add a passkey",
    working: "Working…",
    noPasskeys: "No passkeys.",
    addedOn: (date) => `Added ${date}`,
    lastUsed: (date) => `· last used ${date}`,
    neverUsed: " · never used",
    delete: "Delete",
    confirmDeletePasskey:
      "Delete this passkey? You will have to log in another way afterwards.",
    passkeyRegisterFailed: "Passkey registration failed",
    thisDevice: "This device",
    dataHeading: "Move your data",
    export: "Export",
    import: "Import",
    importing: "Importing…",
    replaceImport: "Clear and import",
    mergeImport: "Merge import",
    clearFirst: "Clear this site's data first",
    cancel: "Cancel",
    notAnExport: "This file is not an export from this site",
    importFailed: "Import failed",
    importDone: "Import complete",
    counts: (c) =>
      [
        plural(c.decks, "deck", "decks"),
        plural(c.cards, "card entry", "card entries"),
        c.groups ? plural(c.groups, "shared pool", "shared pools") : "",
        c.collection
          ? plural(c.collection, "collection entry", "collection entries")
          : "",
        c.prices ? plural(c.prices, "price", "prices") : "",
      ]
        .filter(Boolean)
        .join(" · "),
    reportDecks: (created, updated) =>
      `Decks +${created}${updated ? ` · updated ${updated}` : ""}`,
    reportRest: (r) =>
      [
        plural(r.cards, "card entry", "card entries"),
        r.groups ? plural(r.groups, "shared pool", "shared pools") : "",
        r.collection
          ? plural(r.collection, "collection entry", "collection entries")
          : "",
        r.prices ? plural(r.prices, "price", "prices") : "",
      ]
        .filter(Boolean)
        .join(" · "),
    missingCards: (n) => `Cards this site does not have (${n}): `,
    conflicts: (ids) => `Skipped, owned by another account: ${ids.join(", ")}`,
    loginFirst: "Log in first",
    notJson: "The file is not valid JSON",
    notOurExport: "This does not look like an export from this site",
    newerVersion: (file, supported) =>
      `File version ${file} is newer than the ${supported} this site supports. Update the site first`,
    importFailedUnchanged: "Import failed; no data was changed",
  },
});
