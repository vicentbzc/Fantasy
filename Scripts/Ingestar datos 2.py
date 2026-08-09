import csv
import json
import os
import re
import time

from bs4 import BeautifulSoup

import Común

RUTA_CACHE_SLUGS = Común.ruta_datos("Datos 5.csv")

PATRON_SLUG = re.compile(r"^[a-z0-9-]+$")

HEADERS_XHR = {"X-Requested-With": "XMLHttpRequest"}

AMARILLAS_PARA_ROJA = 5


def listar_jugadores_del_mercado(sesion):
    html = Común.descargar_pagina(sesion, Común.URL_MERCADO)
    return [
        {"id": j["id"], "nombre_corto": j["nombre"], "equipo": j["equipo"]}
        for j in Común.leer_tabla_mercado(html)
    ]


def cargar_cache_slugs(ruta=RUTA_CACHE_SLUGS):
    cache = {}
    if os.path.isfile(ruta):
        with open(ruta, encoding="utf-8") as f:
            for fila in csv.DictReader(f):
                id_jugador = fila.get("ID")
                slug = fila.get("Slug")
                if id_jugador and slug and Común.PATRON_ID_JUGADOR.match(id_jugador) and PATRON_SLUG.match(slug):
                    cache[id_jugador] = fila
    return cache


def guardar_en_cache_slugs(id_jugador, slug, ruta=RUTA_CACHE_SLUGS):
    archivo_existe = os.path.isfile(ruta)
    with open(ruta, "a", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=["ID", "Slug"])
        if not archivo_existe:
            escritor.writeheader()
        escritor.writerow({"ID": id_jugador, "Slug": slug})


def descubrir_slug(sesion, id_jugador):
    html = Común.descargar_pagina(
        sesion,
        f"https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado/detalle/{id_jugador}",
        headers_extra=HEADERS_XHR,
    )
    soup = BeautifulSoup(html, "html.parser")
    enlace = soup.select_one('a[href^="https://www.futbolfantasy.com/jugadores/"]')
    if not enlace:
        return None
    slug = enlace["href"].rstrip("/").rsplit("/", 1)[-1]
    if not PATRON_SLUG.match(slug):
        return None
    return slug


PATRON_ABREVIATURA_LIGAMENTO = re.compile(r"\blig\.")


def obtener_estado(html_ficha):
    soup = BeautifulSoup(html_ficha, "lxml")
    elemento = soup.select_one(".disponible, .lesionado, .sancionado")
    if not elemento:
        return ""

    frases = [
        span.get_text(" ", strip=True)
        for contenedor in elemento.select(".datos, .comentario")
        for span in contenedor.find_all("span", recursive=False)
        if span.get_text(strip=True)
    ]

    if frases:
        texto = frases[0] if len(frases) == 1 else f"{frases[0]}, {frases[1][0].lower()}{frases[1][1:]}"
    else:
        texto = elemento.get_text(" ", strip=True)

    return PATRON_ABREVIATURA_LIGAMENTO.sub("ligamento", texto)


def obtener_minutos_jugados(html_ficha):
    soup = BeautifulSoup(html_ficha, "lxml")
    for bloque in soup.select(".bigstat"):
        etiqueta = bloque.select_one(".label")
        valor = bloque.select_one(".value")
        if etiqueta and valor and "Minutos jugados" in etiqueta.get_text():
            return valor.get_text(strip=True)
    return ""


PATRON_LINEA_DESGLOSE = re.compile(r"^(?:(-?[\d.,]+)\s+)?(.+?)\s+(-?[\d.,]+)\s*p$")


def obtener_desglose_puntos(html_ficha):
    soup = BeautifulSoup(html_ficha, "lxml")
    desglose_por_jornada = {}

    for fila_desglose in soup.select("tr.desglose"):
        bloque = fila_desglose.select_one(".desg.laliga-fantasy")
        if not bloque:
            continue

        fila_jornada = fila_desglose.find_previous_sibling("tr")
        celda_jornada = fila_jornada.select_one(".jorn-td") if fila_jornada else None
        texto_jornada = celda_jornada.get_text(strip=True) if celda_jornada else ""
        if not texto_jornada.isdigit():
            continue
        numero_jornada = int(texto_jornada)

        partes = []
        for item in bloque.select(".estadistica"):
            coincidencia = PATRON_LINEA_DESGLOSE.match(item.get_text(" ", strip=True))
            if not coincidencia:
                continue
            cantidad, nombre, puntos_texto = coincidencia.groups()
            puntos = float(puntos_texto.replace(",", "."))
            palabra = "punto" if abs(puntos) == 1 else "puntos"
            puntos_texto = str(int(puntos)) if puntos == int(puntos) else str(puntos)
            prefijo = f"{cantidad} " if cantidad else ""
            nombre_formateado = "Puntos DAZN" if nombre.strip().lower() == "puntos dazn" else nombre.lower()
            partes.append(f"{prefijo}{nombre_formateado}: {puntos_texto} {palabra}")

        desglose_por_jornada[numero_jornada] = ", ".join(partes) if partes else "sin estadísticas destacadas"

    return desglose_por_jornada


