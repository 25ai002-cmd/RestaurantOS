import serverless from 'serverless-http';
import { createApp } from '../../apps/api/dist/app.js';

const app = createApp();

const handlerInstance = serverless(app, {
  request(request: { url?: string }) {
    if (request.url) {
      if (request.url.startsWith('/.netlify/functions/api')) {
        request.url = '/api' + request.url.slice('/.netlify/functions/api'.length);
      } else if (!request.url.startsWith('/api')) {
        request.url = '/api' + (request.url.startsWith('/') ? '' : '/') + request.url;
      }
    }
  },
});

export const handler = async (event: unknown, context: unknown) => {
  return handlerInstance(event, context);
};
