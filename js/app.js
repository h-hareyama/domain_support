/* ═══════════════════════════════════════════
 * HP公開ドメイン判定ツール メインJS
 * ═══════════════════════════════════════════ */

// ═══════════════════════════════════════════
// 状態管理
// ═══════════════════════════════════════════
const state = {
  gardenName: '',
  directorName: '',
  publishDate: '',
  domainName: '',
  domain: '',     // new / transfer / external
  mail: '',       // none / new / continue
  oldsite: '',    // yes / no
  redirect: '',   // none / needed
  redirectWebCompany: '', redirectDomainCompany: '', redirectTool: '',
  answers: {},    // 動的ヒアリング項目の回答
  checked: {},    // チェック状態
  maxStep: 0,     // 到達済み最大ステップ番号

  // 新規取得：取得申請情報
  newOrgType: '', newOrgLicensed: '', newOrgName: '', newOrgKana: '', newOrgNameEn: '',
  newPostal: '', newAddress: '', newBuilding: '',
  newContactName: '', newContactRoman: '', newContactDept: '', newContactTitle: '',
  newContactPhone: '', newContactEmail: '',
  newRegDate: '', newRegAddress: '', newRepName: '', newRepRoman: '', newRepTitle: '',

  // 出力設定
  recipientEmail: '',
};

