import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chromium } from 'playwright';

test('new domain flow reaches the confirmation form on desktop and mobile', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:5173/');
      await page.getByLabel('園名（正式名称）').fill('テスト幼稚園');
      await page.getByRole('button', { name: /次へ：ホームページ/ }).click();
      await page.getByRole('radio', { name: 'ない', exact: true }).check();
      await page.getByRole('button', { name: /次へ：メール/ }).click();
      await page.getByRole('radio', { name: '利用していない', exact: true }).check();
      await page.getByRole('radio', { name: '利用しない', exact: true }).check();
      await page.getByRole('button', { name: /次へ：確認・送信/ }).click();
      assert.equal(await page.getByText('ドメイン取得申請情報').count(), 1);
      assert.equal(await page.getByLabel('組織名（園名のみ）').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'この内容で送信する' }).count(), 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
