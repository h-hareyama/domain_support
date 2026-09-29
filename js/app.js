/* ═══════════════════════════════════════════
 * HP公開準備フォーム メインJS
 * ═══════════════════════════════════════════ */

// ═══════════════════════════════════════════
// 送信先の設定
// ═══════════════════════════════════════════
// GASをウェブアプリとしてデプロイしたときに発行されるURL。
// 「/exec」で終わるものを貼ってください（「/dev」は開発用なので不可）。
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxpjUqE54xlwZAMtT9EYdQi0VbQG4-56tq73KCmCuo2P6gRF_Dqertgf2tOnTh8XDIz3g/exec';

// GAS側のスクリプトプロパティ SHARED_TOKEN と同じ文字列。
// 静的サイトなので誰でもソースを見れば読めます。総当たりの投稿を
// 少し減らすためのもので、認証の代わりにはなりません。
const SHARED_TOKEN = 'promo-domain-2026';

// ═══════════════════════════════════════════
// 送信
// ═══════════════════════════════════════════
async function submitToGAS() {
  syncAnswersFromDOM();

  if (!state.gardenName) {
    showToast('園名を入力してください（Step 01）', 'error');
    return;
  }

  // 「必須」と表示している項目が空のまま送れてしまわないようにする
  const missing = requiredMissing();
  if (missing.length) {
    showToast(`「${missing[0].q}」を入力してください` +
              (missing.length > 1 ? `（ほか${missing.length - 1}件）` : ''), 'error');
    focusQuestion(missing[0].id);
    return;
  }
  if (!GAS_ENDPOINT) {
    showToast('送信先が未設定です。担当者にお問い合わせください', 'error');
    console.error('GAS_ENDPOINT が空です。js/app.js の先頭に、GASのウェブアプリURL（/exec で終わるもの）を設定してください。');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = '送信中...';

  const risk = calcRisk(state);
  const domainLabel = getDomainPolicyLabel(state);

  const payload = {
    token:         SHARED_TOKEN,
    gardenName:    state.gardenName,
    contactName:  state.contactName,
    domainName:    state.domainName,
    patternId:     patternId(state),
    riskLevel:     risk.level,
    riskLabel:     risk.label,
    oldsite:       state.oldsite,
    oldsiteLabel:  getOldsiteLabel(state),
    urlPolicy:     state.urlPolicy,
    urlPolicyLabel: getUrlPolicyLabel(state),
    domainPolicy:  estimatedDomainPolicy(state),
    domainLabel:   domainLabel,
    domainApplicationInfo: estimatedDomainPolicy(state) === 'new' ? {
      orgType:      state.newOrgType,
      orgLicensed:  state.newOrgLicensed,
      orgName:      state.newOrgName,
      orgKana:      state.newOrgKana,
      orgNameEn:    state.newOrgNameEn,
      postal:       state.newPostal,
      address:      state.newAddress,
      building:     state.newBuilding,
      contactName:  state.newContactName,
      contactRoman: state.newContactRoman,
      contactDept:  state.newContactDept,
      contactTitle: state.newContactTitle,
      contactPhone: state.newContactPhone,
      contactEmail: state.newContactEmail,
      regDate:      state.newRegDate,
      regAddress:   state.newRegAddress,
      repName:      state.newRepName,
      repRoman:     state.newRepRoman,
      repTitle:     state.newRepTitle,
    } : null,
    mail:          state.mail,
    mailLabel:     getMailLabel(state),
    mailKeep:      state.mail === 'using'     ? state.mailKeep : '',
    mailWant:      state.mail === 'not_using' ? state.mailWant : '',
    oldsite:       state.oldsite,
    redirect:      state.redirect,
    answers:       state.answers,
  };

  try {
    // Content-Type を付けないことで、ブラウザが事前確認（プリフライト）を
    // 飛ばさなくなる。GASはプリフライトに応答できないため、これが必要。
    const res  = await fetch(GAS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
      redirect: 'follow',
    });
    const data = await res.json();

    if (!data.ok) throw new Error(data.error || '受付側でエラーが発生しました');

    showToast('送信しました（受付番号 ' + data.receiptNo + '）', 'success');
    btn.textContent = '送信済み ✓';
    btn.style.background = 'var(--ok)';
    clearDraft();
    console.log('受付番号:', data.receiptNo);
  } catch (err) {
    console.error('送信に失敗しました:', err);
    showToast('送信に失敗しました。時間をおいて再度お試しください', 'error');
    btn.disabled = false;
    btn.textContent = 'この内容で送信する';
  }
}

