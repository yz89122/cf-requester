import { Buffer } from 'buffer';
import { Router } from 'itty-router';

const router = Router();

router.post('/proxy', async (request: Request, { env }) => {
  // is authorized
  const apiToken = request.headers.get('x-api-token');
  if (env.API_TOKEN && apiToken != env.API_TOKEN) {
    return new Response(null, { status: 403 });
  }

  // try parse body as JSON
  let subRequestMeta: {
    method: string;
    url: string;
    headers: HeadersInit;
    body: string;
  };
  try {
    subRequestMeta = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // validate URL scheme
  try {
    const url = new URL(subRequestMeta.url);
    if (url.protocol != 'http:' && url.protocol != 'https:') {
      throw new Error('bad protocol');
    }
  } catch {
    return new Response(null, { status: 400 });
  }

  // validate request meta
  let subRequest: Request;
  try {
    const method = subRequestMeta.method.toUpperCase();

    let rawBody;
    if (method != 'GET' && method != 'HEAD' && subRequestMeta.body) {
      const buffer = Buffer.from(subRequestMeta.body, 'base64');
      rawBody = new ArrayBuffer(buffer.length);
      const uint8Array = new Uint8Array(rawBody);
      for (let i = 0; i < buffer.length; ++i) uint8Array[i] = buffer[i];
    }

    subRequest = new Request(subRequestMeta.url, {
      method: method,
      headers: subRequestMeta.headers,
      body: rawBody,
    });
  } catch (err) {
    return new Response(null, { status: 400 });
  }

  // send request & wait response
  const subResponse = await fetch(subRequest);

  // to header struct
  const headers: { [key: string]: string[] } = {};
  subResponse.headers.forEach((value, key) => {
    if (!headers[key]) headers[key] = [];
    headers[key].push(value);
  });

  // body to base64
  const rawBody = await subResponse.arrayBuffer();
  const buffer = Buffer.from(rawBody);
  const rawBodyBase64 = buffer.toString('base64');

  const responseBody = {
    statusCode: subResponse.status,
    headers,
    body: rawBodyBase64,
  };
  return new Response(JSON.stringify(responseBody), {
    headers: { 'content-type': 'application/json;charset=UTF-8' },
  });
});

router.all('*', () => new Response(null, { status: 404 }));

export default {
  async fetch(
    request: Request,
    env: { [key: string]: string },
  ): Promise<Response> {
    try {
      return await router.handle(request, { env });
    } catch (err) {
      return new Response(null, { status: 500 });
    }
  },
};
