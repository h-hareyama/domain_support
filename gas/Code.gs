/**
 * HP公開準備フォーム 受付用 GAS
 *
 * 役割:
 *   フォームから送られてきた内容を受け取り、
 *   ① スプレッドシートに1行追記（原本）
 *   ② Slackに通知（任意）
 *   ③ Notionにページ作成（任意）
 *   を順番に実行する。①が失敗したら②③には進まない。原本が最優先。
 *
 * 設定はコードに直書きせず、スクリプトプロパティに入れる。
 *   プロジェクトの設定 → スクリプト プロパティ
 *     SHEET_ID            必須  スプレッドシートのID（URLの /d/ と /edit の間）
 *     SHEET_NAME          任意  シート名（既定: 受付）
 *     SHARED_TOKEN        任意  フォームと突き合わせる合言葉
 *     SLACK_WEBHOOK_URL   任意  空なら通知しない
 *     NOTION_TOKEN        任意  空ならNotionに書かない
 *     NOTION_DATABASE_ID  任意  空ならNotionに書かない
 */

// ── 列の定義 ──────────────────────────────────────────
// header: スプレッドシートの見出し / get: 受信データから値を取り出す関数
var COLUMNS = [
  ['受付番号',            function (p, ctx) { return ctx.receiptNo; }],
  ['受付日時',            function (p, ctx) { return ctx.receivedAt; }],
  ['ステータス',          function ()       { return '未対応'; }],
  ['園名',                function (p) { return p.gardenName; }],
  ['担当ディレクター',    function (p) { return p.directorName; }],
  ['パターンID',          function (p) { return p.patternId; }],
  ['リスク',              function (p) { return p.riskLabel; }],
  ['ドメイン方式',        function (p) { return p.domainLabel; }],
  ['ドメイン名',          function (p) { return p.domainName; }],
  ['URLにwwwを付けるか',  function (p) { return ans(p, 'q-www'); }],

  ['メール利用状況',      function (p) { return p.mailLabel; }],
  ['今後のドメインメール意向', function (p) {
      return ({ yes: '利用したい', no: '利用しない', considering: '検討中' })[p.mailWant] || '';
  }],
  ['現在のメールサービス名',  function (p) { return ans(p, 'q-mailcon-1'); }],
  ['メール契約会社名',        function (p) { return ans(p, 'q-mailcon-2'); }],
  ['現在のメールアドレス',    function (p) { return ans(p, 'q-mailcon-3'); }],
  ['メール補足',              function (p) { return ans(p, 'q-mailcon-5x'); }],

  ['現在公開中のHP',      function (p) { return p.oldsite === 'yes' ? 'あり' : 'なし'; }],
  ['現在のHPのURL',       function (p) { return ans(p, 'q-old-1'); }],
  ['現在のHPの公開先サービス', function (p) { return ans(p, 'q-old-2'); }],
  ['現在のHPの制作・管理会社', function (p) { return ans(p, 'q-old-3'); }],
  ['制作・管理会社の電話番号', function (p) { return ans(p, 'q-old-3-phone'); }],
  ['制作・管理会社のメール',   function (p) { return ans(p, 'q-old-3-email'); }],
  ['現在のHPを残せる期間',     function (p) { return ans(p, 'q-old-4'); }],
  ['新HPへのご案内',      function (p) { return p.redirect === 'needed' ? '実施' : '不要'; }],

  ['ご案内_WEB制作会社',       function (p) { return ri(p, 'webCompany'); }],
  ['ご案内_WEB制作会社電話',   function (p) { return ri(p, 'webCompanyPhone'); }],
  ['ご案内_WEB制作会社メール', function (p) { return ri(p, 'webCompanyEmail'); }],
  ['ご案内_ドメイン管理会社',       function (p) { return ri(p, 'domainCompany'); }],
  ['ご案内_ドメイン管理会社電話',   function (p) { return ri(p, 'domainCompanyPhone'); }],
  ['ご案内_ドメイン管理会社メール', function (p) { return ri(p, 'domainCompanyEmail'); }],
  ['現在のHPのツール',              function (p) { return ri(p, 'tool'); }],

  ['希望ドメイン候補',    function (p) { return ans(p, 'q-newdom-1'); }],
  ['.ed.jp書類',          function (p) { return ans(p, 'q-newdom-2'); }],
  ['現在のドメイン管理会社', function (p) { return ans(p, 'q-mov-1') || ans(p, 'q-ext-1'); }],
  ['AuthCode取得状況',    function (p) { return ans(p, 'q-mov-2'); }],
  ['ドメイン有効期限',    function (p) { return ans(p, 'q-mov-3'); }],
  ['移管ロック状況',      function (p) { return ans(p, 'q-mov-4'); }],
  ['管理会社連絡窓口',    function (p) { return ans(p, 'q-ext-2'); }],
  ['管理画面ログイン',    function (p) { return ans(p, 'q-ext-3'); }],

  ['申請_法人種類',   function (p) { return oi(p, 'orgType'); }],
  ['申請_認可',       function (p) { return oi(p, 'orgLicensed'); }],
  ['申請_組織名',     function (p) { return oi(p, 'orgName'); }],
  ['申請_組織名読み', function (p) { return oi(p, 'orgKana'); }],
  ['申請_英語表記',   function (p) { return oi(p, 'orgNameEn'); }],
  ['申請_郵便番号',   function (p) { return oi(p, 'postal'); }],
  ['申請_住所',       function (p) { return oi(p, 'address'); }],
  ['申請_建物名',     function (p) { return oi(p, 'building'); }],
  ['申請_担当者氏名', function (p) { return oi(p, 'contactName'); }],
  ['申請_担当者ローマ字', function (p) { return oi(p, 'contactRoman'); }],
  ['申請_部署',       function (p) { return oi(p, 'contactDept'); }],
  ['申請_役職',       function (p) { return oi(p, 'contactTitle'); }],
  ['申請_担当者電話', function (p) { return oi(p, 'contactPhone'); }],
  ['申請_担当者メール', function (p) { return oi(p, 'contactEmail'); }],
  ['申請_登記年月日', function (p) { return oi(p, 'regDate'); }],
  ['申請_登記地住所', function (p) { return oi(p, 'regAddress'); }],
  ['申請_代表者氏名', function (p) { return oi(p, 'repName'); }],
  ['申請_代表者ローマ字', function (p) { return oi(p, 'repRoman'); }],
  ['申請_代表者役職', function (p) { return oi(p, 'repTitle'); }],

  ['社内メモ',        function ()  { return ''; }],
  // 列に割り当てのない回答が来ても捨てないための保険
  ['未割当の回答',    function (p, ctx) { return ctx.leftover; }],
  // 原本なので、送られてきた内容をそのまま残しておく
  ['生データ',        function (p) { return JSON.stringify(p); }],
];

