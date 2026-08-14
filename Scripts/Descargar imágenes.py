import csv
import os
import time

import Común

CARPETA_JUGADORES = Común.ruta_datos(os.path.join("Imágenes", "Jugadores"))
CARPETA_EQUIPOS = Común.ruta_datos(os.path.join("Imágenes", "Equipos"))
CARPETA_COMPETICIONES = Común.ruta_datos(os.path.join("Imágenes", "Competiciones"))

URL_ESCUDO = "https://static.futbolfantasy.com/uploads/images/cabecera/hd/{id_equipo}.png"

URLS_COMPETICIONES = {
    "laliga": "https://static.futbolfantasy.com/uploads/images/logos_competiciones/laliga2023.png",
}

BUCKET_IMAGENES = "imagenes"


def listar_fotos_jugadores(ruta_archivo=Común.ruta_datos("Datos Jugadores.csv")):
    if not os.path.isfile(ruta_archivo):
        return []
    with open(ruta_archivo, encoding="utf-8") as f:
        return [
            (fila["ID"], fila["Foto"])
            for fila in csv.DictReader(f)
            if fila.get("ID") and fila.get("Foto") and Común.PATRON_ID_JUGADOR.match(fila["ID"])
        ]


def descargar_si_falta(sesion, url, ruta_destino, ruta_storage, url_supabase, clave_servicio):
    if os.path.isfile(ruta_destino):
        return
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

        for id_equipo in Común.ID_A_NOMBRE_CORTO:
            try:
                descargar_si_falta(
                    sesion,
                    URL_ESCUDO.format(id_equipo=id_equipo),
                    os.path.join(CARPETA_EQUIPOS, f"{id_equipo}.png"),
                    f"equipos/{id_equipo}.png",
                    url_supabase, clave_servicio,
                )
            except Común.ErrorBloqueo:
                break
            except Exception:
                continue

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
