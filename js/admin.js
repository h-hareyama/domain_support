// -- Firebase 初期化 --
var firebaseConfig = {
  apiKey: "AIzaSyCtHBzancsl1AfyTE0w7deORYMTGFfLE_w",
  authDomain: "domain-support-54f55.firebaseapp.com",
  projectId: "domain-support-54f55",
  storageBucket: "domain-support-54f55.firebasestorage.app",
  messagingSenderId: "1017898228058",
  appId: "1:1017898228058:web:b8847317ef1ae19cc07b63",
  measurementId: "G-X9L9MPZJN0"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
var auth = firebase.auth();
var db   = firebase.firestore();

var allSubmissions = [];
var STATUS_ORDER = { pending: 0, in_progress: 1, done: 2 };
var RISK_ORDER = { high: 0, mid: 1, low: 2 };

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsString(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/'/g, "\\'");
}

function toMillis(value) {
  if (!value) return 0;
  if (value.toMillis) return value.toMillis();
  if (value.toDate) return value.toDate().getTime();
  var parsed = new Date(value).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function publishDateMillis(s) {
  if (!s.publishDate) return Number.MAX_SAFE_INTEGER;
  var parsed = new Date(s.publishDate + 'T00:00:00').getTime();
  return isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'ja');
}

function normalizeStatus(value) {
  return STATUS_ORDER.hasOwnProperty(value) ? value : 'pending';
}

function normalizeRisk(value) {
  return RISK_ORDER.hasOwnProperty(value) ? value : 'low';
}

function getRedirectToolLabel(value) {
  return {
    jimdoo: 'ジンドゥー',
    wix: 'Wix',
    wordpress: 'WordPress',
    studio: 'STUDIO',
    amebaownd: 'Ameba Ownd',
    google: 'Googleサイト',
    other: 'その他・不明'
  }[value] || value || '';
}

// -- リダイレクト結果を処理 --
auth.getRedirectResult().then(function(result) {
  if (result && result.user) {
    console.log('redirect login ok:', result.user.email);
  }
}).catch(function(err) {
  console.error('redirect error:', err.code, err.message);
  showToast('ログインに失敗しました: ' + err.message, 'error');
});

// -- 認証状態監視 --
auth.onAuthStateChanged(function(user) {
  if (user) {
    if (!user.email.endsWith('@smarteducation.jp')) {
      auth.signOut();
      showToast('@smarteducation.jp のアカウントでログインしてください', 'error');
      return;
    }
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-screen').style.display = 'block';
    document.getElementById('user-name').textContent = user.email;
    loadSubmissions();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('admin-screen').style.display = 'none';
  }
});

// -- サインイン/アウト --
function signIn() {
  var provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(function(err) {
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      auth.signInWithRedirect(provider);
    } else if (err.code !== 'auth/cancelled-popup-request') {
      console.error('login error:', err.code, err.message);
      showToast('ログインに失敗しました: ' + err.code, 'error');
    }
  });
}
function signOut() {
  auth.signOut();
}

document.getElementById('login-btn').addEventListener('click', signIn);

// -- データ取得 --
function loadSubmissions() {
  document.getElementById('list-container').innerHTML = '<div class="loading">読み込み中...</div>';
  db.collection('submissions')
    .orderBy('submittedAt', 'desc')
    .get()
    .then(function(snap) {
      allSubmissions = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
      applyFilter();
    })
    .catch(function() {
      document.getElementById('list-container').innerHTML =
        '<div class="empty-state"><p>データの取得に失敗しました</p></div>';
    });
}

// -- フィルター --
function applyFilter() {
  var status = document.getElementById('filter-status').value;
  var risk   = document.getElementById('filter-risk').value;
  var search = document.getElementById('filter-search').value.toLowerCase();
  var filtered = allSubmissions.filter(function(s) {
    if (status && s.status !== status) return false;
    if (risk   && s.riskLevel !== risk) return false;
    if (search && !(s.gardenName || '').toLowerCase().includes(search)) return false;
    return true;
  });
  filtered = sortSubmissions(filtered);
  renderList(filtered);
}

