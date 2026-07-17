/* ═══════════════════════════════════════════
 * HP公開ドメイン判定ツール メインJS
 * ═══════════════════════════════════════════ */

// ═══════════════════════════════════════════
// Firebase 設定・初期化
// ═══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCtHBzancsl1AfyTE0w7deORYMTGFfLE_w",
  authDomain: "domain-support-54f55.firebaseapp.com",
  projectId: "domain-support-54f55",
  storageBucket: "domain-support-54f55.firebasestorage.app",
  messagingSenderId: "1017898228058",
  appId: "1:1017898228058:web:b8847317ef1ae19cc07b63",
  measurementId: "G-X9L9MPZJN0"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ═══════════════════════════════════════════
// Firestore 登録
// ═══════════════════════════════════════════
async function submitToFirestore() {
  syncAnswersFromDOM();

  if (!state.gardenName) {
    showToast('園名を入力してください（Step 01）', 'error');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '登録中...';

  const risk = calcRisk(state);
  const pid  = patternId(state);
  const domainLabel = {new:'新規取得', transfer:'移管', external:'他社管理継続'}[state.domain] || '—';
  const mailLabel   = getMailLabel(state);

  const payload = {
    gardenName:    state.gardenName,
    directorName:  state.directorName,
    publishDate:   state.publishDate,
    domainName:    state.domainName,
    patternId:     pid,
    riskLevel:     risk.level,
    riskLabel:     risk.label,
    domain:        state.domain,
    domainLabel:   domainLabel,
    mail:          state.mail,
    mailLabel:     mailLabel,
    mailService:   state.mail === 'new' ? state.mailService : '',
    oldsite:       state.oldsite,
    redirect:      state.redirect,
    redirectInfo:  state.redirect === 'needed' ? {
      webCompany:        state.redirectWebCompany,
      webCompanyPhone:   state.redirectWebCompanyPhone,
      webCompanyEmail:   state.redirectWebCompanyEmail,
      domainCompany:     state.redirectDomainCompany,
      domainCompanyPhone: state.redirectDomainCompanyPhone,
      domainCompanyEmail: state.redirectDomainCompanyEmail,
      tool:              state.redirectTool,
    } : null,
    answers:       state.answers,
    status:        'pending',
    submittedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp(),
  };

  try {
    const docRef = await db.collection('submissions').add(payload);
    showToast('登録しました！担当者に通知されます', 'success');
    btn.textContent = '登録済み ✓';
    btn.style.background = 'var(--ok)';
    clearDraft();
    console.log('登録ID:', docRef.id);
  } catch (err) {
    console.error(err);
    showToast('登録に失敗しました。時間をおいて再度お試しください', 'error');
    btn.disabled = false;
    btn.textContent = 'この内容で登録する';
  }
}



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
  mailService: '', // gws / self / sakura / undecided
  oldsite: '',    // yes / no
  redirect: '',   // none / needed
  redirectWebCompany: '', redirectWebCompanyPhone: '', redirectWebCompanyEmail: '',
  redirectDomainCompany: '', redirectDomainCompanyPhone: '', redirectDomainCompanyEmail: '',
  redirectTool: '',
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

function getMailLabel(s) {
  if (s.mail === 'new') {
    const service = {
      sakura: 'さくらのビジネスメール',
      gws: 'Google Workspace for Education',
      self: '自分でメールサーバを契約',
      undecided: '利用方法未定',
    }[s.mailService];
    return service ? `新規（${service}）` : '新規';
  }
  return { none: 'なし', continue: '既存継続' }[s.mail] || '—';
}

const DRAFT_KEY = 'domain-support-form-draft';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
let draftSaveTimer = null;
let currentStep = 0;
let isRestoringDraft = false;

function getSelectedValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : '';
}

function syncCoreStateFromDOM() {
  const gardenName = document.getElementById('garden-name');
  const directorName = document.getElementById('director-name');
  const publishDate = document.getElementById('publish-date');

  if (gardenName) state.gardenName = gardenName.value.trim();
  if (directorName) state.directorName = directorName.value.trim();
  if (publishDate) state.publishDate = publishDate.value;

  state.domain = getSelectedValue('domain') || state.domain;
  state.mail = getSelectedValue('mail') || state.mail;
  state.mailService = state.mail === 'new'
    ? (getSelectedValue('mail-service') || state.mailService)
    : '';
  state.oldsite = getSelectedValue('oldsite') || state.oldsite;
  state.redirect = state.oldsite === 'yes'
    ? (getSelectedValue('redirect') || state.redirect)
    : '';
  syncAnswersFromDOM();
}

function getDraftFields() {
  const fields = {};
  document.querySelectorAll('input[id], textarea[id], select[id]').forEach(el => {
    if (el.type !== 'radio' && el.type !== 'button' && el.type !== 'submit') {
      fields[el.id] = el.value;
    }
  });
  return fields;
}

function formatDraftTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setDraftStatus(message, stateName = '') {
  const el = document.getElementById('draft-status');
  if (!el) return;
  el.textContent = message;
  el.className = `draft-status ${stateName}`.trim();
}

function saveDraft() {
  if (isRestoringDraft) return;
  try {
    syncCoreStateFromDOM();
    const savedAt = Date.now();
    const draft = {
      version: DRAFT_VERSION,
      savedAt,
      currentStep,
      maxStep: state.maxStep,
      state,
      fields: getDraftFields(),
      radios: {
        domain: getSelectedValue('domain'),
        mail: getSelectedValue('mail'),
        mailService: getSelectedValue('mail-service'),
        oldsite: getSelectedValue('oldsite'),
        redirect: getSelectedValue('redirect'),
      },
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setDraftStatus(`保存済み ${formatDraftTime(savedAt)}`, 'saved');
  } catch (err) {
    console.error('draft save error:', err);
    setDraftStatus('この端末に下書きを保存できませんでした', 'error');
  }
}

function queueDraftSave() {
  if (isRestoringDraft) return;
  clearTimeout(draftSaveTimer);
  setDraftStatus('保存中...');
  draftSaveTimer = setTimeout(saveDraft, 400);
}

function clearDraft() {
  clearTimeout(draftSaveTimer);
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (err) {
    console.error('draft clear error:', err);
  }
  setDraftStatus('この端末に入力内容を自動保存します');
}

function updateConditionalFields() {
  const mail = getSelectedValue('mail') || state.mail;
  const mailServiceGroup = document.getElementById('mail-service-group');
  if (mailServiceGroup) {
    mailServiceGroup.classList.toggle('hidden', mail !== 'new');
  }

  const oldsite = getSelectedValue('oldsite') || state.oldsite;
  const redirectGroup = document.getElementById('redirect-group');
  if (redirectGroup) {
    redirectGroup.classList.toggle('hidden', oldsite !== 'yes');
  }
}

function restoreDraft() {
  let draft;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    draft = JSON.parse(raw);
    if (
      draft.version !== DRAFT_VERSION ||
      !Number.isFinite(draft.savedAt) ||
      Date.now() - draft.savedAt > DRAFT_MAX_AGE
    ) {
      clearDraft();
      return false;
    }
  } catch (err) {
    console.error('draft restore error:', err);
    clearDraft();
    return false;
  }

  isRestoringDraft = true;
  Object.assign(state, draft.state || {});
  state.answers = state.answers || {};
  delete state.answers['q-newdom-2'];
  state.checked = state.checked || {};
  state.maxStep = Number.isFinite(draft.maxStep) ? draft.maxStep : 0;

  Object.entries(draft.fields || {}).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  const radioNames = {
    domain: 'domain',
    mail: 'mail',
    mailService: 'mail-service',
    oldsite: 'oldsite',
    redirect: 'redirect',
  };
  Object.entries(radioNames).forEach(([key, name]) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
      el.checked = el.value === (draft.radios || {})[key];
    });
  });

  updateConditionalFields();
  const step = Math.max(0, Math.min(4, Number(draft.currentStep) || 0));
  if (step === 4) generateResult(true);
  else goStep(step, true);
  currentStep = step;
  isRestoringDraft = false;
  setDraftStatus(`下書きを復元しました（${formatDraftTime(draft.savedAt)}保存）`, 'restored');
  return true;
}

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
    cond: s => s.mail === 'new' && s.mailService === 'sakura', type: 'text' },
  { id: 'q-mailnew-2', cat: 'メール', required: true,
    q: '希望するメールアドレス',
    why: '作成を希望するアドレスを、わかる範囲で入力してください',
    placeholder: '例：info@、principal@、office@',
    cond: s => s.mail === 'new' && s.mailService === 'sakura', type: 'textarea' },

  // ── メール継続 ──
  { id: 'q-mailcon-1', cat: 'メール', required: true,
    q: '現在のメールサービス名',
    why: '現在お使いのメールサービスを確認するために必要です',
    placeholder: '例：さくらメール / Xserver / GMOクラウド',
    cond: s => s.mail === 'continue' && s.domain === 'transfer', type: 'text' },
  { id: 'q-mailcon-2', cat: 'メール', required: true,
    q: 'メールを契約している会社名',
    why: '設定作業時に連絡先として使います',
    placeholder: '例：さくらインターネット / エックスサーバー株式会社',
    cond: s => s.mail === 'continue' && s.domain === 'transfer', type: 'text' },
  { id: 'q-mailcon-5x', cat: 'メール', required: false,
    q: 'その他・補足（任意）',
    why: '気になることや確認したいことがあれば入力してください',
    placeholder: '例：メールアドレスの数は3つです / 移行時期の希望など',
    cond: s => s.mail === 'continue' && s.domain === 'transfer', type: 'textarea' },

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
  { id: 'q-old-3-phone', cat: '旧サイト', required: false,
    q: '旧サイト管理会社の電話番号',
    why: '旧HPの解約・転送設定について確認する際の連絡先として使います',
    placeholder: '例：03-XXXX-XXXX',
    cond: s => s.oldsite === 'yes', type: 'tel' },
  { id: 'q-old-3-email', cat: '旧サイト', required: false,
    q: '旧サイト管理会社のメールアドレス',
    why: '旧HPの解約・転送設定について確認する際の連絡先として使います',
    placeholder: '例：support@example.com',
    cond: s => s.oldsite === 'yes', type: 'email' },
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
  ['redirectWebCompany',         'redirect-web-company'],
  ['redirectWebCompanyPhone',    'redirect-web-company-phone'],
  ['redirectWebCompanyEmail',    'redirect-web-company-email'],
  ['redirectDomainCompany',      'redirect-domain-company'],
  ['redirectDomainCompanyPhone', 'redirect-domain-company-phone'],
  ['redirectDomainCompanyEmail', 'redirect-domain-company-email'],
  ['redirectTool',               'redirect-tool'],
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
      if (state.mail === 'new') {
        const service = document.querySelector('input[name="mail-service"]:checked');
        if (!service) {
          showToast('新規メールの利用方法を選択してください', 'error');
          return;
        }
        state.mailService = service.value;
      }
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
  currentStep = n;
  queueDraftSave();
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
  document.querySelectorAll('input[name="mail"]').forEach(el => {
    el.addEventListener('change', () => {
      state.mail = el.value;
      updateConditionalFields();
    });
  });

  document.querySelectorAll('input[name="mail-service"]').forEach(el => {
    el.addEventListener('change', () => {
      state.mailService = el.value;
    });
  });

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

  document.addEventListener('input', queueDraftSave);
  document.addEventListener('change', queueDraftSave);
  document.getElementById('draft-clear-btn').addEventListener('click', () => {
    if (!window.confirm('保存した下書きと現在の入力内容を削除します。よろしいですか？')) return;
    resetAll(false);
    showToast('下書きを削除しました', 'success');
  });

  restoreDraft();
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
  const mailServiceEl = document.querySelector('input[name="mail-service"]:checked');
  const oldsiteEl  = document.querySelector('input[name="oldsite"]:checked');
  const redirectEl = document.querySelector('input[name="redirect"]:checked');
  if (domainEl)  state.domain  = domainEl.value;
  if (mailEl)    state.mail    = mailEl.value;
  state.mailService = state.mail === 'new' && mailServiceEl ? mailServiceEl.value : '';
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

  const gwsPanel = document.getElementById('s5-gws-panel');
  if (gwsPanel) {
    gwsPanel.classList.toggle('hidden', !(state.mail === 'new' && state.mailService === 'gws'));
  }

  const selfMailPanel = document.getElementById('s5-self-mail-panel');
  if (selfMailPanel) {
    selfMailPanel.classList.toggle('hidden', !(state.mail === 'new' && state.mailService === 'self'));
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
  meta.push(`メール: ${getMailLabel(state)}`);
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
        : `<input type="${q.type || 'text'}" data-qid="${q.id}" placeholder="${ph}" value="${state.answers[q.id] || ''}" onchange="saveAnswer('${q.id}', this.value)">`;
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

// DOM上の全入力値を state.answers に同期（送信前に必ず呼ぶ）
function syncAnswersFromDOM() {
  document.querySelectorAll('[data-qid]').forEach(el => {
    state.answers[el.dataset.qid] = el.value.trim();
  });
  const dnEl = document.getElementById('domain-name');
  if (dnEl) state.domainName = dnEl.value.trim();
  if (state.domain === 'new') syncOrgFields();
  syncRedirectFields();
}

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
  md += `- メール: ${getMailLabel(state)}\n`;
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
    md += `| WEB制作会社 電話番号 | ${state.redirectWebCompanyPhone || '—'} |\n`;
    md += `| WEB制作会社 メール | ${state.redirectWebCompanyEmail || '—'} |\n`;
    md += `| ドメイン管理会社 | ${state.redirectDomainCompany || '—'} |\n`;
    md += `| ドメイン管理会社 電話番号 | ${state.redirectDomainCompanyPhone || '—'} |\n`;
    md += `| ドメイン管理会社 メール | ${state.redirectDomainCompanyEmail || '—'} |\n`;
    md += `| HPツール | ${toolLabel} |\n\n`;
  }

  return md;
}

