import time

import Común


def guardar_csv(jugadores, ruta_archivo=Común.ruta_datos("Datos Titularidad.csv")):
    columnas = ["Equipo", "Jugador", "Porcentaje de titularidad", "Diferencia", "Diferencia porcentaje", "Tendencia"]
    filas = [
        {
            "Equipo": jugador["equipo"],
            "Jugador": jugador["nombre"],
            "Porcentaje de titularidad": jugador["titularidad"],
            "Diferencia": jugador["diferencia"],
            "Diferencia porcentaje": jugador["diferencia_pct"],
            "Tendencia": jugador["tendencia"],
        }
        for jugador in jugadores
    ]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()

    try:
        html = Común.descargar_pagina(sesion, Común.URL_MERCADO)
    except Común.ErrorBloqueo:
        html = None

    if html is not None:
        jugadores = Común.leer_tabla_mercado(html)
        if jugadores:
            guardar_csv(jugadores)

    time.sleep(1)