function sortSubmissions(submissions) {
  var sort = document.getElementById('filter-sort').value;
  return submissions.slice().sort(function(a, b) {
    if (sort === 'submitted_asc') return toMillis(a.submittedAt) - toMillis(b.submittedAt);
    if (sort === 'publish_asc') return publishDateMillis(a) - publishDateMillis(b);
    if (sort === 'publish_desc') return publishDateMillis(b) - publishDateMillis(a);
    if (sort === 'garden_asc') return compareText(a.gardenName, b.gardenName);
    if (sort === 'status') {
      var statusDiff = (STATUS_ORDER[a.status || 'pending'] || 0) - (STATUS_ORDER[b.status || 'pending'] || 0);
      return statusDiff || (toMillis(b.submittedAt) - toMillis(a.submittedAt));
    }
    if (sort === 'risk') {
      var riskDiff = (RISK_ORDER[a.riskLevel || 'low'] || 0) - (RISK_ORDER[b.riskLevel || 'low'] || 0);
      return riskDiff || (toMillis(b.submittedAt) - toMillis(a.submittedAt));
    }
    return toMillis(b.submittedAt) - toMillis(a.submittedAt);
  });
}

// -- レンダリング --
function renderList(submissions) {
  document.getElementById('count-badge').textContent = submissions.length + '件';
  var container = document.getElementById('list-container');
  if (submissions.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>該当する提出データがありません</p></div>';
    return;
  }
  container.innerHTML = '<div class="submission-list">' +
    submissions.map(renderCard).join('') +
    '</div>';
}

function renderCard(s) {
  var date = s.submittedAt ? s.submittedAt.toDate().toLocaleDateString('ja-JP') : '-';
  var riskClass   = 'risk-' + normalizeRisk(s.riskLevel);
  var statusClass = normalizeStatus(s.status);
  var safeId = escapeJsString(s.id);
  var answers = s.answers || {};
  var answerHtml = Object.entries(answers).map(function(entry) {
    var qid = entry[0], ans = entry[1];
    if (!ans) return '';
    var label = QID_LABELS[qid] || qid;
    return '<div class="answer-item"><span class="q">' + escapeHtml(label) + '</span><span class="a">' + escapeHtml(ans) + '</span></div>';
  }).filter(Boolean).join('');

  var redirectInfo = s.redirectInfo && typeof s.redirectInfo === 'object' ? s.redirectInfo : {};
  var redirectToolLabel = getRedirectToolLabel(redirectInfo.tool);
  var redirectInfoHtml = [
    ['WEB制作会社', redirectInfo.webCompany],
    ['WEB制作会社 電話番号', redirectInfo.webCompanyPhone],
    ['WEB制作会社 メール', redirectInfo.webCompanyEmail],
    ['ドメイン管理会社', redirectInfo.domainCompany],
    ['ドメイン管理会社 電話番号', redirectInfo.domainCompanyPhone],
    ['ドメイン管理会社 メール', redirectInfo.domainCompanyEmail],
    ['旧HPツール', redirectToolLabel]
  ].filter(function(item) { return item[1]; }).map(function(item) {
    return '<div class="answer-item"><span class="q">' + escapeHtml(item[0]) + '</span><span class="a">' + escapeHtml(item[1]) + '</span></div>';
  }).join('');

  var sel = function() {
    return [
      '<option value="pending"'     + (statusClass==='pending'     ? ' selected' : '') + '>未対応</option>',
      '<option value="in_progress"' + (statusClass==='in_progress' ? ' selected' : '') + '>対応中</option>',
      '<option value="done"'        + (statusClass==='done'        ? ' selected' : '') + '>完了</option>'
    ].join('');
  };

  var memoVal = escapeHtml(s.memo || '');

  return '<div class="card status-' + statusClass + '" id="card-' + escapeHtml(s.id) + '">' +
    '<div class="card-header" onclick="toggleDetail(\'' + safeId + '\')">' +
      '<div class="garden-name">' + escapeHtml(s.gardenName || '(未入力)') + '</div>' +
      '<div class="card-meta">' +
        '<span class="meta-tag">提出: ' + escapeHtml(date) + '</span>' +
        '<span class="meta-tag">' + escapeHtml(s.domainLabel || s.domain || '-') + '</span>' +
        '<span class="meta-tag">メール: ' + escapeHtml(s.mailLabel || s.mail || '-') + '</span>' +
        '<span class="meta-tag">担当: ' + escapeHtml(s.directorName || '-') + '</span>' +
        '<span class="meta-tag">公開希望: ' + escapeHtml(s.publishDate || '-') + '</span>' +
        '<span class="risk-tag ' + riskClass + '">' + escapeHtml(s.riskLabel || '-') + '</span>' +
      '</div>' +
      '<select class="status-select ' + statusClass + '" onclick="event.stopPropagation()" onchange="updateStatus(\'' + safeId + '\', this)">' +
        sel() +
      '</select>' +
      '<span class="toggle-icon" id="icon-' + escapeHtml(s.id) + '">v</span>' +
    '</div>' +
    '<div class="card-detail" id="detail-' + escapeHtml(s.id) + '">' +
      '<div class="detail-grid">' +
        '<div class="detail-row"><div class="label">パターンID</div><div class="value">' + escapeHtml(s.patternId || '-') + '</div></div>' +
        '<div class="detail-row"><div class="label">ドメイン名</div><div class="value">' + escapeHtml(s.domainName || '-') + '</div></div>' +
        '<div class="detail-row"><div class="label">旧サイト</div><div class="value">' + (s.oldsite === 'yes' ? 'あり' : 'なし') + '</div></div>' +
        '<div class="detail-row"><div class="label">リダイレクト</div><div class="value">' + (s.redirect === 'needed' ? '必要' : '不要') + '</div></div>' +
      '</div>' +
      (answerHtml ? '<div class="answers-section"><h4>ヒアリング内容</h4>' + answerHtml + '</div>' : '') +
      (redirectInfoHtml ? '<div class="answers-section"><h4>リダイレクト連絡先</h4>' + redirectInfoHtml + '</div>' : '') +
      '<div class="memo-section">' +
        '<div class="memo-label">社内メモ</div>' +
        '<textarea class="memo-textarea" id="memo-' + escapeHtml(s.id) + '" onclick="event.stopPropagation()" onblur="saveMemo(\'' + safeId + '\', this.value)">' + memoVal + '</textarea>' +
      '</div>' +
      '<div class="card-actions">' +
        '<button class="btn btn-danger" onclick="event.stopPropagation(); deleteSubmission(\'' + safeId + '\', this)">削除</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function toggleDetail(id) {
  var detail = document.getElementById('detail-' + id);
  var icon   = document.getElementById('icon-' + id);
  var isOpen = detail.classList.toggle('open');
  icon.textContent = isOpen ? '^' : 'v';
}

