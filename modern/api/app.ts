import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { submissionSchema, toGasPayload } from './schema.js';

type Config = { gasEndpoint: string; gasSharedToken: string };

export function createApp(config: Config, send = fetch) {
  const app = Fastify({ bodyLimit: 64 * 1024, logger: true, trustProxy: true });

  app.register(rateLimit, {
    global: false,
    max: 10,
    timeWindow: '1 minute'
  });

  app.get('/health', async () => ({ ok: true }));

  app.post('/api/submissions', { config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = submissionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: '入力内容を確認してください',
        fields: parsed.error.issues.map(issue => issue.path.join('.'))
      });
    }

    const payload = { ...toGasPayload(parsed.data), token: config.gasSharedToken };
    try {
      const response = await send(config.gasEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`GAS HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('ok' in data) || data.ok !== true ||
          !('receiptNo' in data) || typeof data.receiptNo !== 'string') {
        throw new Error('GAS response was not a successful receipt');
      }
      return { ok: true, receiptNo: data.receiptNo };
    } catch (error) {
      request.log.error({ err: error }, 'GAS submission failed or outcome unknown');
      return reply.code(502).send({
        ok: false,
        error: '受付結果を確認できませんでした。再送前に担当者へお問い合わせください'
      });
    }
  });

  return app;
}
