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
  redirect: '',   // none / self / external
  answers: {},    // 動的ヒアリング項目の回答
  checked: {},    // チェック状態

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
    why: '制作陣に事前確認。DNS設定に影響',
    cond: () => true, type: 'text' },

  // ── ドメイン新規 ──
  { id: 'q-newdom-1', cat: 'ドメイン', required: true,
    q: '希望ドメインの候補（第1〜第3希望）',
    why: '取得できない場合の予備として',
    cond: s => s.domain === 'new', type: 'textarea' },
  { id: 'q-newdom-2', cat: 'ドメイン', required: false,
    q: '.ed.jp取得の場合：認可証・在園証明書類',
    why: '.ed.jpは実在証明が必要。書類準備が必要',
    cond: s => s.domain === 'new', type: 'text' },

  // ── ドメイン移管 ──
  { id: 'q-mov-1', cat: 'ドメイン', required: true,
    q: '現在のドメイン管理会社',
    why: '移管手続きの依頼先',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-2', cat: 'ドメイン', required: true,
    q: 'AuthCode（移管認証コード）の取得状況',
    why: '移管に必須。発行から7〜30日で失効',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-3', cat: 'ドメイン', required: true,
    q: 'ドメイン有効期限',
    why: '残14〜30日を切ると移管不可',
    cond: s => s.domain === 'transfer', type: 'text' },
  { id: 'q-mov-4', cat: 'ドメイン', required: false,
    q: '移管ロック（DomainTransferLocked）の状況',
    why: 'ロック中の場合は解除依頼が必要',
    cond: s => s.domain === 'transfer', type: 'text' },

  // ── ドメイン他社継続 ──
  { id: 'q-ext-1', cat: 'ドメイン', required: true,
    q: '現在のドメイン管理会社',
    why: 'Aレコード変更を依頼する相手',
    cond: s => s.domain === 'external', type: 'text' },
  { id: 'q-ext-2', cat: 'ドメイン', required: true,
    q: '管理会社への連絡窓口（メール/電話）',
    why: 'Aレコード変更依頼の送付先',
    cond: s => s.domain === 'external', type: 'text' },
  { id: 'q-ext-3', cat: 'ドメイン', required: true,
    q: '管理会社の管理画面ログイン情報の有無',
    why: '園側で対応できる範囲を判断するため',
    cond: s => s.domain === 'external', type: 'text' },

  // ── メール新規 ──
  { id: 'q-mailnew-1', cat: 'メール', required: true,
    q: '必要なメールアドレスの数',
    why: 'GWSのライセンス数の見積もりに必要',
    cond: s => s.mail === 'new', type: 'text' },
  { id: 'q-mailnew-2', cat: 'メール', required: true,
    q: '各アドレスの命名希望',
    why: '例：info@, admin@, principal@など',
    cond: s => s.mail === 'new', type: 'textarea' },
  { id: 'q-mailnew-3', cat: 'メール', required: true,
    q: '教育機関認証書類（GWS申請時に必要）',
    why: 'GWS for Education申請時に提出',
    cond: s => s.mail === 'new', type: 'text' },

  // ── メール継続 ──
  { id: 'q-mailcon-1', cat: 'メール', required: true,
    q: '現在のメールサービス名',
    why: '例：さくらメール、GMOクラウド、Xserver等',
    cond: s => s.mail === 'continue', type: 'text' },
  { id: 'q-mailcon-2', cat: 'メール', required: true,
    q: 'MXレコードの値',
    why: 'メール宛先サーバ。DNS設定で必須',
    cond: s => s.mail === 'continue', type: 'text' },
  { id: 'q-mailcon-3', cat: 'メール', required: true,
    q: 'SPFレコードの値',
    why: '送信元認証用。なりすまし防止',
    cond: s => s.mail === 'continue', type: 'text' },
  { id: 'q-mailcon-4', cat: 'メール', required: false,
    q: 'DKIM/DMARC設定（設定がある場合のみ）',
    why: 'メール認証強化。設定済みなら継続必須',
    cond: s => s.mail === 'continue', type: 'textarea' },
  { id: 'q-mailcon-5', cat: 'メール', required: false,
    q: '既存メールサーバのIPアドレス',
    why: 'AWSにメール専用Aレコード作成時に使用',
    cond: s => s.mail === 'continue', type: 'text' },

  // ── 旧サイト関連 ──
  { id: 'q-old-1', cat: '旧サイト', required: true,
    q: '旧サイトのURL',
    why: 'リダイレクト元として使用',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-2', cat: '旧サイト', required: true,
    q: '旧サイトの公開先サービス',
    why: 'Wix/ジンドゥー/WordPress等。ジンドゥーはリダイレクト機能に制限あり',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-3', cat: '旧サイト', required: true,
    q: '旧サイトの管理会社',
    why: '解約・リダイレクト依頼の連絡先となる会社名',
    cond: s => s.oldsite === 'yes', type: 'text' },
  { id: 'q-old-4', cat: '旧サイト', required: false,
    q: '旧サイトの維持期間',
    why: 'リダイレクトを維持するため契約継続が必要',
    cond: s => s.oldsite === 'yes' && s.redirect !== 'none', type: 'text' },

  // ── リダイレクト（自社） ──
  { id: 'q-red-self-1', cat: 'リダイレクト', required: true,
    q: 'リダイレクトの種類',
    why: 'www切替 / 旧→新ドメイン / 両方',
    cond: s => s.redirect === 'self', type: 'text' },

  // ── リダイレクト（他社依頼） ──
  { id: 'q-red-ext-1', cat: 'リダイレクト', required: true,
    q: '旧管理会社の連絡窓口',
    why: 'リダイレクト依頼の送付先',
    cond: s => s.redirect === 'external', type: 'text' },
  { id: 'q-red-ext-2', cat: 'リダイレクト', required: true,
    q: '旧ドメインの契約継続可否',
    why: '契約が切れるとリダイレクトも消える',
    cond: s => s.redirect === 'external', type: 'text' },
  { id: 'q-red-ext-3', cat: 'リダイレクト', required: false,
    q: '想定費用',
    why: '管理会社によっては別途費用が発生',
    cond: s => s.redirect === 'external', type: 'text' },
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
  // High: 既存メール継続 = 設定ミスでメール停止リスク
  if (s.mail === 'continue') return {
    level: 'high',
    label: 'リスク：高（メール停止に注意）',
    msg: '既存メール継続のため、MX/SPF設定を間違えるとメール停止のリスクがあります。DNS切替日とメール停止許容時間を必ず園と合意してください。'
  };
  // Mid: 移管あり または リダイレクト他社依頼
  if (s.domain === 'transfer' || s.redirect === 'external') return {
    level: 'mid',
    label: 'リスク：中（外部依存あり）',
    msg: '移管手続き or 他社へのリダイレクト依頼が必要なため、リードタイムに余裕を持って動いてください。'
  };
  // Low: 新規取得シンプル
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
  const r = { none: '0', self: 'S', external: 'X' }[s.redirect] || '_';
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
function goStep(n) {
  // バリデーション
  if (n === 1 && !document.getElementById('garden-name').value.trim()) {
    showToast('園名を入力してください', 'error');
    return;
  }
  if (n === 2) {
    const d = document.querySelector('input[name="domain"]:checked');
    if (!d) { showToast('ドメインの扱いを選択してください', 'error'); return; }
    state.domain = d.value;
    // 新規取得の場合、フォーム値をstateに同期
    if (state.domain === 'new') syncOrgFields();
  }
  if (n === 3) {
    const m = document.querySelector('input[name="mail"]:checked');
    if (!m) { showToast('メールの扱いを選択してください', 'error'); return; }
    state.mail = m.value;
  }

  // 状態保存
  state.gardenName = document.getElementById('garden-name').value.trim();
  state.directorName = document.getElementById('director-name').value.trim();
  state.publishDate = document.getElementById('publish-date').value;
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
  // ドメイン選択時：ラベル切り替え＋新規フォーム表示制御
  const DOMAIN_LABEL = {
    new:      { label: '希望ドメイン名',   hint: '希望する候補をわかる範囲で入力してください' },
    transfer: { label: '現在のドメイン名', hint: '移管元の既存ドメインを入力してください' },
    external: { label: '現在のドメイン名', hint: '現在使用中のドメインを入力してください' },
  };
  document.querySelectorAll('input[name="domain"]').forEach(el => {
    el.addEventListener('change', () => {
      const form  = document.getElementById('new-domain-form');
      const lbl   = document.getElementById('domain-name-label');
      const hint  = document.getElementById('domain-name-hint');
      const map   = DOMAIN_LABEL[el.value] || {};
      if (lbl)  lbl.textContent  = map.label || '希望ドメイン名 / 現在のドメイン名';
      if (hint) hint.textContent = map.hint  || 'わかる範囲でOK';
      if (el.value === 'new') form.classList.remove('hidden');
      else form.classList.add('hidden');
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

  // 郵便番号 → 住所自動入力
  document.getElementById('new-postal').addEventListener('input', function() {
    const digits = this.value.replace(/[^\d]/g, '');
    if (digits.length === 7) lookupPostal(digits, 'new-address');
  });
});

// ═══════════════════════════════════════════
// 結果生成
// ═══════════════════════════════════════════
function generateResult() {
  // DOM から直接読み取って state を同期（戻り操作後のズレ防止）
  const oldsiteEl = document.querySelector('input[name="oldsite"]:checked');
  const redirectEl = document.querySelector('input[name="redirect"]:checked');
  state.oldsite  = oldsiteEl  ? oldsiteEl.value  : '';
  state.redirect = redirectEl ? redirectEl.value : '';

  // 旧サイトあり選択時はリダイレクトも必須
  if (!state.oldsite) {
    showToast('旧サイトの有無を選択してください', 'error');
    return;
  }
  if (state.oldsite === 'yes' && !state.redirect) {
    showToast('リダイレクトの要否を選択してください', 'error');
    return;
  }

  const risk = calcRisk(state);
  const pid = patternId(state);

  // ヘッダー部分
  document.getElementById('result-garden-name').textContent =
    `${state.gardenName || '〇〇園'} さま｜HP公開ヒアリングシート`;
  document.getElementById('result-pattern').textContent =
    `パターンID: ${pid}　|　担当: ${state.directorName || '—'}　|　公開希望日: ${state.publishDate || '—'}`;

  const meta = [];
  meta.push({ new: 'ドメイン新規', transfer: 'ドメイン移管', external: '他社管理継続' }[state.domain]);
  meta.push({ none: 'メールなし', new: 'メール新規', continue: 'メール継続' }[state.mail]);
  if (state.oldsite === 'yes') meta.push('旧サイトあり');
  if (state.redirect && state.redirect !== 'none') {
    meta.push(state.redirect === 'self' ? 'リダイレクト自社' : 'リダイレクト他社依頼');
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
      const input = q.type === 'textarea'
        ? `<textarea data-qid="${q.id}" placeholder="園の担当者に確認した内容を記入" onchange="saveAnswer('${q.id}', this.value)">${state.answers[q.id] || ''}</textarea>`
        : `<input type="text" data-qid="${q.id}" placeholder="園の担当者に確認した内容を記入" value="${state.answers[q.id] || ''}" onchange="saveAnswer('${q.id}', this.value)">`;
      html += `
        <div class="ask-item">
          <div class="ask-check ${state.checked[q.id] ? 'checked' : ''}" onclick="toggleCheck('${q.id}', this)"></div>
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
  // 新規取得フォームの値を最新化
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
  if (state.redirect) md += `- リダイレクト: ${ {none:'不要', self:'自社対応', external:'他社依頼'}[state.redirect] }\n`;
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
      const mark = state.checked[q.id] ? 'x' : ' ';
      const req = q.required ? '【必須】' : '【任意】';
      const ans = state.answers[q.id] || '';
      md += `- [${mark}] ${req} **${q.q}**\n`;
      md += `  - 確認理由: ${q.why}\n`;
      if (ans) md += `  - 回答: ${ans}\n`;
      md += `\n`;
    });
  });

  // 新規取得の場合、取得申請情報セクションを追加
  if (state.domain === 'new') {
    md += buildOrgSection();
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
    showToast('Markdown形式でコピーしました。Notion・Slackに貼り付けできます', 'success');
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
  const checkedCount = visible.filter(q => state.checked[q.id]).length;

  let text = `*【HP公開ヒアリングシート】*\n`;
  text += `▼園名: ${state.gardenName || '—'}\n`;
  text += `▼担当D: ${state.directorName || '—'}\n`;
  text += `▼公開希望日: ${state.publishDate || '—'}\n`;
  text += `▼パターンID: \`${pid}\`\n`;
  text += `▼リスク: ${risk.label}\n`;
  text += `▼進捗: ${checkedCount}/${visible.length} 項目確認済み\n\n`;
  text += `*要確認項目:*\n`;
  visible.filter(q => q.required && !state.checked[q.id]).forEach(q => {
    text += `• ${q.cat} / ${q.q}\n`;
  });
  text += `\n_全項目はMarkdown形式で別途共有します_`;

  navigator.clipboard.writeText(text).then(() => {
    showToast('Slack共有用の文面をコピーしました。Slackに貼り付けて送信してください', 'success');
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
  goStep(0);
}
