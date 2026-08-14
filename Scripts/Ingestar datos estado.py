import re
import time

from bs4 import BeautifulSoup

import Común

PATRON_ABREVIATURA_LIGAMENTO = re.compile(r"\blig\.")


def leer_estado(elemento):
    gravedad = elemento.select_one('.comentario span[class*="gravedad"]')
    if gravedad:
        return PATRON_ABREVIATURA_LIGAMENTO.sub("ligamento", gravedad.get_text(" ", strip=True))

    frases = [
        span.get_text(" ", strip=True)
        for contenedor in elemento.select(".datos, .comentario")
        for span in contenedor.find_all("span", recursive=False)
        if span.get_text(strip=True)
    ]
    texto = frases[0] if frases else elemento.get_text(" ", strip=True)
    return PATRON_ABREVIATURA_LIGAMENTO.sub("ligamento", texto)


def leer_pagina(html):
    soup = BeautifulSoup(html, "html.parser")
    filas = []
    for seccion in soup.select("section.mod"):
        cabecera = seccion.select_one("header.title")
        equipo_corto = cabecera.get_text(strip=True) if cabecera else ""
        equipo = Común.MAPA_EQUIPOS.get(equipo_corto)
        if equipo is None:
            continue
        for elemento in seccion.select(".elemento"):
            enlace = elemento.select_one(".datos a.jugador")
            nombre = enlace.get_text(strip=True) if enlace else ""
            if not nombre:
                continue
            filas.append({"Equipo": equipo, "Jugador": nombre, "Estado": leer_estado(elemento)})
    return filas


def guardar_csv(filas, ruta_archivo=Común.ruta_datos("Datos Estado.csv")):
    Común.guardar_csv(ruta_archivo, ["Equipo", "Jugador", "Estado"], filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()
    filas = []

    for url in (
        "https://www.futbolfantasy.com/laliga/lesionados",
        "https://www.futbolfantasy.com/laliga/sancionados",
    ):
        try:
            html = Común.descargar_pagina(sesion, url)
        except Común.ErrorBloqueo:
            html = None
        if html is not None:
            filas.extend(leer_pagina(html))
        time.sleep(1)

    if filas:
        guardar_csv(filas)

    time.sleep(1)
