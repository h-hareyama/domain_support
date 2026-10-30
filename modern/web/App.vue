<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { submissionSchema, type Submission } from '../api/schema';
import { orgGroups, questions } from './questions';

const DRAFT_KEY = 'domain-support-modern-draft';
const steps = ['園の基本', 'ホームページ', 'メール', '確認・送信'];
const emptyOrg = () => ({
  orgType: '', orgLicensed: '', orgName: '', orgKana: '', orgNameEn: '',
  postal: '', address: '', building: '', contactName: '', contactRoman: '',
  contactDept: '', contactTitle: '', contactPhone: '', contactEmail: '',
  regDate: '', regAddress: '', repName: '', repRoman: '', repTitle: ''
});
const emptyForm = (): Submission => ({
  gardenName: '', contactName: '', domainName: '', oldsite: 'unknown',
  urlPolicy: '', redirect: '', mail: 'unknown', mailKeep: '', mailWant: '',
  answers: {}, domainApplicationInfo: null
});
const form = reactive<Submission>(emptyForm());
const org = reactive(emptyOrg());
const step = ref(0);
const maxStep = ref(0);
const oldsiteChosen = ref(false);
const mailChosen = ref(false);
const sending = ref(false);
const sentReceipt = ref('');
const message = ref('');
const draftStatus = ref('この端末に入力内容を自動保存します');
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const domainPolicy = computed(() =>
  form.oldsite === 'no' || form.urlPolicy === 'new' ? 'new' :
  form.urlPolicy === 'same' ? 'continue' : 'undecided');
const visibleQuestions = computed(() => questions.filter(q => q.when(form)));
const categories = computed(() => [...new Set(visibleQuestions.value.map(q => q.category))]);
const formPayload = computed<Submission>(() => ({
  ...form,
  domainApplicationInfo: domainPolicy.value === 'new' ? { ...org } : null
}));

function setOldsite(value: Submission['oldsite']) {
  form.oldsite = value;
  oldsiteChosen.value = true;
  if (value !== 'yes') {
    form.urlPolicy = value === 'no' ? 'new' : '';
    form.redirect = '';
  }
}

function setMail(value: Submission['mail']) {
  form.mail = value;
  mailChosen.value = true;
  if (value !== 'using') form.mailKeep = '';
  if (value !== 'not_using') form.mailWant = '';
}

function navigate(next: number) {
  message.value = '';
  if (next > step.value) {
    if (step.value === 0 && !form.gardenName.trim()) message.value = '園名を入力してください';
    if (step.value === 1 && !oldsiteChosen.value) message.value = '現在のホームページの有無を選択してください';
    if (step.value === 1 && form.oldsite === 'yes' && (!form.urlPolicy || !form.redirect)) {
      message.value = 'URLのご希望と新HPへのご案内を選択してください';
    }
    if (step.value === 2 && !mailChosen.value) message.value = 'メールの利用状況を選択してください';
    if (step.value === 2 && form.mail === 'using' && !form.mailKeep) message.value = '公開後のメールの扱いを選択してください';
    if (step.value === 2 && form.mail === 'not_using' && !form.mailWant) message.value = '今後のメール利用について選択してください';
    if (message.value) return;
  }
  step.value = next;
  maxStep.value = Math.max(maxStep.value, next);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function submit() {
  if (sentReceipt.value || sending.value) return;
  message.value = '';
  const parsed = submissionSchema.safeParse(formPayload.value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const question = questions.find(q => q.id === issue?.path[1]);
    message.value = question ? `「${question.label}」を入力してください` : '入力内容を確認してください';
    return;
  }
  sending.value = true;
  try {
    const response = await fetch('/api/submissions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data)
    });
    const result: { ok?: boolean; receiptNo?: string; error?: string } = await response.json();
    if (!response.ok || !result.ok || !result.receiptNo) throw new Error(result.error || '送信に失敗しました');
    sentReceipt.value = result.receiptNo;
    localStorage.removeItem(DRAFT_KEY);
    draftStatus.value = '送信済み';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '送信に失敗しました';
  } finally {
    sending.value = false;
  }
}

function clearDraft() {
  if (!window.confirm('保存した下書きと現在の入力内容を削除します。よろしいですか？')) return;
  localStorage.removeItem(DRAFT_KEY);
  Object.assign(form, emptyForm());
  Object.assign(org, emptyOrg());
  step.value = 0;
  maxStep.value = 0;
  oldsiteChosen.value = false;
  mailChosen.value = false;
  draftStatus.value = 'この端末に入力内容を自動保存します';
}

function printPdf() { window.print(); }