function ans(p, id) { return (p.answers || {})[id] || ''; }
function ri(p, k)   { return (p.redirectInfo || {})[k] || ''; }
function oi(p, k)   { return (p.domainApplicationInfo || {})[k] || ''; }

// COLUMNS が拾っている質問ID（未割当の判定に使う）
var MAPPED_QIDS = [
  'q-www', 'q-mailcon-1', 'q-mailcon-2', 'q-mailcon-3', 'q-mailcon-5x',
  'q-old-1', 'q-old-2', 'q-old-3', 'q-old-3-phone', 'q-old-3-email', 'q-old-4',
  'q-newdom-1', 'q-newdom-2', 'q-mov-1', 'q-mov-2', 'q-mov-3', 'q-mov-4',
  'q-ext-1', 'q-ext-2', 'q-ext-3',
];

// ── エントリポイント ──────────────────────────────────
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: '本文が空です' });
    }
    var payload = JSON.parse(e.postData.contents);

    var expected = prop('SHARED_TOKEN');
    if (expected && payload.token !== expected) {
      return json({ ok: false, error: '合言葉が一致しません' });
    }
    delete payload.token;

    if (!payload.gardenName) {
      return json({ ok: false, error: '園名が入力されていません' });
    }

    var result = appendRow(payload);          // ① 原本。ここが落ちたら以降はやらない

    try { notifySlack(payload, result); } catch (err) { logError('Slack通知', err); }
    try { createNotionPage(payload, result); } catch (err) { logError('Notion登録', err); }

    return json({ ok: true, receiptNo: result.receiptNo });
  } catch (err) {
    logError('doPost', err);
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return json({ ok: true, message: 'HP公開準備フォーム 受付GAS は稼働中です' });
}

