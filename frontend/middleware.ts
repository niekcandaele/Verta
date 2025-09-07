import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Handle redirects from old URL format to new format
  // Old format: /channel/{uuid}/1 → New format: /channel/{slug}
  const oldChannelPattern = /^\/channel\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)/i;
  const match = pathname.match(oldChannelPattern);
  
  if (match) {
    // For now, redirect to the channel ID-based URL without page number
    // In the future, this could look up the slug from a mapping
    const channelId = match[1];
    const newUrl = new URL(`/channel/${channelId}`, request.url);
    
    // Preserve query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      newUrl.searchParams.set(key, value);
    });
    
    return NextResponse.redirect(newUrl, 301); // Permanent redirect
  }

  // Only protect /admin routes
  if (pathname.startsWith('/admin')) {
    const authHeader = request.headers.get('authorization');
    const adminKey = process.env.ADMIN_API_KEY || 'ikbeneenaap';
    
    // Check if authorization is provided
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new NextResponse('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Access"',
        },
      });
    }

    // Decode and verify credentials
    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
      const [username, password] = credentials.split(':');

      // Verify username is "admin" and password matches ADMIN_API_KEY
      if (username !== 'admin' || password !== adminKey) {
        return new NextResponse('Invalid credentials', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Admin Access"',
          },
        });
      }
    } catch (error) {
      return new NextResponse('Invalid authentication format', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin Access"',
        },
      });
    }
  }

  return NextResponse.next();
}

// Configure which paths the middleware should run on
export const config = {
  matcher: ['/admin/:path*', '/channel/:path*'],
};