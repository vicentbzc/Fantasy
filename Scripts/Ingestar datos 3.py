import re
import time
from datetime import date as Fecha

from bs4 import BeautifulSoup

import Común

SLUGS_EQUIPO = {
    "Sevilla": "sevilla",
    "Athletic": "athletic",
    "Barcelona": "barcelona",
    "Espanyol": "espanyol",
    "Real Madrid": "real-madrid",
    "Atlético": "atletico",
    "Deportivo": "deportivo",
    "Betis": "betis",
    "Levante": "levante",
    "Real Sociedad": "real-sociedad",
    "Racing": "racing",
    "Valencia": "valencia",
    "Osasuna": "osasuna",
    "Alavés": "alaves",
    "Elche": "elche",
    "Villarreal": "villarreal",
    "Celta": "celta",
    "Rayo": "rayo-vallecano",
    "Getafe": "getafe",
    "Málaga": "malaga",
}

ID_A_NOMBRE_CORTO = {
    1: "Athletic", 2: "Atlético", 3: "Barcelona", 4: "Betis", 5: "Celta",
    6: "Deportivo", 7: "Espanyol", 8: "Getafe", 10: "Levante", 11: "Málaga",
    13: "Osasuna", 14: "Rayo", 15: "Real Madrid", 16: "Real Sociedad",
    17: "Sevilla", 18: "Valencia", 21: "Elche", 22: "Villarreal",
    28: "Alavés", 42: "Racing",
}

MAPA_DIFICULTAD = {
    "vertical_1.jpg": "Muy baja",
    "vertical_2.jpg": "Baja",
    "vertical_3.jpg": "Media",
    "vertical_4.jpg": "Alta",
    "vertical_5.jpg": "Muy alta",
}

DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

MAPA_DIAS_ABREVIADOS = {
    "Lun": "Lunes", "Mar": "Martes", "Mie": "Miércoles", "Jue": "Jueves",
    "Vie": "Viernes", "Sab": "Sábado", "Dom": "Domingo",
}

MINIMO_PARTIDOS_LIGA = 5
MESES_A_MIRAR_COMO_MAXIMO = 4


def formatear_hora(texto_hora):
    if texto_hora.endswith("h") and not texto_hora.endswith(" h"):
        return texto_hora[:-1] + " h"
    return texto_hora


def expandir_dia_semana(fecha_texto):
    partes = fecha_texto.split(" ", 1)
    if len(partes) == 2 and partes[0] in MAPA_DIAS_ABREVIADOS:
        return f"{MAPA_DIAS_ABREVIADOS[partes[0]]} {partes[1]}"
    return fecha_texto


def normalizar_jornada(texto_jornada):
    if re.fullmatch(r"J\d+", texto_jornada):
        return "Jornada " + texto_jornada[1:]
    return texto_jornada


def parsear_fecha_corta(dia, mes, hoy):
    fecha = Fecha(hoy.year, mes, dia)
    if fecha < hoy:
        fecha = Fecha(hoy.year + 1, mes, dia)
    return fecha


def eventos_desde_ficha_equipo(html, nombre_corto):
    soup = BeautifulSoup(html, "html.parser")
    seccion = soup.select_one("section.proximos")
    partidos = seccion.select("a.partido") if seccion else []

    eventos = []
    for partido in partidos:
        competicion_tag = partido.select_one(".logo img")
        competicion = competicion_tag.get("alt", "") if competicion_tag else ""

        local_tag = partido.select_one(".equipo.local img")
        visitante_tag = partido.select_one(".equipo.visitante img")
        local_nombre = local_tag.get("alt", "") if local_tag else ""
        visitante_nombre = visitante_tag.get("alt", "") if visitante_tag else ""
        if local_nombre == nombre_corto:
            rival, localia = visitante_nombre, "Local"
        else:
            rival, localia = local_nombre, "Visitante"

        fase_tag = partido.select_one(".fase")
        jornada = normalizar_jornada(fase_tag.get_text(strip=True) if fase_tag else "")

        date_tag = partido.select_one(".date")
        texto_fecha = date_tag.get_text(" ", strip=True) if date_tag else ""
        if " " in texto_fecha:
            fecha_texto, hora = texto_fecha.rsplit(" ", 1)
        else:
            fecha_texto, hora = texto_fecha, ""
        dia, mes = (int(x) for x in fecha_texto.split()[-1].split("/"))
        fecha_texto = expandir_dia_semana(fecha_texto)
        fecha_obj = parsear_fecha_corta(dia, mes, Fecha.today())

        img_dificultad = partido.select_one(".dificultad-container img.dificultad")
        if img_dificultad:
            archivo = img_dificultad.get("src", "").rsplit("/", 1)[-1]
            dificultad = MAPA_DIFICULTAD.get(archivo, "")
        else:
            dificultad = ""

        eventos.append({
            "fecha_obj": fecha_obj,
            "rival": rival,
            "competicion": competicion,
            "jornada": jornada,
            "fecha_texto": fecha_texto,
            "hora": formatear_hora(hora),
            "local_o_visitante": localia,
            "dificultad": dificultad,
        })

    eventos.sort(key=lambda e: e["fecha_obj"])
    return eventos


