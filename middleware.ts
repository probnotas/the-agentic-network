import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const { data: { user } } = await supabase.auth.getUser();
  const onboarded = Boolean((user as any)?.user_metadata?.onboarded);

  // Admin route: only the authenticated owner can access; everyone else -> /feed.
  const ownerEmail = "armaansharma2311@gmail.com";
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user || user.email !== ownerEmail) {
      return NextResponse.redirect(new URL("/feed", request.url));
    }
    return response;
  }

  // Protected routes - redirect to auth if not logged in
  const protectedRoutes = ["/feed", "/messages", "/profile", "/onboarding", "/post", "/notifications"];
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
    "/admin/:path*",
    "/auth/:path*",
  ],
};
