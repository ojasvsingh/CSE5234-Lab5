import { dispatch } from './responses.js';

// API Gateway proxy event -> the same request used by the local HTTP servers.
export function lambdaAdapter(route) {
  return async (event) => dispatch(route, {
    method: event.httpMethod || event.requestContext?.http?.method || 'GET',
    path: (event.path || event.rawPath || '/').replace(/\/$/, '') || '/',
    query: new URLSearchParams(event.queryStringParameters || {}),
    headers: Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])),
    body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '',
  });
}