// ═══════════════════════════════════════════
// 状態管理
// ═══════════════════════════════════════════
const state = {
  gardenName: '',
  contactName: '',
  domainName: '',
  oldsite: '',    // yes / no / unknown
  urlPolicy: '',  // same / new / undecided（oldsite === 'yes' のときだけ聞く）
  mail: '',       // using / not_using / unknown
  mailKeep: '',   // keep / change / unknown（mail === 'using' のときだけ）
  mailWant: '',   // yes / no / considering（mail === 'not_using' のときだけ）
  redirect: '',   // none / needed
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
// 園の回答から必要な手続きを推定する
// ═══════════════════════════════════════════
// 園には「移管」「新規取得」といった手続きの種類を選ばせない。
// いまの状況と希望だけ答えてもらい、実際にどう進めるかはここで推定して
// 最終判断はプロモ側が行う。
function estimatedDomainPolicy(s) {
  if (s.oldsite === 'no')      return 'new';        // HPがない → 新しく取るしかない
  if (s.urlPolicy === 'new')   return 'new';        // 変えたい → 新規取得
  if (s.urlPolicy === 'same')  return 'continue';   // 同じがいい → 移管か他社管理継続
  return 'undecided';
}

const DOMAIN_POLICY_LABEL = {
  'new':     '新規取得',
  continue:  '現ドメインを継続',
  undecided: '未定（要相談）',
};

function getDomainPolicyLabel(s) {
  return DOMAIN_POLICY_LABEL[estimatedDomainPolicy(s)];
}

function getUrlPolicyLabel(s) {
  if (s.oldsite === 'no') return '（現在のHPなし）';
  return {
    same:      '今と同じURLを使いたい',
    'new':     '新しいURLにしたい',
    undecided: 'おまかせ・未定',
  }[s.urlPolicy] || 'おまかせ・未定';   // 未選択・HP有無が不明のときもここ
}

function getOldsiteLabel(s) {
  return { yes: 'あり', no: 'なし', unknown: 'わからない' }[s.oldsite] || '—';
}

function getMailLabel(s) {
  if (s.mail === 'using') {
    const keep = {
      keep:    'ドメインメール利用中（公開後もそのまま）',
      change:  'ドメインメール利用中（公開後に変更希望）',
      unknown: 'ドメインメール利用中（公開後は要相談）',
    }[s.mailKeep];
    return keep || 'ドメインメール利用中';
  }
  if (s.mail === 'unknown') return 'わからない（要確認）';
  if (s.mail === 'not_using') {
    return {
      yes:         '未利用（今後利用したい）',
      no:          '未利用（今後も利用しない）',
      considering: '未利用（検討中）',
    }[s.mailWant] || '未利用';
  }
  return '—';
}

const DRAFT_KEY = 'domain-support-form-draft';
const DRAFT_VERSION = 1;
const DRAFT_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
let draftSaveTimer = null;
let currentStep = 0;
// 結果シート（確認・送信）のステップ番号。入力ステップは 0〜2。
const RESULT_STEP = 3;
let isRestoringDraft = false;

function getSelectedValue(name) {
  const selected = document.querySelector(`input[name="${name}"]:checked`);
  return selected ? selected.value : '';
}

function syncCoreStateFromDOM() {
  const gardenName = document.getElementById('garden-name');
  const contactName = document.getElementById('contact-name');

  if (gardenName) state.gardenName = gardenName.value.trim();
  if (contactName) state.contactName = contactName.value.trim();

  state.oldsite = getSelectedValue('oldsite') || state.oldsite;
  state.urlPolicy = state.oldsite === 'yes'
    ? (getSelectedValue('urlpolicy') || state.urlPolicy)
    : (state.oldsite === 'no' ? 'new' : '');
  state.redirect = state.oldsite === 'yes'
    ? (getSelectedValue('redirect') || state.redirect)
    : '';
  state.mail = getSelectedValue('mail') || state.mail;
  state.mailKeep = state.mail === 'using'
    ? (getSelectedValue('mail-keep') || state.mailKeep)
    : '';
  state.mailWant = state.mail === 'not_using'
    ? (getSelectedValue('mail-want') || state.mailWant)
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
        oldsite: getSelectedValue('oldsite'),
        urlPolicy: getSelectedValue('urlpolicy'),
        redirect: getSelectedValue('redirect'),
        mail: getSelectedValue('mail'),
        mailKeep: getSelectedValue('mail-keep'),
        mailWant: getSelectedValue('mail-want'),
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
  const oldsite = getSelectedValue('oldsite') || state.oldsite;
  toggleGroup('urlpolicy-group', oldsite === 'yes');
  toggleGroup('redirect-group',  oldsite === 'yes');

  const mail = getSelectedValue('mail') || state.mail;
  toggleGroup('mail-keep-group', mail === 'using');
  toggleGroup('mail-want-group', mail === 'not_using');
}

function toggleGroup(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('hidden', !show);
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
    oldsite: 'oldsite',
    urlPolicy: 'urlpolicy',
    redirect: 'redirect',
    mail: 'mail',
    mailKeep: 'mail-keep',
    mailWant: 'mail-want',
  };
  Object.entries(radioNames).forEach(([key, name]) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
      el.checked = el.value === (draft.radios || {})[key];
    });
  });

  updateConditionalFields();
  const step = Math.max(0, Math.min(RESULT_STEP, Number(draft.currentStep) || 0));
  if (step === RESULT_STEP) generateResult(true);
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
  // ── 全員に聞く ──
  { id: 'q-www', cat: '基本', required: false,
    q: 'URLに「www」を付けますか？（ご希望があれば）',
    why: 'ご希望がなければ空欄で構いません。スマートエデュケーションで判断します',
    placeholder: '例：付けたい（www.example.ed.jp）/ 付けたくない',
    cond: () => true, type: 'text' },
  { id: 'q-related', cat: '基本', required: false,
    q: '関連するホームページ（任意）',
    why: '法人サイトや系列園など、同じ会社で管理しているサイトがあると、設定の影響範囲が変わることがあります',
    placeholder: '例：法人サイト https://... / 系列園 https://... / 採用サイト https://...',
    cond: () => true, type: 'textarea' },

  // ── 現在のホームページがある場合 ──
  { id: 'q-old-3', cat: 'ホームページ', required: true,
    q: '現在のホームページを制作・管理している会社名',
    why: 'URLの引き継ぎやご案内設定について、こちらから直接ご相談します',
    placeholder: '例：〇〇株式会社',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-3-phone', cat: 'ホームページ', required: false,
    q: '制作・管理会社の電話番号',
    why: 'こちらからご連絡する際に使います。わからなければ空欄で構いません',
    placeholder: '例：03-XXXX-XXXX',
    cond: s => s.oldsite === 'yes', type: 'tel' },
  { id: 'q-old-3-email', cat: 'ホームページ', required: false,
    q: '制作・管理会社のメールアドレス',
    why: 'こちらからご連絡する際に使います。わからなければ空欄で構いません',
    placeholder: '例：support@example.com',
    cond: s => s.oldsite === 'yes', type: 'email' },
  { id: 'q-old-2', cat: 'ホームページ', required: false,
    q: '現在のホームページの公開先サービス（わかれば）',
    why: 'ご案内設定の方法がサービスによって異なります',
    placeholder: '例：Wix / ジンドゥー / WordPress',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-contract-period', cat: 'ホームページ', required: false,
    q: 'ホームページ（URL）のご契約期間はご存じですか？',
    why: '更新の時期によっては、先に更新をお願いする場合があります。更新のご案内メールや請求書に記載されていることが多いです。わからなければ空欄で構いません',
    placeholder: '例：2027年3月まで / 毎年4月に更新 / わからない',
    cond: s => s.oldsite === 'yes', type: 'text' },

  // ── 新しいURLにする場合 ──
  { id: 'q-newdom-1', cat: 'ホームページ', required: false,
    q: '第2・第3希望のURL（任意）',
    why: '第1希望が取得できない場合の候補として使います。おまかせでも構いません',
    placeholder: '例：jiro.ed.jp, jiro-kindergarten.jp',
    cond: s => estimatedDomainPolicy(s) === 'new', type: 'textarea' },

  // ── ドメインメールを利用中の場合 ──
  { id: 'q-mailcon-2', cat: 'メール', required: true,
    q: 'メールを契約している会社名',
    why: 'メールを止めずに引き継ぐため、設定内容の確認をお願いする連絡先として使います',
    placeholder: '例：さくらインターネット / エックスサーバー株式会社',
    cond: s => s.mail === 'using', type: 'text' },
  { id: 'q-mailcon-1', cat: 'メール', required: false,
    q: '現在お使いのメールサービス名（わかれば）',
    why: '現在のメール環境を把握するために使います',
    placeholder: '例：さくらメール / Xserver / Google Workspace',
    cond: s => s.mail === 'using', type: 'text' },
  { id: 'q-mailcon-3', cat: 'メール', required: false,
    q: '現在お使いのメールアドレス（わかる範囲で）',
    why: '引き継ぎ対象を把握するために使います',
    placeholder: '例：info@example.ed.jp、jimu@example.ed.jp',
    cond: s => s.mail === 'using', type: 'textarea' },
  { id: 'q-mailcon-5x', cat: 'メール', required: false,
    q: 'その他・補足（任意）',
    why: '気になることや確認したいことがあれば入力してください',
    placeholder: '例：メールアドレスは3つです / 切替時期の希望など',
    cond: s => s.mail === 'using' || s.mail === 'not_using', type: 'textarea' },
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
  const est = estimatedDomainPolicy(s);

  // 高：今と同じURLを使う ＋ ドメインメール利用中（または不明）
  //   URLを引き継ぐとDNSを組み直すことになり、MX/SPFを間違えるとメールが止まる
  if (s.urlPolicy === 'same' && (s.mail === 'using' || s.mail === 'unknown')) return {
    level: 'high',
    label: 'リスク：高（メール停止に注意）',
    msg: 'URLを引き継ぐためDNSを組み直します。MX/SPFの設定を間違えるとメールが止まります。切替日とメール停止の許容時間を必ず園と合意してください。メールの利用状況が「わからない」の場合は、まず現況の確認から始めてください。'
  };

  // 中：外部への確認・依頼が発生するケース
  if (s.urlPolicy === 'same' ||
      s.redirect === 'needed' ||
      (est === 'new' && s.mail === 'using') ||
      s.mail === 'unknown' ||
      s.oldsite === 'unknown') return {
    level: 'mid',
    label: 'リスク：中（外部調整が必要）',
    msg: '現在の管理会社への確認・依頼や、新しいURL上でのメール設定など、外部への調整が必要です。リードタイムに余裕を持って動いてください。'
  };

  // 低：新規取得でメールも絡まない、など
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
  const u = { same: 'S', 'new': 'N', undecided: 'U' }[s.urlPolicy] || '_';
  const m = { using: 'U', not_using: 'N', unknown: '?' }[s.mail]   || '_';
  const o = { yes: 'O', no: '_', unknown: '?' }[s.oldsite]         || '_';
  const r = { needed: 'R', none: '0' }[s.redirect]                 || '_';
  return `U${u}-M${m}-${o}${r}`;
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
      const o = document.querySelector('input[name="oldsite"]:checked');
      if (!o) { showToast('現在公開中のホームページの有無を選択してください', 'error'); return; }
      state.oldsite = o.value;
      if (state.oldsite === 'yes') {
        const up = document.querySelector('input[name="urlpolicy"]:checked');
        if (!up) { showToast('新しいホームページのURLについて選択してください', 'error'); return; }
        state.urlPolicy = up.value;
        const rd = document.querySelector('input[name="redirect"]:checked');
        if (!rd) { showToast('新しいホームページへのご案内の要否を選択してください', 'error'); return; }
        state.redirect = rd.value;
      } else {
        // HPがなければ新しく取るしかない。ご案内設定も対象外
        state.urlPolicy = state.oldsite === 'no' ? 'new' : '';
        state.redirect = '';
      }
    }
    if (n === 3) {
      const m = document.querySelector('input[name="mail"]:checked');
      if (!m) { showToast('メールの利用状況を選択してください', 'error'); return; }
      state.mail = m.value;
      if (state.mail === 'using') {
        const keep = document.querySelector('input[name="mail-keep"]:checked');
        if (!keep) {
          showToast('公開後も今のメールアドレスを使うかを選択してください', 'error');
          return;
        }
        state.mailKeep = keep.value;
      }
      if (state.mail === 'not_using') {
        const want = document.querySelector('input[name="mail-want"]:checked');
        if (!want) {
          showToast('今後ドメインメールを利用したいかを選択してください', 'error');
          return;
        }
        state.mailWant = want.value;
      }
    }
  }

  // 状態保存
  state.gardenName = document.getElementById('garden-name').value.trim();
  state.contactName = document.getElementById('contact-name').value.trim();
  // 到達済み最大ステップを更新
  if (n > state.maxStep) state.maxStep = n;
  state.domainName = document.getElementById('domain-name').value.trim();

  // パネル切替
  for (let i = 0; i <= RESULT_STEP; i++) {
    const panel = document.getElementById(`step-${i}`);
    if (panel) panel.classList.add('hidden');
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
  // 条件が外れたサブ質問は、ラジオの選択自体も外す。
  // DOMに古い選択が残ると、後から読み直したときに復活してしまう。
  function clearRadios(name) {
    document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false);
  }

  document.querySelectorAll('input[name="oldsite"]').forEach(el => {
    el.addEventListener('change', () => {
      state.oldsite = el.value;
      if (el.value !== 'yes') {
        // HPがなければURLの希望もご案内設定も聞かない
        state.urlPolicy = el.value === 'no' ? 'new' : '';
        state.redirect  = '';
        clearRadios('urlpolicy');
        clearRadios('redirect');
      }
      updateConditionalFields();
    });
  });

  document.querySelectorAll('input[name="urlpolicy"]').forEach(el => {
    el.addEventListener('change', () => { state.urlPolicy = el.value; });
  });

  document.querySelectorAll('input[name="redirect"]').forEach(el => {
    el.addEventListener('change', () => { state.redirect = el.value; });
  });

  document.querySelectorAll('input[name="mail"]').forEach(el => {
    el.addEventListener('change', () => {
      state.mail = el.value;
      if (el.value !== 'using')     { state.mailKeep = ''; clearRadios('mail-keep'); }
      if (el.value !== 'not_using') { state.mailWant = ''; clearRadios('mail-want'); }
      updateConditionalFields();
    });
  });

  document.querySelectorAll('input[name="mail-keep"]').forEach(el => {
    el.addEventListener('change', () => { state.mailKeep = el.value; });
  });

  document.querySelectorAll('input[name="mail-want"]').forEach(el => {
    el.addEventListener('change', () => { state.mailWant = el.value; });
  });

  // ステッパークリックでナビゲーション（訪問済みのみ）
  document.querySelectorAll('.stepper .step').forEach((el, i) => {
    el.style.cursor = 'default';
    el.addEventListener('click', () => {
      if (i > state.maxStep) {
        showToast('まず順番にステップを進めてください', 'info');
        return;
      }
      if (i === RESULT_STEP) {
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
  state.contactName = document.getElementById('contact-name').value.trim();
  const oldsiteEl   = document.querySelector('input[name="oldsite"]:checked');
  const urlPolicyEl = document.querySelector('input[name="urlpolicy"]:checked');
  const redirectEl  = document.querySelector('input[name="redirect"]:checked');
  const mailEl      = document.querySelector('input[name="mail"]:checked');
  const mailKeepEl  = document.querySelector('input[name="mail-keep"]:checked');
  const mailWantEl  = document.querySelector('input[name="mail-want"]:checked');

  state.oldsite = oldsiteEl ? oldsiteEl.value : state.oldsite;
  if (state.oldsite === 'yes') {
    state.urlPolicy = urlPolicyEl ? urlPolicyEl.value : state.urlPolicy;
    state.redirect  = redirectEl  ? redirectEl.value  : state.redirect;
  } else {
    state.urlPolicy = state.oldsite === 'no' ? 'new' : '';
    state.redirect  = '';
  }
  if (mailEl) state.mail = mailEl.value;
  state.mailKeep = state.mail === 'using'     && mailKeepEl ? mailKeepEl.value : '';
  state.mailWant = state.mail === 'not_using' && mailWantEl ? mailWantEl.value : '';

  if (!silent) {
    if (!state.oldsite) {
      showToast('現在公開中のホームページの有無を選択してください', 'error');
      return;
    }
    if (state.oldsite === 'yes' && !state.urlPolicy) {
      showToast('新しいホームページのURLについて選択してください', 'error');
      return;
    }
    if (state.oldsite === 'yes' && !state.redirect) {
      showToast('新しいホームページへのご案内の要否を選択してください', 'error');
      return;
    }
    if (!state.mail) {
      showToast('メールの利用状況を選択してください', 'error');
      return;
    }
  }

  // 最大到達ステップ更新
  state.maxStep = RESULT_STEP;

  // ドメイン名ラベル＆申請フォームの表示を選択に合わせて更新
  const DLABEL = {
    'new':     { label: 'ご希望のURL（第1希望）', hint: 'お決まりであれば入力してください。おまかせの場合は空欄で構いません' },
    continue:  { label: '現在のホームページのURL', hint: '今お使いのURLを入力してください' },
    undecided: { label: 'URL（お決まりであれば）', hint: 'お決まりでなければ空欄で構いません' },
  };
  const dlmap = DLABEL[estimatedDomainPolicy(state)] || {};
  const dlbl  = document.getElementById('domain-name-label');
  const dhint = document.getElementById('domain-name-hint');
  if (dlbl)  dlbl.textContent  = dlmap.label || '希望ドメイン名 / 現在のドメイン名';
  if (dhint) dhint.textContent = dlmap.hint  || 'わかる範囲でOK';
  const ndf = document.getElementById('new-domain-form');
  if (ndf) {
    if (estimatedDomainPolicy(state) === 'new') ndf.classList.remove('hidden');
    else ndf.classList.add('hidden');
  }

  // ヘッダー部分
  //
  // この画面は園の先生が見る。リスク判定・パターンID・こちらの想定対応は
  // 社内の判断材料なので出さない。園を不安にさせるだけで、園が取れる行動もない。
  // これらは送信時にスプレッドシートとNotionへ渡している。
  document.getElementById('result-garden-name').textContent =
    `${state.gardenName || '〇〇園'} さま｜ご入力内容の確認`;
  document.getElementById('result-pattern').textContent =
    state.contactName ? `ご担当者: ${state.contactName}` : '';

  // 園自身が答えた内容だけを要約として出す
  const meta = [];
  meta.push(`現在公開中のHP: ${getOldsiteLabel(state)}`);
  if (state.urlPolicy) meta.push(`URLのご希望: ${getUrlPolicyLabel(state)}`);
  meta.push(`メール: ${getMailLabel(state)}`);
  if (state.redirect === 'needed') meta.push('新HPへのご案内あり');
  document.getElementById('result-meta').innerHTML = meta.map(m => `<span>● ${m}</span>`).join('');

  // ヒアリング項目
  const visible = QUESTIONS.filter(q => q.cond(state));
  const byCat = {};
  visible.forEach(q => {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });

  let html = '';
  const order = ['基本', 'ホームページ', 'メール'];
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
  goStep(RESULT_STEP);
}

function saveAnswer(qid, val) { state.answers[qid] = val; }

/** いま表示されている必須項目のうち、未入力のものを返す。 */
function requiredMissing() {
  return QUESTIONS.filter(q =>
    q.required && q.cond(state) && !(state.answers[q.id] || '').trim()
  );
}

/** 未入力の項目までスクロールして、目印を付ける。 */
function focusQuestion(qid) {
  const el = document.querySelector(`[data-qid="${qid}"]`);
  if (!el) return;
  const item = el.closest('.ask-item') || el;
  item.classList.add('is-missing');
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.focus({ preventScroll: true });
  el.addEventListener('input', () => item.classList.remove('is-missing'), { once: true });
}

// DOM上の全入力値を state.answers に同期（送信前に必ず呼ぶ）
function syncAnswersFromDOM() {
  document.querySelectorAll('[data-qid]').forEach(el => {
    state.answers[el.dataset.qid] = el.value.trim();
  });
  const dnEl = document.getElementById('domain-name');
  if (dnEl) state.domainName = dnEl.value.trim();
  if (estimatedDomainPolicy(state) === 'new') syncOrgFields();
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
  if (estimatedDomainPolicy(state) === 'new') syncOrgFields();

  const risk = calcRisk(state);
  const pid = patternId(state);
  const visible = QUESTIONS.filter(q => q.cond(state));
  let md = `# ${state.gardenName || '〇〇園'} さま｜HP公開ヒアリングシート\n\n`;
  md += `- **パターンID:** ${pid}\n`;
  md += `- **園のご担当者:** ${state.contactName || '—'}\n`;
  md += `- **ドメイン名:** ${state.domainName || '—'}\n`;
  md += `- **リスク評価:** ${risk.label}\n\n`;
  md += `> ${risk.msg}\n\n`;

  md += `## 判定条件\n`;
  md += `- URLの希望: ${getUrlPolicyLabel(state)}\n`;
  md += `- 想定される対応: ${getDomainPolicyLabel(state)}\n`;
  md += `- メール: ${getMailLabel(state)}\n`;
  md += `- 現在公開中のHP: ${getOldsiteLabel(state)}\n`;
  if (state.redirect) md += `- 新しいHPへのご案内: ${ {none:'不要', needed:'原則どおり実施'}[state.redirect] }\n`;
  md += `\n`;

  const byCat = {};
  visible.forEach(q => {
    if (!byCat[q.cat]) byCat[q.cat] = [];
    byCat[q.cat].push(q);
  });
  const order = ['基本', 'ホームページ', 'メール'];
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
  if (estimatedDomainPolicy(state) === 'new') {
    md += buildOrgSection();
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
  const domainLabel = getDomainPolicyLabel(state);
  const mailLabel   = getMailLabel(state);

  let body = `${state.gardenName || '〇〇園'} さまのHP公開ヒアリングシートです。\n\n`;
  body += `■ パターンID: ${pid}\n`;
  body += `■ リスク評価: ${risk.label}\n`;
  body += `■ ご担当者: ${state.contactName || '—'}\n`;
  body += `■ ドメイン: ${domainLabel}\n`;
  body += `■ メール: ${mailLabel}\n`;
  body += `■ 現在公開中のHP: ${getOldsiteLabel(state)}\n`;
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
  const domainLabel = getDomainPolicyLabel(state);
  const mailLabel   = getMailLabel(state);
  const visible = QUESTIONS.filter(q => q.cond(state));

  let text = `【HP公開ヒアリングシート】\n`;
  text += `▼園名: ${state.gardenName || '—'}\n`;
  text += `▼ご担当者: ${state.contactName || '—'}\n`;
  text += `▼パターンID: ${pid}\n`;
  text += `▼リスク: ${risk.label}\n`;
  text += `▼想定対応: ${domainLabel} / メール: ${mailLabel} / 現在公開中のHP: ${getOldsiteLabel(state)}\n`;
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
  ['urlpolicy-group', 'redirect-group', 'mail-keep-group', 'mail-want-group']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  document.getElementById('new-domain-form').classList.add('hidden');
  state.maxStep = 0;
  isRestoringDraft = true;
  goStep(0);
  isRestoringDraft = false;
  clearDraft();
}
