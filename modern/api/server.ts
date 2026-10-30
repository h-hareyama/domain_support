import { createApp } from './app.js';

const gasEndpoint = process.env.GAS_ENDPOINT;
const gasSharedToken = process.env.GAS_SHARED_TOKEN;
if (!gasEndpoint || !gasEndpoint.startsWith('https://script.google.com/macros/s/') ||
    !gasEndpoint.endsWith('/exec') || !gasSharedToken) {
  throw new Error('GAS_ENDPOINT and GAS_SHARED_TOKEN must be configured');
}

const app = createApp({ gasEndpoint, gasSharedToken });
const port = Number(process.env.PORT || 3000);
await app.listen({ host: '0.0.0.0', port });
