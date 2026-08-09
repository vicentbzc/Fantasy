import csv
import os
import re

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup


class ErrorBloqueo(Exception):
    pass


MAPA_EQUIPOS = {
    "Sevilla": "Sevilla Fútbol Club",
    "Athletic": "Athletic Club",
    "Barcelona": "Fútbol Club Barcelona",
    "Espanyol": "Real Club Deportivo Espanyol de Barcelona",
    "Real Madrid": "Real Madrid",
    "Atlético": "Atlético de Madrid",
    "Deportivo": "Real Club Deportivo de A Coruña",
    "Betis": "Real Betis Balompié",
    "Levante": "Levante Unión Deportiva",
    "Real Sociedad": "Real Sociedad de Fútbol",
    "Racing": "Real Racing Club de Santander",
    "Valencia": "Valencia Club de Fútbol",
    "Osasuna": "Club Atlético Osasuna",
    "Alavés": "Deportivo Alavés",
    "Elche": "Elche Club de Fútbol",
    "Villarreal": "Villarreal Club de Fútbol",
    "Celta": "Real Club Celta de Vigo",
    "Rayo": "Rayo Vallecano de Madrid",
    "Getafe": "Getafe Club de Fútbol",
    "Málaga": "Málaga Club de Fútbol",
}

MAPA_EQUIPOS_INVERSO = {oficial: corto for corto, oficial in MAPA_EQUIPOS.items()}

POSICIONES_VALIDAS = {"Portero", "Defensa", "Mediocampista", "Delantero"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

URL_MERCADO = "https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado"

PATRON_ID_JUGADOR = re.compile(r"^\d+$")

CARPETA_DATOS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "Datos"))
os.makedirs(CARPETA_DATOS, exist_ok=True)


def ruta_datos(nombre_archivo):
    return os.path.join(CARPETA_DATOS, nombre_archivo)


def crear_sesion():
    sesion = requests.Session()
    sesion.headers.update(HEADERS)
    reintentos = Retry(
        total=2,
        backoff_factor=0.5,
        status_forcelist=[500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adaptador = HTTPAdapter(max_retries=reintentos)
    sesion.mount("https://", adaptador)
    sesion.mount("http://", adaptador)
    return sesion


def descargar_pagina(sesion, url, timeout=20, headers_extra=None):
    respuesta = sesion.get(url, timeout=timeout, headers=headers_extra)
    if respuesta.status_code in (403, 429):
        raise ErrorBloqueo(f"la web ha respondido {respuesta.status_code} en {url}")
    respuesta.raise_for_status()
    return respuesta.text


def formatear_miles(numero):
    return f"{int(numero):,}".replace(",", ".")


def guardar_csv(ruta_archivo, columnas, filas):
    ruta_temporal = f"{ruta_archivo}.tmp"
    with open(ruta_temporal, "w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=columnas)
        escritor.writeheader()
        escritor.writerows(filas)
    os.replace(ruta_temporal, ruta_archivo)


def leer_tabla_mercado(html):
    soup = BeautifulSoup(html, "html.parser")
    jugadores = []

    for fila in soup.select("tr.elemento_jugador"):
        try:
            jugador = _leer_fila_mercado(fila)
        except Exception:
            continue
        if jugador is not None:
            jugadores.append(jugador)

    return jugadores


def _leer_fila_mercado(fila):
    posicion = fila.get("data-posicion", "")
    if posicion not in POSICIONES_VALIDAS:
        return None

    id_jugador = fila.get("data-id", "")
    if not PATRON_ID_JUGADOR.match(id_jugador):
        return None

    equipo_corto = fila.select_one(".player-equipo span")
    equipo_corto = equipo_corto.get_text(strip=True) if equipo_corto else ""
    equipo = MAPA_EQUIPOS.get(equipo_corto)
    if equipo is None:
        return None

    nombre_tag = fila.select_one(".player-name span.d-none.d-md-inline")
    nombre = nombre_tag.get_text(strip=True) if nombre_tag else fila.get("data-nombre", "").title()
    if not nombre:
        return None

    valor = fila.get("data-valor", "")

    diferencia = fila.get("data-diferencia1", "")
    diferencia_pct_raw = fila.get("data-diferencia-pct1", "")
    diferencia_pct = round(float(diferencia_pct_raw), 2) if diferencia_pct_raw else ""

    celdas = fila.find_all("td")

    icono_aceleracion = celdas[3].find("i") if len(celdas) > 3 else None
    aceleracion = icono_aceleracion.get("data-tooltip", "").strip() if icono_aceleracion else ""
    if aceleracion.lower() == "inflexión negativa":
        aceleracion = "Inflexión negativa"

    tendencia_raw = fila.get("data-tendencia", "0")
    dias_tendencia = abs(int(tendencia_raw))
    tendencia = f"{dias_tendencia} día" if dias_tendencia == 1 else f"{dias_tendencia} días"

    titularidad = ""
    if len(celdas) > 5:
        probabilidad_tag = celdas[5].select_one(".probabilidad-widget span")
        titularidad = probabilidad_tag.get_text(strip=True) if probabilidad_tag else ""

    return {
        "id": id_jugador,
        "nombre": nombre,
        "equipo": equipo,
        "posicion": posicion,
        "titularidad": titularidad,
        "valor": valor,
        "diferencia": diferencia,
        "diferencia_pct": diferencia_pct,
        "aceleracion": aceleracion,
        "tendencia": tendencia,
    }