// ═══════════════════════════════════════════
// ヒアリング項目マスタ
// ═══════════════════════════════════════════
const QUESTIONS = [
  // ── 共通 ──
  { id: 'q-www', cat: '基本', required: true,
    q: 'URLに「www」を付けますか？',
    why: 'URLの形式に影響します。制作前に確認が必要な項目です',
    placeholder: '例：付ける（www.example.ed.jp）/ 付けない',
    cond: () => true, type: 'text' },

  // ── ドメイン新規 ──
  { id: 'q-newdom-1', cat: 'ドメイン', required: true,
    q: '希望ドメインの候補（第1〜第3希望）',
    why: 'ご希望のURLが取得できない場合の候補として使います',
    placeholder: '例：jiro-yochien.ed.jp, jiro.ed.jp, jiro-kindergarten.jp',
    cond: s => s.domain === 'new', type: 'textarea' },
  { id: 'q-newdom-2', cat: 'ドメイン', required: false,
    q: '.ed.jp取得の場合：認可証・在園証明書類',
    why: '.ed.jpの取得には認可証などの書類が必要です',
    placeholder: '例：認可証コピーを準備済み / 確認中',
    cond: s => s.domain === 'new', type: 'text' },

  // ── ドメイン移管 ──
  { id: 'q-mov-1', cat: 'ドメイン', required: true,
    q: '現在のドメイン管理会社',
    why: 'URL管理の引き継ぎ先として確認が必要です',
    placeholder: '例：〇〇株式会社 / お名前.com',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-2', cat: 'ドメイン', required: true,
    q: 'AuthCode（移管認証コード）の取得状況',
    why: 'URLを移管するために必要なコードです（有効期限があります）',
    placeholder: '例：取得済み / 管理会社に依頼中',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-3', cat: 'ドメイン', required: true,
    q: 'ドメイン有効期限',
    why: '期限が近い場合、手続きができないことがあります',
    placeholder: '例：2027年3月31日',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-4', cat: 'ドメイン', required: false,
    q: '移管ロック（DomainTransferLocked）の状況',
    why: 'ロックがかかっている場合は事前に解除が必要です',
    placeholder: '例：解除済み / 解除依頼中',
    cond: s => s.domain === 'transfer', type: 'text' },

  // ── ドメイン他社継続 ──
  { id: 'q-ext-1', cat: 'ドメイン', required: true,
    q: '現在のドメイン管理会社',
    why: 'URLの設定変更をお願いする会社の確認に必要です',
    placeholder: '例：〇〇株式会社 / お名前.com',
    cond: s => s.domain === 'external', type: 'text' },
  { id: 'q-ext-2', cat: 'ドメイン', required: true,
    q: '管理会社への連絡窓口（メール/電話）',
    why: 'URL設定の変更依頼を送る連絡先として使います',
    placeholder: '例：info@example.com / 03-XXXX-XXXX',
    cond: s => s.domain === 'external', type: 'text' },
  { id: 'q-ext-3', cat: 'ドメイン', required: true,
    q: '管理会社の管理画面ログイン情報の有無',
    why: '貴園が自分で対応できる範囲を確認するために必要です',
    placeholder: '例：ID・パスワードあり / 不明',
    cond: s => s.domain === 'external', type: 'text' },

  // ── メール新規 ──
  { id: 'q-mailnew-1', cat: 'メール', required: true,
    q: '必要なメールアドレスの数',
    why: 'メールサービスのプランを決めるために必要です',
    placeholder: '例：3アドレス（園長・事務・info@）',
    cond: s => s.mail === 'new', type: 'text' },
  { id: 'q-mailnew-2', cat: 'メール', required: true,
    q: '各アドレスの命名希望',
    why: 'どのようなメールアドレスを作るかを決めるために入力してください',
    placeholder: '例：info@, principal@, office@',
    cond: s => s.mail === 'new', type: 'textarea' },
  { id: 'q-mailnew-3', cat: 'メール', required: true,
    q: '教育機関認証書類（GWS申請時に必要）',
    why: '教育機関向けメールサービスの申請に必要な書類です',
    placeholder: '例：認定証コピーを準備済み / 確認中',
    cond: s => s.mail === 'new', type: 'text' },

  // ── メール継続 ──
  { id: 'q-mailcon-1', cat: 'メール', required: true,
    q: '現在のメールサービス名',
    why: '現在お使いのメールサービスを確認するために必要です',
    placeholder: '例：さくらメール / Xserver / GMOクラウド',
    cond: s => s.mail === 'continue' && s.domain !== 'external', type: 'text' },
  { id: 'q-mailcon-2', cat: 'メール', required: true,
    q: 'MXレコードの値',
    why: 'メールの受信先を引き継ぐために必要な設定値です',
    placeholder: '例：MX 10 mail.example.com',
    cond: s => s.mail === 'continue' && s.domain !== 'external', type: 'text' },
  { id: 'q-mailcon-3', cat: 'メール', required: true,
    q: 'SPFレコードの値',
    why: 'メールの送信元を証明するための設定値です',
    placeholder: '例：v=spf1 include:example.com ~all',
    cond: s => s.mail === 'continue' && s.domain !== 'external', type: 'text' },
  { id: 'q-mailcon-4', cat: 'メール', required: false,
    q: 'DKIM/DMARC設定（設定がある場合のみ）',
    why: '設定済みの場合、新HPでも継続が必要です',
    placeholder: '例：設定なし / v=DMARC1;p=none...',
    cond: s => s.mail === 'continue' && s.domain !== 'external', type: 'textarea' },
  { id: 'q-mailcon-5', cat: 'メール', required: false,
    q: '既存メールサーバのIPアドレス',
    why: 'メール専用のサーバー設定に使う情報です',
    placeholder: '例：123.456.78.9',
    cond: s => s.mail === 'continue' && s.domain !== 'external', type: 'text' },

  // ── 旧サイト関連 ──
  { id: 'q-old-1', cat: '旧サイト', required: true,
    q: '旧サイトのURL',
    why: '現在のHPのURLとして記録します',
    placeholder: '例：https://www.example.com',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-2', cat: '旧サイト', required: true,
    q: '旧サイトの公開先サービス',
    why: '転送設定の方法がサービスによって異なります',
    placeholder: '例：Wix / ジンドゥー / WordPress',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-3', cat: '旧サイト', required: true,
    q: '旧サイトの管理会社',
    why: '旧HPの解約・転送設定の連絡先として使います',
    placeholder: '例：〇〇株式会社',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-4', cat: '旧サイト', required: false,
    q: '旧サイトの維持期間',
    why: '転送設定を維持するために旧URLの契約を継続する期間を確認します',
    placeholder: '例：2026年9月まで',
    cond: s => s.oldsite === 'yes' && s.redirect === 'needed', type: 'text' },
];

// ═══════════════════════════════════════════
// 新規取得フォーム：state同期・Markdown出力
// ═══════════════════════════════════════════
const ORG_FIELD_MAP = [
  ['newOrgType',      'new-org-type'],
  ['newOrgLicensed',  'new-org-licensed'],
  ['newOrgName',      'new-org-name'],
  ['newOrgKana',      'new-org-kana'],
  ['newOrgNameEn',    'new-org-name-en'],
  ['newPostal',       'new-postal'],
  ['newAddress',      'new-address'],
  ['newBuilding',     'new-building'],
  ['newContactName',  'new-contact-name'],
  ['newContactRoman', 'new-contact-roman'],
  ['newContactDept',  'new-contact-dept'],
  ['newContactTitle', 'new-contact-title'],
  ['newContactPhone', 'new-contact-phone'],
  ['newContactEmail', 'new-contact-email'],
  ['newRegDate',      'new-reg-date'],
  ['newRegAddress',   'new-reg-address'],
  ['newRepName',      'new-rep-name'],
  ['newRepRoman',     'new-rep-roman'],
  ['newRepTitle',     'new-rep-title'],
];