function saveDraft() {
  if (sentReceipt.value) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      savedAt: Date.now(), form: { ...form }, org: { ...org }, step: step.value,
      maxStep: maxStep.value, oldsiteChosen: oldsiteChosen.value, mailChosen: mailChosen.value
    }));
    draftStatus.value = `保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    draftStatus.value = 'この端末に下書きを保存できませんでした';
  }
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > 30 * 86400000) return;
    Object.assign(form, draft.form || {});
    Object.assign(org, draft.org || {});
    step.value = Math.max(0, Math.min(3, Number(draft.step) || 0));
    maxStep.value = Math.max(step.value, Math.min(3, Number(draft.maxStep) || 0));
    oldsiteChosen.value = Boolean(draft.oldsiteChosen);
    mailChosen.value = Boolean(draft.mailChosen);
    draftStatus.value = '下書きを復元しました';
  } catch { localStorage.removeItem(DRAFT_KEY); }
});
watch([form, org, step, maxStep, oldsiteChosen, mailChosen], () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 400);
}, { deep: true });

const radioGroups = {
  oldsite: [['yes', 'ある'], ['no', 'ない'], ['unknown', 'わからない']],
  urlPolicy: [['same', '今と同じURLを使いたい'], ['new', '新しいURLにしたい'], ['undecided', 'おまかせ・まだ決めていない']],
  redirect: [['needed', '原則どおり実施する'], ['none', 'ご案内は不要']],
  mail: [['using', '利用している'], ['not_using', '利用していない'], ['unknown', 'わからない']],
  mailKeep: [['keep', 'そのまま使いたい'], ['change', 'この機会に変えたい'], ['unknown', 'わからない・相談したい']],
  mailWant: [['yes', '利用したい'], ['no', '利用しない'], ['considering', '検討中']]
} as const;
</script>

<template>
  <div class="app modern-app">
    <header class="brand">
      <span class="logo">スマートエデュケーション</span>
      <h1>ホームページ公開 準備フォーム</h1>
      <span class="meta">HPの公開に必要な情報をご入力ください</span>
    </header>

    <div class="draft-bar" aria-live="polite">
      <span class="draft-status">{{ draftStatus }}</span>
      <button type="button" class="draft-clear" @click="clearDraft">下書きを削除</button>
    </div>

    <nav class="stepper" aria-label="入力手順">
      <button v-for="(name, index) in steps" :key="name" type="button" class="step"
        :class="{ active: index === step, done: index < step }" :disabled="index > maxStep"
        @click="navigate(index)">
        <span class="step-text"><span class="num">0{{ index + 1 }}</span>{{ name }}</span>
      </button>
    </nav>

    <p v-if="message" class="modern-error" role="alert">{{ message }}</p>

    <section v-if="step === 0" class="panel">
      <div class="panel-head"><div class="eyebrow">Step 01 / 04</div><h2>園の基本情報</h2>
        <p class="desc">はじめに、園のお名前と、このあとご連絡する窓口の方をお伺いします。</p></div>
      <div class="field"><label for="garden-name">園名（正式名称）</label>
        <span class="hint">法人格を含む正式名称</span>
        <input id="garden-name" v-model="form.gardenName" type="text" autocomplete="organization" placeholder="例：学校法人 〇〇学園 〇〇幼稚園"></div>
      <div class="field"><label for="contact-name">ご担当者名（園さま）</label>
        <input id="contact-name" v-model="form.contactName" type="text" autocomplete="name" placeholder="例：山田 花子"></div>
      <div class="nav"><span></span><button class="btn btn-primary" @click="navigate(1)">次へ：ホームページ →</button></div>
    </section>

    <section v-if="step === 1" class="panel">
      <div class="panel-head"><div class="eyebrow">Step 02 / 04</div><h2>ホームページについて</h2>
        <p class="desc">現在の状況を教えてください。必要な手続きはスマートエデュケーションで判断し、ご案内します。</p></div>
      <div class="q-group"><div class="q-label">現在、公開中のホームページはありますか？</div>
        <div class="q-options"><label v-for="option in radioGroups.oldsite" :key="option[0]" class="q-opt">
          <input type="radio" name="oldsite" :value="option[0]" :checked="oldsiteChosen && form.oldsite === option[0]" @change="setOldsite(option[0])">
          <span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div></div>
      <div v-if="oldsiteChosen && form.oldsite === 'yes'" class="q-group">
        <div class="q-label">新しいホームページのURLは、今と同じものを使いたいですか？</div>
        <div class="q-options"><label v-for="option in radioGroups.urlPolicy" :key="option[0]" class="q-opt">
          <input v-model="form.urlPolicy" type="radio" name="urlPolicy" :value="option[0]">
          <span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div>
      </div>
      <div v-if="oldsiteChosen && form.oldsite === 'yes'" class="q-group">
        <div class="q-label">現在のホームページを見に来た方を、新しいホームページへ自動でご案内します</div>
        <div class="q-options"><label v-for="option in radioGroups.redirect" :key="option[0]" class="q-opt">
          <input v-model="form.redirect" type="radio" name="redirect" :value="option[0]">
          <span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div>
      </div>
      <div class="nav"><button class="btn btn-secondary" @click="navigate(0)">← 戻る</button>
        <button class="btn btn-primary" @click="navigate(2)">次へ：メール →</button></div>
    </section>

    <section v-if="step === 2" class="panel">
      <div class="panel-head"><div class="eyebrow">Step 03 / 04</div><h2>メールについて</h2>
        <p class="desc">ホームページと同じドメインのメールアドレスについてお伺いします。</p></div>
      <div class="q-group"><div class="q-label">現在、ホームページと同じドメインのメールアドレスを利用していますか？</div>
        <div class="q-options"><label v-for="option in radioGroups.mail" :key="option[0]" class="q-opt">
          <input type="radio" name="mail" :value="option[0]" :checked="mailChosen && form.mail === option[0]" @change="setMail(option[0])">
          <span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div></div>
      <div v-if="mailChosen && form.mail === 'using'" class="q-group"><div class="q-label">公開後も、今のメールアドレスをそのままお使いになりますか？</div>
        <div class="q-options"><label v-for="option in radioGroups.mailKeep" :key="option[0]" class="q-opt">
          <input v-model="form.mailKeep" type="radio" name="mailKeep" :value="option[0]"><span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div></div>
      <div v-if="mailChosen && form.mail === 'not_using'" class="q-group"><div class="q-label">今後、同じドメインのメールアドレスを利用したいですか？</div>
        <div class="q-options"><label v-for="option in radioGroups.mailWant" :key="option[0]" class="q-opt">
          <input v-model="form.mailWant" type="radio" name="mailWant" :value="option[0]"><span class="q-opt-body"><span class="q-opt-title">{{ option[1] }}</span></span>
        </label></div></div>
      <div class="nav"><button class="btn btn-secondary" @click="navigate(1)">← 戻る</button>
        <button class="btn btn-primary" @click="navigate(3)">次へ：確認・送信 →</button></div>
    </section>

    <div v-if="step === 3">
      <div class="result-head"><h2>{{ form.gardenName }} さま｜ご入力内容の確認</h2>
        <div class="pattern-id">{{ form.contactName ? `ご担当者: ${form.contactName}` : '' }}</div></div>
      <section class="panel modern-result-panel">
        <div class="panel-head"><h2>ドメイン情報</h2><p class="desc">わかる範囲で入力してください。</p></div>
        <div class="field"><label for="domain-name">{{ domainPolicy === 'new' ? 'ご希望のURL（第1希望）' : '現在のホームページのURL' }}</label>
          <input id="domain-name" v-model="form.domainName" type="text" placeholder="例：example.ed.jp"></div>
        <div v-if="domainPolicy === 'new'" class="new-domain-form">
          <div class="new-domain-head"><h3 class="new-domain-title">ドメイン取得申請情報</h3>
            <p class="new-domain-desc">.ed.jp 等の新規取得時に必要になる情報です。わかる範囲で入力してください。</p></div>
          <div v-for="group in orgGroups" :key="group.title" class="modern-org-group">
            <h4 class="sub-section">{{ group.title }}</h4>
            <div class="form-grid"><div v-for="field in group.fields" :key="field[0]" class="field">
              <label :for="field[0]">{{ field[1] }}</label>
              <select v-if="field[0] === 'orgType'" :id="field[0]" v-model="org.orgType">
                <option value="">選択してください</option><option v-for="name in ['学校法人','社会福祉法人','医療法人','宗教法人','NPO法人','株式会社','その他']" :key="name">{{ name }}</option>
              </select>
              <select v-else-if="field[0] === 'orgLicensed'" :id="field[0]" v-model="org.orgLicensed">
                <option value="">選択してください</option><option value="yes">受けている</option><option value="no">受けていない</option>
              </select>
              <input v-else :id="field[0]" v-model="org[field[0]]"
                :type="field[0] === 'contactEmail' ? 'email' : field[0] === 'contactPhone' ? 'tel' : field[0] === 'regDate' ? 'date' : 'text'">
            </div></div>
            <button v-if="group.title === '登記情報'" type="button" class="btn btn-secondary" @click="org.regAddress = org.address">登記地住所に上の住所を使用</button>
          </div>
        </div>
      </section>
      <section v-for="category in categories" :key="category" class="panel modern-result-panel">
        <h2>{{ category }}</h2>
        <div v-for="question in visibleQuestions.filter(q => q.category === category)" :key="question.id" class="ask-item">
          <div class="ask-body"><label class="ask-title" :for="question.id">{{ question.label }}
            <span :class="['badge', question.required ? 'badge-required' : 'badge-optional']">{{ question.required ? '必須' : '任意' }}</span></label>
            <p class="ask-why">{{ question.hint }}</p>
            <textarea v-if="question.multiline" :id="question.id" v-model="form.answers[question.id]" :placeholder="question.placeholder"></textarea>
            <input v-else :id="question.id" v-model="form.answers[question.id]" :type="question.type || 'text'" :placeholder="question.placeholder">
          </div>
        </div>
      </section>
      <div class="modern-actions"><button class="btn btn-secondary" @click="navigate(2)">← 質問に戻る</button>
        <button class="btn btn-secondary" @click="printPdf">PDF保存</button>
        <button class="btn btn-submit" :disabled="sending || !!sentReceipt" @click="submit">{{ sentReceipt ? `送信済み（${sentReceipt}）` : sending ? '送信中...' : 'この内容で送信する' }}</button>
      </div>
    </div>
  </div>
</template>
