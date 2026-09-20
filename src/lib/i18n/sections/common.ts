/** 跨页面的通用文字:加载、分页、错误面板。 */
import { section } from "../define";

export default section({
  zh: {
    loading: "加载中…",
    pagination: "分页",
    prev: "上一页",
    next: "下一页",
    reloadingNewVersion: "正在加载新版本…",
    errorTitle: "这一页出错了",
    errorBody: "页面在服务器渲染时抛了异常。可以试试重试,或者回上一页。",
    unknownError: "未知错误",
    possibleFix: "💡 可能的修复方法",
    retry: "重试",
    backToSearch: "回卡牌检索",
    backHome: "回首页",
    hideDetail: "收起详情",
    showDetail: "查看详情",
    errorDetail: "错误详情",
    copied: "✓ 已复制",
    copy: "复制",
    hintNativeBinding:
      "better-sqlite3 的 native 绑定与当前 Node 版本不兼容\n" +
      "(通常发生在通过 nvm/brew 升级 Node 之后)。重建一下就好。",
    hintDbPath:
      "数据库文件路径错误。检查 .env.local 里的 CDB_DIGIMON_DB / CDB_UA_DB " +
      "环境变量,或确认默认路径下的 .db 文件存在。",
    hintCantOpen:
      "SQLite 打不开数据库文件。可能原因:\n" +
      "  · 文件路径不对\n" +
      "  · 进程没有读权限\n" +
      "  · 同目录里残留了过期的 .db-shm / .db-wal 锁文件",
    hintSchema:
      "数据库结构不匹配。可能是迁移没跑完,或者环境变量指到了一个旧版本的 .db。\n" +
      "重启 dev 服务器让 runMigrations 跑一遍,或者检查 CDB_*_DB 指向的文件。",
  },
  ja: {
    loading: "読み込み中…",
    pagination: "ページ送り",
    prev: "前へ",
    next: "次へ",
    reloadingNewVersion: "新しいバージョンを読み込んでいます…",
    errorTitle: "このページでエラーが発生しました",
    errorBody:
      "サーバーでのページ生成中に例外が発生しました。再試行するか、前のページに戻ってください。",
    unknownError: "不明なエラー",
    possibleFix: "💡 考えられる対処",
    retry: "再試行",
    backToSearch: "カード検索に戻る",
    backHome: "トップに戻る",
    hideDetail: "詳細を閉じる",
    showDetail: "詳細を見る",
    errorDetail: "エラーの詳細",
    copied: "✓ コピーしました",
    copy: "コピー",
    hintNativeBinding:
      "better-sqlite3 のネイティブバインディングが現在の Node と互換性がありません\n" +
      "(nvm/brew で Node を更新した後によく起こります)。再ビルドしてください。",
    hintDbPath:
      "データベースファイルのパスが正しくありません。.env.local の CDB_DIGIMON_DB / CDB_UA_DB " +
      "環境変数を確認するか、既定の場所に .db ファイルがあることを確認してください。",
    hintCantOpen:
      "SQLite がデータベースファイルを開けません。考えられる原因:\n" +
      "  · ファイルのパスが正しくない\n" +
      "  · プロセスに読み取り権限がない\n" +
      "  · 同じディレクトリに古い .db-shm / .db-wal ロックファイルが残っている",
    hintSchema:
      "データベースの構造が一致しません。マイグレーションが完了していないか、環境変数が古い .db を指しています。\n" +
      "dev サーバーを再起動して runMigrations を実行するか、CDB_*_DB が指すファイルを確認してください。",
  },
  en: {
    loading: "Loading…",
    pagination: "Pagination",
    prev: "Previous",
    next: "Next",
    reloadingNewVersion: "Loading the new version…",
    errorTitle: "This page ran into an error",
    errorBody:
      "The server threw an exception while rendering the page. Try again, or go back.",
    unknownError: "Unknown error",
    possibleFix: "💡 Possible fix",
    retry: "Try again",
    backToSearch: "Back to card search",
    backHome: "Back to the home page",
    hideDetail: "Hide details",
    showDetail: "Show details",
    errorDetail: "Error details",
    copied: "✓ Copied",
    copy: "Copy",
    hintNativeBinding:
      "The better-sqlite3 native binding does not match the current Node version\n" +
      "(usual after upgrading Node through nvm/brew). Rebuild it.",
    hintDbPath:
      "The database path is wrong. Check CDB_DIGIMON_DB / CDB_UA_DB in .env.local, " +
      "or make sure the .db file exists at the default location.",
    hintCantOpen:
      "SQLite cannot open the database file. Possible causes:\n" +
      "  · the path is wrong\n" +
      "  · the process has no read permission\n" +
      "  · stale .db-shm / .db-wal lock files are left in the same directory",
    hintSchema:
      "The database schema does not match. A migration may not have finished, or the environment points at an older .db.\n" +
      "Restart the dev server so runMigrations runs, or check the file CDB_*_DB points to.",
  },
});
