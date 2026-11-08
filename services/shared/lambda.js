import { dispatch } from './responses.js';

// API Gateway proxy event -> the same request used by the local HTTP servers.
export function lambdaAdapter(route) {
  return async (event, context) => {
    // Return completed responses while retaining idle MySQL connections for reuse.
    if (context) context.callbackWaitsForEmptyEventLoop = false;
    let path = event.path || event.rawPath || '/';
    const stage = event.requestContext?.stage;
    // HTTP API named-stage invoke URLs may include the stage in rawPath.
    if (event.version === '2.0' && stage && stage !== '$default' && path.startsWith(`/${stage}/`)) {
      path = path.slice(stage.length + 1);
    }
    return dispatch(route, {
      method: event.httpMethod || event.requestContext?.http?.method || 'GET',
      path: path.replace(/\/$/, '') || '/',
      query: new URLSearchParams(event.queryStringParameters || {}),
      headers: Object.fromEntries(Object.entries(event.headers || {}).map(([key, value]) => [key.toLowerCase(), value])),
      body: event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : event.body || '',
    });
  };
}