const REDIRECT_FIELD_MAP = [
  ['redirectWebCompany',    'redirect-web-company'],
  ['redirectDomainCompany', 'redirect-domain-company'],
  ['redirectTool',          'redirect-tool'],
];

function syncRedirectFields() {
  REDIRECT_FIELD_MAP.forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) state[key] = el.value.trim();
  });
}

function syncOrgFields() {
  const dnEl = document.getElementById('domain-name');
  if (dnEl) state.domainName = dnEl.value.trim();
  ORG_FIELD_MAP.forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) state[key] = el.value.trim();
  });
  const emailEl = document.getElementById('recipient-email');
  if (emailEl) state.recipientEmail = emailEl.value.trim();
}

function buildOrgSection() {
  const s = state;
  const licensed = s.newOrgLicensed === 'yes' ? '受けている' :
                   s.newOrgLicensed === 'no'  ? '受けていない' : '—';
  let md = `## ドメイン取得申請情報\n\n`;
  md += `### 組織情報\n`;
  md += `| 項目 | 内容 |\n|------|------|\n`;
  md += `| 法人種類 | ${s.newOrgType || '—'} |\n`;
  md += `| 認可 | ${licensed} |\n`;
  md += `| 組織名（園名のみ） | ${s.newOrgName || '—'} |\n`;
  md += `| 読み仮名 | ${s.newOrgKana || '—'} |\n`;
  md += `| 英語表記 | ${s.newOrgNameEn || '—'} |\n\n`;
  md += `### 住所\n`;
  md += `| 項目 | 内容 |\n|------|------|\n`;
  md += `| 郵便番号 | ${s.newPostal || '—'} |\n`;
  md += `| 住所 | ${s.newAddress || '—'} |\n`;
  md += `| 建物 | ${s.newBuilding || '—'} |\n\n`;
  md += `### 登録担当者\n`;
  md += `| 項目 | 内容 |\n|------|------|\n`;
  md += `| 氏名（漢字） | ${s.newContactName || '—'} |\n`;
  md += `| 氏名（ローマ字） | ${s.newContactRoman || '—'} |\n`;
  md += `| 部署 | ${s.newContactDept || '—'} |\n`;
  md += `| 役職 | ${s.newContactTitle || '—'} |\n`;
  md += `| 電話番号 | ${s.newContactPhone || '—'} |\n`;
  md += `| メール | ${s.newContactEmail || '—'} |\n\n`;
  md += `### 登記情報\n`;
  md += `| 項目 | 内容 |\n|------|------|\n`;
  md += `| 登記年月日 | ${s.newRegDate || '—'} |\n`;
  md += `| 登記地住所 | ${s.newRegAddress || '—'} |\n`;
  md += `| 代表者氏名 | ${s.newRepName || '—'} |\n`;
  md += `| 代表者（ローマ字） | ${s.newRepRoman || '—'} |\n`;
  md += `| 代表者役職 | ${s.newRepTitle || '—'} |\n\n`;
  return md;
}

// ═══════════════════════════════════════════
// リスク判定
// ═══════════════════════════════════════════
function calcRisk(s) {
  // High: 移管 ＋ 既存メール継続
  //   → DNS が丸ごと再構築されるため MX/SPF を設定ミスするとメール停止
  if (s.domain === 'transfer' && s.mail === 'continue') return {
    level: 'high',
    label: 'リスク：高（メール停止に注意）',
    msg: '移管によりDNSが再構築されます。MX/SPF設定を間違えるとメール停止のリスクがあります。DNS切替日とメール停止許容時間を必ず園と合意してください。'
  };
  // Mid: 移管あり / リダイレクト必要 / 新規ドメイン＋既存メール継続
  //   ※ 他社管理継続＋メール継続はAレコードのみ変更のためMXは無関係 → Low
  if (s.domain === 'transfer' ||
      s.redirect === 'needed' ||
      (s.domain === 'new' && s.mail === 'continue')) return {
    level: 'mid',
    label: 'リスク：中（外部調整が必要）',
    msg: '移管手続き・リダイレクト設定・新規DNS上でのメール設定など、外部への調整が必要です。リードタイムに余裕を持って動いてください。'
  };
  // Low: それ以外（他社管理継続＋Aレコード変更のみ、など）
  return {
    level: 'low',
    label: 'リスク：低（シンプルケース）',
    msg: '比較的シンプルな案件です。基本フローに沿って進めれば問題ありません。'
  };
}

