import { NextResponse, type NextRequest } from "next/server";
import {
  isRespondentToken,
  newRespondentToken,
  RESPONDENT_COOKIE,
  respondentCookieOptions,
} from "@/lib/respondent";
import { hasSessionCookie, updateSession } from "@/lib/supabase/proxy";

// Renova a sessão, cria o cookie de respondente em /s/* e adianta o redirecionamento de
// /admin sem sessão para /login, guardando a origem em `next`. A checagem de verdade é no
// servidor (admin/layout.tsx).
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/admin") && !hasSessionCookie(request)) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  const response = await updateSession(request);
  // Cookie de respondente criado na primeira visita a uma pesquisa (spec 6.5).
  if (
    pathname.startsWith("/s/") &&
    !isRespondentToken(request.cookies.get(RESPONDENT_COOKIE)?.value)
  ) {
    response.cookies.set(RESPONDENT_COOKIE, newRespondentToken(), respondentCookieOptions);
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
