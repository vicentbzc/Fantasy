import csv
import os
import time

import Común

CARPETA_JUGADORES = Común.ruta_datos(os.path.join("Imágenes", "Jugadores"))
CARPETA_EQUIPOS = Común.ruta_datos(os.path.join("Imágenes", "Equipos"))
CARPETA_COMPETICIONES = Común.ruta_datos(os.path.join("Imágenes", "Competiciones"))

URL_TEAMS_MASTER = "https://fantasy-api.llt-services.com/api/v3/teams-master?x-lang=es"

URLS_COMPETICIONES = {
    "laliga": "https://static.futbolfantasy.com/uploads/images/logos_competiciones/laliga2023.png",
}

BUCKET_IMAGENES = "imagenes"

NOMBRE_CORTO_A_ID_OFICIAL = {corto: id_oficial for id_oficial, corto in Común.MAPA_EQUIPO_ID_OFICIAL_A_CORTO.items()}


def listar_fotos_jugadores(ruta_archivo=Común.ruta_datos("Datos Fotos.csv")):
    if not os.path.isfile(ruta_archivo):
        return []
    with open(ruta_archivo, encoding="utf-8") as f:
        return [
            (fila["ID"], fila["Foto"])
            for fila in csv.DictReader(f)
            if fila.get("ID") and fila.get("Foto") and fila["ID"].isdigit()
        ]


def obtener_equipos_oficiales(sesion, token):
    equipos = Común.descargar_json_autenticado(sesion, URL_TEAMS_MASTER, token)
    return {int(equipo["id"]): equipo for equipo in equipos}


def guardar_nombres_oficiales(filas, ruta_archivo=Común.ruta_datos("Datos Equipos.csv")):
    Común.guardar_csv(ruta_archivo, ["Equipo", "Nombre oficial"], filas)


def descargar_si_falta(sesion, url, ruta_destino, ruta_storage, url_supabase, clave_servicio):
    if os.path.isfile(ruta_destino):
        return
    descargar_siempre(sesion, url, ruta_destino, ruta_storage, url_supabase, clave_servicio)


def descargar_siempre(sesion, url, ruta_destino, ruta_storage, url_supabase, clave_servicio):
    contenido = Común.descargar_binario(sesion, url)
    Común.subir_a_storage(url_supabase, BUCKET_IMAGENES, ruta_storage, contenido, clave_servicio)
    Común.guardar_binario(ruta_destino, contenido)
    time.sleep(0.3)


if __name__ == "__main__":
    os.makedirs(CARPETA_JUGADORES, exist_ok=True)
    os.makedirs(CARPETA_EQUIPOS, exist_ok=True)
    os.makedirs(CARPETA_COMPETICIONES, exist_ok=True)

    url_supabase = Común.obtener_configuracion("SUPABASE_URL")
    clave_servicio = Común.obtener_configuracion("SUPABASE_SERVICE_ROLE_KEY")

    sesion = Común.crear_sesion()

    try:
        for id_jugador, url_foto in listar_fotos_jugadores():
            try:
                descargar_si_falta(
                    sesion, url_foto,
                    os.path.join(CARPETA_JUGADORES, f"{id_jugador}.png"),
                    f"jugadores/{id_jugador}.png",
                    url_supabase, clave_servicio,
                )
            except Común.ErrorBloqueo:
                break
            except Exception:
                continue

        try:
            token = Común.obtener_token_laliga_fantasy(sesion)
            equipos_oficiales = obtener_equipos_oficiales(sesion, token)
        except Común.ErrorBloqueo:
            equipos_oficiales = {}

        nombres_oficiales = []
        for id_equipo, nombre_corto in Común.ID_A_NOMBRE_CORTO.items():
            id_oficial = NOMBRE_CORTO_A_ID_OFICIAL.get(nombre_corto)
            equipo_oficial = equipos_oficiales.get(id_oficial) if id_oficial else None
            if equipo_oficial is None:
                continue

            nombres_oficiales.append({
                "Equipo": Común.MAPA_EQUIPOS[nombre_corto],
                "Nombre oficial": equipo_oficial["name"],
            })

            url_escudo = equipo_oficial.get("badgeColor", "")
            if not url_escudo.startswith(Común.PREFIJO_ASSETS_LALIGA_FANTASY):
                continue
            try:
                descargar_siempre(
                    sesion,
                    url_escudo,
                    os.path.join(CARPETA_EQUIPOS, f"{id_equipo}.png"),
                    f"equipos/{id_equipo}.png",
                    url_supabase, clave_servicio,
                )
            except Común.ErrorBloqueo:
                break
            except Exception:
                continue

        if nombres_oficiales:
            guardar_nombres_oficiales(nombres_oficiales)

        for slug, url_competicion in URLS_COMPETICIONES.items():
            try:
                descargar_si_falta(
                    sesion,
                    url_competicion,
                    os.path.join(CARPETA_COMPETICIONES, f"{slug}.png"),
                    f"competiciones/{slug}.png",
                    url_supabase, clave_servicio,
                )
            except Común.ErrorBloqueo:
                break
            except Exception:
                continue
    except KeyboardInterrupt:
        pass
