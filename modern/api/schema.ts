import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const answerKey = /^q-[a-z0-9-]+$/;

export const domainApplicationSchema = z.object({
  orgType: text(200), orgLicensed: text(20), orgName: text(200),
  orgKana: text(200), orgNameEn: text(200), postal: text(20),
  address: text(500), building: text(200), contactName: text(200),
  contactRoman: text(200), contactDept: text(200), contactTitle: text(200),
  contactPhone: text(50), contactEmail: text(254), regDate: text(50),
  regAddress: text(500), repName: text(200), repRoman: text(200),
  repTitle: text(200)
}).strict();

export const submissionSchema = z.object({
  gardenName: text(200).min(1),
  contactName: text(200).default(''),
  domainName: text(500).default(''),
  oldsite: z.enum(['yes', 'no', 'unknown']),
  urlPolicy: z.enum(['same', 'new', 'undecided', '']),
  redirect: z.enum(['needed', 'none', '']),
  mail: z.enum(['using', 'not_using', 'unknown']),
  mailKeep: z.enum(['keep', 'change', 'unknown', '']),
  mailWant: z.enum(['yes', 'no', 'considering', '']),
  answers: z.record(z.string().regex(answerKey), text(1900)),
  domainApplicationInfo: domainApplicationSchema.nullable()
}).strict().superRefine((value, ctx) => {
  const requireAnswer = (key: string) => {
    if (!value.answers[key]?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['answers', key], message: '必須項目です' });
    }
  };

  if (value.oldsite === 'yes') {
    if (!value.urlPolicy || !value.redirect) {
      ctx.addIssue({ code: 'custom', path: ['urlPolicy'], message: 'URLとご案内の選択が必要です' });
    }
    requireAnswer('q-old-3');
  }
  if (value.mail === 'using') {
    if (!value.mailKeep) ctx.addIssue({ code: 'custom', path: ['mailKeep'], message: '必須項目です' });
    requireAnswer('q-mailcon-2');
  }
  if (value.mail === 'not_using' && !value.mailWant) {
    ctx.addIssue({ code: 'custom', path: ['mailWant'], message: '必須項目です' });
  }
});

export type Submission = z.infer<typeof submissionSchema>;

export function toGasPayload(input: Submission) {
  const domainPolicy = input.oldsite === 'no' || input.urlPolicy === 'new'
    ? 'new' : input.urlPolicy === 'same' ? 'continue' : 'undecided';
  const riskLevel = input.urlPolicy === 'same' && ['using', 'unknown'].includes(input.mail)
    ? 'high'
    : input.urlPolicy === 'same' || input.redirect === 'needed' ||
      (domainPolicy === 'new' && input.mail === 'using') ||
      input.mail === 'unknown' || input.oldsite === 'unknown'
      ? 'mid' : 'low';
  const riskLabel = {
    high: 'リスク：高（メール停止に注意）',
    mid: 'リスク：中（外部調整が必要）',
    low: 'リスク：低（シンプルケース）'
  }[riskLevel];
  const urlPolicy = input.oldsite === 'no' ? 'new' : input.oldsite === 'yes' ? input.urlPolicy : '';
  const redirect = input.oldsite === 'yes' ? input.redirect : '';
  const mailKeep = input.mail === 'using' ? input.mailKeep : '';
  const mailWant = input.mail === 'not_using' ? input.mailWant : '';
  const u = { same: 'S', new: 'N', undecided: 'U' }[urlPolicy as 'same' | 'new' | 'undecided'] || '_';
  const m = { using: 'U', not_using: 'N', unknown: '?' }[input.mail];
  const o = { yes: 'O', no: '_', unknown: '?' }[input.oldsite];
  const r = { needed: 'R', none: '0' }[redirect as 'needed' | 'none'] || '_';
  const mailLabels = {
    using: {
      keep: 'ドメインメール利用中（公開後もそのまま）',
      change: 'ドメインメール利用中（公開後に変更希望）',
      unknown: 'ドメインメール利用中（公開後は要相談）'
    },
    not_using: {
      yes: '未利用（今後利用したい）',
      no: '未利用（今後も利用しない）',
      considering: '未利用（検討中）'
    }
  };
  const mailLabel = input.mail === 'using'
    ? mailLabels.using[mailKeep as 'keep' | 'change' | 'unknown']
    : input.mail === 'not_using'
      ? mailLabels.not_using[mailWant as 'yes' | 'no' | 'considering']
      : 'わからない（要確認）';

  return {
    ...input,
    urlPolicy,
    redirect,
    mailKeep,
    mailWant,
    domainApplicationInfo: domainPolicy === 'new' ? input.domainApplicationInfo : null,
    patternId: `U${u}-M${m}-${o}${r}`,
    riskLevel,
    riskLabel,
    oldsiteLabel: { yes: 'あり', no: 'なし', unknown: 'わからない' }[input.oldsite],
    urlPolicyLabel: input.oldsite === 'no' ? '（現在のHPなし）' :
      { same: '今と同じURLを使いたい', new: '新しいURLにしたい', undecided: 'おまかせ・未定', '': 'おまかせ・未定' }[urlPolicy],
    domainPolicy,
    domainLabel: { new: '新規取得', continue: '現ドメインを継続', undecided: '未定（要相談）' }[domainPolicy],
    mailLabel
  };
}