// ── ① スプレッドシートへの追記 ────────────────────────
function appendRow(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);                       // 受付番号の重複を防ぐ
  try {
    var sheet = getSheet();
    var receiptNo  = nextReceiptNo();
    var receivedAt = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');

    var mapped = {};
    MAPPED_QIDS.forEach(function (id) { mapped[id] = true; });
    var leftover = {};
    Object.keys(payload.answers || {}).forEach(function (id) {
      if (!mapped[id] && payload.answers[id]) leftover[id] = payload.answers[id];
    });

    var ctx = {
      receiptNo:  receiptNo,
      receivedAt: receivedAt,
      leftover:   Object.keys(leftover).length ? JSON.stringify(leftover) : '',
    };

    var row = COLUMNS.map(function (col) {
      var v = col[1](payload, ctx);
      return (v === undefined || v === null) ? '' : v;
    });
    sheet.appendRow(row);

    return { receiptNo: receiptNo, receivedAt: receivedAt, rowIndex: sheet.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

function getSheet() {
  var id = prop('SHEET_ID');
  if (!id) throw new Error('スクリプトプロパティ SHEET_ID が設定されていません');
  var ss    = SpreadsheetApp.openById(id);
  var name  = prop('SHEET_NAME') || '受付';
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);

  // 見出し行がなければ作る
  if (sheet.getLastRow() === 0) {
    var headers = COLUMNS.map(function (c) { return c[0]; });
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#e7eff7');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** 2026-0001 形式。年が変わったら採番をリセットする。 */
function nextReceiptNo() {
  var props = PropertiesService.getScriptProperties();
  var year  = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy');
  var key   = 'SEQ_' + year;
  var seq   = parseInt(props.getProperty(key) || '0', 10) + 1;
  props.setProperty(key, String(seq));
  return year + '-' + ('000' + seq).slice(-4);
}

// ── ② Slack通知 ───────────────────────────────────────
function notifySlack(payload, result) {
  var url = prop('SLACK_WEBHOOK_URL');
  if (!url) return;

  var lines = [
    '*HP公開準備フォームに新しい提出がありました*',
    '受付番号: `' + result.receiptNo + '`',
    '園名: *' + (payload.gardenName || '(未入力)') + '*',
    '担当: ' + (payload.directorName || '—'),
    'ドメイン: ' + (payload.domainLabel || '—') + '（' + (payload.domainName || '未入力') + '）',
    'メール: ' + (payload.mailLabel || '—'),
    '現在公開中のHP: ' + (payload.oldsite === 'yes' ? 'あり' : 'なし') +
      ' / 新HPへのご案内: ' + (payload.redirect === 'needed' ? '実施' : '不要'),
    'リスク: ' + (payload.riskLabel || '—'),
  ];

  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ text: lines.join('\n') }),
    muteHttpExceptions: true,
  });
}

