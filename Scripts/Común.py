import csv
import importlib.util
import json
import os
import re
import unicodedata

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

ID_A_NOMBRE_CORTO = {
    1: "Athletic", 2: "Atlético", 3: "Barcelona", 4: "Betis", 5: "Celta",
    6: "Deportivo", 7: "Espanyol", 8: "Getafe", 10: "Levante", 11: "Málaga",
    13: "Osasuna", 14: "Rayo", 15: "Real Madrid", 16: "Real Sociedad",
    17: "Sevilla", 18: "Valencia", 21: "Elche", 22: "Villarreal",
    28: "Alavés", 42: "Racing",
}

NOMBRE_OFICIAL_A_ID = {MAPA_EQUIPOS[corto]: id_equipo for id_equipo, corto in ID_A_NOMBRE_CORTO.items()}

POSICIONES_VALIDAS = {"Portero", "Defensa", "Mediocampista", "Delantero"}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

URL_MERCADO = "https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado"

URL_BASE_LALIGA_FANTASY = "https://fantasy-api.llt-services.com/api/v1/competition/1"
URL_LOGIN_LALIGA_FANTASY = "https://login.laliga.es/laligadspprob2c.onmicrosoft.com/oauth2/v2.0/token?p=B2C_1A_ResourceOwnerv2"
CLIENT_ID_LALIGA_FANTASY = "af88bcff-1157-40a0-b579-030728aacf0b"
REDIRECT_URI_LALIGA_FANTASY = "authredirect://com.lfp.laligafantasy"

MAPA_EQUIPO_ID_OFICIAL_A_CORTO = {
    2: "Atlético", 3: "Athletic", 4: "Barcelona", 5: "Betis", 6: "Celta",
    7: "Elche", 8: "Espanyol", 9: "Getafe", 11: "Levante", 12: "Málaga",
    13: "Osasuna", 14: "Rayo", 15: "Real Madrid", 16: "Real Sociedad",
    17: "Sevilla", 18: "Valencia", 20: "Villarreal", 21: "Alavés",
    26: "Deportivo", 49: "Racing",
}

MAPA_POSICION_OFICIAL = {
    "1": "Portero", "2": "Defensa", "3": "Mediocampista", "4": "Delantero",
}


def equipo_oficial_a_nombre_largo(id_equipo_oficial):
    nombre_corto = MAPA_EQUIPO_ID_OFICIAL_A_CORTO.get(int(id_equipo_oficial))
    return MAPA_EQUIPOS.get(nombre_corto) if nombre_corto else None


PREFIJO_ASSETS_LALIGA_FANTASY = "https://assets-fantasy.llt-services.com/"


def normalizar_nombre(texto):
    sin_acentos = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", sin_acentos).strip().lower()

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


def descargar_binario(sesion, url, timeout=20, headers_extra=None):
    respuesta = sesion.get(url, timeout=timeout, headers=headers_extra)
    if respuesta.status_code in (403, 429):
        raise ErrorBloqueo(f"la web ha respondido {respuesta.status_code} en {url}")
    respuesta.raise_for_status()
    return respuesta.content


def guardar_binario(ruta_archivo, contenido):
    ruta_temporal = f"{ruta_archivo}.tmp"
    with open(ruta_temporal, "wb") as f:
        f.write(contenido)
    os.replace(ruta_temporal, ruta_archivo)


RUTA_CONFIGURACION_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Configuración local.py")


def obtener_configuracion(nombre_variable):
    valor = os.environ.get(nombre_variable)
    if valor:
        return valor
    spec = importlib.util.spec_from_file_location("configuracion_local", RUTA_CONFIGURACION_LOCAL)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return getattr(modulo, nombre_variable, None)


def guardar_json(ruta_archivo, datos):
    ruta_temporal = f"{ruta_archivo}.tmp"
    with open(ruta_temporal, "w", encoding="utf-8") as f:
        json.dump(datos, f)
    os.replace(ruta_temporal, ruta_archivo)


def leer_json(ruta_archivo):
    if not os.path.isfile(ruta_archivo):
        return None
    with open(ruta_archivo, encoding="utf-8") as f:
        return json.load(f)