function sendEmail() {
  syncAnswersFromDOM();
  const email = state.recipientEmail;
  if (!email) {
    showToast('送信先メールアドレスを入力してください', 'error');
    return;
  }
  const risk = calcRisk(state);
  const pid = patternId(state);
  const subject = `【HP公開ヒアリングシート】${state.gardenName || '〇〇園'}さま`;
  const domainLabel = {new:'新規取得', transfer:'移管', external:'他社管理継続'}[state.domain] || '—';
  const mailLabel   = getMailLabel(state);

  let body = `${state.gardenName || '〇〇園'} さまのHP公開ヒアリングシートです。\n\n`;
  body += `■ パターンID: ${pid}\n`;
  body += `■ リスク評価: ${risk.label}\n`;
  body += `■ 公開希望日: ${state.publishDate || '—'}\n`;
  body += `■ 担当: ${state.directorName || '—'}\n`;
  body += `■ ドメイン: ${domainLabel}\n`;
  body += `■ メール: ${mailLabel}\n`;
  body += `■ 旧サイト: ${state.oldsite === 'yes' ? 'あり' : 'なし'}\n`;
  body += `\n【ヒアリング内容】\n`;

  const visible = QUESTIONS.filter(q => q.cond(state));
  let lastCat = '';
  visible.forEach(q => {
    if (q.cat !== lastCat) { body += `\n＜${q.cat}＞\n`; lastCat = q.cat; }
    const ans = state.answers[q.id] || '（未記入）';
    body += `▼ ${q.q}\n  → ${ans}\n`;
  });

  if (state.domainName) body += `\n▼ ドメイン名\n  → ${state.domainName}\n`;
  body += `\n---\nスマートエデュケーション ホームページ公開準備フォームより自動生成\n`;

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
  syncAnswersFromDOM();
  const risk = calcRisk(state);
  const pid = patternId(state);
  const domainLabel = {new:'新規取得', transfer:'移管', external:'他社管理継続'}[state.domain] || '—';
  const mailLabel   = getMailLabel(state);
  const visible = QUESTIONS.filter(q => q.cond(state));

  let text = `【HP公開ヒアリングシート】\n`;
  text += `▼園名: ${state.gardenName || '—'}\n`;
  text += `▼担当: ${state.directorName || '—'}\n`;
  text += `▼公開希望日: ${state.publishDate || '—'}\n`;
  text += `▼パターンID: ${pid}\n`;
  text += `▼リスク: ${risk.label}\n`;
  text += `▼ドメイン: ${domainLabel} / メール: ${mailLabel} / 旧サイト: ${state.oldsite === 'yes' ? 'あり' : 'なし'}\n`;
  if (state.domainName) text += `▼ドメイン名: ${state.domainName}\n`;
  text += `\n`;

  let lastCat = '';
  visible.forEach(q => {
    if (q.cat !== lastCat) { text += `\n＜${q.cat}＞\n`; lastCat = q.cat; }
    const ans = state.answers[q.id] || '（未記入）';
    const req = q.required ? '【必須】' : '【任意】';
    text += `${req} ${q.q}\n  → ${ans}\n`;
  });

  navigator.clipboard.writeText(text).then(() => {
    showToast('文面をコピーしました。メール・チャット等に貼り付けて送信してください', 'success');
  }).catch(() => {
    showToast('クリップボードへのアクセスが拒否されました', 'error');
  });
}