// ═══════════════════════════════════════════
// パターンID
// ═══════════════════════════════════════════
function patternId(s) {
  const d = { new: 'N', transfer: 'T', external: 'X' }[s.domain] || '?';
  const m = { none: '0', new: 'N', continue: 'C' }[s.mail] || '?';
  const o = s.oldsite === 'yes' ? 'O' : '_';
  const r = { none: '0', needed: 'R' }[s.redirect] || '_';
  return `D${d}-M${m}-${o}${r}`;
}

// ═══════════════════════════════════════════
// トースト通知
// ═══════════════════════════════════════════
let _toastTimer = null;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  // 連続呼び出し時はタイマーをリセット
  clearTimeout(_toastTimer);
  requestAnimationFrame(() => {
    el.classList.add('show');
    _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  });
}

// ═══════════════════════════════════════════
// ステップ遷移
// ═══════════════════════════════════════════
function goStep(n, force = false) {
  // バリデーション（force=true の場合はスキップ）
  if (!force) {
    if (n === 1 && !document.getElementById('garden-name').value.trim()) {
      showToast('園名を入力してください', 'error');
      return;
    }
    if (n === 2) {
      const d = document.querySelector('input[name="domain"]:checked');
      if (!d) { showToast('ドメインの扱いを選択してください', 'error'); return; }
      state.domain = d.value;
    }
    if (n === 3) {
      const m = document.querySelector('input[name="mail"]:checked');
      if (!m) { showToast('メールの扱いを選択してください', 'error'); return; }
      state.mail = m.value;
    }
  }

  // 状態保存
  state.gardenName = document.getElementById('garden-name').value.trim();
  state.directorName = document.getElementById('director-name').value.trim();
  state.publishDate = document.getElementById('publish-date').value;
  // 到達済み最大ステップを更新
  if (n > state.maxStep) state.maxStep = n;
  state.domainName = document.getElementById('domain-name').value.trim();

  // パネル切替
  for (let i = 0; i <= 4; i++) {
    document.getElementById(`step-${i}`).classList.add('hidden');
  }
  document.getElementById(`step-${n}`).classList.remove('hidden');

  // ステッパー更新
  document.querySelectorAll('.stepper .step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i < n) el.classList.add('done');
    if (i === n) el.classList.add('active');
  });

  // スクロール
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ═══════════════════════════════════════════
// 初期化：イベントリスナー登録
// ═══════════════════════════════════════════
// 郵便番号 → 住所補完（zipcloud API）
// ═══════════════════════════════════════════
async function lookupPostal(digits, targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;
  try {
    const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${digits}`);
    const json = await res.json();
    if (json.results && json.results.length > 0) {
      const r = json.results[0];
      const addr = r.address1 + r.address2 + r.address3;
      target.value = addr;
      target.focus();
      target.setSelectionRange(addr.length, addr.length);
      showToast('住所を自動入力しました。番地・号を続けて入力してください', 'success');
    } else {
      showToast('該当する住所が見つかりませんでした', 'error');
    }
  } catch {
    showToast('住所の取得に失敗しました（通信エラー）', 'error');
  }
}

// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // ドメイン選択ラジオ：状態は goStep() で取得、詳細入力は結果シートで表示するため
  // ここでは UI 更新なし

  // 旧サイトあり選択時のサブ質問表示
  document.querySelectorAll('input[name="oldsite"]').forEach(el => {
    el.addEventListener('change', () => {
      state.oldsite = el.value;
      const sub = document.getElementById('redirect-group');
      if (el.value === 'yes') sub.classList.remove('hidden');
      else { sub.classList.add('hidden'); state.redirect = ''; }
    });
  });

  document.querySelectorAll('input[name="redirect"]').forEach(el => {
    el.addEventListener('change', () => state.redirect = el.value);
  });

  // ステッパークリックでナビゲーション（訪問済みのみ）
  document.querySelectorAll('.stepper .step').forEach((el, i) => {
    el.style.cursor = 'default';
    el.addEventListener('click', () => {
      if (i > state.maxStep) {
        showToast('まず順番にステップを進めてください', 'info');
        return;
      }
      if (i === 4) {
        // 結果シートへは generateResult を再実行して最新内容を反映
        generateResult(true);
      } else {
        goStep(i, true);
      }
    });
  });

  // 郵便番号 → 住所自動入力
  document.getElementById('new-postal').addEventListener('input', function() {
    const digits = this.value.replace(/[^\d]/g, '');
    if (digits.length === 7) lookupPostal(digits, 'new-address');
  });
});

// ═══════════════════════════════════════════
// 結果生成
// ═══════════════════════════════════════════
function generateResult(silent = false) {
  // DOM から全ラジオ・テキストを再同期（戻って変更後も正しく反映するため）
  state.gardenName   = document.getElementById('garden-name').value.trim();
  state.directorName = document.getElementById('director-name').value.trim();
  state.publishDate  = document.getElementById('publish-date').value;
  const domainEl   = document.querySelector('input[name="domain"]:checked');
  const mailEl     = document.querySelector('input[name="mail"]:checked');
  const oldsiteEl  = document.querySelector('input[name="oldsite"]:checked');
  const redirectEl = document.querySelector('input[name="redirect"]:checked');
  if (domainEl)  state.domain  = domainEl.value;
  if (mailEl)    state.mail    = mailEl.value;
  state.oldsite  = oldsiteEl  ? oldsiteEl.value  : state.oldsite;
  state.redirect = redirectEl ? redirectEl.value : state.redirect;

  if (!silent) {
    if (!state.oldsite) {
      showToast('旧サイトの有無を選択してください', 'error');
      return;
    }
    if (state.oldsite === 'yes' && !state.redirect) {
      showToast('リダイレクトの要否を選択してください', 'error');
      return;
    }
  }

  const risk = calcRisk(state);
  const pid = patternId(state);

  // 最大到達ステップ更新
  state.maxStep = 4;

  // リダイレクトパネルの表示制御
  const rdPanel = document.getElementById('s5-redirect-panel');
  if (rdPanel) {
    if (state.redirect === 'needed') rdPanel.classList.remove('hidden');
    else rdPanel.classList.add('hidden');
  }

  // ドメイン名ラベル＆申請フォームの表示を選択に合わせて更新
  const DLABEL = {
    new:      { label: '希望ドメイン名',   hint: '第1〜第3希望を入力してください（複数ある場合はカンマ区切りでOK）' },
    transfer: { label: '現在のドメイン名', hint: '移管元の既存ドメインを入力してください' },
    external: { label: '現在のドメイン名', hint: '現在使用中のドメインを入力してください' },
  };
  const dlmap = DLABEL[state.domain] || {};
  const dlbl  = document.getElementById('domain-name-label');
  const dhint = document.getElementById('domain-name-hint');
  if (dlbl)  dlbl.textContent  = dlmap.label || '希望ドメイン名 / 現在のドメイン名';
  if (dhint) dhint.textContent = dlmap.hint  || 'わかる範囲でOK';
  const ndf = document.getElementById('new-domain-form');
  if (ndf) {
    if (state.domain === 'new') ndf.classList.remove('hidden');
    else ndf.classList.add('hidden');
  }

  // ヘッダー部分
  document.getElementById('result-garden-name').textContent =
    `${state.gardenName || '〇〇園'} さま｜HP公開ヒアリングシート`;
  document.getElementById('result-pattern').textContent =
    `パターンID: ${pid}　|　担当: ${state.directorName || '—'}　|　公開希望日: ${state.publishDate || '—'}`;

  const meta = [];
  meta.push({ new: 'ドメイン新規', transfer: 'ドメイン移管', external: '他社管理継続' }[state.domain]);
  meta.push({ none: 'メールなし', new: 'メール新規', continue: 'メール継続' }[state.mail]);
  if (state.oldsite === 'yes') meta.push('旧サイトあり');
  if (state.redirect === 'needed') {
    meta.push('リダイレクト必要');
  }
  document.getElementById('result-meta').innerHTML = meta.map(m => `<span>● ${m}</span>`).join('');

  // リスクバナー
  const banner = document.getElementById('risk-banner');
  banner.className = `risk-banner ${risk.level}`;
  banner.innerHTML = `<strong>${risk.label}</strong><br>${risk.msg}`;

  // ヒアリング項目
  const visible = QUESTIONS.filter(q => q.cond(state));
  const byCat = {};
  visible.forEach(q => {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });

  let html = '';
  const order = ['基本', 'ドメイン', 'メール', '旧サイト', 'リダイレクト'];
  order.forEach(cat => {
    if (!byCat[cat]) return;
    html += `<div class="section-title">${cat}</div>`;
    byCat[cat].forEach(q => {
      const badge = q.required
        ? '<span class="badge badge-required">必須</span>'
        : '<span class="badge badge-optional">任意</span>';
      const ph = q.placeholder || '内容を記入';
      const input = q.type === 'textarea'
        ? `<textarea data-qid="${q.id}" placeholder="${ph}" onchange="saveAnswer('${q.id}', this.value)">${state.answers[q.id] || ''}</textarea>`
        : `<input type="text" data-qid="${q.id}" placeholder="${ph}" value="${state.answers[q.id] || ''}" onchange="saveAnswer('${q.id}', this.value)">`;
      html += `
        <div class="ask-item">
          <div class="ask-body">
            <div class="ask-title">${q.q}${badge}</div>
            <div class="ask-why">${q.why}</div>
            <div class="ask-answer">${input}</div>
          </div>
        </div>`;
    });
  });

  document.getElementById('result-body').innerHTML = html;
  goStep(4);
}

function saveAnswer(qid, val) { state.answers[qid] = val; }

function toggleCheck(qid, el) {
  state.checked[qid] = !state.checked[qid];
  el.classList.toggle('checked');
}

// ═══════════════════════════════════════════
// 出力機能
// ═══════════════════════════════════════════
function buildMarkdown() {
  // フォーム値を最新化（domainName は常に、org情報は新規取得時のみ）
  const dnEl2 = document.getElementById('domain-name');
  if (dnEl2) state.domainName = dnEl2.value.trim();
  if (state.domain === 'new') syncOrgFields();

  const risk = calcRisk(state);
  const pid = patternId(state);
  const visible = QUESTIONS.filter(q => q.cond(state));
  let md = `# ${state.gardenName || '〇〇園'} さま｜HP公開ヒアリングシート\n\n`;
  md += `- **パターンID:** ${pid}\n`;
  md += `- **担当ディレクター:** ${state.directorName || '—'}\n`;
  md += `- **HP公開希望日:** ${state.publishDate || '—'}\n`;
  md += `- **ドメイン名:** ${state.domainName || '—'}\n`;
  md += `- **リスク評価:** ${risk.label}\n\n`;
  md += `> ${risk.msg}\n\n`;

  md += `## 判定条件\n`;
  md += `- ドメイン: ${ {new:'新規取得', transfer:'移管', external:'他社管理継続'}[state.domain] }\n`;
  md += `- メール: ${ {none:'なし', new:'新規', continue:'既存継続'}[state.mail] }\n`;
  md += `- 旧サイト: ${ state.oldsite === 'yes' ? 'あり' : 'なし' }\n`;
  if (state.redirect) md += `- リダイレクト: ${ {none:'不要', needed:'必要'}[state.redirect] }\n`;
  md += `\n`;

  const byCat = {};
  visible.forEach(q => {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });
  const order = ['基本', 'ドメイン', 'メール', '旧サイト', 'リダイレクト'];
  order.forEach(cat => {
    if (!byCat[cat]) return;
    md += `## ${cat}\n\n`;
    byCat[cat].forEach(q => {
      const req = q.required ? '【必須】' : '【任意】';
      const ans = state.answers[q.id] || '';
      md += `- ${req} **${q.q}**\n`;
      md += `  - 確認理由: ${q.why}\n`;
      if (ans) md += `  - 回答: ${ans}\n`;
      md += `\n`;
    });
  });

  // 新規取得の場合、取得申請情報セクションを追加
  if (state.domain === 'new') {
    md += buildOrgSection();
  }

  // リダイレクト必要の場合、制作会社情報セクションを追加
  if (state.redirect === 'needed') {
    syncRedirectFields();
    const toolLabel = {
      jimdoo: 'ジンドゥー', wix: 'Wix', wordpress: 'WordPress',
      studio: 'STUDIO', amebaownd: 'Ameba Ownd', google: 'Googleサイト', other: 'その他・不明'
    }[state.redirectTool] || state.redirectTool || '—';
    md += `## リダイレクト情報\n\n`;
    md += `| 項目 | 内容 |\n|------|------|\n`;
    md += `| WEB制作会社 | ${state.redirectWebCompany || '—'} |\n`;
    md += `| ドメイン管理会社 | ${state.redirectDomainCompany || '—'} |\n`;
    md += `| HPツール | ${toolLabel} |\n\n`;
  }

  return md;
}

function sendEmail() {
  syncOrgFields();
  const email = state.recipientEmail;
  if (!email) {
    showToast('送信先メールアドレスを入力してください', 'error');
    return;
  }
  const risk = calcRisk(state);
  const pid = patternId(state);
  const subject = `【HP公開ヒアリングシート】${state.gardenName || '〇〇園'}さま`;

  let body = `${state.gardenName || '〇〇園'} さまのHP公開ヒアリングシートです。\n\n`;
  body += `■ パターンID: ${pid}\n`;
  body += `■ リスク評価: ${risk.label}\n`;
  body += `■ 公開希望日: ${state.publishDate || '—'}\n`;
  body += `■ 担当ディレクター: ${state.directorName || '—'}\n`;
  body += `■ ドメイン: ${ {new:'新規取得', transfer:'移管', external:'他社管理継続'}[state.domain] }\n`;
  body += `■ メール: ${ {none:'なし', new:'新規', continue:'既存継続'}[state.mail] }\n`;
  if (state.oldsite === 'yes') body += `■ 旧サイト: あり\n`;
  body += `\n---\n`;
  body += `詳細はヒアリングシートを「テキストで保存」してご確認ください。\n`;

  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
  showToast('メールクライアントを開きます', 'info');
}

function copyAsMarkdown() {
  const md = buildMarkdown();
  navigator.clipboard.writeText(md).then(() => {
    showToast('Markdown形式でコピーしました。NotionやGoogleドキュメント等に貼り付けできます', 'success');
  }).catch(() => {
    showToast('クリップボードへのアクセスが拒否されました', 'error');
  });
}

function downloadAsText() {
  const md = buildMarkdown();
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (state.gardenName || 'garden').replace(/[\\/:*?"<>|]/g, '_');
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  a.href = url;
  a.download = `ヒアリングシート_${safeName}_${dateStr}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function sendSlack() {
  const risk = calcRisk(state);
  const pid = patternId(state);
  const visible = QUESTIONS.filter(q => q.cond(state));
  let text = `*【HP公開ヒアリングシート】*\n`;
  text += `▼園名: ${state.gardenName || '—'}\n`;
  text += `▼担当D: ${state.directorName || '—'}\n`;
  text += `▼公開希望日: ${state.publishDate || '—'}\n`;
  text += `▼パターンID: \`${pid}\`\n`;
  text += `▼リスク: ${risk.label}\n`;
  text += `▼確認項目数: ${visible.length} 項目\n\n`;
  text += `*要確認項目:*\n`;
  visible.filter(q => q.required && !state.checked[q.id]).forEach(q => {
    text += `• ${q.cat} / ${q.q}\n`;
  });
  text += `\n_全項目はMarkdown形式で別途共有します_`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('文面をコピーしました。メール・チャット等に貼り付けて送信してください', 'success');
  }).catch(() => {
    showToast('クリップボードへのアクセスが拒否されました', 'error');
  });
}

function resetAll() {
  if (!window.confirm('入力内容をすべてリセットしてよろしいですか？')) return;
  Object.keys(state).forEach(k => {
    if (typeof state[k] === 'string') state[k] = '';
    else state[k] = {};
  });
  document.querySelectorAll('input[type="text"], input[type="date"], input[type="email"], input[type="tel"], textarea').forEach(el => el.value = '');
  document.querySelectorAll('input[type="radio"]').forEach(el => el.checked = false);
  document.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  document.getElementById('redirect-group').classList.add('hidden');
  document.getElementById('new-domain-form').classList.add('hidden');
  const rdPanel2 = document.getElementById('s5-redirect-panel');
  if (rdPanel2) rdPanel2.classList.add('hidden');
  state.maxStep = 0;
  goStep(0);
}