def procesar_estadisticas(html_stats):
    soup = BeautifulSoup(html_stats, "html.parser")
    eventos = []

    for fila in soup.select(".sd-row[data-jornada]"):
        if fila.get("data-not-played") == "1":
            continue

        jornada_texto = fila.get("data-jornada", "")
        numero_jornada = int(re.sub(r"\D", "", jornada_texto) or 0)

        try:
            puntos_por_juego = json.loads(fila.get("data-puntos", "{}"))
        except (json.JSONDecodeError, TypeError):
            puntos_por_juego = {}
        puntos = puntos_por_juego.get("laliga-fantasy", "")

        amarillas = int(fila.get("data-tarjetas-amarillas", "0") or 0)
        roja = fila.get("data-tarjeta-roja", "0") not in ("0", "", None)

        eventos.append({
            "numero": numero_jornada,
            "jornada": f"Jornada {numero_jornada}",
            "puntos": puntos,
            "amarillas_este_partido": amarillas,
            "roja_este_partido": roja,
        })

    eventos.sort(key=lambda e: e["numero"])

    contador = 0
    for evento in eventos:
        contador += evento["amarillas_este_partido"]
        if contador >= AMARILLAS_PARA_ROJA:
            contador = 0
        evento["amarillas_acumuladas"] = contador

    return eventos


def guardar_puntos_por_jornada(filas, ruta_archivo=Común.ruta_datos("Datos 4.csv")):
    columnas = ["Equipo", "ID", "Jugador", "Jornada", "Puntos", "Estadísticas", "Tarjetas amarillas acumuladas"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


def guardar_fichas(filas, ruta_archivo=Común.ruta_datos("Datos 2.csv")):
    columnas = ["Equipo", "ID", "Jugador", "Estado", "Minutos jugados"]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()

    jugadores = listar_jugadores_del_mercado(sesion)

    cache_slugs = cargar_cache_slugs()

    filas_fichas = []
    filas_puntos = []

    try:
        for jugador in jugadores:
            id_jugador = jugador["id"]

            try:
                info_cache = cache_slugs.get(id_jugador)
                if info_cache is None:
                    slug = descubrir_slug(sesion, id_jugador)
                    time.sleep(0.5)
                    if slug is None:
                        continue
                    guardar_en_cache_slugs(id_jugador, slug)
                    cache_slugs[id_jugador] = {"ID": id_jugador, "Slug": slug}
                else:
                    slug = info_cache["Slug"]

                html_ficha = Común.descargar_pagina(
                    sesion, f"https://www.futbolfantasy.com/jugadores/{slug}", timeout=30,
                )

                estado = obtener_estado(html_ficha)
                minutos = obtener_minutos_jugados(html_ficha)
                desglose_puntos = obtener_desglose_puntos(html_ficha)
                time.sleep(0.5)

                html_stats = Común.descargar_pagina(sesion, f"https://www.futbolfantasy.com/analytics/stats/detalle/{id_jugador}")
                eventos = procesar_estadisticas(html_stats)
                time.sleep(0.5)
            except Común.ErrorBloqueo:
                break
            except Exception:
                continue

            filas_fichas.append({
                "Equipo": jugador["equipo"],
                "ID": id_jugador,
                "Jugador": jugador["nombre_corto"],
                "Estado": estado,
                "Minutos jugados": minutos,
            })

            for evento in eventos:
                filas_puntos.append({
                    "Equipo": jugador["equipo"],
                    "ID": id_jugador,
                    "Jugador": jugador["nombre_corto"],
                    "Jornada": evento["jornada"],
                    "Puntos": evento["puntos"],
                    "Estadísticas": desglose_puntos.get(evento["numero"], "sin estadísticas destacadas"),
                    "Tarjetas amarillas acumuladas": evento["amarillas_acumuladas"],
                })
    except KeyboardInterrupt:
        pass

    guardar_fichas(filas_fichas)
    guardar_puntos_por_jornada(filas_puntos)