// ── ③ Notionにページ作成 ──────────────────────────────
function createNotionPage(payload, result) {
  var token = prop('NOTION_TOKEN');
  var dbId  = prop('NOTION_DATABASE_ID');
  if (!token || !dbId) return;

  var props = {
    '園名':       { title: [{ text: { content: payload.gardenName || '(未入力)' } }] },
    '受付番号':   { rich_text: [{ text: { content: result.receiptNo } }] },
    'ドメイン方式': { select: { name: payload.domainLabel || '未設定' } },
    'メール':     { select: { name: payload.mailLabel || '未設定' } },
    'リスク':     { select: { name: payload.riskLabel || '未設定' } },
    'ステータス': { select: { name: '未対応' } },
    '担当':       { rich_text: [{ text: { content: payload.directorName || '' } }] },
  };

  // 細かいヒアリング内容はプロパティにせず、本文に流し込む
  var body = [];
  body.push(notionHeading('受付内容'));
  body.push(notionParagraph('受付番号: ' + result.receiptNo + '　受付日時: ' + result.receivedAt));
  body.push(notionParagraph('ドメイン: ' + (payload.domainLabel || '—') + '（' + (payload.domainName || '未入力') + '）'));
  body.push(notionParagraph('メール: ' + (payload.mailLabel || '—')));
  body.push(notionParagraph('現在公開中のHP: ' + (payload.oldsite === 'yes' ? 'あり' : 'なし') +
                            ' / 新HPへのご案内: ' + (payload.redirect === 'needed' ? '実施' : '不要')));

  var answers = payload.answers || {};
  var ids = Object.keys(answers).filter(function (k) { return answers[k]; });
  if (ids.length) {
    body.push(notionHeading('ヒアリング内容'));
    ids.forEach(function (id) {
      body.push(notionParagraph((QID_LABELS[id] || id) + ': ' + answers[id]));
    });
  }

  var res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization':  'Bearer ' + token,
      'Notion-Version': '2022-06-28',
    },
    payload: JSON.stringify({
      parent: { database_id: dbId },
      properties: props,
      children: body.slice(0, 100),
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() >= 300) {
    throw new Error('Notion API ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

function notionHeading(text) {
  return { object: 'block', type: 'heading_3',
           heading_3: { rich_text: [{ type: 'text', text: { content: text } }] } };
}
function notionParagraph(text) {
  return { object: 'block', type: 'paragraph',
           paragraph: { rich_text: [{ type: 'text', text: { content: String(text).slice(0, 1900) } }] } };
}

var QID_LABELS = {
  'q-www': 'URLにwwwを付けるか',
  'q-newdom-1': '希望ドメイン候補',
  'q-newdom-2': '.ed.jp書類',
  'q-mov-1': '現在のドメイン管理会社',
  'q-mov-2': 'AuthCode取得状況',
  'q-mov-3': 'ドメイン有効期限',
  'q-mov-4': '移管ロック状況',
  'q-ext-1': 'ドメイン管理会社',
  'q-ext-2': '管理会社連絡窓口',
  'q-ext-3': '管理画面ログイン',
  'q-mailcon-1': '現在のメールサービス名',
  'q-mailcon-2': 'メール契約会社名',
  'q-mailcon-3': '現在のメールアドレス',
  'q-mailcon-5x': 'メール補足',
  'q-old-1': '現在のHPのURL',
  'q-old-2': '現在のHPの公開先サービス',
  'q-old-3': '現在のHPの制作・管理会社',
  'q-old-3-phone': '制作・管理会社の電話番号',
  'q-old-3-email': '制作・管理会社のメールアドレス',
  'q-old-4': '現在のHPを残せる期間',
};

// ── 共通 ──────────────────────────────────────────────
function prop(key) {
  return (PropertiesService.getScriptProperties().getProperty(key) || '').trim();
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logError(where, err) {
  console.error(where + ' に失敗: ' + (err && err.stack || err));
}

// ── 動作確認用。エディタから直接実行する ──────────────
function testAppend() {
  var sample = {
    gardenName: 'テスト幼稚園', directorName: '佐藤',
    patternId: 'DT-MU-OR', riskLabel: 'リスク：高（メール停止に注意）',
    domain: 'transfer', domainLabel: '移管', domainName: 'test.ed.jp',
    mail: 'using', mailLabel: 'ドメインメール利用中', mailWant: '',
    oldsite: 'yes', redirect: 'needed',
    answers: {
      'q-www': '付ける',
      'q-mailcon-1': 'さくらメール',
      'q-mailcon-2': 'さくらインターネット',
      'q-old-1': 'https://old.example.com',
      'q-old-3': '旧管理株式会社',
      'q-unknown-99': '列に割り当てのない回答',
    },
    redirectInfo: { webCompany: '制作株式会社', tool: 'wordpress' },
    domainApplicationInfo: null,
  };
  var r = appendRow(sample);
  console.log('追記しました: ' + r.receiptNo + '（' + r.rowIndex + '行目）');
}