function resetAll(askForConfirmation = true) {
  if (askForConfirmation && !window.confirm('入力内容をすべてリセットしてよろしいですか？')) return;
  Object.keys(state).forEach(k => {
    if (k === 'answers' || k === 'checked') state[k] = {};
    else if (k === 'maxStep') state[k] = 0;
    else state[k] = '';
  });
  document.querySelectorAll('input[type="text"], input[type="date"], input[type="email"], input[type="tel"], textarea').forEach(el => el.value = '');
  document.querySelectorAll('input[type="radio"]').forEach(el => el.checked = false);
  document.querySelectorAll('select').forEach(el => el.selectedIndex = 0);
  document.getElementById('redirect-group').classList.add('hidden');
  document.getElementById('mail-service-group').classList.add('hidden');
  document.getElementById('new-domain-form').classList.add('hidden');
  const rdPanel2 = document.getElementById('s5-redirect-panel');
  if (rdPanel2) rdPanel2.classList.add('hidden');
  const gwsPanel2 = document.getElementById('s5-gws-panel');
  if (gwsPanel2) gwsPanel2.classList.add('hidden');
  const selfMailPanel2 = document.getElementById('s5-self-mail-panel');
  if (selfMailPanel2) selfMailPanel2.classList.add('hidden');
  state.maxStep = 0;
  isRestoringDraft = true;
  goStep(0);
  isRestoringDraft = false;
  clearDraft();
}
