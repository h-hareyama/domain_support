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
      // ポップアップがブロックされた場合はリダイレクトにフォールバック
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
  renderList(filtered);
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
  var riskClass   = 'risk-' + (s.riskLevel || 'low');
  var statusClass = s.status || 'pending';
  var answers = s.answers || {};
  var answerHtml = Object.entries(answers).map(function(entry) {
    var qid = entry[0], ans = entry[1];
    if (!ans) return '';
    var label = QID_LABELS[qid] || qid;
    return '<div class="answer-item"><span class="q">' + label + '</span><span class="a">' + ans + '</span></div>';
  }).filter(Boolean).join('');

  var sel = function() {
    return [
      '<option value="pending"'     + (s.status==='pending'     ? ' selected' : '') + '>未対応</option>',
      '<option value="in_progress"' + (s.status==='in_progress' ? ' selected' : '') + '>対応中</option>',
      '<option value="done"'        + (s.status==='done'        ? ' selected' : '') + '>完了</option>'
    ].join('');
  };

  return '<div class="card status-' + statusClass + '" id="card-' + s.id + '">' +
    '<div class="card-header" onclick="toggleDetail(\'' + s.id + '\')">' +
      '<div class="garden-name">' + (s.gardenName || '(未入力)') + '</div>' +
      '<div class="card-meta">' +
        '<span class="meta-tag">提出: ' + date + '</span>' +
        '<span class="meta-tag">' + (s.domainLabel || s.domain || '-') + '</span>' +
        '<span class="meta-tag">メール: ' + (s.mailLabel || s.mail || '-') + '</span>' +
        '<span class="meta-tag">担当: ' + (s.directorName || '-') + '</span>' +
        '<span class="meta-tag">公開希望: ' + (s.publishDate || '-') + '</span>' +
        '<span class="risk-tag ' + riskClass + '">' + (s.riskLabel || '-') + '</span>' +
      '</div>' +
      '<select class="status-select ' + statusClass + '" onclick="event.stopPropagation()" onchange="updateStatus(\'' + s.id + '\', this)">' +
        sel() +
      '</select>' +
      '<span class="toggle-icon" id="icon-' + s.id + '">v</span>' +
    '</div>' +
    '<div class="card-detail" id="detail-' + s.id + '">' +
      '<div class="detail-grid">' +
        '<div class="detail-row"><div class="label">パターンID</div><div class="value">' + (s.patternId || '-') + '</div></div>' +
        '<div class="detail-row"><div class="label">ドメイン名</div><div class="value">' + (s.domainName || '-') + '</div></div>' +
        '<div class="detail-row"><div class="label">旧サイト</div><div class="value">' + (s.oldsite === 'yes' ? 'あり' : 'なし') + '</div></div>' +
        '<div class="detail-row"><div class="label">リダイレクト</div><div class="value">' + (s.redirect === 'needed' ? '必要' : '不要') + '</div></div>' +
      '</div>' +
      (answerHtml ? '<div class="answers-section"><h4>ヒアリング内容</h4>' + answerHtml + '</div>' : '') +
      '<div class="memo-section">' +
        '<div class="memo-label">社内メモ</div>' +
        '<textarea class="memo-textarea" id="memo-' + s.id + '" placeholder="対応履歴・連絡事項など..." onclick="event.stopPropagation()" onblur="saveMemo(\'' + s.id + '\', this.value)">' + (s.memo || '') + '</textarea>' +
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
  if (s && s.memo === value) return; // 変更なし
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

// -- CSV出力 --
function exportCSV() {
  var filtered = getFiltered();
  if (filtered.length === 0) { showToast('出力するデータがありません', 'error'); return; }
  var headers = ['園名','担当','公開希望日','提出日','パターンID','リスク','ドメイン','メール','旧サイト','リダイレクト','ステータス'];
  var statusMap = { pending: '未対応', in_progress: '対応中', done: '完了' };
  var rows = filtered.map(function(s) {
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
      s.redirect === 'needed' ? '必要' : '不要',
      statusMap[s.status] || ''
    ];
  });
  var csv = [headers].concat(rows)
    .map(function(r) { return r.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); })
    .join('\n');
  var bom = '﻿';
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
  return allSubmissions.filter(function(s) {
    if (status && s.status !== status) return false;
    if (risk   && s.riskLevel !== risk) return false;
    if (search && !(s.gardenName || '').toLowerCase().includes(search)) return false;
    return true;
  });
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
  'q-mailnew-2': 'アド