// -- メモ保存 --
function saveMemo(id, value) {
  var s = allSubmissions.find(function(s) { return s.id === id; });
  if (s && s.memo === value) return;
  db.collection('submissions').doc(id).update({
    memo: value,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    if (s) s.memo = value;
    showToast('メモを保存しました', 'success');
  }).catch(function() {
    showToast('メモの保存に失敗しました', 'error');
  });
}

// -- ステータス更新 --
function updateStatus(id, selectEl) {
  var newStatus = selectEl.value;
  var card = document.getElementById('card-' + id);
  db.collection('submissions').doc(id).update({
    status: newStatus,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }).then(function() {
    card.className = 'card status-' + newStatus;
    selectEl.className = 'status-select ' + newStatus;
    var s = allSubmissions.find(function(s) { return s.id === id; });
    if (s) s.status = newStatus;
    showToast('ステータスを更新しました', 'success');
  }).catch(function() {
    showToast('更新に失敗しました', 'error');
  });
}

// -- 提出データ削除 --
function deleteSubmission(id, buttonEl) {
  var s = allSubmissions.find(function(s) { return s.id === id; });
  var name = s && s.gardenName ? s.gardenName : '(未入力)';
  var ok = window.confirm('「' + name + '」の提出データを削除します。\nこの操作は元に戻せません。よろしいですか？');
  if (!ok) return;

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = '削除中...';
  }

  db.collection('submissions').doc(id).delete()
    .then(function() {
      allSubmissions = allSubmissions.filter(function(s) { return s.id !== id; });
      applyFilter();
      showToast('提出データを削除しました', 'success');
    })
    .catch(function() {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = '削除';
      }
      showToast('削除に失敗しました', 'error');
    });
}

