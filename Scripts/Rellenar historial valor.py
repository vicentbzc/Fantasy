import time

import psycopg2
from psycopg2.extras import execute_values

import Común


def main():
    sesion = Común.crear_sesion()
    token = Común.obtener_token_laliga_fantasy(sesion)
    catalogo = Común.descargar_json_autenticado(
        sesion, f"{Común.URL_BASE_LALIGA_FANTASY}/players?x-lang=es", token
    )

    jugadores = []
    for jugador in catalogo:
        posicion = Común.MAPA_POSICION_OFICIAL.get(str(jugador.get("positionId")))
        if posicion is None:
            continue
        equipo = Común.equipo_oficial_a_nombre_largo(jugador.get("teamId"))
        if equipo is None:
            continue
        jugadores.append({
            "id": jugador.get("id"),
            "nombre": jugador.get("nickname", ""),
            "equipo": equipo,
        })

    print(f"{len(jugadores)} jugadores a consultar")

    filas = []
    for i, jugador in enumerate(jugadores):
        try:
            historial = Común.descargar_json_autenticado(
                sesion,
                f"{Común.URL_BASE_LALIGA_FANTASY}/player/{jugador['id']}/market-value?x-lang=es",
                token,
            )
        except Común.ErrorBloqueo as error:
            print(f"[{i + 1}/{len(jugadores)}] {jugador['nombre']}: bloqueado, {error}")
            time.sleep(1)
            continue

        for entrada in historial:
            fecha_texto = entrada.get("date", "")
            valor = entrada.get("marketValue")
            if not fecha_texto or valor is None:
                continue
            filas.append((
                jugador["id"],
                jugador["nombre"],
                fecha_texto[:10],
                jugador["equipo"],
                int(valor),
            ))

        if (i + 1) % 50 == 0:
            print(f"[{i + 1}/{len(jugadores)}] procesados")
        time.sleep(1)

    print(f"{len(filas)} filas de histórico descargadas, subiendo a Supabase...")

    conexion = psycopg2.connect(Común.obtener_configuracion("DATABASE_URL"))
    try:
        with conexion.cursor() as cur:
            execute_values(
                cur,
                """
                insert into historial_valor (id, jugador, fecha, equipo, valor)
                values %s
                on conflict (id, fecha) do nothing
                """,
                filas,
            )
        conexion.commit()
    finally:
        conexion.close()

    print("Hecho.")


if __name__ == "__main__":
    main()
