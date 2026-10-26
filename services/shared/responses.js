export const MAX_BODY_BYTES = 64 * 1024;

export class HttpError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...headers,
    },
    body: status === 204 ? '' : JSON.stringify(body),
  };
}

export function errorResponse(error) {
  return error instanceof HttpError
    ? json(error.status, { error: { code: error.code, message: error.message, ...error.details } })
    : json(500, { error: { code: 'INTERNAL_ERROR', message: 'The service could not complete the request.' } });
}

export function parseJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
    throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the order as application/json.');
  }
  try {
    return JSON.parse(request.body);
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
  }
}

export async function dispatch(route, request) {
  try {
    if (request.method === 'OPTIONS') return json(204, null);
    if (Buffer.byteLength(request.body || '') > MAX_BODY_BYTES) {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
    }
    return await route(request);
  } catch (error) {
    // Never log order bodies, card details, addresses, or raw upstream errors.
    return errorResponse(error);
  }
}