// -- CSV出力 --
function exportCSV() {
  var filtered = getFiltered();
  if (filtered.length === 0) { showToast('出力するデータがありません', 'error'); return; }
  var headers = ['園名','担当','公開希望日','提出日','パターンID','リスク','ドメイン','メール','旧サイト','旧サイト管理会社','旧サイト管理会社電話','旧サイト管理会社メール','リダイレクト','WEB制作会社','WEB制作会社電話','WEB制作会社メール','ドメイン管理会社','ドメイン管理会社電話','ドメイン管理会社メール','旧HPツール','ステータス','メモ'];
  var statusMap = { pending: '未対応', in_progress: '対応中', done: '完了' };
  var rows = filtered.map(function(s) {
    var redirectInfo = s.redirectInfo && typeof s.redirectInfo === 'object' ? s.redirectInfo : {};
    var answers = s.answers || {};
    return [
      s.gardenName || '',
      s.directorName || '',
      s.publishDate || '',
      s.submittedAt ? s.submittedAt.toDate().toLocaleDateString('ja-JP') : '',
      s.patternId || '',
      s.riskLabel || '',
      s.domainLabel || s.domain || '',
      s.mailLabel || s.mail || '',
      s.oldsite === 'yes' ? 'あり' : 'なし',
      answers['q-old-3'] || '',
      answers['q-old-3-phone'] || '',
      answers['q-old-3-email'] || '',
      s.redirect === 'needed' ? '必要' : '不要',
      redirectInfo.webCompany || '',
      redirectInfo.webCompanyPhone || '',
      redirectInfo.webCompanyEmail || '',
      redirectInfo.domainCompany || '',
      redirectInfo.domainCompanyPhone || '',
      redirectInfo.domainCompanyEmail || '',
      getRedirectToolLabel(redirectInfo.tool),
      statusMap[s.status] || '',
      s.memo || ''
    ];
  });
  var csv = [headers].concat(rows)
    .map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""')+'"'; }).join(','); })
    .join('\n');
  var bom = '\ufeff';
  var blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var now = new Date();
  a.href = url;
  a.download = '提出一覧_' + now.getFullYear() + ('0'+(now.getMonth()+1)).slice(-2) + ('0'+now.getDate()).slice(-2) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSVを出力しました', 'success');
}

function getFiltered() {
  var status = document.getElementById('filter-status').value;
  var risk   = document.getElementById('filter-risk').value;
  var search = document.getElementById('filter-search').value.toLowerCase();
  var filtered = allSubmissions.filter(function(s) {
    if (status && s.status !== status) return false;
    if (risk   && s.riskLevel !== risk) return false;
    if (search && !(s.gardenName || '').toLowerCase().includes(search)) return false;
    return true;
  });
  return sortSubmissions(filtered);
}

// -- 質問ID -> ラベル対応表 --
var QID_LABELS = {
  'q-www':       'URLにwwwを付けるか',
  'q-newdom-1':  '希望ドメイン候補',
  'q-newdom-2':  '.ed.jp書類',
  'q-mov-1':     '現在のドメイン管理会社',
  'q-mov-2':     'AuthCode取得状況',
  'q-mov-3':     'ドメイン有効期限',
  'q-mov-4':     '移管ロック状況',
  'q-ext-1':     'ドメイン管理会社',
  'q-ext-2':     '管理会社連絡窓口',
  'q-ext-3':     '管理画面ログイン',
  'q-mailnew-1': '必要メールアドレス数',
  'q-mailnew-2': 'アドレス命名希望',
  'q-mailnew-3': '教育機関認証書類',
  'q-mailcon-1': '現在のメールサービス名',
  'q-mailcon-2': 'メール契約会社名',
  'q-mailcon-5x': 'メール補足',
  'q-old-1':     '旧サイトURL',
  'q-old-2':     '旧サイト公開先サービス',
  'q-old-3':     '旧サイト管理会社',
  'q-old-3-phone': '旧サイト管理会社 電話番号',
  'q-old-3-email': '旧サイト管理会社 メール',
  'q-old-4':     '旧サイト維持期間'
};

// -- フィルター・ボタンのイベント --
document.getElementById('logout-btn').addEventListener('click', signOut);
document.getElementById('csv-btn').addEventListener('click', exportCSV);
document.getElementById('reload-btn').addEventListener('click', loadSubmissions);
document.getElementById('filter-status').addEventListener('change', applyFilter);
document.getElementById('filter-risk').addEventListener('change', applyFilter);
document.getElementById('filter-search').addEventListener('input', applyFilter);
document.getElementById('filter-sort').addEventListener('change', applyFilter);

// -- トースト --
var toastTimer;
function showToast(msg, type) {
  type = type || 'info';
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove('show'); }, 3000);
}
