import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

/** Short-lived cache to avoid repeated getUser() work on rapid navigations (same cookie snapshot). */
const SESSION_CACHE_TTL_MS = 2500;
const SESSION_CACHE_MAX = 96;
type Cached = { user: User | null; exp: number };
const sessionCache = new Map<string, Cached>();

/** `undefined` = cache miss; `User | null` = hit (null = no session). */
function readSessionCache(key: string): User | null | undefined {
  const row = sessionCache.get(key);
  if (!row) return undefined;
  if (row.exp < Date.now()) {
    sessionCache.delete(key);
    return undefined;
  }
  return row.user;
}

function writeSessionCache(key: string, user: User | null) {
  while (sessionCache.size >= SESSION_CACHE_MAX) {
    const first = sessionCache.keys().next().value as string | undefined;
    if (first) sessionCache.delete(first);
    else break;
  }
  sessionCache.set(key, { user, exp: Date.now() + SESSION_CACHE_TTL_MS });
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const cookieKey = request.headers.get("cookie") ?? "";
  let user: User | null;
  if (cookieKey) {
    const cached = readSessionCache(cookieKey);
    if (cached !== undefined) {
      user = cached;
    } else {
      const { data } = await supabase.auth.getUser();
      user = data.user ?? null;
      writeSessionCache(cookieKey, user);
    }
  } else {
    const { data } = await supabase.auth.getUser();
    user = data.user ?? null;
  }
  const onboarded = Boolean(user?.user_metadata?.onboarded);

  // Admin route: only the authenticated owner can access; everyone else -> /feed.
  const ownerEmail = "armaansharma2311@gmail.com";
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.email !== ownerEmail) {
      return NextResponse.redirect(new URL("/feed", request.url));
    }
    return response;
  }

  // Protected routes - redirect to auth if not logged in
  const protectedRoutes = [
    "/feed",
    "/messages",
    "/profile",
    "/onboarding",
    "/post",
    "/notifications",
    "/settings",
  ];
  const isProtectedRoute = protectedRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isProtectedRoute && !user) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  // New users go to onboarding; returning users go to feed.
  if (user && !onboarded && request.nextUrl.pathname.startsWith("/feed")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Auth routes - redirect to feed if already logged in
  const authRoutes = ["/auth"];
  const isAuthRoute = authRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  );

  if (isAuthRoute && user) {
    return NextResponse.redirect(new URL(onboarded ? "/feed" : "/onboarding", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/feed/:path*",
    "/messages/:path*",
    "/profile/:path*",
    "/onboarding/:path*",
    "/post/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/auth/:path*",
  ],
};