RUTA_TOKEN_LALIGA_FANTASY = os.path.join(CARPETA_DATOS, "Token LaLiga Fantasy.json")


def _iniciar_sesion_laliga_fantasy(sesion, email, password):
    respuesta = sesion.post(
        URL_LOGIN_LALIGA_FANTASY,
        data={
            "grant_type": "password",
            "client_id": CLIENT_ID_LALIGA_FANTASY,
            "scope": f"openid {CLIENT_ID_LALIGA_FANTASY} offline_access",
            "redirect_uri": REDIRECT_URI_LALIGA_FANTASY,
            "username": email,
            "password": password,
            "response_type": "id_token",
        },
        timeout=20,
    )
    if respuesta.status_code in (401, 403, 429):
        raise ErrorBloqueo(f"login de LaLiga Fantasy ha respondido {respuesta.status_code}")
    respuesta.raise_for_status()
    return respuesta.json()


def _refrescar_token_laliga_fantasy(sesion, refresh_token):
    respuesta = sesion.post(
        URL_LOGIN_LALIGA_FANTASY,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": CLIENT_ID_LALIGA_FANTASY,
            "scope": f"openid {CLIENT_ID_LALIGA_FANTASY} offline_access",
        },
        timeout=20,
    )
    if respuesta.status_code in (401, 403, 429):
        raise ErrorBloqueo(f"refresco de token de LaLiga Fantasy ha respondido {respuesta.status_code}")
    respuesta.raise_for_status()
    return respuesta.json()


def obtener_token_laliga_fantasy(sesion):
    cache = leer_json(RUTA_TOKEN_LALIGA_FANTASY)
    if cache is not None and cache.get("refresh_token"):
        try:
            token = _refrescar_token_laliga_fantasy(sesion, cache["refresh_token"])
            guardar_json(RUTA_TOKEN_LALIGA_FANTASY, token)
            return token["access_token"]
        except ErrorBloqueo:
            pass

    email = obtener_configuracion("LALIGA_FANTASY_EMAIL")
    password = obtener_configuracion("LALIGA_FANTASY_PASSWORD")
    token = _iniciar_sesion_laliga_fantasy(sesion, email, password)
    guardar_json(RUTA_TOKEN_LALIGA_FANTASY, token)
    return token["access_token"]


def descargar_json_autenticado(sesion, url, token, timeout=20):
    respuesta = sesion.get(url, timeout=timeout, headers={"Authorization": f"Bearer {token}"})
    if respuesta.status_code in (401, 403, 429):
        raise ErrorBloqueo(f"la API de LaLiga Fantasy ha respondido {respuesta.status_code} en {url}")
    respuesta.raise_for_status()
    return respuesta.json()


def subir_a_storage(url_supabase, bucket, ruta, contenido, clave_servicio):
    respuesta = requests.put(
        f"{url_supabase}/storage/v1/object/{bucket}/{ruta}",
        data=contenido,
        headers={
            "Authorization": f"Bearer {clave_servicio}",
            "Content-Type": "image/png",
            "x-upsert": "true",
        },
        timeout=20,
    )
    respuesta.raise_for_status()


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

    equipo_corto = fila.select_one(".player-equipo span")
    equipo_corto = equipo_corto.get_text(strip=True) if equipo_corto else ""
    equipo = MAPA_EQUIPOS.get(equipo_corto)
    if equipo is None:
        return None

    nombre_tag = fila.select_one(".player-name span.d-none.d-md-inline")
    nombre = nombre_tag.get_text(strip=True) if nombre_tag else fila.get("data-nombre", "").title()
    if not nombre:
        return None

    celdas = fila.find_all("td")

    titularidad = ""
    if len(celdas) > 5:
        probabilidad_tag = celdas[5].select_one(".probabilidad-widget span")
        titularidad = probabilidad_tag.get_text(strip=True) if probabilidad_tag else ""

    return {
        "nombre": nombre,
        "equipo": equipo,
        "titularidad": titularidad,
    }
