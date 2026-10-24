import { createServer } from 'node:http';
import { dispatch, errorResponse, HttpError, MAX_BODY_BYTES } from './responses.js';

export function createServiceServer(route) {
  return createServer({ requestTimeout: 15000 }, async (request, response) => {
    let result;
    try {
      let bytes = 0;
      const chunks = [];
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes <= MAX_BODY_BYTES) chunks.push(chunk);
      }
      if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
      const url = new URL(request.url, 'http://localhost');
      result = await dispatch(route, {
        method: request.method, path: url.pathname.replace(/\/$/, '') || '/',
        query: url.searchParams, headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
    } catch (error) {
      result = errorResponse(error);
    }
    response.writeHead(result.statusCode, result.headers);
    response.end(result.body);
  });
}

export function listen(route, port, name) {
  const server = createServiceServer(route);
  server.on('error', (error) => {
    console.error(`${name} could not start (${error.code}). Check that port ${port} is free.`);
    process.exitCode = 1;
  });
  server.listen(port, process.env.HOST || '127.0.0.1', () => {
    console.log(`${name}: http://${process.env.HOST || '127.0.0.1'}:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => { server.close(); server.closeAllConnections(); });
  }
  return server;
}
