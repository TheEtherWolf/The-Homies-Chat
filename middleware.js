import { getToken } from "next-auth/jwt"
import { NextResponse } from "next/server"

// List of paths that don't require authentication
const publicPaths = [
  "/",
  "/auth/signin",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/error",
  "/api/auth/",
  "/_next/",
  "/favicon.ico"
]

// List of API routes that don't require authentication
const publicApiRoutes = [
  "/api/public/"
]

export async function middleware(req) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (publicPaths.some(path => 
    pathname === path || 
    pathname.startsWith(`${path}`) ||
    (path.endsWith('/') && pathname.startsWith(path.slice(0, -1)))
  )) {
    return NextResponse.next()
  }

  // Allow public API routes
  if (publicApiRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Check for the session token
  const token = await getToken({ 
    req, 
    secret: process.env.NEXTAUTH_SECRET 
  })
  
  // If there's no token and the user is trying to access a protected route
  if (!token) {
    // Store the current URL for redirecting back after login
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    
    // If this is an API route, return a 401
    if (pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    // For non-API routes, redirect to sign in
    return NextResponse.redirect(signInUrl)
  }

  // If user is authenticated but hasn't completed setup
  if (token && !token.setupComplete && !pathname.startsWith('/setup')) {
    const setupUrl = new URL('/setup', req.url)
    setupUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(setupUrl)
  }

  // If user is authenticated and has completed setup, or is on a setup page
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
