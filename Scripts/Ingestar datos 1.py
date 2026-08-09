import csv
import os
import time
from datetime import date

import Común


def guardar_csv(jugadores, ruta_archivo=Común.ruta_datos("Datos 1.csv")):
    columnas = [
        "Equipo", "ID", "Jugador", "Posición", "Porcentaje de titularidad", "Valor",
        "Diferencia de valor", "Porcentaje de diferencia", "Aceleración", "Tendencia",
    ]
    filas = [
        {
            "Equipo": jugador["equipo"],
            "ID": jugador["id"],
            "Jugador": jugador["nombre"],
            "Posición": jugador["posicion"],
            "Porcentaje de titularidad": jugador["titularidad"],
            "Valor": Común.formatear_miles(jugador["valor"]),
            "Diferencia de valor": Común.formatear_miles(jugador["diferencia"]),
            "Porcentaje de diferencia": f"{jugador['diferencia_pct']}%",
            "Aceleración": jugador["aceleracion"],
            "Tendencia": jugador["tendencia"],
        }
        for jugador in jugadores
    ]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_historial(jugadores, ruta_archivo=Común.ruta_datos("Datos 6.csv")):
    hoy = date.today().strftime("%d/%m/%Y")
    columnas = ["Fecha", "Equipo", "ID", "Jugador", "Valor"]

    archivo_existe = os.path.isfile(ruta_archivo)

    if archivo_existe:
        with open(ruta_archivo, encoding="utf-8") as f:
            ya_guardado_hoy = any(fila.startswith(hoy + ",") for fila in f)
        if ya_guardado_hoy:
            return

    with open(ruta_archivo, "a", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=columnas)
        if not archivo_existe:
            escritor.writeheader()
        for jugador in jugadores:
            escritor.writerow({
                "Fecha": hoy,
                "Equipo": jugador["equipo"],
                "ID": jugador["id"],
                "Jugador": jugador["nombre"],
                "Valor": Común.formatear_miles(jugador["valor"]),
            })


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
            guardar_historial(jugadores)

    time.sleep(1)
