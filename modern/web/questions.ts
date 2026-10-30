import type { Submission } from '../api/schema';

export type Question = {
  id: string;
  category: string;
  label: string;
  hint: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
  type?: string;
  when: (value: Submission) => boolean;
};

const always = () => true;
export const questions: Question[] = [
  { id: 'q-www', category: '基本', label: 'URLに「www」を付けますか？（ご希望があれば）', hint: 'ご希望がなければ空欄で構いません。スマートエデュケーションで判断します', placeholder: '例：付けたい / 付けたくない', required: false, when: always },
  { id: 'q-related', category: '基本', label: '関連するホームページ（任意）', hint: '法人サイトや系列園など、関連するサイトがあれば教えてください', placeholder: '例：法人サイト https://...', required: false, multiline: true, when: always },
  { id: 'q-old-3', category: 'ホームページ', label: '現在のホームページを制作・管理している会社名', hint: 'URLの引き継ぎやご案内設定について、こちらから直接ご相談します', placeholder: '例：〇〇株式会社', required: true, when: s => s.oldsite === 'yes' },
  { id: 'q-old-3-phone', category: 'ホームページ', label: '制作・管理会社の電話番号', hint: 'わからなければ空欄で構いません', placeholder: '例：03-XXXX-XXXX', required: false, type: 'tel', when: s => s.oldsite === 'yes' },
  { id: 'q-old-3-email', category: 'ホームページ', label: '制作・管理会社のメールアドレス', hint: 'わからなければ空欄で構いません', placeholder: '例：support@example.com', required: false, type: 'email', when: s => s.oldsite === 'yes' },
  { id: 'q-old-2', category: 'ホームページ', label: '現在のホームページの公開先サービス（わかれば）', hint: 'ご案内設定の方法がサービスによって異なります', placeholder: '例：Wix / WordPress', required: false, when: s => s.oldsite === 'yes' },
  { id: 'q-contract-period', category: 'ホームページ', label: 'ホームページ（URL）のご契約期間はご存じですか？', hint: 'わからなければ空欄で構いません', placeholder: '例：2027年3月まで', required: false, when: s => s.oldsite === 'yes' },
  { id: 'q-newdom-1', category: 'ホームページ', label: '第2・第3希望のURL（任意）', hint: '第1希望が取得できない場合の候補として使います', placeholder: '例：jiro.ed.jp, jiro-kindergarten.jp', required: false, multiline: true, when: s => s.oldsite === 'no' || s.urlPolicy === 'new' },
  { id: 'q-mailcon-2', category: 'メール', label: 'メールを契約している会社名', hint: 'メールを止めずに引き継ぐための確認先として使います', placeholder: '例：さくらインターネット', required: true, when: s => s.mail === 'using' },
  { id: 'q-mailcon-1', category: 'メール', label: '現在お使いのメールサービス名（わかれば）', hint: '現在のメール環境を把握します', placeholder: '例：さくらメール / Google Workspace', required: false, when: s => s.mail === 'using' },
  { id: 'q-mailcon-3', category: 'メール', label: '現在お使いのメールアドレス（わかる範囲で）', hint: '引き継ぎ対象を把握します', placeholder: '例：info@example.ed.jp', required: false, multiline: true, when: s => s.mail === 'using' },
  { id: 'q-mailcon-5x', category: 'メール', label: 'その他・補足（任意）', hint: '気になることや確認したいことがあれば入力してください', placeholder: '補足を入力', required: false, multiline: true, when: s => s.mail === 'using' || s.mail === 'not_using' }
];

export const orgGroups = [
  { title: '組織情報', fields: [
    ['orgType', '法人種類'], ['orgLicensed', '認可を受けているか'], ['orgName', '組織名（園名のみ）'],
    ['orgKana', '組織名読み仮名'], ['orgNameEn', '園名英語表記']
  ] },
  { title: '住所', fields: [
    ['postal', '郵便番号'], ['address', '市区町村・番地'], ['building', '建物名']
  ] },
  { title: '登録担当者', fields: [
    ['contactName', '姓名（漢字）'], ['contactRoman', '姓名（ローマ字）'],
    ['contactDept', '部署名'], ['contactTitle', '役職'], ['contactPhone', '電話番号'],
    ['contactEmail', 'メールアドレス']
  ] },
  { title: '登記情報', fields: [
    ['regDate', '登記年月日（西暦）'], ['regAddress', '登記地住所'],
    ['repName', '代表者氏名'], ['repRoman', '代表者氏名（ローマ字）'], ['repTitle', '代表者役職']
  ] }
] as const;
