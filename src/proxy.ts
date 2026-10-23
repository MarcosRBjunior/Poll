import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie, updateSession } from "@/lib/supabase/proxy";

// Renova a sessão e adianta o redirecionamento de /admin sem sessão para /login,
// guardando a origem em `next`. A checagem de verdade é no servidor (admin/layout.tsx).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin") && !hasSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
