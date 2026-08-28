import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|apple-touch-icon).*)",
  ],
};

const NOMBRE_COOKIE = "fantasy_acceso";
const UN_ANIO = 60 * 60 * 24 * 365;

const PAGINA_BLOQUEO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Acceso restringido</title></head><body style="font-family:system-ui,-apple-system,sans-serif;max-width:30rem;margin:22vh auto;padding:0 1.5rem;text-align:center;color:#1D1D1F"><h1 style="font-size:1.25rem;margin:0 0 .5rem">Acceso restringido</h1><p style="color:#6e6e73;line-height:1.5;margin:0">Esta web es privada. Ábrela desde tu enlace de acceso.</p></body></html>`;

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const clave = process.env.SITE_ACCESS_KEY;
  if (!clave) {
    return NextResponse.next();
  }

  if (request.cookies.get(NOMBRE_COOKIE)?.value === clave) {
    return NextResponse.next();
  }

  if (request.nextUrl.searchParams.get("acceso") === clave) {
    const destino = request.nextUrl.clone();
    destino.searchParams.delete("acceso");
    const respuesta = NextResponse.redirect(destino);
    respuesta.cookies.set(NOMBRE_COOKIE, clave, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: UN_ANIO,
      path: "/",
    });
    return respuesta;
  }

  const cabecera = request.headers.get("authorization");
  if (cabecera?.startsWith("Basic ")) {
    const descifrado = Buffer.from(cabecera.slice(6), "base64").toString("utf-8");
    if (descifrado.slice(descifrado.indexOf(":") + 1) === clave) {
      return NextResponse.next();
    }
  }

  return new NextResponse(PAGINA_BLOQUEO, {
    status: 401,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
