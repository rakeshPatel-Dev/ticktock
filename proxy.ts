import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Proxy (Next.js 16 successor to middleware.ts).
 *
 * Performs a lightweight session-cookie check to protect all app routes.
 * This is NOT a substitute for per-action auth — always call requireUser()
 * inside Server Functions for real validation.
 *
 * Cookie names used by Better Auth:
 *   - better-auth.session_token          (HTTP / dev)
 *   - __Secure-better-auth.session_token (HTTPS production)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let public auth pages through
  if (pathname === '/login' || pathname === '/signup') {
    return NextResponse.next()
  }

  // Let Better Auth API routes through
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  // Check for a session cookie (dev or secure production variant)
  const sessionCookie =
    request.cookies.get('better-auth.session_token') ??
    request.cookies.get('__Secure-better-auth.session_token')

  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api/auth   (Better Auth endpoints)
     * - _next/static (static assets)
     * - _next/image  (image optimisation)
     * - favicon.ico, icon1.png, apple-icon.png, manifest.json (metadata / PWA)
     */
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|icon1\\.png|apple-icon\\.png|manifest\\.json).*)',
  ],
}
