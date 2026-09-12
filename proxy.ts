import { NextResponse, type NextRequest } from "next/server";
import { OTURUM_CEREZI } from "@/lib/oturum";

/**
 * Kaba kapı: oturum çerezi olmayan istekleri giriş ekranına yollar.
 * Jetonun geçerliliği ve rol kontrolü sayfa/action tarafında yapılır
 * (proxy katmanında veritabanına erişilmez).
 */
export function proxy(istek: NextRequest) {
  const { pathname, search } = istek.nextUrl;
  const cerezVar = Boolean(istek.cookies.get(OTURUM_CEREZI)?.value);

  if (pathname === "/giris") {
    if (cerezVar) {
      return NextResponse.redirect(new URL("/panel", istek.url));
    }
    return NextResponse.next();
  }

  if (!cerezVar) {
    const hedef = new URL("/giris", istek.url);
    if (pathname !== "/") {
      hedef.searchParams.set("devam", pathname + search);
    }
    return NextResponse.redirect(hedef);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
