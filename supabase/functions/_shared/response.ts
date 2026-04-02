import { CORS_HEADERS } from './cors.ts';

export function jsonSuccess<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function jsonError(
  error: string,
  code: string,
  status = 400,
): Response {
  return new Response(JSON.stringify({ success: false, error, code }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
