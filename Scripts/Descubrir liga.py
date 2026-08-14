import Común

if __name__ == "__main__":
    sesion = Común.crear_sesion()
    token = Común.obtener_token_laliga_fantasy(sesion)
    ligas = Común.descargar_json_autenticado(
        sesion,
        f"{Común.URL_BASE_LALIGA_FANTASY}/leagues?x-lang=es",
        token,
    )
    print(ligas)