def eventos_desde_calendario_mensual(sesion, slug, desde_fecha, partidos_liga_que_faltan):
    eventos = []
    mes, anio = desde_fecha.month, desde_fecha.year

    for _ in range(MESES_A_MIRAR_COMO_MAXIMO):
        if partidos_liga_que_faltan <= 0:
            break

        url = f"https://www.futbolfantasy.com/equipos/{slug}/calendario/{mes}/{anio}"
        html = Común.descargar_pagina(sesion, url)
        soup = BeautifulSoup(html, "html.parser")

        for dia_div in soup.select(".calendar .day"):
            enlace = dia_div.find("a")
            competicion_tag = dia_div.select_one(".competicion img")
            if not enlace or not competicion_tag:
                continue

            competicion = competicion_tag.get("alt", "")

            numero_tag = dia_div.select_one(".number")
            if not numero_tag:
                continue
            dia = int(numero_tag.get_text(strip=True))
            fecha_obj = Fecha(anio, mes, dia)
            if fecha_obj <= desde_fecha:
                continue

            rival_tag = dia_div.select_one(".rival")
            rival = ""
            if rival_tag:
                id_match = re.search(r"escudom/(\d+)\.png", rival_tag.get("data-src", ""))
                if id_match:
                    rival = ID_A_NOMBRE_CORTO.get(int(id_match.group(1)), "")

            jornada_tag = dia_div.select_one(".jornada")
            jornada = normalizar_jornada(jornada_tag.get_text(strip=True) if jornada_tag else "")

            es_local = dia_div.select_one(".fecha .home") is not None
            local_o_visitante = "Local" if es_local else "Visitante"

            hora_tag = dia_div.select_one(".fecha")
            hora_texto = hora_tag.get_text(" ", strip=True) if hora_tag else ""
            hora = formatear_hora(hora_texto.split()[-1]) if hora_texto else ""

            dia_semana = DIAS_SEMANA[fecha_obj.weekday()]
            fecha_texto = f"{dia_semana} {dia:02d}/{mes:02d}"

            eventos.append({
                "fecha_obj": fecha_obj,
                "rival": rival,
                "competicion": competicion,
                "jornada": jornada,
                "fecha_texto": fecha_texto,
                "hora": hora,
                "local_o_visitante": local_o_visitante,
                "dificultad": "",
            })
            if competicion == "LaLiga":
                partidos_liga_que_faltan -= 1
                if partidos_liga_que_faltan <= 0:
                    break

        mes += 1
        if mes > 12:
            mes = 1
            anio += 1
        time.sleep(0.5)

    eventos.sort(key=lambda e: e["fecha_obj"])
    return eventos


def extraer_calendario(sesion, nombre_corto, slug):
    html_ficha = Común.descargar_pagina(sesion, f"https://www.futbolfantasy.com/laliga/equipos/{slug}")
    eventos = eventos_desde_ficha_equipo(html_ficha, nombre_corto)

    partidos_liga = sum(1 for e in eventos if e["competicion"] == "LaLiga")
    if partidos_liga < MINIMO_PARTIDOS_LIGA and eventos:
        faltan = MINIMO_PARTIDOS_LIGA - partidos_liga
        extra = eventos_desde_calendario_mensual(sesion, slug, eventos[-1]["fecha_obj"], faltan)
        eventos.extend(extra)

    unir = lambda clave: " | ".join(e[clave] for e in eventos)
    rivales_oficiales = " | ".join(Común.MAPA_EQUIPOS.get(e["rival"], e["rival"]) for e in eventos)
    return {
        "Siguientes rivales": rivales_oficiales,
        "Competición": unir("competicion"),
        "Jornada": unir("jornada"),
        "Día": unir("fecha_texto"),
        "Hora": unir("hora"),
        "Estadio": unir("local_o_visitante"),
        "Dificultad de los rivales": unir("dificultad"),
    }


def guardar_csv(filas, ruta_archivo=Común.ruta_datos("Datos 3.csv")):
    columnas = [
        "Equipo", "Siguientes rivales", "Competición", "Jornada",
        "Día", "Hora", "Estadio", "Dificultad de los rivales",
    ]
    Común.guardar_csv(ruta_archivo, columnas, filas)


if __name__ == "__main__":
    sesion = Común.crear_sesion()

    filas = []
    try:
        for nombre_oficial, nombre_corto in Común.MAPA_EQUIPOS_INVERSO.items():
            slug = SLUGS_EQUIPO[nombre_corto]
            try:
                datos = extraer_calendario(sesion, nombre_corto, slug)
            except Común.ErrorBloqueo:
                break
            except Exception:
                time.sleep(1)
                continue
            datos["Equipo"] = nombre_oficial
            filas.append(datos)
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    guardar_csv(filas)
