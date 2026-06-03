import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';

  const subdomain = host.split('.')[0];

  if (host === 'mywebapp.com' || host.startsWith('www')) {
    return NextResponse.next();
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant', subdomain);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}