import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  const usuarioEsperado = process.env.BASIC_AUTH_USER;
  const claveEsperada = process.env.BASIC_AUTH_PASSWORD;

  if (!usuarioEsperado || !claveEsperada) {
    return NextResponse.next();
  }

  const cabecera = request.headers.get("authorization");

  if (cabecera?.startsWith("Basic ")) {
    const descifrado = Buffer.from(cabecera.slice(6), "base64").toString("utf-8");
    const separador = descifrado.indexOf(":");
    const usuario = descifrado.slice(0, separador);
    const clave = descifrado.slice(separador + 1);

    if (usuario === usuarioEsperado && clave === claveEsperada) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Acceso restringido.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Fantasy", charset="UTF-8"' },
  });
}
