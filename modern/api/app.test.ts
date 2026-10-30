import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from './app.js';

const valid = {
  gardenName: 'テスト園', contactName: '', domainName: '',
  oldsite: 'yes', urlPolicy: 'same', redirect: 'needed',
  mail: 'using', mailKeep: 'keep', mailWant: '',
  answers: { 'q-old-3': '旧管理会社', 'q-mailcon-2': 'さくら' },
  domainApplicationInfo: null
};

test('valid submission forwards one normalized receipt without exposing token', async () => {
  let forwarded: Record<string, unknown> | undefined;
  const app = createApp({ gasEndpoint: 'https://script.google.com/macros/s/test/exec', gasSharedToken: 'server-only' },
    async (_url, init) => {
      forwarded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, receiptNo: '2026-0010' }));
    });
  const response = await app.inject({ method: 'POST', url: '/api/submissions', payload: valid });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().receiptNo, '2026-0010');
  assert.equal(forwarded?.token, 'server-only');
  assert.equal(forwarded?.patternId, 'US-MU-OR');
  assert.equal(forwarded?.riskLevel, 'high');
  await app.close();
});

test('invalid input is rejected before forwarding to GAS', async () => {
  let called = false;
  const app = createApp({ gasEndpoint: 'https://script.google.com/macros/s/test/exec', gasSharedToken: 'server-only' },
    async () => { called = true; throw new Error('should not call'); });
  const response = await app.inject({ method: 'POST', url: '/api/submissions', payload: { ...valid, answers: {} } });
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
  await app.close();
});

test('new domain application details are forwarded to GAS', async () => {
  let forwarded: Record<string, unknown> | undefined;
  const app = createApp({ gasEndpoint: 'https://script.google.com/macros/s/test/exec', gasSharedToken: 'server-only' },
    async (_url, init) => {
      forwarded = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ ok: true, receiptNo: '2026-0011' }));
    });
  const domainApplicationInfo = {
    orgType: '学校法人', orgLicensed: 'yes', orgName: 'テスト園', orgKana: '', orgNameEn: '',
    postal: '', address: '', building: '', contactName: '', contactRoman: '',
    contactDept: '', contactTitle: '', contactPhone: '', contactEmail: '',
    regDate: '', regAddress: '', repName: '', repRoman: '', repTitle: ''
  };
  const response = await app.inject({ method: 'POST', url: '/api/submissions', payload: {
    ...valid, oldsite: 'no', urlPolicy: 'new', redirect: '', mail: 'not_using',
    mailKeep: '', mailWant: 'no', answers: {}, domainApplicationInfo
  } });
  assert.equal(response.statusCode, 200);
  assert.equal(forwarded?.domainPolicy, 'new');
  assert.deepEqual(forwarded?.domainApplicationInfo, domainApplicationInfo);
  await app.close();
});

test('uncertain GAS outcome does not claim a successful submission', async () => {
  const app = createApp({ gasEndpoint: 'https://script.google.com/macros/s/test/exec', gasSharedToken: 'server-only' },
    async () => new Response(JSON.stringify({ ok: false, error: 'Notion sync failed' })));
  const response = await app.inject({ method: 'POST', url: '/api/submissions', payload: valid });
  assert.equal(response.statusCode, 502);
  assert.equal(response.json().ok, false);
  assert.match(response.json().error, /再送前/);
  await app.close();
});
