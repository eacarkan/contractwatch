import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

import { GATE_COOKIE, isGateOpen } from "./lib/demo-gate";
import { routing } from "./lib/i18n/routing";

const intl = createMiddleware(routing);

function isEnterPage(pathname: string) {
  return routing.locales.some((locale) => pathname === `/${locale}/enter`);
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  const open = await isGateOpen(
    process.env.DEMO_PASSWORD,
    request.cookies.get(GATE_COOKIE)?.value,
  );
  if (!open && !isEnterPage(pathname)) {
    if (isApi) {
      return NextResponse.json({ error: "demoGate" }, { status: 401 });
    }
    const locale =
      routing.locales.find((candidate) =>
        pathname.startsWith(`/${candidate}`),
      ) ?? routing.defaultLocale;
    const target = request.nextUrl.clone();
    target.pathname = `/${locale}/enter`;
    target.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(target);
  }

  return isApi ? NextResponse.next() : intl(request);
}

export const config = {
  // Everything except Next.js internals and files with an extension.
  matcher: "/((?!_next|_vercel|.*\\..*).*)",
};
