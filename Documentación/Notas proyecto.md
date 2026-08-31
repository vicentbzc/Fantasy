# Proyecto Fantasy — notas y decisiones

Este documento existe para que el contexto de por qué está hecho así **no
dependa de recordar una conversación de chat**. Describe el estado
**actual** del proyecto (reescrito el 14/08/2026 tras el Paso 8, que
sustituyó por completo la forma de trabajar anterior — ver "Historia
breve" al final si hace falta el porqué de alguna decisión antigua).

## Qué es esto

Sistema personal para analizar jugadores de LaLiga Fantasy y ver el estado
real de tu liga privada (valores, plantillas, calendario). Sin ánimo de
lucro, sin publicidad, sin marca de LaLiga. El código es público en
GitHub; **los datos (base de datos, credenciales) no**.

## Estructura de carpetas

```
Fantasy/
├── .claude/          (config de Claude Code, no tocar ni mover)
├── Datos/             (CSV/JSON que generan los scripts — no público)
├── Documentación/     (este documento)
├── Scripts/           (todo el código Python + el SQL del esquema)
└── Web/                (la web en Next.js, ver más abajo)
```

`.claude` es la carpeta de configuración de la propia herramienta Claude
Code, no una carpeta de organización del usuario — no tocar ni mover.

`Común.ruta_datos()` calcula la ruta de `Datos/` a partir de dónde está
`Común.py`, así que da igual desde qué carpeta se lancen los scripts.

## Reglas que hay que respetar siempre

- **Ningún archivo de código lleva comentarios ni docstrings — nunca, en
  ninguno, presente ni futuro** (decisión explícita del usuario). Aplica a
  todos los `.py` y a `Esquema base de datos.sql`. Todo el porqué de cada
  cosa vive únicamente en este documento.
- **`Común.py` y los scripts `Ingestar datos ....py` no imprimen nada por
  terminal.** `Sincronizar base de datos.py` es la única excepción del
  pipeline automático (informa de cuántas filas sincroniza cada tabla).
  `Scripts/Descubrir liga.py` también imprime, pero es una utilidad manual
  de un solo uso, no parte del pipeline.
- **La cuenta real de LaLiga Fantasy solo se usa contra la API oficial**,
  nunca contra otro sitio, solo en modo lectura. Credenciales solo en
  `Scripts/Configuración local.py` (fuera de git) o como secreto de
  GitHub Actions — nunca en el código ni pegadas en el chat.
- **Peticiones espaciadas, nunca en ráfaga**, ni a futbolfantasy.com ni a
  la API de LaLiga Fantasy — respetar las frecuencias de la tabla de
  scripts de abajo.
- El código puede ser público; la base de datos con datos reales no.
- **Si GitHub Actions ya tiene un workflow activo contra la base de datos
  real, subir los cambios de pipeline/esquema a GitHub cuanto antes** — no
  dejarlos solo en local. El cron sigue corriendo el código que hay en
  GitHub, no el que tengas en tu PC (ver "Historia breve" para el
  incidente que enseñó esto).

## Fuente de cada dato

| Dato | Fuente | Cómo |
|---|---|---|
| `nombre`, `equipo`, `posicion`, `valor` (oficial), foto de jugador | API LaLiga Fantasy | `Ingestar datos liga.py` |
| `valor_liga` (cláusula si el jugador está en alguna plantilla de tu liga, si no el valor oficial) | API LaLiga Fantasy | `Ingestar datos liga.py` |
| `equipos.nombre_oficial`, escudo de equipo | API LaLiga Fantasy (`v3/teams-master`) | `Descargar imágenes.py` |
| `porcentaje_titularidad` | futbolfantasy.com | `Ingestar datos 1.py` |
| `estado` (tiempo de baja, no la descripción de la lesión) | futbolfantasy.com | `Ingestar datos estado.py` |
| `calendario` | futbolfantasy.com | `Ingestar datos 3.py` |
| `posicion_x`, `posicion_y` (formación táctica real, ver más abajo) | futbolfantasy.com | `Ingestar datos 3.py` |
| `diferencia_valor`, `porcentaje_diferencia`, `tendencia_dias`, `aceleracion` | Calculado por nosotros | `Sincronizar`, comparando contra `historial_valor` |
| `puntos_jornada` (jornada, puntos) | API LaLiga Fantasy (`weekPoints` del catálogo `/players`, sin petición extra) | `Ingestar datos liga.py` |
| `minutos_jugados`, `puntos_jornada_detalle` (desglose por estadística) | API LaLiga Fantasy (`GET /player/{id}`, 1 petición por jugador) | `Ingestar datos detalle.py` |

futbolfantasy.com se raspa **solo** para lo que la API no da: titularidad,
estado, calendario y la formación táctica real (posición en el campo). Los
escudos, el nombre oficial de cada equipo y las fotos de jugador se movieron
de futbolfantasy.com a la API oficial el 19/08/2026 (ver "Paso 9" más abajo)
— antes de esa fecha salían de futbolfantasy.com, decisión que quedó
revertida explícitamente por el usuario.

## `Común.py` — funciones compartidas

- `crear_sesion()`: `requests.Session()` con reintentos automáticos ante
  errores temporales del servidor (500/502/503/504), nunca ante 403/429.
- `descargar_pagina()` / `descargar_binario()`: GET a futbolfantasy.com;
  si responde 403/429 lanza `ErrorBloqueo` (bloqueo/límite de peticiones —
  el script que la llama para ahí mismo, no insiste).
- `descargar_json_autenticado()`: igual pero para la API de LaLiga
  Fantasy con Bearer token (401/403/429 → `ErrorBloqueo`).
- `guardar_csv()` / `guardar_binario()` / `guardar_json()`: escritura
  atómica (a un `.tmp` y luego `os.replace`), para no dejar un archivo a
  medias si el proceso se corta a mitad de escritura.
- `obtener_configuracion(nombre)`: variable de entorno primero (así se le
  pasan los secretos en GitHub Actions), si no existe cae a
  `Configuración local.py` (así funciona igual en local).
- `obtener_token_laliga_fantasy()`: login/refresco de la API de LaLiga
  Fantasy, con caché en `Datos/Token LaLiga Fantasy.json` — ver más abajo.
- `MAPA_EQUIPOS` / `ID_A_NOMBRE_CORTO` / `MAPA_EQUIPO_ID_OFICIAL_A_CORTO` /
  `MAPA_POSICION_OFICIAL`: traducción entre los tres sistemas de nombres
  que hay en juego (nombre corto de futbolfantasy, nombre oficial largo,
  id de equipo oficial de LaLiga Fantasy) — ver "Tres catálogos distintos"
  más abajo.
- `normalizar_nombre()`: quita acentos y pasa a minúsculas, usado por el
  emparejador de nombres de `Sincronizar` (ver más abajo).
- `leer_tabla_mercado()` / `_leer_fila_mercado()`: parsea la tabla de
  mercado de futbolfantasy.com (`tr.elemento_jugador`), de donde salen solo
  `equipo`, `nombre` y `titularidad` — el resto de columnas que esa tabla
  trae (valor, foto, diferencia, aceleración...) no se usan porque vienen
  de la API oficial.
- `PREFIJO_ASSETS_LALIGA_FANTASY`: dominio válido para fotos de jugador y
  escudos (`assets-fantasy.llt-services.com`) — mismo criterio de
  validación por dominio que antes se aplicaba a las fotos de
  futbolfantasy.com.

## Los scripts

| Script | Fuente | Genera | Coste | Cadencia actual |
|---|---|---|---|---|
| `Ingestar datos liga.py` | API LaLiga Fantasy | `Datos Jugadores.csv`, `Datos Historial valor.csv`, `Datos Puntos jornada.csv`, `Datos Mi club.csv` | 1 + 1 + N peticiones autenticadas (N = equipos de tu liga) | Cada 5 minutos (desde el 25/08/2026, antes cada 15 min) |
| `Ingestar datos 1.py` | futbolfantasy.com | `Datos Titularidad.csv` | 1 petición | Cada 5 minutos |
| `Ingestar datos estado.py` | futbolfantasy.com | `Datos Estado.csv` | 2 peticiones | Cada 5 minutos |
| `Ingestar datos 3.py` | futbolfantasy.com | `Datos 3.csv` (calendario, con fecha real desde el 24/08/2026), `Datos Posicion.csv` (formación real) | ~20-40 peticiones | Cada 15 minutos |
| `Descargar imágenes.py` | API LaLiga Fantasy (escudos + nombre oficial) + `Datos Fotos.csv` (fotos, ya con URL oficial) | Sube a Supabase Storage, `Datos Equipos.csv` | 1 petición autenticada + Gratis salvo la primera vez para las imágenes | Cada 5 horas |
| `Ingestar datos detalle.py` | API LaLiga Fantasy | `Datos Puntos jornada detalle.csv`, `Datos Minutos.csv` | 1 + N peticiones autenticadas (N = jugadores con algún punto esta temporada, ~254 a fecha de hoy) | Cada 15 minutos |
| `Sincronizar base de datos.py` | CSV → Postgres | — | — | Después de cualquiera de los anteriores |
| `Notificar Telegram.py` | Postgres | Avisos por Telegram (ver "Decimoséptima ronda") | — | Después de Sincronizar, en cualquiera de los tres disparos |
| `Descubrir liga.py` | API LaLiga Fantasy | imprime tus ligas | 1 petición | Manual, un solo uso |

**Cadencias fijadas por el usuario el 22/08/2026** (ver "Novena ronda" más abajo), no
deducidas por nosotros — el criterio es qué dato de la web depende de cada script, no
el script en sí:
- Imágenes (jugadores, equipos, competiciones): máximo 24h de margen, se dejó en la
  cadencia que ya tenía (~5h) porque ya lo cumplía de sobra.
- Alineaciones probables y próximos partidos (`Ingestar datos 3.py`): máximo 15 min.
- Estado y titularidad: exactamente cada 5 min (no es un máximo, es fijo).
- Todo lo demás que aparece como columna opcional en "Filtros" de `/jugadores`
  (Valor, Puntos, desglose de estadísticas, minutos jugados...): máximo 15 min.

### `Ingestar datos liga.py`

Pide el token, descarga `/players` (catálogo oficial completo, ~715
elementos), la clasificación de tu liga (`standing`) para saber qué
equipos tiene, y la plantilla de **cada uno** de esos equipos (no solo el
tuyo — así se puede leer la cláusula de un compañero si algún día se une
alguno). Para cada jugador del catálogo: se descarta si su posición es
"Entrenador" o su equipo no es uno de los 20 de esta temporada; si no,
`valor` = `marketValue` oficial, `valor_liga` = la cláusula de quien lo
tenga en la liga (de cualquier equipo, no solo el tuyo) o el mismo
`marketValue` si nadie lo tiene, `Foto` = el campo `image` del catálogo
(validado contra `Común.PREFIJO_ASSETS_LALIGA_FANTASY`).

**Puntos por jornada, desde el 22/08/2026**: cada elemento de `/players`
trae también `points` (total de la temporada) y `weekPoints` (lista
`{weekNumber, points}`, una entrada por cada jornada ya jugada, histórico
completo cada vez, no solo la última) — sin ninguna petición extra, es el
mismo catálogo que ya se pedía para el valor. Antes de esta fecha
`Datos Puntos jornada.csv` se escribía con cabecera pero sin filas, a la
espera de encontrar el formato real de `playerStats` (que solo empezó a
devolver datos cuando arrancó la temporada 2026/27). Se investigó
`GET /player/{id}?x-lang=es` (que sí trae el desglose de estadísticas por
jornada, `stats.mins_played`/`goals`/etc.) pero es **una petición por
jugador** — con ~715 jugadores sale carísimo, el mismo problema que ya
forzó a abandonar el `Ingestar datos 2.py` original antes del Paso 8. Por
eso de momento solo se usa `weekPoints` del catálogo bulk (da `Jornada` y
`Puntos`, no el desglose `Estadísticas` ni `Tarjetas amarillas
acumuladas`, que se guardan vacíos) — sigue pendiente el desglose real
por estadística, ver "Pendiente".

### `Ingestar datos 1.py`

Descarga la tabla de mercado de futbolfantasy.com (1 petición, trae los
~600 jugadores de golpe) y guarda solo `Equipo, Jugador, Porcentaje de
titularidad` — el resto de columnas de esa tabla (valor, foto, tendencia,
aceleración...) se descartan porque ya vienen de la API oficial (la foto
se movió aquí desde esta tabla el 19/08/2026, ver "Paso 9").

### `Ingestar datos estado.py`

Descarga `/laliga/lesionados` y `/laliga/sancionados` (páginas ligeras,
~400 KB + ~225 KB) y guarda `Equipo, Jugador, Estado` **solo para los
jugadores que aparecen en alguna de las dos**. `leer_estado()` busca
primero un `span` con clase que empiece por `gravedad-` (el tiempo de
baja, ej. "Duda para la jornada 2", "Baja hasta finales de agosto") — es
lo que se guarda. Si no existe ese span (pasa con los sancionados, que no
tienen incertidumbre médica), se queda con la descripción (ej. "Roja
directa (2/2)"). Un jugador que no aparece en ninguna de las dos páginas
usa **"Disponible para competir"** por defecto (comprobado en directo
contra una ficha real de futbolfantasy.com — es el texto literal que usa
la web, no uno inventado).

### `Ingestar datos 3.py`

Por cada uno de los 20 equipos hace 2 peticiones: la ficha del equipo
(`/laliga/equipos/{slug}`, para `extraer_formacion()`) y su página de
partidos (`/laliga/equipos/{slug}/partidos`, temporada completa, para
`extraer_calendario()`/`eventos_desde_partidos()`) — ver "Dificultad de
partidos lejanos, arreglada de raíz" más abajo para el porqué de la
segunda en vez del calendario mensual antiguo (ya eliminado). Se detiene
en cuanto acumula `MINIMO_PARTIDOS_LIGA` partidos de competición "LaLiga"
(6 desde el 21/08/2026, antes 5 — ver "Quinta ronda" más abajo). Guarda
`Datos 3.csv`: `Equipo, Siguientes rivales, Competición, Jornada, Día,
Hora, Estadio, Dificultad de los rivales` (varios partidos separados por
` | `). Dificultad traducida a mano de la imagen que usa la web: 1=Muy
baja, 2=Baja, 3=Media, 4=Alta, 5=Muy alta (amistosos sin dificultad, a
propósito).

Desde el 19/08/2026 (Paso 9) la misma ficha de equipo que ya se descargaba
para el calendario **también** se usa para `extraer_formacion()`: la web
de futbolfantasy.com pinta la alineación probable como marcadores
`.camiseta-wrapper` con posición absoluta en `style="left: X%; top: Y%"`
sobre el dibujo del campo, y `data-onceff="titular"` en los que forman el
once probable. Sin petición extra (reutiliza el HTML que ya se había
bajado para el calendario). El HTML incluye el mismo marcador **repetido**
más de una vez (vista de escritorio/móvil superpuestas, y para equipos con
rotación incierta, más de un candidato en la misma posición) — por eso
`extraer_formacion()` deduplica primero por slot `(x, y)` y luego por
nombre, quedándose siempre con la `data-probabilidad` más alta de cada
grupo. Aun así, 2-3 equipos con mucha incertidumbre de rotación pueden
salir con más de 11 candidatos; la web (`calcularFormacion()`) recorta a
los 10 de campo con más probabilidad, así que el sobrante simplemente no
se usa. Guarda `Datos Posicion.csv`: `Equipo, Jugador, Posicion X,
Posicion Y, Probabilidad` (valores 0-100, un jugador por fila).

**Banquillo real, desde el 21/08/2026** (ver "Quinta ronda" más abajo):
la misma ficha también tiene marcadores `.camiseta-wrapper` con
`data-onceff="suplente"` para el banquillo (layout en filas de `top: 44px
/ 148px / 250px`, sin coordenadas porcentuales — no se dibujan sobre el
campo). `extraer_suplentes()` los lee igual que los titulares (nombre +
`data-probabilidad`, dedup por nombre) y se guardan **en el mismo**
`Datos Posicion.csv`, con `Posicion X`/`Posicion Y` vacíos — así
`Sincronizar` los emparaja con `emparejar_por_nombre()` exactamente igual
que a los titulares, sin código nuevo en `Sincronizar`. Confirmado en
directo que titulares y suplentes nunca comparten nombre en la misma
ficha (los `data-onceff="titular"` "fantasma" sin `data-probabilidad`
que aparecen por rotación incierta siempre pierden el desempate de
`extraer_formacion()` frente al titular real de esa posición, así que un
suplente real nunca cuela como titular). Antes de este cambio, el
"banquillo" de la web era **puramente sintético** (los jugadores del
catálogo oficial que sobraban de la alineación, ordenados por
`porcentaje_titularidad`) y nunca reflejaba el banquillo real de
futbolfantasy.com — motivo: el usuario vio que Gordon y Adeyemi salían al
50% en el banquillo real de futbolfantasy.com pero no aparecían en
absoluto en el nuestro (ninguno de los dos está en el catálogo oficial de
LaLiga Fantasy bajo el Barça, así que el banquillo sintético no tenía
ninguna fila suya de la que tirar).

**Desde el 21/08/2026, solo si la ficha es de un partido de LIGA** (ver
"Quinta ronda" más abajo): `extraer_rival_ficha()` lee el rival mostrado
en `.alineacion-partido` de la propia ficha (misma estructura
`.equipo.local`/`.equipo.visitante` que `_partido_a_evento()`) y se
compara contra el rival de la próxima jornada de LIGA que ya dio
`eventos_desde_partidos()`. Si no coinciden (la ficha muestra la
alineación de un partido de otra competición que cae antes que la
siguiente jornada de liga), no se guarda ninguna fila de posición **ni de
titulares ni de suplentes** para ese equipo esa vuelta — la web cae sola
al reparto sintético en vez de
mostrar una alineación real pero del partido equivocado.

Desde el 21/08/2026 la `data-probabilidad` que ya se leía para desempatar
duplicados **también** se guarda como columna `Probabilidad` (antes se
calculaba y se descartaba). `Sincronizar` la usa como respaldo de
`porcentaje_titularidad` cuando el emparejador de `Datos Titularidad.csv`
no encuentra pareja — ver "Cálculo de tendencias..." más abajo, en
realidad ver la sección de `Sincronizar` — sin tocar `nombres_coinciden()`
en absoluto, solo como una segunda fuente para el mismo dato. Motivo: se
detectó que jugadores "fantasma" (ver Paso 9) como "Swedberg" del Celta
mostraban "0%"/sin dato en la web aunque futbolfantasy.com sí tenía su
probabilidad real (confirmado en directo: 50%, coincide exacto con la
`data-probabilidad` de esta misma página). Los jugadores fantasma nunca
tienen fila en `jugadores` (no pasan por `Ingestar datos 1.py`), así que
antes de este cambio no había forma de que tuvieran titularidad.

### `Descargar imágenes.py`

Desde el 19/08/2026 (Paso 9) escudos y nombre oficial de equipo salen de
la API oficial (`GET /v3/teams-master?x-lang=es`, con Bearer token igual
que `Ingestar datos liga.py`) en vez de futbolfantasy.com — cada equipo
trae `badgeColor` (escudo a color) y `name` (nombre oficial corto, ej.
"FC Barcelona" en vez de "Fútbol Club Barcelona"). El `id` de
`teams-master` es el mismo espacio de ids que `teamId` en `/players`
(`Común.MAPA_EQUIPO_ID_OFICIAL_A_CORTO`), confirmado en directo contra
los 20 equipos de esta temporada. El escudo se sigue subiendo a
Supabase Storage con la ruta `equipos/{id}.png` usando el id de
`Común.ID_A_NOMBRE_CORTO` (el mismo de siempre, el que usa
`equipos.id` en la base de datos) — así la web no tuvo que cambiar nada
para leer el escudo, solo cambió de dónde sale el archivo que se sube.
Los escudos usan `descargar_siempre()` (sin comprobar si ya existe en
disco, a diferencia de las fotos de jugador) porque solo son 20 archivos
y hacía falta forzar el cambio de fuente en el primer despliegue. El
nombre oficial se guarda en `Datos Equipos.csv` (`Equipo, Nombre oficial`,
`Equipo` = el nombre largo interno de `MAPA_EQUIPOS`) para que
`Sincronizar` lo suba a `equipos.nombre_oficial`.

Fotos de jugador: se leen de `Datos Fotos.csv` (`ID, Foto` con el id
oficial, ya con la URL de la API oficial — generado por `Sincronizar`
directamente desde `Datos Jugadores.csv`, ver más abajo). No vuelve a
descargar/subir lo que ya tiene en disco. Sube cada archivo primero a
Supabase Storage y solo si funciona lo guarda en local (si se hiciera al
revés, un fallo de subida quedaría escondido para siempre).

### `Ingestar datos detalle.py`

Desde el 22/08/2026 (ver "Puntos y desglose por jornada, datos reales"
más abajo para el porqué). Pide el token y el catálogo `/players`
(mismo catálogo que `Ingestar datos liga.py`, petición aparte porque es
un script distinto), se queda solo con los jugadores con `weekPoints` no
vacío (~254 de ~780) y para cada uno pide `GET /player/{id}?x-lang=es`.
De ahí saca el desglose por estadística de cada jornada
(`MAPA_ESTADISTICA` traduce cada campo en inglés a la `nombre` española
que ya usa `ESTADISTICAS_DETALLE` en la web) y los minutos jugados de la
jornada más reciente. Guarda `Datos Puntos jornada detalle.csv`
(`ID, Jugador, Equipo, Jornada, Orden, Estadística, Cantidad, Puntos`) y
`Datos Minutos.csv` (`ID, Minutos`). Corre en el cron pesado (cada
4-6h), no en el ligero — a ~254 peticiones con 1s de espera cada una,
sería demasiado para el cron de cada hora.

## La API de LaLiga Fantasy

No oficial, no documentada por LaLiga — descubierta investigando proyectos
de la comunidad ([Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp))
y verificada en directo con la cuenta real del usuario.

- **Host**: `https://fantasy-api.llt-services.com/api/v1/competition/1`
  (los endpoints de equipos, `v3/teams-master`, son una excepción, ver
  abajo).
- **Login** (`_iniciar_sesion_laliga_fantasy()`): OAuth2 ROPC contra Azure
  B2C (`login.laliga.es/.../oauth2/v2.0/token?p=B2C_1A_ResourceOwnerv2`),
  `grant_type=password`, devuelve `access_token` + `refresh_token` (válido
  ~24h).
- **Refresco** (`_refrescar_token_laliga_fantasy()`): **mismo** endpoint
  que el login, `grant_type=refresh_token` — el endpoint distinto que
  documentaban proyectos de terceros no funciona (`AADB2C90090`).
  `obtener_token_laliga_fantasy()` refresca en cada ejecución en vez de
  loguear con contraseña cada vez; solo hace login completo si no hay
  caché o el refresco falla.
- **Endpoints usados**:
  - `GET /players?x-lang=es` — catálogo completo. Campos: `id`,
    `positionId` (1=Portero, 2=Defensa, 3=Mediocampista [la API lo llama
    "Centrocampista", aquí se traduce], 4=Delantero, 5=Entrenador),
    `nickname`, `marketValue`, `teamId`, `image`. No trae nombre de
    equipo, solo el id.
  - `GET /leagues?x-lang=es` — tus ligas (`Descubrir liga.py`).
  - `GET /leagues/{leagueId}/standing?x-lang=es` — equipos de la liga
    (`team.id`, `team.manager.managerName`).
  - `GET /leagues/{leagueId}/teams/{teamId}?x-lang=es` — plantilla de
    cualquier equipo de la liga, con `players[].buyoutClause`.
  - `GET /player/{id}/market-value?x-lang=es` — histórico real de
    `marketValue` por fecha (descubierto el 14/08/2026, no usado todavía
    en el pipeline — ver "Pendiente").
  - `GET /v3/teams-master?x-lang=es` (nota: `v3`, no `v1/competition/1`) —
    42 clubes de Primera y Segunda. Campos usados: `id`, `name` (nombre
    oficial corto), `badgeColor` (escudo). `GET /teams` (sin `v3`) no
    existe (404). El `id` de este endpoint **es** el mismo `teamId` que
    usa `/players` (confirmado en directo contra los 20 equipos de esta
    temporada vía `Común.MAPA_EQUIPO_ID_OFICIAL_A_CORTO`) — **no**
    coincide con el id que usa futbolfantasy.com, que es un catálogo
    aparte. Usado por `Descargar imágenes.py` desde el 19/08/2026.
- **`valor` vs `valor_liga`**: `marketValue` es el valor base del juego,
  igual en cualquier liga. `buyoutClause` (la cláusula) solo existe para
  jugadores que ya están en la plantilla de algún equipo de una liga
  concreta, y es lo que su manager puede subir a mano — confirmado con un
  caso real (Robin Le Normand, `marketValue` 9.831.352 pero `buyoutClause`
  16.405.623 tras subirla el usuario).

## Tres catálogos distintos, sin clave común

futbolfantasy.com, la API de LaLiga Fantasy y el sistema de ids de cada
uno son independientes entre sí:

- **Equipos**: el nombre corto de futbolfantasy ("Sevilla") se traduce al
  oficial largo ("Sevilla Fútbol Club") vía `MAPA_EQUIPOS`. El `teamId`
  numérico de la API se traduce al mismo nombre oficial largo vía
  `MAPA_EQUIPO_ID_OFICIAL_A_CORTO` + `MAPA_EQUIPOS`
  (`equipo_oficial_a_nombre_largo()`). El nombre oficial largo es el
  idioma común entre las tres fuentes.
- **Jugadores**: no hay ningún id compartido. `Sincronizar` empareja por
  **nombre + equipo** (`emparejar_por_nombre()`,
  `tokenizar_nombre()`/`nombres_coinciden()`): compara por conjuntos de
  tokens en vez de por texto exacto, tratando un token de una sola letra
  como comodín de inicial (para casar "O. Sancet" con "Oihan Sancet",
  "Laporte" con "Aymeric Laporte", etc.). Probado en directo: ~86% de
  acierto en titularidad, ~80% en estado. Lo que no se empareja se queda
  con `NULL` (titularidad) o el valor por defecto (estado) — nunca se
  inventa un dato. Desde el 21/08/2026, si `Datos Titularidad.csv` no
  empareja a un jugador, `porcentaje_titularidad` cae a la `Probabilidad`
  que sí consiguió `Datos Posicion.csv` para ese mismo jugador (si la
  tuvo) en vez de quedarse en `NULL` — mismo dato real de
  futbolfantasy.com, solo que de una página distinta del mismo sitio.

## Cálculo de tendencias (`diferencia_valor`, `porcentaje_diferencia`, `tendencia_dias`, `aceleracion`)

La API no da esto, solo el valor actual — `calcular_tendencias()` en
`Sincronizar` lo calcula después de sincronizar `historial_valor`: lee las
últimas 15 filas de cada jugador, calcula la diferencia contra ayer,
cuenta días consecutivos en la misma dirección, y aproxima `aceleracion` a
5 categorías (`clasificar_aceleracion()`: "Acelera mucho" / "Acelera" /
"Estable" / "Desacelera" / "Desacelera mucho", por umbrales del cambio de
velocidad de hoy contra la de ayer; ver Trigésima sexta ronda, antes había
también dos "Inflexión" por cambio de signo). **Es una aproximación
nuestra, no la fórmula original de futbolfantasy.com** (nunca se conoció,
aprobado así explícitamente por el usuario). Necesita al menos 2 días de
historial para calcular algo, 3 para `aceleracion`.

## Base de datos (Supabase / Postgres)

`Scripts/Esquema base de datos.sql` se pega en el *SQL Editor* de Supabase
(no es un script de Python). Tablas:

- `equipos` (`nombre` PK, `id` del escudo, `nombre_oficial` desde el
  19/08/2026 — nombre corto oficial de la API, ej. "FC Barcelona"; `nombre`
  sigue siendo la clave interna larga de `MAPA_EQUIPOS` y no se toca, para
  no tener que migrar los `equipo` de las demás tablas).
- `jugadores` (`id` PK = id oficial de LaLiga Fantasy): `nombre`, `equipo`,
  `posicion`, `porcentaje_titularidad`, `valor`, `valor_liga`,
  `diferencia_valor`, `porcentaje_diferencia`, `aceleracion`,
  `tendencia_dias`, `estado`, `minutos_jugados`, `posicion_x`,
  `posicion_y` (desde el 19/08/2026 — coordenadas 0-100 de la formación
  táctica real, `null` si el jugador no es titular probable esta jornada
  según futbolfantasy.com). UPSERT en cada sincronización.
  `minutos_jugados` se fuerza explícitamente a `null` en cada
  sincronización desde el 22/08/2026 (`sincronizar_jugadores()` no tiene
  de dónde sacar un valor real todavía, ver "Pendiente") — antes esa
  columna simplemente no aparecía en el `UPDATE SET`, así que 10
  jugadores sueltos (de equipos distintos, sin ningún patrón) se habían
  quedado con un número de minutos de pruebas antiguas que nunca se
  limpiaba solo, entre ellos "Álex Baena" — el mismo jugador cuyas filas
  sueltas de `puntos_jornada` motivaron toda la investigación de esta
  sesión. Mismo tipo de basura vieja, columna distinta.
- `historial_valor` (`id, fecha` PK): solo `valor_liga` de cada jugador,
  un snapshot por día. Solo se insertan filas nuevas (`ON CONFLICT DO
  NOTHING`), nunca se corrigen las que ya había.
- `puntos_jornada` (`id, jornada` PK): desde el 22/08/2026 se borra
  **entera** y se reinserta en cada sincronización (`sincronizar_puntos()`
  ya no hace `UPSERT`) — la API da el histórico completo de la temporada
  en cada respuesta, así que un refresco total es correcto y además
  limpia solo cualquier fila vieja/incorrecta que hubiera quedado de
  antes. `estadisticas` y `tarjetas_amarillas_acumuladas` se guardan
  vacíos por ahora (ver "Pendiente").
- `puntos_jornada_detalle`: tabla creada, **sin sincronizar por ahora** —
  el parser que existía dependía del formato de texto de un script ya
  eliminado; hay que escribir uno nuevo cuando se conozca el formato real
  del desglose por jugador (ver "Pendiente" — necesita `GET
  /player/{id}?x-lang=es`, una petición por jugador).
- `calendario` (`equipo, orden` PK): se borra y reinserta por equipo en
  cada sincronización (la lista de próximos partidos se reemplaza entera).
- `posicion_sin_oficial` (`equipo, nombre` PK, desde el 19/08/2026): los
  jugadores "fantasma" (ver Paso 9) — `posicion_x`, `posicion_y` (desde
  el 21/08/2026 pueden ser `null`: un fantasma del banquillo, ver
  "Quinta ronda", no tiene coordenadas de campo) y `probabilidad` (puede
  ser `null` si futbolfantasy.com no traía `data-probabilidad` para ese
  jugador). Se borra y reinserta entera en cada sincronización, igual que
  `calendario`.

**`Esquema base de datos.sql` es el esquema de una base de datos nueva, no
una migración** — para una base de datos que ya existe (como la real de
este proyecto), las columnas nuevas hay que añadirlas a mano en el SQL
Editor de Supabase:
```sql
alter table equipos add column nombre_oficial text;
alter table jugadores add column posicion_x numeric;
alter table jugadores add column posicion_y numeric;
alter table posicion_sin_oficial add column probabilidad numeric;
alter table posicion_sin_oficial alter column posicion_x drop not null;
alter table posicion_sin_oficial alter column posicion_y drop not null;
```
Hasta que no se ejecuten las 3 últimas líneas, `sincronizar_jugadores()`
falla entera (hace `rollback`) en cada sincronización — no solo se pierde
el dato nuevo, se detiene también la actualización normal de `jugadores`
(valor, titularidad, estado...) hasta que se apliquen. Mismo patrón que
las columnas anteriores, solo que esta vez el radio de impacto de no
aplicarlas a tiempo es mayor. Las 2 primeras líneas de esta lista de 3 ya
se confirmaron aplicadas el 21/08/2026 (el `workflow_dispatch` manual
sincronizó sin error) — falta solo el `drop not null` de las
coordenadas, añadido el mismo día para los fantasmas de banquillo.
Hasta que no se ejecute esto, la web da error en `/equipos/[id]` y
`/mi-equipo` (consultan columnas que todavía no existen) — pendiente de
que el usuario lo ejecute, ver "Pendiente".

`Sincronizar base de datos.py` lee `DATABASE_URL` con
`Común.obtener_configuracion()` (variable de entorno primero, así se le
pasa el secreto de GitHub Actions), y es el único script que informa por
pantalla (filas sincronizadas por tabla, o `Error sincronizando {tabla}`
sin el detalle de la excepción — los logs de Actions son públicos con el
repo público, así que no se expone ningún dato scrapeado en un mensaje de
error).

## GitHub Actions (`.github/workflows/scraping.yml`)

Repositorio público (Actions minutos ilimitados y gratis en público, muy
por encima de los 2.000 min/mes gratis de un repo privado).

- **Tres cron, desde el 22/08/2026** (ver "Novena ronda" más abajo): `*/5 * * * *`
  (cada 5 min — `1.py` titularidad, `estado.py`), `*/15 * * * *` (cada 15 min —
  `Ingestar datos liga.py`, `3.py`, `Ingestar datos detalle.py`) y `0 */5 * * *`
  (cada 5h — `Descargar imágenes.py`). `Sincronizar` corre siempre al final,
  sin condición, en cualquiera de los tres disparos. Antes de esta fecha eran
  solo dos cron (`0 * * * *` / `0 */5 * * *`), ver "Historia breve" para el
  porqué del cambio.
- `concurrency: group: fantasy-scraping, cancel-in-progress: false` —
  ejecuciones que coinciden se encolan, nunca corren en paralelo (evita
  que dos procesos escriban a la vez sobre la caché de `Datos/`). Efecto
  secundario aceptado del cron de 5 min: si coincide con una ejecución del
  cron de 15 min todavía corriendo (~5-7 min, sobre todo por las 254
  peticiones de `Ingestar datos detalle.py`), la de 5 min se encola detrás
  y ese ciclo concreto de titularidad/estado llega unos minutos tarde. Se
  eligió esto en vez de varios workflows en paralelo porque correr
  `Sincronizar` o el refresco del token de LaLiga Fantasy (`Común.
  obtener_token_laliga_fantasy()`, que reutiliza el mismo `refresh_token`
  cacheado) a la vez desde procesos distintos sí sería un riesgo real de
  condición de carrera; encolado en un único job, nunca pasa.
- **Volumen de peticiones aceptado explícitamente por el usuario el
  22/08/2026**: pasar `Ingestar datos detalle.py` (254 peticiones, 1 por
  jugador) de cada 4-6h a cada 15 min multiplica por ~20 las peticiones
  diarias contra la cuenta real de LaLiga Fantasy (de ~1.200 a ~24.400
  peticiones/día) — el usuario confirmó que lo quiere así pese al
  aumento, avisado explícitamente del número antes de aplicarlo. Mismo
  criterio de riesgo que ya se aceptó en el Paso 8 (ver "Historia breve"),
  ahora a mayor escala.
- `workflow_dispatch` con input `modo` (`todo` / `solo-rapido` /
  `solo-medio` / `solo-lento`, uno por cada franja de cron) para lanzarlo
  a mano sin esperar al cron.
- **Secretos usados**: `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (ya configurados desde antes del Paso 8),
  `LALIGA_FANTASY_EMAIL`, `LALIGA_FANTASY_PASSWORD`,
  `LALIGA_FANTASY_LEAGUE_ID` (los 3 confirmados aplicados el 21/08/2026,
  ver "Pendiente") + `LALIGA_FANTASY_TEAM_ID` (**pendiente de añadir**,
  desde el 24/08/2026, ver "Decimotercera ronda") — desde el 19/08/2026
  `Descargar imágenes.py` (cron de cada 4-6h) **también** necesita los 3
  secretos de LaLiga Fantasy para pedir el token y leer `teams-master`;
  antes de esa fecha era el único script del cron pesado que no los
  necesitaba.

## Web (`Fantasy/Web/`, Next.js + TypeScript + Tailwind)

Lee Postgres directo (`pg`) desde Server Components, con el mismo
`DATABASE_URL` (variable de entorno de Vercel al desplegar, nunca en el
código) — no usa el cliente JS de Supabase ni su API REST. Fotos/escudos
servidos desde un bucket público de Supabase Storage
(`imagenes/jugadores/{id}.png`, `imagenes/equipos/{id}.png`).

`Web/src/lib/db.ts` selecciona `j.valor_liga as valor` (no `j.valor`) en
la consulta de `/jugadores` — la web muestra el valor de tu liga, no el
oficial del juego, que es el objetivo de todo el Paso 8. El resto de
componentes de React no necesitaron cambios: siguen leyendo el campo
`valor` tal cual.

Nombre de equipo mostrado en la web: siempre `nombreOficial ?? nombre`
(helper por página, no una función compartida) — si `Descargar
imágenes.py` todavía no ha sincronizado `nombre_oficial` para un equipo,
cae al nombre largo interno en vez de mostrar vacío.

`CampoTactico.tsx` soporta dos modos: si `calcularFormacion()` encuentra
al menos 8 jugadores de campo con `posicion_x`/`posicion_y` reales (y
portero), coloca a cada uno con `position: absolute` en esas coordenadas
(formación real de futbolfantasy.com); si no, cae al reparto sintético
anterior por líneas (`Defensa`/`Mediocampista`/`Delantero`). Mi equipo
**nunca** usa el modo real (es una plantilla inventada por nosotros con
jugadores de equipos distintos, no tiene sentido posicionarlos con la
coordenada de su equipo real) — `aProbable()` en `mi-equipo/page.tsx`
pone `posX`/`posY` a `null` a propósito.

Rutas: `/` (inicio), `/equipos` y `/equipos/[id]` (alineación probable de
un club real, con formación táctica real cuando futbolfantasy.com la da),
`/jugadores` (tabla filtrable/ordenable con selección múltiple fijada
arriba, sin comparación lado a lado), `/comparador` (tarjetas de jugador +
tabla de comparación con Filtros y coloreado mejor/peor), `/mi-equipo`
(plantilla de relleno con los 25 jugadores de mayor valor — pendiente de
guardar una plantilla real, ver "Pendiente").

## Seguridad — lo que ya está resuelto

- HTTPS con verificación de certificado siempre activa, nunca
  `verify=False`. Todas las peticiones llevan `timeout`.
- No hay `eval`/`exec`/`pickle`/`subprocess`/`os.system` en ningún sitio.
- No hay SQL construido con texto (todo `execute_values`/parámetros).
- Credenciales solo en `Configuración local.py` (en `.gitignore`) o
  secretos de GitHub Actions — nunca en código ni en logs.
- URLs de imágenes validadas por dominio antes de guardarse
  (`Común.PREFIJO_ASSETS_LALIGA_FANTASY`) — no se confía en que un `src`
  scrapeado o un campo `image` de la API apunte de verdad a donde debería.
- `Sincronizar` nunca imprime el detalle de una excepción (los logs de
  Actions son públicos), solo el nombre de la tabla que falló.

## Dependencias

```
pip install requests beautifulsoup4 psycopg2-binary tzdata
```

`tzdata` añadido el 22/08/2026 para `ZoneInfo("Europe/Madrid")` en `Ingestar
datos liga.py` (ver "Décima ronda" más abajo) — sin este paquete,
`zoneinfo` falla en Windows (no trae base de datos de husos horarios
propia, a diferencia de Linux/GitHub Actions que normalmente sí la tiene
del sistema); con `tzdata` instalado funciona igual en cualquier
plataforma, así que se añadió como dependencia explícita en vez de confiar
en que el runner de turno la tenga.

## Pendiente

1. ~~Añadir los secretos que faltan en GitHub...~~ **Resuelto (confirmado
   21/08/2026)**: los 3 secretos de LaLiga Fantasy están bien puestos, los
   últimos 20 runs de `scraping.yml` son todos `success`.
2. ~~Ejecutar en el SQL Editor de Supabase las 3 columnas nuevas del Paso
   9...~~ ~~Falta una columna nueva más: `probabilidad`...~~ ~~Falta un
   cambio más: drop not null de posicion_x/y...~~ **Todo resuelto
   (confirmado 21/08/2026)**: el `workflow_dispatch` manual sincronizó
   `jugadores` sin error y Gordon/Adeyemi aparecieron en el banquillo
   real del Barça, confirmando que las 3 columnas del Paso 9,
   `probabilidad` y el `drop not null` de `posicion_x`/`posicion_y` están
   todos aplicados en Supabase.
3. ~~`puntos_jornada` / `minutos_jugados` / `puntos_jornada_detalle`...~~
   **Resuelto (22/08/2026)**: ver "Puntos y desglose por jornada, datos
   reales" más abajo — `Jornada`/`Puntos`, `minutos_jugados` y el
   desglose por estadística ya salen reales. Confirmado en local con
   datos de verdad antes de subir el cambio (Baena: 33 minutos jugados,
   1 gol, coincide con el desglose real de la API).
4. ~~Histórico real de `valor` (marketValue oficial)...~~ **Resuelto
   (25/08/2026)**: ver "Decimoctava ronda" más abajo — `Rellenar historial
   valor.py`, script manual de un solo uso, rellenó `historial_valor` con
   hasta 58 días reales por jugador vía `GET /player/{id}/market-value`.
5. ~~La liga privada "Prueba"...~~ **Resuelto el 19/08/2026**: la liga real
   del usuario es **"LaLiga"** (`leagueId` `018070031`, 10 mánagers,
   `access: private`), no "Prueba" (`018053483`, esa solo tenía al
   usuario). `LALIGA_FANTASY_LEAGUE_ID` corregido en
   `Configuración local.py` y probado en directo: 138 jugadores salen con
   `valor_liga` (cláusula real de algún mánager) distinto del `valor`
   oficial — confirma que el emparejador de `buyoutClause` funciona bien
   con una liga de varios mánagers de verdad. **Falta corregir el mismo
   secreto en GitHub** (`LALIGA_FANTASY_LEAGUE_ID` → `018070031`) para que
   el cron use la liga correcta.
6. ~~Desplegar de verdad en Vercel...~~ **Resuelto (28/08/2026)**: ver
   "Cuadragésima tercera ronda". Web en producción en
   `fantasy-vicent-blanquez.vercel.app`, auto-deploy en cada push a
   `main`, `DATABASE_URL` + `GEMINI_API_KEY` + `SITE_ACCESS_KEY`
   como variables de Vercel, acceso por enlace + cookie (`Web/src/proxy.ts`).
   Falta solo un **dominio propio** (de momento el `.vercel.app`).
7. ~~Rol de Postgres de solo lectura para la web...~~ **Resuelto
   (25/08/2026)**: ver "Decimoctava ronda" — rol `web_solo_lectura`
   creado y verificado en directo, con permiso de escritura ampliado solo
   en `mi_equipo_jugadores`. **Cubierto del todo (28/08/2026)**: producción
   en Vercel arranca con la `DATABASE_URL` del rol de solo lectura y las
   páginas con BD funcionan (ver "Cuadragésima tercera ronda").
8. ~~`/mi-equipo` ya tiene diseño e interfaz...~~ **Resuelto del todo
   (25/08/2026)**: plantilla real vía `mi_equipo_jugadores` y dinero/
   fichas reales vía `mi_club` (Decimotercera ronda); `LALIGA_FANTASY_TEAM_ID`
   ya añadido también en GitHub, así que el cron real sincroniza esto
   igual que en local.
9. ~~Consultas en vivo para datos de liga privada...~~ **Resuelto del
   todo (25/08/2026)**: Grupos A, B y C completos, ver "Decimoséptima" y
   "Decimoctava" rondas — 12 avisos de Telegram en total. El usuario
   ejecutó el SQL en Supabase y se confirmó en directo: `Sincronizar`
   corre limpio contra producción (0 tablas con error, incluidas las 3
   nuevas) y `dueno`/`en_mercado`/`protegido_hasta` ya tienen datos reales
   (123/64/123 jugadores respectivamente).
10. ~~Disposición exacta de los jugadores del banquillo en
    `/equipos/[id]`...~~ **Dado por resuelto (25/08/2026)**: el usuario
    confirmó que ya no hace falta la captura de referencia.
11. ~~La deduplicación de `extraer_formacion()`...~~ **Resuelto
    (25/08/2026)**: ver "Decimoctava ronda" — no era incertidumbre de
    rotación, era un segundo widget `.camiseta-wrapper` intruso en la
    misma página que se colaba por el mismo selector; filtrado por la
    clase `tipo_campo`, verificado en los 20 equipos reales (0 con más o
    menos de 11 titulares).
12. ~~`GEMINI_API_KEY`...~~ ~~Falta añadirla como variable de Vercel...~~
    **Resuelto del todo (28/08/2026)**: añadida a Vercel (Production +
    Preview) y chat verificado en la web pública. Cuidado con las comillas
    de `.env.local` al subirla (ver "Cuadragésima tercera ronda").

## Rediseño de la web (14/08/2026)

El usuario diseñó una referencia visual completa en Framer
(`https://stale-guava-741955.framer.app/`) y pidió calcar ese diseño en la
web real antes de seguir con funcionalidades. Tokens extraídos verificando
en directo con JavaScript (no a ojo) desde el navegador integrado: fondo
`#F5F5F7`, texto `#1D1D1F`, fuente Inter, nav con
`rgba(245,245,247,0.82)` + `blur(18px)`, radios de tarjeta en px
arbitrarios (18/24/28/36 según tamaño), dropdowns `rounded-[14px]` (no
píldora completa como tenía la web antes).

Cambios aplicados (nota: varios de estos detalles cambiaron otra vez el
19/08/2026, ver "Paso 9 — segunda ronda de la web" más abajo; esta
sección se dejó como estaba para no perder el porqué original):
- `NavBar.tsx`: fondo translúcido con blur (dejó de ser `sticky` en el
  Paso 9, ver más abajo).
- `MenuFiltros.tsx` / `MenuMultiSeleccion.tsx` / buscador de
  `Explorador.tsx`: de `rounded-full` a `rounded-[14px]`, y se añadió un
  hover-oscurecido que **no existía antes** en los botones trigger (solo
  en las opciones de dentro del panel; el color exacto cambió de
  `#EBEBEE` a `#FAFAFC` en el Paso 9 para igualar el de las tarjetas de
  `/equipos`). Nuevo color de referencia para cualquier botón interactivo
  nuevo del mismo estilo.
- **`Comparador` reconstruido como página independiente** (antes
  compartía literalmente el componente `Explorador` con `/jugadores`).
  Reescrito otra vez por completo en el Paso 9 (ver más abajo);
  `Comparacion.tsx` ya no existe.
- **`Web/src/app/mi-equipo/page.tsx` construida desde cero** (antes
  placeholder puro): 4 tarjetas de stats, campo táctico (reutiliza
  `CampoTactico.tsx` de `/equipos`) con botón "+" en la esquina, banquillo
  (reutiliza `Banquillo.tsx`) con un "+" al final alineado exactamente con
  las fotos (mismo `flex flex-col items-center gap-1` con un span
  invisible del mismo tamaño que el `%` de probabilidad, para que la caja
  cuadrada de 62px quede a la misma altura), secciones "En duda" y
  "Seguimiento" con el título fuera de la tarjeta blanca. Verificado por
  código que las 5 secciones miden exactamente el mismo ancho (452px a
  1280px de viewport).
- **Nuevos componentes reutilizables**: `BotonAgregar.tsx` (el "+"
  cuadrado o con texto, mismo estilo/hover en todos los sitios donde se
  usa) y `TarjetaEstadistica.tsx` (las 4 stat cards de Mi equipo).
- `equipos/[id]/page.tsx`: el título "Próximos partidos" salió del `div`
  blanco (`rounded-[28px] bg-white p-[28px]`), ahora es hermano de la
  tarjeta, igual que ya estaba "En duda" en Mi equipo.

Todo verificado en directo en el navegador integrado (sin errores de
consola, en desktop y móvil) — no solo visualmente, con `javascript_tool`
comprobando radios/colores/anchos exactos contra los tokens de Framer.

## Paso 9 — segunda ronda de la web + fotos/escudos desde la API oficial (19/08/2026)

Dos frentes en la misma sesión: (1) revisión a fondo del rediseño del
Paso 8 comparándolo en directo contra capturas reales del Framer del
usuario (no solo contra la versión publicada vacía, que resultó no tener
contenido real en la mayoría de páginas — el usuario tenía la versión con
datos de ejemplo abierta en su propio editor de Framer); (2) mover fotos
de jugador y escudos/nombre de equipo de futbolfantasy.com a la API
oficial, y usar la formación táctica real de futbolfantasy.com en vez de
una sintética.

**Por qué la primera revisión del Paso 8 se quedó corta**: el navegador
integrado veía la versión *publicada* de Framer, que para casi todas las
páginas salvo Inicio no tenía contenido real (placeholders vacíos tipo
"Hueco para escudo"). El usuario pasó capturas reales de su editor de
Framer (con datos de ejemplo) y eso permitió medir de verdad tamaños,
colores y disposición de Equipos, Jugadores, Comparador y Mi equipo.

Cambios de esta ronda:
- Sombras: **quitadas de todos los elementos "planos"** (barra de
  búsqueda, tarjetas, tabla, chips de selección) — solo se dejó
  `shadow-lg` en los paneles flotantes de los desplegables (Filtros,
  selección múltiple, añadir jugador), que sí flotan sobre el resto del
  contenido.
- `NavBar.tsx`: ya no es `sticky` — desaparece al hacer scroll como
  cualquier otro contenido (antes se quedaba fijo arriba). `globals.css`
  tiene `scrollbar-gutter: stable` para que no se desplace lateralmente
  al cambiar entre páginas con y sin scroll vertical.
- Inicio: imagen de portada con `object-cover` a tamaño fijo por
  breakpoint (antes `object-contain` con alto automático) y el subtítulo
  bajó su `max-w` a 360px para que el salto de línea sea idéntico al de
  Framer ("Bienvenido a la herramienta" / "definitiva para LaLiga
  Fantasy.").
- `FotoJugadorSlot.tsx`: ya no tiene recuadro de fondo (`bg`) ni sombra —
  ahora muestra el nombre completo del jugador debajo de la foto (sin
  `truncate`), con `colorNombre`/`fontSizeNombre` configurables por
  contexto (blanco en el campo verde, oscuro en fondo blanco).
- `ImagenCuadrada.tsx`: nuevo prop `padding` (px) y `bg` ahora opcional
  (por defecto blanco) — los escudos del encabezado y de "Próximos
  partidos" en `equipos/[id]` usan `bg="transparent"` + `padding` para
  reducir el escudo proporcionalmente dentro de la misma caja, igual que
  el `p-[31%]` de las tarjetas de `/equipos`; el logo de competición
  también pasó a `bg="transparent"`.
- `CampoTactico.tsx`: contenedor a 700×980 (antes 500×750), círculo
  central, áreas, semicírculos y área pequeña (nueva, no existía) con las
  proporciones reales medidas en el Framer del usuario. Soporta colocar a
  los 11 titulares por coordenada real (`posicionesReales` en
  `lib/formacion.ts`) cuando `Ingestar datos 3.py` consiguió la formación
  de ese equipo; si no, cae al reparto sintético de siempre.
- `equipos/[id]/page.tsx`: ancho de página a 700px (antes 500px),
  "Próximos partidos" alineado a la izquierda de su recuadro (antes
  centrado), subtítulo de fecha y "Dificultad X" separados en dos líneas
  sin punto final (antes una sola frase con puntos), dificultad ahora
  después de la fila de equipos (antes antes), nombre de equipo mostrado
  = `nombreOficial ?? nombre`.
- `TarjetaProximoPartido.tsx`: reescrito con grid de 3 columnas
  (`1fr auto 1fr`) para que el VS y los escudos queden siempre centrados
  sin importar la longitud de los nombres de los equipos a los lados; el
  equipo local siempre a la izquierda (antes el orden dependía de si el
  usuario miraba "su" equipo o el rival, no de quién jugaba en casa).
- `Explorador.tsx` (`/jugadores`): quitado el párrafo de ayuda bajo los
  filtros, "Todas las posiciones" → "Posiciones", placeholder del buscador
  → "Buscar a un jugador", filas con rayado gris alterno
  (`rgba(29,29,31,0.04)`/blanco, igual que Framer). **Quitada la
  comparación al seleccionar 2+ jugadores** (ya no existe
  `Comparacion.tsx`): ahora seleccionar fija esas filas arriba de la
  tabla, en el orden en que se seleccionaron, independientemente de lo
  que se busque después; sin límite de 3.
- **`Comparador.tsx` reescrito por completo** según la captura real:
  tarjetas de jugador (foto + nombre, botón "−" arriba a la izquierda) +
  tarjeta "+ Añadir jugador", y debajo una tabla con "Filtros" (mismo
  componente `MenuFiltros` que en Jugadores, aquí controla qué
  estadísticas numéricas se muestran como filas, no un filtro de
  búsqueda) en la cabecera, filas alternas y coloreado verde/rojo según
  quién tiene el mejor valor en cada estadística.
- `mi-equipo/page.tsx`: ancho a 700px, "Revalorización" en verde si es
  positiva y rojo si es negativa (el signo "−" ya salía solo de
  `toLocaleString`), botón "Filtros" arriba a la derecha del campo, "+"
  del campo abajo a la izquierda (antes abajo a la derecha), banquillo
  reutiliza `<Banquillo mostrarAgregar />` en vez de duplicar su JSX a
  mano (ahora es literalmente el mismo componente que en
  `equipos/[id]`), "En duda" y "Seguimiento" muestran a los jugadores
  igual que el banquillo (foto + % + nombre, sin descripción de estado ni
  texto adicional) alineados a la izquierda del recuadro, con el mismo
  botón "+" que el banquillo.

**Fotos, escudos y nombres de equipo desde la API oficial** (decisión
explícita del usuario, revierte lo que se había hecho con
futbolfantasy.com):
- `GET /players` ya traía un campo `image` con la foto oficial del
  jugador (`assets-fantasy.llt-services.com/players/...`) que no se
  estaba usando — ahora `Ingestar datos liga.py` lo guarda como columna
  `Foto` en `Datos Jugadores.csv`, y `Sincronizar` escribe `Datos
  Fotos.csv` directamente desde ahí (antes emparejaba por nombre contra
  `Datos Titularidad.csv`, con el mismo ~80% de acierto que titularidad y
  estado). `Ingestar datos 1.py` dejó de leer/guardar la foto.
- `GET /v3/teams-master` trae `badgeColor` (escudo) y `name` (nombre
  oficial corto) por equipo — `Descargar imágenes.py` ahora pide token y
  usa esto en vez del patrón estático de futbolfantasy.com. El escudo se
  sigue subiendo a la misma ruta de Storage de siempre
  (`equipos/{id}.png`, con el id de `Común.ID_A_NOMBRE_CORTO`), así que la
  web no tuvo que cambiar cómo lee el escudo. El nombre oficial se guarda
  en la columna nueva `equipos.nombre_oficial` (ver "Base de datos" y el
  SQL de migración ahí) y la web lo prefiere sobre el `nombre` interno
  allí donde se muestra un nombre de equipo a un humano.
- Al pasar a depender de la API oficial, `Descargar imágenes.py` empezó a
  necesitar los mismos 3 secretos que `Ingestar datos liga.py` (ver
  "Pendiente").

**Formación táctica real** (antes: `calcularFormacion()` cogía los 10
jugadores de campo con más `porcentaje_titularidad` y los repartía en 3
líneas por posición — daba, por ejemplo, un 4-4-2 fijo para el Barça, sin
sentido). Ahora `Ingestar datos 3.py` reutiliza la misma ficha de equipo
que ya descargaba para el calendario (sin petición extra) y lee la
posición real `(x%, y%)` de cada titular probable del dibujo del campo de
futbolfantasy.com — ver el detalle de la deduplicación necesaria en la
sección de `Ingestar datos 3.py` más arriba. Probado en local contra los
20 equipos reales antes de subir el cambio: 17 de 20 equipos salen con
exactamente 11 candidatos, los otros 3 con algunos de más que la web
recorta.

Todo verificado en local contra datos reales (no solo en el navegador):
los 3 scripts de ingesta y `Descargar imágenes.py` se ejecutaron de
verdad contra la API oficial y futbolfantasy.com antes de dar el cambio
por bueno, comprobando el CSV/las imágenes resultantes.

### 3 bugs reales encontrados tras el primer despliegue (19/08/2026, más tarde)

El usuario probó el Paso 9 contra la base de datos real y encontró 3
fallos que no habían salido en las pruebas locales de más arriba:

1. **`emparejar_por_nombre()` no era exclusivo**: nada impedía que la
   misma fila de `Datos Posicion.csv` (o de Titularidad/Estado) se
   emparejara con **más de un** jugador oficial distinto. Con
   titularidad/estado esto ya pasaba antes silenciosamente (parte del
   ~80-86% de acierto conocido) pero no se notaba mucho; con la posición
   táctica se veía clarísimo — dos jugadores distintos ("Unai G." y
   "Guruzeta" del Athletic, por ejemplo) acababan con las mismas
   coordenadas exactas, apilados uno encima del otro en el campo.
   **Arreglado**: `emparejar_por_nombre()` ahora borra el candidato de la
   lista en cuanto lo empareja con alguien, así no se puede reutilizar.
   Beneficia también al emparejado de titularidad y estado, aunque ahí no
   era tan visible.
2. **Bug de tipos en `lib/formacion.ts`**: `JugadorPosicionado` se definió
   como `JugadorProbable & { x: number; y: number }`, pero el objeto real
   nunca tuvo esos campos — solo `posX`/`posY` (los que vienen de
   `obtenerJugadoresEquipo()`). El *type predicate* de TypeScript dejaba
   compilar sin avisar, pero en tiempo de ejecución `jugador.x` era
   `undefined` y todos los jugadores del campo real acababan en la misma
   esquina (`left: undefined%` se renderiza como `0,0`). Arreglado usando
   `posX`/`posY` directamente en `CampoTactico.tsx`, sin el alias `x`/`y`.
3. **Las fotos de jugador nunca se actualizaban a la fuente nueva**:
   `descargar_si_falta()` se salta la descarga si el archivo ya existe en
   `Datos/Imágenes/Jugadores/`, y `actions/cache` en GitHub Actions
   restaura esa carpeta entre ejecuciones con la clave fija
   `datos-fantasy-` — así que las ~600 fotos descargadas hace semanas
   desde futbolfantasy.com nunca se volvían a pedir, aunque el código ya
   apuntara a la URL oficial nueva. Los escudos de equipo no tenían este
   problema porque ya usaban `descargar_siempre()` (sin comprobar si
   existen, son solo 20 archivos). **Arreglado**: la clave de
   `actions/cache` pasó a `datos-fantasy-v2-` (con su propio
   `restore-keys`), así el próximo run parte de una carpeta `Datos/`
   vacía y todas las fotos se piden de nuevo a la fuente correcta. Un
   futuro cambio de fuente de imágenes debería repetir este truco
   (subir la versión de la clave) en vez de tocar la lógica de
   `descargar_si_falta()`.

Además, a petición del usuario, los escudos de `equipos/[id]` (cabecera y
"Próximos partidos") se agrandaron una vez vistos en producción (104px/
padding 18 en la cabecera, 64px/padding 10 en próximos partidos — antes
76/23 y 46/14).

### Caché de imágenes en el navegador y jugadores "fantasma" (19/08/2026, tercera ronda)

Después de la caché de `actions/cache`, el usuario seguía viendo escudos y
fotos antiguos. Causa distinta: la URL de cada imagen nunca cambia
(`equipos/{id}.png`, `jugadores/{id}.png`), así que el navegador (y el
propio optimizador de imágenes de Next.js) la sirve desde su caché aunque
el archivo real en Supabase Storage ya sea otro. **Arreglado**:
`urlFotoJugador()`/`urlEscudoEquipo()` en `lib/imagenes.ts` añaden
`?v=AAAA-MM-DD` (fecha de hoy) a la URL, así que cambia una vez al día y
fuerza a pedir la imagen de nuevo. Si algún día se necesita invalidar más
fino que una vez al día, este es el sitio a tocar.

**Jugadores "fantasma"** (jugadores que futbolfantasy.com sí muestra en la
alineación probable pero que todavía no existen en el catálogo oficial de
LaLiga Fantasy — típico de fichajes muy recientes): antes simplemente
desaparecían del campo sin más. A petición del usuario, ahora se muestran
igual que cualquier otro jugador pero con el nombre tal cual lo raspó
futbolfantasy.com y la foto genérica de "sin foto" (`SIN_FOTO`). Requirió:

- Tabla nueva `posicion_sin_oficial` (`equipo, nombre, posicion_x,
  posicion_y`) — `Sincronizar` la rellena con las filas de `Datos
  Posicion.csv` que ningún jugador oficial reclamó (se borra y reinserta
  entera en cada sincronización, igual que `calendario`).
- `obtenerJugadoresEquipo()` en `lib/db.ts` combina los jugadores reales
  con estos fantasmas, usando un `id` negativo sintético (solo vale como
  `key` de React dentro de esa página, nunca se guarda en `jugadores`) y
  `esFantasma: true`.
- `CampoTactico.tsx` pasa `src={null}` cuando `esFantasma`, así
  `FotoJugadorSlot` cae solo en su fallback de "sin foto" existente, sin
  necesidad de lógica nueva ahí.

**Bug del emparejador afinado otra vez**: el fix de la ronda anterior
(exigir al menos una coincidencia exacta) era *demasiado* estricto — dejó
fuera a "Vinicius" (nombre real raspado) contra "Vini Jr." (apodo oficial),
porque ninguno de los dos es una inicial de una letra y tampoco son
idénticos. Se cambió la condición de "coincidencia exacta" por
"coincidencia fuerte" (`coincidencia_fuerte()`): igual que antes, más un
prefijo de **al menos 4 letras** de un token dentro del otro
("vini"→"vinicius"). Sigue exigiendo esa coincidencia fuerte en algún
token para aceptar el emparejamiento completo, así que el caso original de
"Raphinha" (que no comparte ningún prefijo real con "R. Araujo", solo la
inicial) sigue quedando fuera.

**Cuarta ronda (19/08/2026, mismo día)**: se encontró un fallo más sutil
en `nombres_coinciden()` — exigía que **todos** los tokens del nombre
corto encontraran pareja, procesándolos en el orden en que aparecen en el
nombre, y se rendía en el primero que fallaba sin llegar a probar los
siguientes. Caso real: "Álex Balde" (oficial) vs "Alejandro Balde"
(raspado de futbolfantasy.com) — el apellido "balde" coincide exacto, pero
como el algoritmo procesaba "alex" primero y no encontraba pareja para él,
nunca llegaba a comprobar "balde" y rechazaba el emparejamiento entero (su
`porcentaje_titularidad` se quedaba en `null`, lo que en la nueva vista de
formación real se veía como "0%"). Se probó primero un arreglo que
permitía que **1 token se quedara sin pareja** siempre que hubiera una
coincidencia fuerte en otro (típicamente el apellido) — **revertido casi
al momento**: en la práctica hizo que "Joan García" (el portero titular
real del Barça) se emparejase con la fila de "Eric Garcia" (un defensa
distinto) solo por compartir apellido, dejando a Eric sin posición y a
Joan en el sitio equivocado del campo. Mostrar a un jugador en la posición
equivocada es mucho peor que un `0%` de titularidad, así que se volvió a
exigir que **todos** los tokens coincidan (con coincidencia fuerte en al
menos uno) — el efecto secundario aceptado es que "Álex Balde" vuelve a
quedarse sin `porcentaje_titularidad` real. Consultar primero el orden de
prioridad: nunca sacrificar precisión posicional por precisión de un dato
secundario.

**Formación real refrescada con datos del día**: al investigar el caso
"aparece Araujo en vez de Raphinha", se confirmó que no era un bug de
código — el `Datos Posicion.csv` usado en las rondas anteriores tenía
horas de antigüedad, y la alineación probable de futbolfantasy.com había
cambiado entre medias (cosas así ocurren constantemente, según se acerca
la jornada). Al re-ejecutar `Ingestar datos 3.py` en el momento, salió
"Raphinha" en su sitio correcto, y de paso apareció "Adeyemi" (el jugador
del caso original, sin ficha oficial todavía) en el hueco correspondiente.

**Dificultad de partidos lejanos, arreglada de raíz**: a sugerencia del
usuario, `Ingestar datos 3.py` dejó de usar la ficha del equipo (máx. 5
partidos) + el calendario mensual como respaldo (que nunca traía
dificultad, ver más arriba) y pasó a usar
`https://www.futbolfantasy.com/laliga/equipos/{slug}/partidos` — una
página con **toda la temporada** (~39 partidos restantes) dentro de
`section.partidos.proximos`, con dificultad en cada partido de LaLiga sin
excepción. Esto sustituye por completo `eventos_desde_calendario_mensual()`
(eliminada) y de paso reduce las peticiones por equipo (antes hasta 5:
ficha + hasta 4 meses; ahora exactamente 2: ficha para la formación +
partidos para calendario/dificultad). Probado en directo: el Barça-Levante
que antes salía sin dificultad ahora sale "Muy baja".

**Imagen de "sin foto"**: sustituida por la que proporcionó el usuario
(guardada también en `Datos/Imágenes/Web/Sin foto.png` como referencia),
copiada a `Web/public/sin-foto.png`.

**Banquillo, ancho igual al campo**: en la ronda anterior se había hecho
`w-fit` con columnas de ancho fijo (69px) para que el margen borde↔columna
quedara igual al hueco entre columnas — eso hizo la caja mucho más
estrecha que el campo de arriba, porque `CampoTactico` y `Banquillo` son
hermanos dentro del mismo contenedor con `px-6`, y el ancho real
disponible ahí (652px a 1280px de viewport, no 700 — el `max-w-[700px]`
de la página incluye ese padding) nunca coincidía con los 69px×5 fijos.
Arreglado usando columnas `minmax(0, 1fr)` en vez de un ancho fijo en
píxeles, con `gap` y `padding` al mismo valor (28px): así la caja siempre
ocupa el 100% del ancho disponible (`w-full`, igual que `CampoTactico`) y
coincide automáticamente con el campo a cualquier tamaño de viewport, sin
tener que calcular a mano un ancho de columna para cada caso. Verificado:
652px en ambos a 1280px de viewport, márgenes de 28px en los dos bordes.

## Cuarta ronda de bugs de producción (21/08/2026)

El usuario, ya con el Paso 9 desplegado y confirmado (secretos de GitHub,
columnas de Supabase, caché de imágenes — ver "Pendiente"), reportó 4
cosas más viendo la web real:

1. **Colores de dificultad**: `COLOR_DIFICULTAD` en `lib/formato.ts` no
   seguía una escala reconocible (Muy baja y Baja eran los dos el mismo
   verde). Cambiado a la escala que pidió el usuario: Muy baja verde
   (`#16A34A`), Baja azul (`#2563EB`), Media amarillo (`#CA8A04`), Alta
   naranja (`#EA580C`), Muy alta rojo (`#DC2626`, sin cambios).
2. **Bloque VS de `/equipos/[id]` descentrado**: el header de "Posible
   alineación de la jornada X" (arriba del todo, el VS de la propia
   jornada de liga — no las tarjetas de "Próximos partidos", esas ya
   tenían el fix) seguía usando el layout `flex flex-wrap justify-center`
   antiguo, el mismo problema que `TarjetaProximoPartido.tsx` ya había
   resuelto con un grid `1fr auto 1fr` en el Paso 9. Se le aplicó el mismo
   grid — nunca se migró en su momento porque son dos componentes
   distintos con el mismo bug visual.
3. **"0%" en vez de "sin dato"**: `probabilidad` se calculaba como
   `porcentaje_titularidad === null ? 0 : ...` en `lib/db.ts` y
   `mi-equipo/page.tsx` (3 sitios) — un jugador sin emparejar (ver "Tres
   catálogos distintos") se veía como "0% de probabilidad" en vez de "sin
   dato". Cambiado a propagar `null` hasta `FotoJugadorSlot`, que ahora
   muestra "—" en ese caso (`probabilidad: number | null` en todo el
   camino: `JugadorProbable`, `comparar()` en `lib/formacion.ts` con
   `?? -1` al ordenar, y el propio componente). Afecta a Álex Balde
   (documentado ya como caso sin `porcentaje_titularidad` real) y a
   cualquier jugador fantasma (antes tenían `probabilidad: 0` a mano).
4. **Jugadores fantasma sin ninguna titularidad real disponible**: al
   investigar el caso "Álex Balde" salió un caso más concreto —
   "Swedberg" (Celta, fantasma, sin ficha oficial todavía) aparecía sin
   dato aunque futbolfantasy.com sí muestra su probabilidad (50%,
   confirmado en directo). Los fantasmas nunca pasan por `Ingestar datos
   1.py` (no tienen fila en `jugadores`), así que no tenían ninguna vía
   posible hacia una titularidad real. Se aprovechó que
   `extraer_formacion()` en `Ingestar datos 3.py` ya leía
   `data-probabilidad` de la misma página (hasta ahora solo para
   desempatar duplicados, luego se descartaba) — ahora se guarda como
   columna `Probabilidad` en `Datos Posicion.csv` y `Sincronizar` la usa
   de dos formas: (a) como `probabilidad` de `posicion_sin_oficial` para
   los fantasmas, y (b) como respaldo de `porcentaje_titularidad` en
   `jugadores` cuando `Datos Titularidad.csv` no logró emparejar a ese
   jugador (`primero_no_nulo()`, sin tocar `nombres_coinciden()` en
   absoluto). Verificado en directo contra Celta real: "Swedberg" sale
   con probabilidad 50, exactamente lo que reportó el usuario. Requiere
   una columna nueva en Supabase (`posicion_sin_oficial.probabilidad`,
   ver "Base de datos" y "Pendiente") antes de que el cron pueda
   sincronizar `jugadores` sin error.

Confirmado en directo con el propio caso real que puso sobre aviso al
usuario para lo que sigue: en el Barça, la Jornada 1 (vs Athletic,
27/08) sale **después** que la Jornada 2 (vs Elche, 23/08) — el número de
jornada no es fiable como orden cronológico, solo la fecha real (que es
justo lo que ya usa `orden`, asignado en `Ingestar datos 3.py` tras
`eventos.sort(key=lambda e: e["fecha_obj"])`).

## Quinta ronda: partido duplicado y alineación de la competición equivocada (21/08/2026, mismo día)

1. **"Próximos partidos" repetía el partido ya mostrado en grande**: el
   bloque VS de arriba de `/equipos/[id]` y la lista de abajo leían la
   misma fuente (`equipo.partidos`) sin excluirse entre sí. Arreglado
   añadiendo `jornadaLigaOrden` a `EquipoDetalle` (el `orden` exacto del
   partido que ya se muestra arriba) y filtrando la lista por ese `orden`
   en `equipos/[id]/page.tsx` — **por `orden`, nunca por número de
   jornada ni por posición en el array**, precisamente por el caso
   Jornada 1/Jornada 2 de arriba.
2. **La alineación grande no estaba garantizado que fuera la del
   siguiente partido de LIGA**: `extraer_formacion()` lee la ficha
   principal del equipo, que pinta la alineación probable de **el
   siguiente partido que sea, cualquiera que sea su competición** — sin
   ningún cruce contra el calendario de LIGA que decide el texto
   "Jornada X" de la cabecera (son dos scrapes independientes de páginas
   distintas). Si el siguiente partido real fuera, por ejemplo, de
   Champions League, la cabecera diría igualmente "Jornada X" con el
   rival de LIGA correcto (porque esa parte sí viene bien filtrada por
   `competicion == "LaLiga"`), pero los jugadores del campo serían los
   probables para el partido de Champions, no para esa jornada de LIGA.
   No se pudo reproducir en directo (a día 21/08/2026 ningún equipo tiene
   un partido de otra competición antes de su siguiente jornada — la
   Champions no empieza hasta septiembre) pero el riesgo era real en
   cuanto empezara la fase de grupos para los equipos españoles en
   Europa. **Arreglado con `extraer_rival_ficha()`**: lee el rival que
   muestra la propia sección `.alineacion-partido` de la ficha (mismo
   patrón `.equipo.local`/`.equipo.visitante` que ya usa
   `_partido_a_evento()` en la página de partidos) y solo se guarda
   `extraer_formacion()` si ese rival coincide (`Común.normalizar_nombre`)
   con el rival de la próxima jornada de LIGA que ya dio
   `eventos_desde_partidos()`. Si no coincide, no se guarda ninguna
   posición para ese equipo esa vuelta — la web cae sola al reparto
   sintético por líneas en vez de mostrar una alineación real pero de otro
   partido. Verificado en directo contra el Barça real: ficha → rival
   "Elche", próxima jornada de LIGA → rival "Elche", coinciden.
3. **Mínimo de partidos de LIGA en la lista bajó a 4 tras arreglar el
   punto 1**: al excluir de la lista el partido que ya se muestra arriba,
   como antes solo se pedían 5 partidos de LIGA en total (`Datos
   Posicion.csv`/`Datos 3.csv`), quedaban 4 en "Próximos partidos".
   `MINIMO_PARTIDOS_LIGA` subió de 5 a 6 en `Ingestar datos 3.py` para
   que, tras excluir 1, sigan quedando 5 partidos de LIGA reales en la
   lista — mismo criterio "mínimo 5" que ya pedía el usuario originalmente
   en el Paso 9, solo que ahora contando el que se ve arriba aparte.
4. **El banquillo era 100% sintético, nunca el real de futbolfantasy.com**:
   el usuario vio a "Gordon" y "Adeyemi" al 50% en el banquillo real del
   Barça en futbolfantasy.com y no aparecían en absoluto en el nuestro.
   Investigado en directo: la ficha SÍ tiene marcadores de banquillo real
   (`data-onceff="suplente"`, con su propia `data-probabilidad`), en una
   sección aparte de los titulares que hasta ahora `Ingestar datos 3.py`
   ignoraba por completo — el "banquillo" de la web se rellenaba
   únicamente con los jugadores del catálogo oficial que sobraban de la
   alineación (`calcularFormacion()` en `lib/formacion.ts`), así que un
   jugador de banquillo real que aún no está en el catálogo oficial de
   LaLiga Fantasy (caso de Gordon y Adeyemi, igual que "Swedberg" de la
   Cuarta ronda pero en el banquillo en vez del campo) no tenía ninguna
   vía posible hacia la web. **Arreglado con `extraer_suplentes()`**
   (mismo patrón que `extraer_formacion()`, dedup por nombre) — se guardan
   en el mismo `Datos Posicion.csv` con `Posicion X`/`Posicion Y` vacíos,
   así `Sincronizar` los empareja exactamente igual que a los titulares
   sin ningún código nuevo ahí. Confirmado en directo contra la ficha real
   del Barça: 15 suplentes reales, ninguno comparte nombre con los 11
   titulares (los candidatos "fantasma" de rotación incierta que
   `extraer_formacion()` ya descarta por probabilidad no interfieren).
   Requiere permitir `null` en `posicion_sin_oficial.posicion_x/y` (ver
   "Base de datos" y "Pendiente") porque un fantasma de banquillo no tiene
   coordenadas de campo.

## Puntos y desglose por jornada, datos reales (22/08/2026)

El usuario reportó que en `/jugadores`, para el Atlético, solo "Baena"
tenía puntos de la última jornada cuando en la vida real muchos más
jugadores habían puntuado. Investigado en directo contra la base de
datos real: la tabla `puntos_jornada` tenía 183 filas sueltas con
jornadas hasta la 38 (la temporada 2026/27 acaba de empezar) y con la
codificación rota ("Baena" sin la Á) — basura de antes de que el
pipeline actual existiera, porque `guardar_puntos_jornada()` en
`Ingestar datos liga.py` escribía **siempre** un CSV vacío (llevaba así
semanas, a la espera de que arrancara la temporada real). Se encontró el
mismo patrón en `jugadores.minutos_jugados`: esa columna nunca apareció
en el `UPDATE SET` de `sincronizar_jugadores()`, así que 10 jugadores
sueltos de equipos distintos (Baena otra vez entre ellos) se habían
quedado con un número de minutos de pruebas antiguas para siempre,
porque nada lo tocaba ni para bien ni para mal.

**Puntos por jornada (gratis, sin petición extra)**: el catálogo
`/players` que ya se pedía cada hora trae `points` (total de temporada)
y `weekPoints` (lista `{weekNumber, points}`, histórico completo cada
vez). `Ingestar datos liga.py` ahora lo guarda en `Datos Puntos
jornada.csv` (antes vacío a propósito) y `sincronizar_puntos()` pasó de
`UPSERT` a borrar-y-reinsertar entero — limpia sola cualquier basura
vieja de paso, sin necesidad de un `DELETE` manual.

**Desglose por estadística y minutos jugados (caro, 1 petición por
jugador)**: se investigó a fondo antes de implementar nada, porque violar
"nunca se inventa un dato" mapeando mal un campo es peor que no tener el
dato. Probados varios candidatos a endpoint bulk por equipo/semana
(`/teams/{id}/players`, `/players?week=1`) — ninguno existe o ninguno
trae el desglose; solo `GET /player/{id}?x-lang=es` lo tiene, y es 1
petición por jugador. El usuario eligió explícitamente la opción de
traerlo para el catálogo completo en el cron pesado (cada 4-6h) en vez
de limitarlo a su liga privada o no implementarlo. Optimización real: solo
se pide el detalle de jugadores con `weekPoints` no vacío (254 de ~780 a
fecha de hoy, no ~715 como se había estimado antes de comprobar) — un
jugador que no ha puntuado nunca no tiene nada que desglosar.

Nuevo script `Ingestar datos detalle.py` (cron pesado, necesita
`LALIGA_FANTASY_EMAIL`/`PASSWORD` pero no `LEAGUE_ID` — el login no es
por liga). Cada entrada de `playerStats` trae `stats` con cada
estadística como un array `[cantidad, puntos]` (confirmado contra datos
reales de Baena: `"goals": [1, 5]` = 1 gol, 5 puntos por ello;
`"mins_played": [33, 1]` = 33 minutos, 1 punto). `MAPA_ESTADISTICA`
traduce cada clave en inglés de
la API a la `nombre` española exacta que ya usaba `ESTADISTICAS_DETALLE`
en `Web/src/lib/db.ts`, para que el `SUM(CASE WHEN estadistica = ...)`
del lado web siga funcionando sin tocarlo:

| Campo API | Estadística (español) |
|---|---|
| `goals` | goles |
| `goal_assist` | asistencias de gol |
| `offtarget_att_assist` | asistencias sin gol |
| `pen_area_entries` | balones al área |
| `penalty_won` | penaltis provocados |
| `penalty_conceded` | penaltis cometidos |
| `penalty_save` | penaltis parados |
| `saves` | paradas |
| `effective_clearance` | despejes |
| `penalty_failed` | penaltis fallados |
| `own_goals` | goles en propia puerta |
| `goals_conceded` | goles en contra |
| `yellow_card` | tarjetas amarillas |
| `red_card` | tarjetas rojas |
| `total_scoring_att` | tiros a puerta |
| `won_contest` | regates |
| `ball_recovery` | balones recuperados |
| `poss_lost_all` | posesiones perdidas |
| `marca_points` | Puntos DAZN |
| `mins_played` | no es un detalle — va directo a `jugadores.minutos_jugados` (de la jornada más reciente de cada jugador) |
| `second_yellow_card` | descartado — "Segundas amarillas" se eliminó de la web esta misma sesión |

**"Puntos DAZN" se queda como estaba**: por el nombre del campo
(`marca_points`) parecía venir de Diario Marca en vez de DAZN, y se
probó a renombrar la columna — **revertido de inmediato por el
usuario**, confirma que "Puntos DAZN" es el nombre correcto pese al
nombre interno del campo en la API. El `clave` interno (`puntosDazn`) y
la `nombre`/`etiqueta` visible en la web se quedan igual que siempre.

`sincronizar_jugadores()` ahora lee `Datos Minutos.csv` (opcional, lo
genera `Ingestar datos detalle.py`) y usa el valor real si existe, `null`
si no (nunca se queda pillado con un valor viejo). Nueva función
`sincronizar_detalle()` (borra y reinserta `puntos_jornada_detalle`
entero, mismo criterio que `puntos_jornada`) añadida al pipeline
**después** de `puntos_jornada` — importante el orden, porque
`puntos_jornada_detalle` tiene `foreign key (id, jornada) references
puntos_jornada(id, jornada)` y necesita que esas filas ya existan.
`sincronizar_puntos()` también borra `puntos_jornada_detalle` antes de
borrar `puntos_jornada` (para no violar esa misma FK) — en una pasada
donde solo corre el cron ligero, esto deja `puntos_jornada_detalle`
vacía hasta la siguiente pasada del cron pesado; se autocorrige solo,
no hace falta ninguna acción manual.

Probado en local contra la API real antes de subir nada: 254 jugadores
con petición de detalle, 4.978 filas de desglose, 224 con minutos reales
(no todos los 254 tienen `mins_played` en su jornada más reciente).
Baena: 33 minutos, 1 gol — ya no el "720" ni el "9 puntos sin desglose"
de antes.

## Sexta ronda: rediseño a fondo de la tabla de Jugadores (22/08/2026)

El usuario pidió 15 cambios sobre `/jugadores` en un solo mensaje, casi
todos verificados en directo contra el navegador antes de darlos por
buenos (no solo compilando). Los más simples: orden alfabético por
nombre cuando no hay ninguna columna ordenada activamente (antes
ordenaba por "Valor" aunque esa columna ni se mostrara), sin sufijo
(`%`, "días"...) cuando el valor es `null` (antes salía "—%"),
`Avatar.tsx` sin `rounded-full`/fondo — `object-contain` en vez de
`object-cover` para que ni fotos de jugador ni escudos se recorten, y
"Histórico de valor · Nombre" → "Histórico del valor de Nombre".

**`minutos_jugados` pasa a ser acumulado de toda la temporada, no de la
última jornada**: `extraer_jugador()` en `Ingestar datos detalle.py`
sumaba solo `mins_played` de la jornada más reciente; ahora suma las de
todas las `playerStats` del jugador. De paso, `mins_played` se añadió
también a `MAPA_ESTADISTICA` (como "minutos jugados", primera entrada)
para que aparezca en el desglose por jornada del modal de puntos — antes
solo alimentaba `jugadores.minutos_jugados` y se descartaba del todo del
desglose. También se filtran las filas con cantidad 0 (`if not valor or
not valor[0]: continue`) — antes se guardaban las ~19 estadísticas de
cada jugador en cada jornada aunque no hubiera pasado nada (ej. un
centrocampista con "0 paradas"), inflando `puntos_jornada_detalle` sin
aportar nada útil al desglose.

**Nulos como el valor más bajo al ordenar**: antes un valor `null`
siempre iba al final de la lista da igual la dirección del orden
(`if (va === null) return 1`). Ahora se trata como "más pequeño que
cualquier valor real": en ascendente sale primero, en descendente sale
último — mismo criterio en `compararPorClave()` para números y para
texto.

**"Aceleración" eliminada del todo de `/jugadores`** (de
`COLUMNAS_OPCIONALES`, ya no aparece en Filtros ni como columna) — a
petición explícita del usuario, revierte parte de lo hecho horas antes
en la misma sesión. `Comparador.tsx` **no se tocó**: sigue teniendo su
fila fija de "Aceleración" (siempre visible al comparar, independiente
de `COLUMNAS_OPCIONALES`), porque el usuario solo habló de la página de
Jugadores.

**"Posición" y "Estado" pasan de columnas fijas a columnas opcionales**,
primeras en el orden de Filtros (antes de "Titularidad"). Por defecto,
sin ningún filtro activo, la tabla ahora solo muestra Jugador y Equipo
— antes siempre mostraba también Posición y Estado sin poder ocultarlos.
El desplegable "Posiciones" que ya filtraba filas (al lado de "Equipos")
se dejó tal cual, es un concepto distinto (filtra qué jugadores se ven)
del nuevo "Posición" de Filtros (muestra la columna). `Comparador.tsx`
ya tenía sus propias filas fijas de "Posición" y "Estado" — se añadió
`estado`/`posicion` a su lista de claves excluidas del propio
`MenuFiltros` (antes solo excluía `aceleracion`) para que no salgan
duplicadas ahí.

**Revalorización y su porcentaje, coloreados** (verde positivo, rojo
negativo, color normal si es 0 o `null`) — mismo criterio que ya usaba
`Comparador.tsx` para "mejor/peor" (`#16A34A`/`#DC2626`), aplicado tanto
en la tabla principal como en el panel de "Totales".

**Tendencia con "día"/"días"**: `ColumnaOpcional` ganó un campo opcional
`formatear?: (valor) => string` (reemplaza el mecanismo genérico de
`sufijo` cuando la lógica no es un simple `${numero}${sufijo}`) — usado
para pluralizar Tendencia y para que "Estado" pase por
`formatearEstado()` en vez de mostrarse en crudo.

**Sticky ampliado a Jugador + Equipo** (antes solo Jugador, y sin
`z-index` en las celdas del `<tbody>`, solo en la cabecera) — al hacer
scroll horizontal con muchas columnas activas, el resto de datos se
pintaban encima de la foto/nombre del jugador porque las celdas fijas
del cuerpo no tenían `z-10` como sí tenía la cabecera. Arreglado dando
ancho fijo a Jugador (260px) y Equipo (220px) para poder calcular el
`left` de scroll de Equipo (`left-[300px]`, después de los 40px del
checkbox + 260px de Jugador) y añadiendo `z-10` a las tres celdas fijas
del cuerpo.

**Rayado de filas con colores sólidos** (`#F7F7F8`/`#FFFFFF` en vez de
`rgba(29,29,31,0.04)`/`#FFFFFF`) — el usuario vio la celda de Jugador
más gris que el resto de su misma fila, con una línea blanca separándola
de la casilla de selección. Un color semi-transparente compuesto sobre
celdas `position: sticky` no pinta exactamente igual que sobre celdas
normales (cada capa sticky crea su propio contexto de composición);
usar un color sólido equivalente elimina cualquier diferencia posible
entre celdas fijas y no fijas de la misma fila.

**Panel "Totales de equipo" rediseñado**: título = nombre del equipo,
subtítulo pequeño debajo = "N jugadores" (antes todo en una sola línea
"Totales de X · N jugadores"); excluye explícitamente Titularidad,
Porcentaje de revalorización, Tendencia y Minutos jugados
(`CLAVES_EXCLUIDAS_TOTALES`); usa `formatearCelda()` en vez de
`formatearNumero() + sufijo` a mano, así hereda gratis el mismo
formateo (sin sufijo en nulos, "Puntos DAZN" en vez de números pelados,
etc.) que ya tiene la tabla principal. El escudo ya no se recorta en
círculo (heredado del arreglo de `Avatar.tsx`).

**Modal "Puntos por jornada" con desglose real, expandible**: título
"Puntos por jornada de {nombre}" (antes "Puntos por jornada · {nombre}"),
quitado el subtítulo "El rival y el resultado... todavía no se guardan"
(ya no aplica, era de cuando `estadisticas` en `puntos_jornada` estaba
siempre vacío). `obtenerHistorialPuntos()` en `db.ts` ahora hace una
segunda consulta a `puntos_jornada_detalle` (en paralelo con
`Promise.all`) y agrupa las filas por jornada en JS; cada jornada del
modal es un botón que expande/colapsa mostrando cada línea como
"{cantidad} {estadística}: {puntos} puntos" (ej. "1 goles: 5 puntos").
Verificado en directo: funciona correctamente, aunque con los datos que
había en producción en el momento de la prueba todavía salían las
~19 filas por jornada sin filtrar (la sincronización con el filtro de
cantidad 0 y `mins_played` en el desglose es posterior a esos datos) —
se limpia solo en el próximo sync, nada que arreglar en la web.

**El caso de Mariano no era un bug**: el usuario vio que su
revalorización de hoy debería ser +494.429 y salía 0. Investigado en
directo contra la base de datos real: los dos últimos snapshots de
`historial_valor` para ese jugador (20/08 y 21/08) tienen el mismo valor
exacto (5.721.255) porque el último `Ingestar datos liga.py` real corrió
a las 23:38 UTC del 21/08 y nada ha corrido desde entonces (confirmado
contra el historial de runs de GitHub Actions) — la subida que el
usuario ve en la app real todavía no ha llegado a nuestra base de datos.
`calcular_tendencias()` está calculando bien la diferencia entre los dos
snapshots que existen; el "0" es correcto para los datos disponibles,
no un fallo de la fórmula. **Nota del 22/08/2026 (ronda siguiente,
mismo día)**: aunque el cálculo no tenía fallos, el usuario prefirió
eliminar esta clase entera de bug (retrasos de sincronización) usando
directamente el dato ya calculado por futbolfantasy.com en vez de
recalcularlo nosotros — ver "Séptima ronda" más abajo.
`calcular_tendencias()` ya no escribe `diferencia_valor` /
`porcentaje_diferencia` / `tendencia_dias`, solo `aceleracion`.

## Séptima ronda: revalorización real y arreglos finos de Jugadores (22/08/2026, mismo día)

1. **Solapamiento al hacer scroll horizontal, causa real encontrada**: el
   arreglo de la Sexta ronda (columnas Jugador/Equipo con `sticky` y
   ancho fijo) no funcionaba del todo — el `<span>` del nombre estaba
   dentro de un `div class="flex items-center gap-2"` sin `min-w-0`. Un
   hijo flex sin `min-width: 0` nunca se encoge por debajo del ancho de
   su contenido, así que un nombre largo hacía que la celda de Jugador
   creciera **de verdad** más allá de los 260px declarados — y como el
   `left-[300px]` de Equipo se calculó asumiendo esos 260px reales, la
   celda de Equipo (y todo lo que viene después) se plantaba en un sitio
   que ya no coincidía con el ancho real de Jugador. Arreglado añadiendo
   `min-w-0` + `flex-1` + `truncate` a los spans de nombre de jugador Y
   de equipo (por si `equipoNombreOficial` es `null` alguna vez y cae al
   nombre largo interno). Verificado con `elementFromPoint()` en el
   punto donde antes se solapaban: el elemento visible es el de la celda
   fija (`Equipo`), no el de la columna que se desplaza por detrás — tal
   y como debe comportarse una columna `sticky`.
2. **Minutos jugados / desglose sin filtrar / orden del desglose**: ya
   estaban arreglados en el código de la ronda anterior (acumulado de
   toda la temporada, filtro de cantidad 0, mismo orden que Filtros) pero
   **nunca se llegaron a subir ni sincronizar** — el usuario probó en
   producción antes de que hubiera commit+push+workflow_dispatch de por
   medio. Nada que tocar de nuevo, solo desplegar.
3. **"Puntos DAZN" sin decimales**: tenía `decimales: 1` puesto de
   antemano (antes de tener datos reales) — quitado, ahora usa el
   `decimales` por defecto (0) de `formatearNumero()`.
4. **Revalorización, porcentaje y tendencia: dejan de calcularse,
   ahora son el dato real de futbolfantasy.com**. El usuario, tras ver
   el caso de Mariano, pidió explícitamente no volver a calcular esto
   nosotros nunca más ("evitarnos errores de cálculo por fallos de
   script"). Investigado en directo: la misma tabla de mercado que ya
   raspa `Ingestar datos 1.py` para `porcentaje_titularidad` trae en
   cada `<tr>` los atributos `data-diferencia1`, `data-diferencia-pct1`
   y `data-tendencia` — el valor absoluto en dinero, el porcentaje y los
   días de tendencia, **ya calculados por futbolfantasy.com**, sin
   petición extra (mismo HTML que ya se descargaba). Confirmado contra
   Mariano en directo: `data-diferencia1="494429"`,
   `data-diferencia-pct1="23.53..."`, `data-tendencia="6"` — coincide
   exacto con lo que el usuario veía en la web real. `_leer_fila_mercado()`
   en `Común.py` ahora también devuelve `diferencia`/`diferencia_pct`/
   `tendencia`, `Ingestar datos 1.py` los guarda en `Datos
   Titularidad.csv` (3 columnas nuevas) y `sincronizar_jugadores()` los
   usa directamente (mismo emparejador `coincidencias_mercado` que ya
   usaba para titularidad) en vez de que `calcular_tendencias()` los
   derive de `historial_valor`. `data-tendencia` puede venir en negativo
   (tendencia bajista) — se guarda en valor absoluto
   (`parsear_entero_absoluto()`) para no romper el "días" que muestra la
   web, que no distingue signo. **`calcular_tendencias()` se simplificó
   a solo `aceleracion`** (lo único que de verdad necesitaba el bucle de
   15 días de histórico; bajado a 3 días, que es lo que hace falta para
   comparar la velocidad de hoy contra la de ayer). **Ojo**: "Valor" en
   la web es `valor_liga` (la cláusula de tu liga privada), pero la
   revalorización que ahora se usa viene de lo que futbolfantasy.com
   entiende como "valor" (previsiblemente `marketValue` oficial, no
   `valor_liga`) — para la inmensa mayoría de jugadores son el mismo
   número (`valor_liga` solo diverge para quien tiene la cláusula subida
   a mano en tu liga), pero técnicamente no está garantizado que
   "Revalorización" sea exactamente `Valor(hoy) − Valor(ayer)` para esos
   pocos casos. No se ha resuelto porque no hay (todavía) una fuente de
   histórico de `valor_liga` en ningún sitio externo.
5. **Todas las columnas de Filtros, alineadas a la izquierda** (antes
   `text-right`) — igual que Jugador y Equipo, a petición del usuario.
6. **Buscador insensible a tildes**: "Martin" no encontraba "T.
   Martínez" porque `"martínez".includes("martin")` es `false` en
   JavaScript (la í con tilde no es lo mismo carácter que la i suelta).
   Nueva `normalizarTexto()` en `Explorador.tsx` (quita diacríticos con
   `.normalize("NFKD")` + reemplazo del rango Unicode de marcas
   combinadas) aplicada tanto al texto buscado como a cada nombre antes
   de comparar — mismo problema, mismo tipo de solución, que
   `Común.normalizar_nombre()` ya resolvía hace tiempo en el lado
   Python para el emparejador de nombres.
7. **Histórico de valor (la gráfica), pendiente de decisión del
   usuario**: pidió que tampoco se calcule nosotros, que venga de
   futbolfantasy.com. La misma fila de la tabla de mercado trae
   `data-valor1/2/3/7/14/30` (el valor de hace 1, 2, 3, 7, 14 y 30 días)
   — pero son **6 puntos fijos**, no una serie diaria continua como la
   que ya se acumula sola en `historial_valor` desde el Paso 8 (un punto
   más cada día, sin límite). Cambiar la gráfica a estos 6 puntos sería
   perder granularidad del histórico ya acumulado a cambio de no
   depender de nuestro propio cálculo — un cambio de arquitectura real,
   no una corrección de bug, así que se dejó sin implementar hasta que
   el usuario decida explícitamente qué prefiere. **Resuelto (mismo
   día)**: el usuario prefirió mantener el histórico diario propio tal
   cual estaba — no se tocó nada de `historial_valor` ni `GraficaValor.tsx`.

## Octava ronda: retoques finales de Jugadores (22/08/2026, mismo día)

1. **"-1" delante de "Puntos DAZN" en el desglose**: `marca_points` de
   la API no es una cantidad contable como el resto de estadísticas —
   su primer valor (`cantidad`) no tiene un significado real, solo el
   segundo (`puntos`) importa (confirmado con Baena: `[-1, 3]`). Antes
   el desglose mostraba literalmente "-1 Puntos DAZN". `HistorialPuntos.tsx`
   ahora tiene un caso especial: si la estadística es "Puntos DAZN" no
   antepone la cantidad, solo muestra la etiqueta.
2. **Desglose también para "Puntos en la última jornada"**: antes solo
   "Puntos totales" abría un modal (con las jornadas colapsadas,
   click para expandir cada una). Ahora "Puntos en la última jornada"
   también es clicable y abre el mismo componente `HistorialPuntos` en
   un modo nuevo (`soloUltimaJornada`) que solo pide/muestra la primera
   fila (la más reciente, ya que `obtenerHistorialPuntos` ordena por
   `jornada desc`) y la enseña ya desplegada directamente, sin necesidad
   de otro clic — título "Puntos de la última jornada de {nombre}" en
   vez de "Puntos por jornada de {nombre}".
3. **Jugador y Estado dejan de ser ordenables**: a petición explícita del
   usuario, revierte parte de lo añadido en la Sexta ronda (donde se hizo
   clicable el propio encabezado "Jugador" para poder volver al alfabético
   a mano). El orden alfabético por nombre **sigue siendo el que se aplica
   por defecto** (no cambia el estado inicial), simplemente ya no hay forma
   de volver a activarlo a mano una vez se ordena por otra columna — ni
   "Jugador" ni "Estado" tienen ya flecha ni `cursor-pointer` ni `onClick`.
4. **Equipo pasa de columna fija a opcional**, primera en Filtros (antes
   de Posición) — mismo patrón que ya se le aplicó a Posición y Estado en
   la ronda anterior. Sin ningún filtro activo la tabla ahora solo muestra
   Jugador (antes Jugador + Equipo). Al activarse, se renderiza igual que
   antes (escudo + nombre oficial) pero como una columna dinámica más,
   ya no `sticky` — deja de estar fija durante el scroll horizontal, cosa
   que no se pidió mantener. El desplegable "Equipos" que ya filtraba
   filas (al lado del buscador) se dejó tal cual, es un concepto distinto
   (qué jugadores se ven) del nuevo "Equipo" de Filtros (si se muestra la
   columna) — mismo razonamiento que ya se aplicó a "Posiciones". Como
   ya pasaba con Posición/Estado, `Comparador.tsx` tiene su propia fila
   fija de "Equipo" — se añadió a su lista de claves excluidas del propio
   `MenuFiltros` para que no salga duplicada.

## Novena ronda: cadencias fijadas por el usuario (22/08/2026)

El usuario dio instrucciones explícitas de cada cuánto debe refrescarse cada
tipo de dato de la web, en vez de dejarlo a criterio nuestro como hasta
ahora:

1. Imágenes (jugadores, equipos, competiciones): máximo 24h.
2. Alineaciones probables y próximos partidos: máximo 15 min.
3. Estado y titularidad: exactamente cada 5 min (fijo, no un máximo).
4. Todo el resto de columnas opcionales de "Filtros" en `/jugadores`:
   máximo 15 min.

El workflow pasó de 2 cron a 3 (ver "GitHub Actions" más arriba) para
poder cumplir el punto 3 sin arrastrar a esa cadencia todo lo demás.
Antes de aplicar el cambio se avisó al usuario de un efecto concreto:
`Ingestar datos detalle.py` (el desglose de estadísticas por jugador —
minutos, goles, asistencias, tarjetas, Puntos DAZN... todo lo que no es
estado/titularidad/alineación) hace **1 petición por jugador contra la
cuenta real** (254 a día de hoy) y estaba en el cron de 4-6h precisamente
por ser caro. Pasarlo a 15 min multiplica sus peticiones diarias por ~20
(de ~1.200 a ~24.400 peticiones/día contra la API no oficial de LaLiga
Fantasy, con la cuenta real logueada). **El usuario confirmó explícitamente
que lo quiere así**, asumiendo ese aumento — se le dieron las cifras
exactas antes de que dijera que sí, no se implementó a ciegas.

`Ingestar datos liga.py` (valor, puntos totales, puntos por jornada) se
movió del cron de cada hora al de 15 min — antes vivía en el barato junto a
titularidad/estado sin ninguna razón especial de fondo (solo porque ambos
eran "el cron ligero"), pero "Valor" y "Puntos" son columnas de Filtros
igual que el resto del punto 4, no titularidad/estado del punto 3.

`Descargar imágenes.py` no se tocó (cadencia ~5h, sigue en su propio cron
`0 */5 * * *`) porque el límite de 24h del punto 1 ya se cumplía de sobra
sin cambiar nada.

## Décima ronda: retoques de Jugadores y reinicio del histórico de valor (22/08/2026)

1. **Columna Estado, más ancha y sin salto de línea**: textos como "Baja
   hasta finales de agosto" se partían en varias líneas dentro de la
   celda. La celda genérica de columna (todas las columnas de Filtros
   salvo Equipo/Valor/Puntos, que ya tenían render especial) no llevaba
   `whitespace-nowrap` — solo lo llevaba la cabecera, no el cuerpo.
   Añadido a la celda genérica de `Explorador.tsx`, más `min-w-[220px]`
   solo para Estado (cabecera y cuerpo) para que tenga sitio de sobra.
2. **Línea fina entre la casilla de selección y "Jugador" con contenido
   de detrás asomando al hacer scroll**: eran dos `<td>`/`<th>` `sticky`
   independientes y contiguos (`left-0` la casilla, `left-10` Jugador) —
   un problema clásico de subpíxel al posicionar dos elementos `sticky`
   pegados: el navegador puede redondear cada uno a un píxel físico
   distinto y dejar una rendija de un píxel por la que se ve la columna
   que se desplaza por detrás, aunque los colores de fondo ya coincidan.
   Arreglado de raíz fusionando checkbox + avatar + nombre en **una sola**
   celda `sticky` de 300px (antes 40px + 260px por separado) — con un solo
   elemento `sticky` no hay dos bordes que puedan desalinearse entre sí.
3. **Desglose de puntos por jornada, solo estadísticas con puntos
   distintos de 0**: antes se mostraba cualquier línea con `cantidad`
   distinta de 0 aunque hubiera aportado 0 puntos (ej. "1 tiros a puerta:
   0 puntos"). `obtenerHistorialPuntos()` en `db.ts` ahora filtra
   `puntos <> 0` en la propia consulta SQL — a propósito **no** se tocó
   `Ingestar datos detalle.py` (que sigue filtrando por `cantidad`, no por
   `puntos`), porque esas filas con 0 puntos sí cuentan para las columnas
   agregadas de la tabla principal (ej. "Tiros a puerta" de toda la
   temporada); filtrar en el origen habría restado esas estadísticas del
   total. El orden del desglose (`order by jornada, orden`) ya coincidía
   con el de "Filtros" sin tocar nada — la columna `orden` se asigna en
   `Ingestar datos detalle.py` recorriendo `MAPA_ESTADISTICA`, que está
   escrito en el mismo orden que `COLUMNAS_OPCIONALES` en `columnas.ts`
   (confirmado comparando ambas listas entrada por entrada).
4. **Histórico de valor, reiniciado y con ventana de las 8:00**: el
   usuario detectó que el valor de un jugador a veces sale mal justo
   después de la actualización diaria (~00:00 hora de Barcelona) y se
   corrige solo a los pocos minutos — y como `guardar_historial()` en
   `Ingestar datos liga.py` grababa el **primer** valor que veía cada día
   (con un guardián para no repetir el mismo día, `ya_guardado_hoy`), con
   el cron nuevo de 15 min ese primer valor podía ser precisamente el
   erróneo, y se quedaba fijado para siempre (la sincronización hace
   `on conflict (id, fecha) do nothing`, nunca corrige lo ya guardado).
   El usuario pidió considerar el valor real recién a partir de las 14:00
   hora de Barcelona — cambiado más tarde el mismo día a las **8:00**,
   también su petición explícita. `guardar_historial()` ahora usa
   `datetime.now(ZoneInfo("Europe/Madrid"))` en vez de `date.today()`
   (que en GitHub Actions corre en UTC, no en hora española) y no escribe
   ninguna fila si son antes de las 8:00 — así el primer valor que se
   graba cada día es el de la primera ejecución del cron de 15 min a
   partir de esa hora, ya asentado. **Tabla `historial_valor` vaciada por
   completo** (`truncate table historial_valor`, ejecutado en directo
   contra Supabase, 4.437 filas antiguas borradas) para que el histórico
   empiece a contar limpio desde hoy con la lógica nueva — la clave de
   `actions/cache` en `scraping.yml` también subió a `datos-fantasy-v3-`
   (mismo truco que en los "3 bugs reales" del Paso 9) para que `Datos
   Historial valor.csv`, que se iba acumulando día a día dentro de la
   caché del runner, también parta vacío y no reintroduzca las fechas
   viejas.

## Undécima ronda: puntos_jornada_detalle vacía en producción, causa real (24/08/2026)

El usuario reportó que al hacer clic en "Puntos totales" o "Puntos en la
última jornada" solo veía la jornada y el total, nunca el motivo (el
desglose). Investigado en directo contra la base de datos real:
`puntos_jornada_detalle` tenía **0 filas en toda la tabla**, mientras que
`jugadores.minutos_jugados` (que sale del mismo script/misma ejecución,
`Ingestar datos detalle.py`) sí tenía datos reales y recientes para 386
jugadores — descartando de raíz que fuera un problema de la API o de
bloqueo de la cuenta (la Novena ronda ya había avisado de ese riesgo al
subir la cadencia a 15 min, pero no era la causa aquí).

**Causa real, reproducida en local contra la base de datos real**:
`sincronizar_detalle()` hace un único `execute_values` con las ~2.700
filas del desglose de la jornada. `puntos_jornada_detalle` tiene
`foreign key (id, jornada) references puntos_jornada(id, jornada)` — y
bastaba con que **una sola fila** trajera un `(id, jornada)` que
`Ingestar datos liga.py` todavía no hubiera registrado en `puntos_jornada`
(las dos peticiones a `/players` de los dos scripts no son atómicas entre
sí, así que un jugador recién puntuado puede aparecer en el detalle antes
de que el otro script lo refleje en el total) para que **todo el lote**
fallara con `ForeignKeyViolation`, se hiciera `rollback` y la tabla se
quedara como estaba antes — que, la primera vez que esto pasó, era vacía,
y se ha quedado vacía desde entonces porque el mismo choque se repite en
cuanto hay jornadas nuevas. Nada de esto se veía en producción porque
`Sincronizar` traga el detalle de cualquier excepción a propósito (ver
"Seguridad" más arriba) — se diagnosticó ejecutando `sincronizar_detalle()`
suelto en local contra la base de datos real para ver la excepción
completa.

**Arreglado** filtrando en Python las filas huérfanas antes de insertar:
`sincronizar_detalle()` ahora consulta primero los pares `(id, jornada)`
que sí existen en `puntos_jornada` y descarta cualquier fila del CSV que
no encaje, en vez de confiar en que los dos scripts vayan siempre
sincronizados. Verificado en directo tras el arreglo: 2.765 de 2.765 filas
insertadas sin error, Baena ya muestra desglose real de la Jornada 1 y 2
en el modal.

## Duodécima ronda: desplegable de Filtros con portal, dificultad de 5 niveles, banquillo por posición (24/08/2026)

- **`MenuFiltros.tsx` reescrito para pintar su panel flotante con
  `createPortal` en `document.body`**, en vez de como hijo `absolute`
  normal. Motivo: en `Comparador.tsx` el botón necesitaba vivir dentro de
  la misma fila/celda que los nombres de los jugadores (misma tarjeta
  blanca que la tabla), pero esa tarjeta necesita `overflow-x-auto` para
  recortar bien las esquinas redondeadas — y por la especificación CSS,
  `overflow-x` distinto de `visible` fuerza a `overflow-y` a `auto`
  también, así que cualquier panel `absolute` anidado ahí se recortaba o
  necesitaba scroll interno en vez de flotar por encima. Con portal, el
  panel se posiciona con `position: fixed` calculado desde
  `getBoundingClientRect()` del botón y no hereda ningún `overflow` de
  sus ancestros — soluciona el problema de raíz para cualquier sitio
  donde se use este componente en el futuro, no solo Comparador.
- **`Comparador.tsx`**: el botón de Filtros pasó a vivir dentro del
  `<th>` de la cabecera de la tabla (misma fila que los nombres de los
  jugadores, no una fila aparte encima), con `bg-[#F5F5F7]` (el mismo
  gris que usan los recuadros de "Próximos partidos" en Equipos) para
  contrastar contra la tarjeta blanca. El recuadro volvió a llevar
  `overflow-x-auto` (ya sin riesgo, ver punto anterior), arreglando de
  paso que las esquinas inferiores se vieran cuadradas y de un color
  distinto al fondo de la página (el rayado de filas, con su propio
  `backgroundColor` en el `<tr>`, no se recortaba a la curva del
  contenedor sin ese `overflow`).
- **Dificultad del calendario, 5 niveles en vez de 3**: `bucketDificultadCalendario()`
  en `formato.ts` ahora corta en `≤1` Muy fácil, `≤2` Fácil, `≤3` Normal,
  `≤4` Difícil, `>4` Muy difícil (antes 3 tramos con corte en 2 y 4, que
  dejaba a un jugador con promedio exacto 4.0 en "Normal" en vez de
  "Difícil" — caso real de Boyomo, del Atlético Osasuna, que motivó el
  cambio). `COLOR_DIFICULTAD_CALENDARIO` reutiliza literalmente los
  valores de `COLOR_DIFICULTAD` (el de los partidos individuales en
  Equipos) en vez de definir colores propios, para que combinen siempre
  aunque `COLOR_DIFICULTAD` cambie en el futuro. Esta paleta absoluta solo
  se usa en Jugadores; en Comparador la columna sigue con el verde/rojo
  relativo de `colorMejorPeor()` (mismo criterio que el resto de columnas
  numéricas ahí), decisión explícita del usuario para no mezclar los dos
  sistemas de color.
- **Banquillo de Equipos, agrupado por posición**: `calcularFormacion()`
  en `lib/formacion.ts` seguía escogiendo los 10 suplentes por
  probabilidad (sin cambios, sigue siendo el criterio de quién entra en
  el banquillo) pero ahora aplica un segundo `.sort(compararBanquillo)`
  solo para el ORDEN de presentación dentro de esos 10 ya elegidos:
  Portero primero, luego Defensa, Mediocampista y Delantero, con la
  probabilidad como desempate dentro de cada grupo.

## Decimotercera ronda: Mi equipo con datos reales, arreglo del scroll de Filtros (24/08/2026)

**Dos arreglos rápidos primero**:
- `MenuFiltros.tsx` cerraba el panel entero al hacer scroll dentro de la
  propia lista de casillas (el listener de `scroll` en `window` no
  distinguía si el scroll era del panel o de la página) — arreglado
  comprobando `panelRef.current?.contains(evento.target)` antes de cerrar.
- `Comparador.tsx` ya no activa ningún filtro por defecto (petición
  explícita del usuario, antes traía 9 activados de fábrica).

**Mi equipo, de relleno sintético a datos reales**: hasta ahora la página
usaba los 25 jugadores de mayor valor como plantilla falsa (documentado
como pendiente desde el rediseño de la web). Investigando la API de
LaLiga Fantasy para traer el dinero real del club se descubrió que
`GET /leagues/{id}/teams/{teamId}` (el mismo endpoint que ya se llama por
cada equipo de la liga para `buyoutClause`, sin petición extra) también
trae `teamMoney` (dinero del manager) y `playersNumber` (fichas) para
cualquier equipo, incluido el propio. Nueva variable `LALIGA_FANTASY_TEAM_ID`
(`38394495`, el equipo de "Vicent Blanquez" en la clasificación) en
`Configuración local.py`, mismo patrón que `LALIGA_FANTASY_LEAGUE_ID` —
**pendiente añadir el secreto en GitHub** para que el cron lo recoja (sin
él, `id_mi_equipo` es `None` y `mi_club` nunca se rellena, sin romper nada
más).

**Por qué hace falta una tabla nueva y no basta con la API**: el juego
sabe qué 14 jugadores son tuyos, pero no sabe si tú los consideras
titulares, suplentes, en duda o en seguimiento — eso es una categorización
personal dentro de nuestra web, no un dato del juego. Tabla nueva
`mi_equipo_jugadores` (`jugador_id` PK, `estado` con check de los 4
valores), gestionada **enteramente desde la web** (primera vez que la web
escribe en la base de datos, no solo lee) a través de dos server actions
nuevas (`accionEstablecerEstadoMiEquipo`, `accionEliminarDeMiEquipo`) que
llaman `revalidatePath("/mi-equipo")` tras cada cambio. Tabla `mi_club`
(fila única con `dinero`/`fichas`) sincronizada por el pipeline normal
como cualquier otra tabla (`sincronizar_mi_club()`, borra-y-reinserta como
`calendario`). Ambas tablas creadas directamente contra Supabase (aditivo,
sin tocar datos existentes) y documentadas en `Esquema base de datos.sql`.

**Fórmulas de las 4 tarjetas**, orden pedido explícitamente (Valor de mi
club, Valor de mi equipo, Revalorización, Fichas de mi equipo):
- Valor de mi equipo = suma de `valor` de titulares + suplentes.
- Revalorización = suma de `diferenciaValor` de titulares + suplentes
  (los negativos restan, no se ignoran).
- Valor de mi club = Valor de mi equipo + `mi_club.dinero` (el dinero
  real de la app, **sin contar ninguna puja activa** — es literalmente
  `teamMoney` tal cual lo da la API; no se ha podido confirmar en directo
  si esa cifra ya excluye pujas pendientes porque no había ninguna activa
  al probarlo, revisar si algún día no cuadra con la app real).
- Fichas de mi equipo = `mi_club.fichas` (de la API, no contado desde
  titulares+suplentes — pueden no coincidir si el usuario no ha colocado
  manualmente todos sus jugadores reales todavía, es intencional).
- Revalorización ya pintaba en rojo/verde según signo desde antes de esta
  ronda (el usuario preguntó si estaba contemplado — sí, confirmado).

**Un solo componente `MiEquipo.tsx`** (antes iba todo directo en
`page.tsx`, ahora ese archivo solo hace `obtenerJugadores()` +
`obtenerMiClub()` y delega, mismo patrón que `Explorador`/`Comparador`).
La colocación en el campo ya no usa `calcularFormacion()` (esa función
elige titulares por probabilidad, aquí los elige el usuario a mano vía el
menú) — construye el objeto `Formacion` directamente agrupando los
titulares por `posicion` con el mismo `LINEAS_ORDEN` que ya usaba
`formacion.ts` (exportado para poder reutilizarlo). El campo reutiliza
literalmente el componente `CampoTactico`, así que las medidas son
idénticas a Equipos por construcción, no por copiar valores a mano.

**Menú de acciones al hacer clic en un jugador**: modal centrado (mismo
patrón visual que `HistorialPuntos`/`ProximosPartidos`, no un menú
flotante posicionado) con las 4 opciones de estado **excluyendo la que ya
tiene** (si es titular, no se le ofrece "Poner como titular") más
"Eliminar" (borra la fila de `mi_equipo_jugadores`, no toca `jugadores`).
El buscador de "+" (campo, banquillo, en duda, seguimiento — los 4 usan
literalmente el mismo componente ahora) se extrajo a
`BuscadorJugador.tsx` desde el que tenía Comparador, para que sean
exactamente el mismo componente en vez de dos copias — sin restringir a
los jugadores reales del usuario, busca en todo el catálogo (permite
"fichar" a cualquiera hipotéticamente o seguir a un jugador que todavía
no es tuyo).

**`FotoJugadorSlot.tsx`, `CampoTactico.tsx` y `Banquillo.tsx` ganaron
props opcionales** (`lineas`, `datosPorJugador`, `onClick`) sin tocar el
comportamiento por defecto de quien no los pasa (Equipos sigue exactamente
igual). Mi equipo usa Filtros restringido a 4 categorías (Titularidad,
Valor, Revalorización, Dificultad del calendario, vía `excluir` de
`MenuFiltros`, igual mecanismo que ya usaba Comparador) para decidir qué
líneas de texto se muestran encima de cada foto — en el campo (fondo
verde) siempre en blanco para que se lea bien, en las tarjetas blancas
(banquillo, en duda, seguimiento) con los mismos colores que ya usa el
resto de la web (verde/rojo para revalorización, la paleta de
`COLOR_DIFICULTAD_CALENDARIO` para dificultad).

**Delanteros ya no aparecen tan adelantados**: la línea de delanteros
(ahora la última, tras invertir el campo en la ronda anterior) quedaba
literalmente dentro del área pequeña porque `justify-between` pega el
último elemento al borde exacto del contenedor y el área se dibuja con
una altura fija (150px) independiente del tamaño real del campo. Se
cambió el padding de `CampoTactico` de uniforme (`p-6`) a asimétrico
(`pt-10 pb-[140px]`), verificado en directo con las coordenadas reales:
la foto del delantero termina ahora a 8px del borde del área (antes
quedaba dentro). Mismo componente que usa Equipos, así que el arreglo
beneficia a ambas páginas por igual — comprobado que allí también mejora.

**Datos de prueba**: se insertaron a mano en `mi_equipo_jugadores` los 14
jugadores reales de la plantilla del usuario (11 titulares en un 4-3-3,
3 suplentes) para poder verificar toda la función de principio a fin con
datos reales antes de darla por buena — el usuario puede reorganizarlos
como quiera desde el menú, esto era solo para no probar contra una
plantilla vacía.

## Decimocuarta ronda: recorte real de Filtros, "Valor sin cláusula", reglas de Mi equipo (24/08/2026)

**El recorte de Filtros no era el mismo bug de antes**: esta vez el panel
sí vivía en un portal sin ningún `overflow` ancestro (ya arreglado en la
ronda anterior), pero seguía calculando una altura fija (`max-h-[70vh]`)
sin comprobar si el botón estaba lo bastante arriba en la pantalla como
para que esos 70vh cupieran de verdad — en Comparador, con el botón cerca
de la mitad de la pantalla, el panel se extendía por debajo del borde
inferior del viewport, y al ser `position: fixed`, esa parte no se podía
alcanzar ni haciendo scroll de la página (un elemento fijo no se mueve
con el scroll, así que lo que queda fuera del viewport queda fuera para
siempre, no es cuestión de scrollear más). `MenuFiltros.tsx` ahora calcula
el espacio real disponible arriba y abajo del botón en el momento de
abrir, y decide: si cabe mejor arriba, abre hacia arriba (`bottom` en vez
de `top`); el `maxHeight` real es el menor entre el espacio disponible y
70vh. Verificado en directo forzando el caso real (botón a mitad de
pantalla): el panel se abrió hacia arriba y se pudo hacer scroll hasta
"Puntos DAZN" (el último de la lista) sin que nada quedara inalcanzable.

**Mi equipo, reglas de negocio que faltaban** (`establecerEstadoMiEquipo`
en `db.ts`, ahora con transacción):
- Máximo 11 titulares — si ya hay 11 y se intenta añadir un 12º, se
  rechaza y la web muestra un aviso (`alert`) en vez de aplicar el
  cambio.
- Poner un portero de titular habiendo ya otro portero titular sustituye
  al anterior (pasa a suplente) **sin contar contra el límite de 11** —
  es un intercambio neto cero, no una incorporación. El primer intento
  de esta regla la aplicaba en el orden equivocado (comprobaba el límite
  antes de detectar que era un intercambio de portero), lo que bloqueaba
  precisamente el caso que debía funcionar solo — corregido comprobando
  primero si hay portero titular a sustituir.
- Probado en directo con datos reales: intentar un 12º titular (no
  portero) → bloqueado con el aviso correcto; poner un segundo portero
  de titular → el primero pasa a suplente automáticamente y el conteo se
  queda en 11.

**Colores de jugador en el campo, unificados con Jugadores**: antes el
campo (fondo verde) mostraba todo en blanco a propósito, para que se
leyera bien — el usuario pidió explícitamente mantener los mismos
colores que en Jugadores (verde/rojo para revalorización, la paleta de
dificultad) incluso ahí, así que se quitó la distinción; ahora
Revalorización y Dificultad del calendario salen coloreadas también
sobre el césped.

**Dificultad del calendario, clic igual que en Jugadores**: `FotoJugadorSlot`
ahora acepta un `onClick` por línea (antes solo uno para todo el bloque);
la línea de dificultad abre el mismo modal `ProximosPartidos` que
Jugadores, sin activar también el menú de acciones del jugador
(`stopPropagation`). Verificado en directo: clic en "Normal"/"Difícil"
abre los partidos reales del equipo, clic en la foto o el nombre sigue
abriendo el menú de titular/suplente/duda/seguimiento.

**`BotonAgregar.tsx` tenía `bg-white` fijo en la clase base**, y el
`className` que le pasábamos para los botones "+" en gris se añadía
*después* en el string — en CSS compilado por Tailwind el orden de las
clases en el HTML no decide cuál gana, así que `bg-white` seguía
ganando pese a venir primero visualmente en el código. Arreglado
quitando el `bg-white` de la clase base y poniéndolo como valor por
defecto del propio prop `className`, para que nunca haya dos clases de
fondo compitiendo. Los 4 botones "+" de Mi equipo (campo, banquillo, en
duda, seguimiento) miden ahora 52px y usan el mismo gris `#F5F5F7` —
confirmado en directo que ya no salían blancos.

**Nueva columna "Valor sin cláusula"** (`jugadores.valor`, el
`marketValue` oficial de la API — hasta ahora se traía a la base de
datos pero no se exponía a la web en ningún sitio, solo se usaba
`valor_liga` bajo el nombre `valor`). Añadida a `COLUMNAS_OPCIONALES`
justo después de Titularidad y antes de Valor, en Jugadores, Comparador
(menor es mejor, igual que Valor) y Mi equipo. **La gráfica del
histórico se movió de "Valor" a "Valor sin cláusula"** — el clic para
abrir `GraficaValor` ya no está en la columna Valor, solo en la nueva;
la gráfica en sí sigue leyendo `historial_valor` tal cual (esa tabla seguía
guardando esencialmente el mismo dato salvo para los pocos jugadores con
la cláusula subida a mano, ver Séptima ronda), no ha hecho falta ninguna
tabla ni pipeline nuevo.

~~Pendiente de aclarar con el usuario...~~ **Resuelto (24/08/2026, ver
"Decimoquinta ronda" más abajo)**: `GET /leagues/{id}/teams/{teamId}` no
tiene ningún campo aparte para dinero comprometido en una puja — el único
dato de dinero que devuelve es `teamMoney`, confirmado con un volcado en
directo de la respuesta completa (`loanedPlayers`, `teamMoney`,
`playersNumber`, `id`, `managerId`, `startingWeek`, `banned`,
`teamValue`, `teamPoints`, `position`, `manager`, nada más). Como el
usuario pidió explícitamente usar "el dinero que tengo sin tener en
cuenta la puja", y `teamMoney` es el único número que existe, ya es
exactamente ese dato — no hizo falta ningún cambio de código en `Valor
de mi club`.

## Decimoquinta ronda: navegación cruzada entre páginas, persistencia de filtros, y más arreglos de Mi equipo (24/08/2026)

**Persistencia de selecciones y filtros** (`Jugadores` y `Comparador`):
petición del usuario de que buscador, filtros de equipo/posición,
columnas visibles, orden y jugadores seleccionados/comparados
sobrevivan a navegar a otra página, recargar la web, o cerrarla y volver
otro día — antes todo ese estado vivía en `useState` normal, se perdía
en cuanto el componente se desmontaba. Nuevo hook
`Web/src/lib/usePersistedState.ts`, un `[valor, setValor]` con la misma
forma que `useState` pero respaldado por `localStorage` bajo una clave
por campo (`fantasy.jugadores.busqueda`, `fantasy.comparador.columnas`,
etc.). Construido con `useSyncExternalStore` en vez del patrón obvio
`useState` + `useEffect` para leer `localStorage` al montar — el ESLint
de este proyecto (`eslint-config-next` 16, reglas del React Compiler)
rechaza como error tanto "setState síncrono dentro de un efecto" como
"leer/escribir un ref durante el render", así que el patrón clásico de
"leer localStorage en un `useEffect` y volcarlo a `useState`" no compila
limpio aquí; `useSyncExternalStore` sí es la vía sancionada por React
para sincronizar con un almacén externo sin esos problemas, con
`getServerSnapshot` devolviendo `null` para que el render en servidor
(las páginas de `/jugadores` y `/comparador` son estáticas,
`revalidate = 300`) no reviente ni desajuste la hidratación. `setValor`
escribe a `localStorage` y notifica a un pequeño registro interno de
"escuchas" por clave para que el propio hook se entere del cambio y
re-renderice.

**Selección de jugador desde Equipos → Jugadores sin filtros**: cada
foto de jugador de `/equipos/[id]` (alineación real, banquillo, y dentro
del nuevo modal de partido, ver abajo) es ahora un enlace a
`/jugadores?seleccionado={id}` (nuevo prop `href` en
`FotoJugadorSlot.tsx`, que envuelve el slot entero en un `next/link` en
vez de un `div` con `onClick` cuando se le pasa `href` — evita el
problema de pasar una función de un Server Component a un Client
Component, ya que `CampoTactico`/`Banquillo` no tienen "use client" y se
usan tanto desde `/equipos/[id]` — página de servidor — como desde
`MiEquipo.tsx` — cliente —, así que solo strings serializables viajan
como prop, nunca una función). `Explorador.tsx` lee ese `?seleccionado=`
con `useSearchParams()` en un `useEffect`, limpia búsqueda y filtros de
equipo/posición, fija la selección a ese único jugador, y usa
`router.replace("/jugadores")` para quitar el parámetro de la URL sin
dejarlo pegado tras la primera carga. `useSearchParams()` obliga a
envolver `Explorador` en un `<Suspense>` en `jugadores/page.tsx` (la
página es estática) según la documentación de Next 16, si no el build de
producción falla con "Missing Suspense boundary".

**Jugadores "fantasma" nunca enlazan**: los banquillos sintéticos de
`posicion_sin_oficial` usan ids negativos sintéticos (`-(i+1)`, ver
"Tres catálogos distintos") que no existen en la tabla `jugadores` — el
nuevo `hrefsJugadores()` de `lib/formacion.ts` los excluye explícitamente
al construir el mapa de `id → href`, así que esas fotos siguen sin ser
clicables (no hay a dónde llevar).

**Modal de partido al hacer clic en la lista de "Próximos partidos"**:
nuevo componente `ModalPartido.tsx` + server action
`accionDetallePartido(equipoId, orden)` en `actions.ts` (reutiliza
`obtenerEquipoDetalle` + `obtenerJugadoresEquipo` + `calcularFormacion`,
nada de tablas ni queries nuevas). Al pulsar cualquier tarjeta de la
lista de partidos (`ListaProximosPartidos.tsx`, nuevo wrapper cliente
para la lista de `/equipos/[id]`) se abre el modal con la cabecera VS de
ese partido concreto, el campo táctico + banquillo, y la misma lista de
próximos partidos **excluyendo el que se pulsó**; pulsar otra tarjeta
dentro del propio modal cambia de partido sin cerrar y reabrir (estado
`ordenActual` interno, no una pila de modales). Importante: la
alineación que se muestra es siempre la **misma** probable alineación
actual del equipo (`calcularFormacion` sobre `jugadores`/
`posicion_sin_oficial`) — futbolfantasy.com solo publica un snapshot de
alineación probable por equipo (la del próximo partido), no una por cada
partido futuro de la lista, así que no existe (ni puede existir con los
datos actuales) una alineación distinta para un partido de dentro de
varias jornadas; se acepta mostrar siempre esa misma alineación porque es
la única información real disponible, en vez de inventar nada.

**Clic en cualquier escudo/nombre de equipo lleva a su ficha**: dentro
de `TarjetaProximoPartido.tsx` (usado en la lista de próximos partidos y
en el modal nuevo) y en la cabecera VS de `/equipos/[id]`, cada bloque de
equipo (nombre + escudo) es ahora un `next/link` a `/equipos/{id}`, con
`stopPropagation` en el de dentro de la tarjeta para que no dispare
también el clic de "abrir modal de este partido" de la tarjeta que lo
contiene. Solo enlaza si el equipo tiene `id` conocido (el rival puede
no estar en la tabla `equipos` todavía).

**Mi equipo — "Valor de mi equipo" pasa a ser `valorSinClausula`**:
hasta ahora sumaba `valor` (que en la consulta de `obtenerJugadores()` es
en realidad `valor_liga`, la cláusula) — el usuario aclaró que quiere la
suma del valor oficial del juego (`marketValue`, igual en cualquier
liga), no el de su liga concreta. Cambiado en `MiEquipo.tsx`
(`valorEquipo` sobre `j.valorSinClausula`); `valorClub` (que es
`valorEquipo + dinero`) hereda el cambio automáticamente. Verificado en
directo contra la plantilla real de prueba: la suma coincidió
exactamente con el campo `teamValue` que devuelve la propia API de
LaLiga Fantasy para el club (194.190.648 en ambos), confirmando que la
fórmula nueva es la correcta.

**Colores de Revalorización/Dificultad sobre el campo verde,
diferenciados de las tarjetas blancas**: el verde de "positivo"
(`#16A34A`) y el verde de "Muy baja/Fácil" dificultad casi se fundían
con el verde del césped (`#5B9D70`–`#3E8055`). Nuevas paletas pastel
`COLOR_DIFICULTAD_CALENDARIO_CAMPO` y `COLOR_REVALORIZACION_CAMPO` en
`lib/formato.ts` (mismo mapeo de categorías, tonos mucho más claros:
`#CFFFDF`, `#CFE8FF`, `#FFF2A8`, `#FFD8A8`, `#FFC9C9`), usadas solo
dentro de `CampoTactico` (nuevo parámetro `enCampo` en
`lineasParaJugador()` de `MiEquipo.tsx`, que ahora calcula dos mapas de
`datosPorJugador` — uno para el campo, otro para banquillo/en duda/
seguimiento, que siguen con la paleta saturada de siempre porque ahí sí
contrasta bien contra blanco). Verificado en directo con
`getComputedStyle`: un jugador titular con revalorización negativa pintó
`rgb(255, 201, 201)` sobre el campo, y un suplente con revalorización
positiva en la tarjeta blanca del banquillo pintó `rgb(22, 163, 74)` — la
paleta correcta en cada sitio.

**Sin límite de titulares**: se quitó la comprobación de
`MAXIMO_TITULARES` (11) en `establecerEstadoMiEquipo()` — el usuario
quiere poder poner más de 11 titulares. Se mantiene intacto el
intercambio automático de portero (poner un segundo portero titular pasa
al anterior a suplente, sin pasar por el límite porque ya no existe
ningún límite). Probado en directo por el propio usuario mientras se
trabajaba en esta sesión: puso a 3 suplentes más como titulares (13 en
total) sin que la web lo bloqueara.

**Botones "+" de banquillo/en duda/seguimiento, arreglo real de tamaño y
centrado**: el intento de la Decimocuarta ronda arregló el color pero no
el tamaño (52px, cuando las fotos de al lado son de 62px) ni contaba con
que el nombre del jugador ocupa una tercera línea debajo de la foto que
el hueco del botón "+" no reservaba — con `align-items: stretch` por
defecto del contenedor flex, el botón quedaba descentrado verticalmente
en cuanto había más de una fila de datos opcionales encima de las fotos.
Nuevo componente `RanuraAgregar.tsx`: mismo alto que una `FotoJugadorSlot`
real — un bloque de líneas invisibles arriba (tantas como columnas
opcionales estén activas, `numLineasActivas` contado desde
`columnasVisibles`), el botón "+" a 62px, y una línea invisible más abajo
del mismo tamaño que el nombre — usado en `Banquillo.tsx` y en las
secciones "En duda"/"Seguimiento" de `MiEquipo.tsx`. Verificado en
directo con `getBoundingClientRect()`: la fila de fotos del banquillo y
el botón "+" comparten el mismo `top` exacto, con 0 filtros activos y
también con 1 activo (confirma que el cálculo dinámico de líneas
funciona, no solo el caso por defecto).

**Verificación de esta ronda**: el navegador integrado no tuvo panel
visible en esta sesión (capturas y clics simulados con coordenadas
fallaron: "the Browser pane is not displayed"), así que la verificación
se hizo leyendo el árbol de accesibilidad, disparando eventos DOM reales
(`pointerdown`/`mousedown`/`pointerup`/`mouseup`/`click`, que sí
llegaban a React) y comparando estilos computados/posiciones en vez de
capturas de pantalla — más las pruebas del propio usuario en su pestaña
real mientras se trabajaba (el servidor de desarrollo recarga solo con
Turbopack). Sin errores de consola ni del servidor en ninguna página
tocada (`/jugadores`, `/comparador`, `/equipos`, `/equipos/[id]`,
`/mi-equipo`).

## Decimosexta ronda: arreglos reales de la ronda anterior (24/08/2026, mismo día)

El usuario probó en directo los cambios de la Decimoquinta ronda y encontró que dos de los arreglos no eran del todo correctos:

**Nombre de equipo separado del escudo en "Próximos partidos", causa real**:
`TarjetaProximoPartido.tsx` envolvía el nombre en `next/link` (Decimoquinta
ronda) pero la clase `text-right`/`text-left` se quedó en un `<span>`
**dentro** del enlace en vez de en el propio enlace — un `<a>` dentro de
una celda de grid sí se estira para ocupar toda la columna (`justify-self:
stretch` por defecto), pero el `text-align` de un `<span>` interno no
alinea nada dentro de esa celda estirada, solo dentro de su propia caja
diminuta ajustada al texto. El resultado visual era el mismo que si no
hubiera alineación: el texto pegado al lado contrario del escudo con todo
el ancho de la columna vacío en medio. Arreglado moviendo la clase de
alineación al propio `<Link>` (o al `<span>` de respaldo cuando no hay
`id`, ver `ConEnlaceAEquipo` en el mismo archivo) — el mismo patrón que ya
usaba correctamente la cabecera VS de `/equipos/[id]` y `ModalPartido.tsx`
(ahí el `className` sí iba directo en el `Link`, por eso esos dos sitios
nunca tuvieron el problema). Verificado en directo con
`getBoundingClientRect()`: el hueco entre el borde derecho del nombre y
el borde izquierdo del escudo pasó a ser de 8px exactos (el `gap-2` del
grid), antes mucho mayor.

**Botones "+" de banquillo/en duda/seguimiento, esta vez con el tamaño
real, no solo el hueco**: el intento anterior mantenía el botón visible a
62px (el tamaño de la foto) rodeado de líneas invisibles calculadas a
mano (`numLineasActivas`) para simular el alto de una `FotoJugadorSlot`
completa — frágil, porque el nombre real de un jugador puede ocupar más
de una línea (el `span` del nombre en `FotoJugadorSlot.tsx` no tiene
`whitespace-nowrap`, así que nombres largos envuelven) y el cálculo a
mano nunca lo tenía en cuenta. `RanuraAgregar.tsx` reescrito por completo:
ya no intenta adivinar cuántas líneas hacen falta — es un único `<button>`
que ocupa toda su celda del grid/flex (con `align-items: stretch`, el
valor por defecto de ambos contenedores, ya se encarga el navegador de
estirarlo a la altura real de la fila, la misma que ya calcula para las
fotos de al lado, sea cual sea su nombre o cuántas líneas de filtros
tengan activas) con el "+" centrado dentro con flexbox. Lleva un
`minHeight` de respaldo (tamaño de foto + 22px, la altura típica de una
tarjeta con nombre de una sola línea) solo para el caso de una sección
completamente vacía, donde no hay ninguna foto al lado de la que
heredar altura. Verificado en directo con `getBoundingClientRect()` en
tres escenarios reales: banquillo con 1 suplente y 0 filtros (foto y
botón con `height: 84` idénticos), y el mismo banquillo con 2 filtros de
texto activados (`height: 118.75` en ambos, sube junto con la foto sin
tocar el componente).

**Las otras dos cosas que el usuario reportó como mal no eran bugs de
código**: "Valor de mi club" sin sumar el dinero y "Fichas de mi equipo"
en `—` — confirmado con una consulta directa a la base de datos real
(`select * from mi_club`) que la tabla está **vacía**, no que la web lea
mal un dato que sí existe. Encaja exactamente con el pendiente ya
documentado: `sincronizar_mi_club()` borra la tabla entera en cada
sincronización y solo la rellena si `Datos Mi club.csv` trae una fila
(que depende de que `LALIGA_FANTASY_TEAM_ID` esté configurado) — como ese
secreto todavía no está en GitHub, el cron de cada 15 minutos vacía la
tabla una y otra vez contra la base de datos real, aunque en local sí
funcione. No hace falta ningún cambio de código; hace falta que el
usuario añada el secreto (ver "Pendiente").

## Decimoséptima ronda: avisos por Telegram, Grupo A (24/08/2026)

El usuario pidió 16 disparadores distintos de avisos por Telegram. Se
dividieron por si ya teníamos los datos: **Grupo A** (esta ronda, 9
avisos con datos que ya teníamos o a un paso de tener), Grupo B (necesita
saber quién es el dueño de cada jugador de la liga, no implementado
todavía), Grupo C (necesita investigar si existen endpoints de actividad
de mercado / clasificación por jornada / fecha de compra de cláusula —
no investigado todavía) y un ítem de "puntos DAZN de la jornada" que
queda pendiente de Grupo C porque el mensaje pedido necesita el puesto en
la clasificación de la jornada, que no tenemos.

**`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`**: mismo patrón que el resto
de credenciales — en `Configuración local.py` o como secretos de GitHub
Actions, nunca en el código. `Común.enviar_telegram(mensaje)` es la única
función que manda mensajes; si falta cualquiera de las dos variables, o
si la API de Telegram falla, devuelve `False` sin lanzar excepción — un
aviso que no se pudo mandar nunca debe tumbar el pipeline, y ningún sitio
del código marca un aviso como "ya enviado" si `enviar_telegram` devolvió
`False` (para que se reintente solo en el siguiente ciclo).

**Tabla nueva `notificaciones_estado`** (`clave` texto, `valor` texto,
`actualizado_en`): guarda el último valor conocido de lo que sea que un
aviso necesite comparar, para que cada aviso salte **una sola vez por
evento** y no en cada ciclo del cron mientras la condición siga siendo
cierta (ej. un jugador con 4 amarillas no debe avisar 96 veces al día
mientras se quede en 4). El patrón en todas las comprobaciones de
`Notificar Telegram.py` es el mismo: comparar contra `obtener_estado()`,
y solo llamar a `guardar_estado()` dentro de la rama que sí dispara si
`enviar_telegram()` devolvió `True` — las ramas que no disparan (o la
primera vez que se ve un jugador, sin valor anterior con el que comparar)
sí guardan el valor actual sin condición, para tener una base de
comparación real en el siguiente ciclo.

**Fecha real del próximo partido, pieza que faltaba**: `Ingestar datos
3.py` ya calculaba una fecha real (`fecha_obj`, un `date` de Python, en
`_partido_a_evento()`) solo para poder ordenar los partidos por fecha,
pero solo guardaba el texto ya formateado ("Sábado 29/08", sin año) y
tiraba el objeto fecha. Ahora también se guarda `fecha_obj.isoformat()`
como columna nueva "Fecha" en `Datos 3.csv` (en paralelo a "Día", que se
queda igual para no tocar nada de la web), sincronizada a una columna
nueva `calendario.fecha date`. Para encontrar el inicio real de "la
próxima jornada de LaLiga" (no solo el próximo partido de un equipo
concreto): se coge la fila de `calendario` con `competicion = 'LaLiga'`
con la fecha más próxima entre todos los equipos, se mira su `jornada`
(ej. "Jornada 3"), y se calcula el mínimo de fecha+hora entre todas las
filas que compartan esa misma jornada — así no importa que algún equipo
tenga partidos aplazados con `orden` desincronizado respecto al resto.

**Bug real encontrado de paso, `jugadores` llevaba tiempo sin
sincronizar**: probando esta ronda en local, `Sincronizar` falló en la
tabla `jugadores` con `UniqueViolation` en `posicion_sin_oficial_pkey`
— el jugador "Sato" del Valencia salía dos veces en `Datos Posicion.csv`:
una como titular fantasma con 0% de probabilidad (sin `data-probabilidad`
real, un marcador ruido de incertidumbre de rotación) y otra como
suplente real con 50%. Esto contradice el supuesto documentado en la
Quinta ronda ("titulares y suplentes nunca comparten nombre en la misma
ficha") — resultó ser cierto casi siempre, pero no siempre. Arreglado en
`Ingestar datos 3.py`: al combinar `extraer_formacion()` +
`extraer_suplentes()`, si un mismo nombre aparece en las dos listas se
queda solo con la de mayor `probabilidad` (mismo criterio de desempate
que ya usa el resto del archivo), en vez de guardar las dos filas sueltas.
Como el job del workflow no fallaba (el `try/except` de `Sincronizar`
por tabla se traga el error y sigue con las demás), este fallo llevaba
tiempo pasando en cada ciclo sin que nada avisara — motivo de más para
el aviso de fallos de pipeline (ver debajo).

**Aviso de fallo de pipeline, dos capas**: `Sincronizar base de
datos.py` ahora hace `sys.exit(1)` si alguna tabla falló (antes siempre
salía con código 0 aunque una tabla fallara en silencio, como el bug de
arriba demostró en directo) — así el paso "Sincronizar con Supabase" del
workflow sí queda marcado como fallido de verdad. Nuevo paso final en
`scraping.yml` con `if: failure()` que manda un aviso por Telegram con
`curl` directo (sin depender de que Python funcione) si cualquier paso
del job ha fallado.

**Los 8 avisos que sí dependen de datos** viven en el script nuevo
`Scripts/Notificar Telegram.py` (mismo patrón que `Sincronizar`: conecta
a `DATABASE_URL`, una función por comprobación, cada una con su propio
try/except para que un fallo en una no bloquee las demás), y se ejecuta
justo después de `Sincronizar base de datos.py` en el workflow, sin
condición de horario — igual que Sincronizar, corre en los tres
disparos del cron:

- Revalorización diaria del club (una vez al día, primera sincronización
  después de las 8:00, sumando `diferencia_valor` de titulares+suplentes
  — misma fórmula que la web).
- Titularidad de cualquier jugador de `mi_equipo_jugadores` (los 4
  estados) que baje respecto al último valor conocido — "el estado del
  jugador" en el mensaje es `jugadores.estado` (disponibilidad/lesión,
  confirmado con el usuario), no su categoría en Mi equipo.
- Un jugador de `mi_equipo_jugadores` (los 4 estados) que llegue a 4
  tarjetas amarillas acumuladas.
- Fichas del club llegando a 24.
- Faltan 48h para el inicio de la próxima jornada de LaLiga.
- Faltan 2h para la jornada y la alineación titular tiene menos de 11.
- Faltan 2h para la jornada y `mi_club.dinero` es negativo.
- Aviso fijo cada día a las 21:00 (hora de Madrid) de que el mercado
  cierra en 1 hora.

Verificado en local, contra la base de datos real, sin las credenciales
de Telegram puestas todavía: el script corre sin errores y no escribe
ningún estado de "aviso enviado" (solo las bases de comparación),
confirmando que `enviar_telegram` devuelve `False` limpiamente cuando
faltan las credenciales. Pendiente de que el usuario cree el bot y ponga
`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` para probar un envío real.
**Resuelto el mismo día**: el usuario creó el bot, probó un envío real
(`Común.enviar_telegram` directo) y confirmó que le llegó, y añadió los
secretos en GitHub.

**`Ingestar datos liga.py` pasa de cada 15 a cada 5 minutos (25/08/2026,
decisión explícita del usuario)**: antes solo corría en los disparos del
cron `*/15 * * * *`; ahora corre en los del `*/5 * * * *` (se quitó la
condición de `*/15` del todo, porque ese cron ya dispara también en todos
los minutos múltiplos de 15 por su cuenta — mantener las dos condiciones
habría hecho que corriera dos veces en esos minutos). Multiplica por 3
las peticiones diarias de este script contra la API real de LaLiga
Fantasy (de ~1.150 a ~3.450 al día, con la liga actual de 10 mánagers) —
mismo criterio que ya se aceptó en la Novena ronda para
`Ingestar datos detalle.py`, esta vez a menor escala.

**Columnas de valor intercambiadas (25/08/2026)**: "Valor sin cláusula"
pasó a llamarse **"Valor"** y "Valor" pasó a llamarse **"Valor en la
liga"** — solo el texto (`etiqueta` en `COLUMNAS_OPCIONALES`,
`Web/src/lib/columnas.ts`), el dato detrás de cada una no cambió. Antes
el nombre de la columna no coincidía con lo que mostraba (la que
contenía el valor oficial del juego, no específico de tu liga, se
llamaba "Valor sin cláusula", y la que sí es la cláusula real de tu liga
se llamaba solo "Valor").

**Gráfica del histórico de valor (25/08/2026)**: dos cambios en
`GraficaValor.tsx`. `obtenerHistorialValor()` (`lib/db.ts`) ahora filtra
por `fecha >= current_date - interval '1 month'` — la gráfica solo pinta
el último mes (el resto del histórico se queda intacto en
`historial_valor` para lo demás que lo usa, como `calcular_tendencias`).
Y el eje de fechas ya no muestra solo la primera/última fecha con
`flex justify-between` (que además desalineaba con los puntos reales del
SVG) — ahora muestra hasta 6 fechas en formato DD/MM, repartidas
uniformemente y posicionadas con `left` en % exactamente bajo su punto,
para que no se amontonen aunque haya ~30 días de datos.

## Chat con IA sobre jugadores (25/08/2026)

Nueva página `/chat`: un chat en lenguaje natural sobre los datos de los
jugadores (ej. "¿qué jugadores han marcado en total 7 goles?").

**Decisión de arquitectura, confirmada con el usuario**: en cada
pregunta se le pasa a la IA el CSV completo de los ~780 jugadores (todo
lo que ya expone `COLUMNAS_OPCIONALES`) como contexto, en vez de darle
una herramienta para generar SQL — más simple, y más seguro porque la IA
nunca ejecuta una consulta de verdad contra la base de datos. El CSV se
construye en `Web/src/lib/ia.ts` (`jugadoresACsv()`, reutilizando
`formatearCelda()` de `columnas.ts` para que la IA vea los mismos textos
que ve el usuario en la tabla — "Muy difícil" en vez de un número de
dificultad, "—" en vez de `null`, etc.). Los datos se piden frescos
(`obtenerJugadores()`) en cada pregunta, no se congelan al abrir el chat.

La conversación es multi-turno pero solo vive en el estado de React del
navegador (`Chat.tsx`) — no hay tabla nueva ni persistencia en Postgres;
se pierde al recargar la página, a propósito por simplicidad. El
historial se manda como texto plano dentro del propio mensaje
(`construirEntrada()` en `lib/ia.ts`), no usando el mecanismo de estado
de conversación del proveedor — más simple y sin depender de que un id
de conversación siga vivo entre preguntas.

**Empezó como Claude, se cambió a Gemini el mismo día por coste**: la
primera versión usaba `claude-opus-5` (`@anthropic-ai/sdk`), pero el
usuario no quería gastar dinero. Se investigó si el nivel gratuito de la
API de Gemini era una alternativa real — sí existe, pero los términos de
Google **prohíben usarlo para servir a usuarios en la UE/Reino
Unido/Suiza**, solo permiten el nivel de pago ahí. Como el usuario está
en España, técnicamente su propio uso personal cae dentro de esa
restricción — se le explicó esto explícitamente y decidió usarlo de
todas formas, asumiendo el riesgo (bajo, para un proyecto personal de
poco uso) de que Google lo limite o lo bloquee más adelante. Cambiado a
`@google/genai` (paquete oficial) — se quitó `@anthropic-ai/sdk` de
`Web/package.json` al ya no usarse. Sin caché de prompt (Gemini la
gestiona distinto y no hace falta para uso gratuito): cada pregunta
reenvía el CSV completo dentro de `systemInstruction`.

**Modelo `gemini-3.6-flash`**, no `gemini-2.5-flash` como decía la
documentación pública consultada por búsqueda web — al probar la clave
real, la propia API respondió que `gemini-2.5-flash` "ya no está
disponible para usuarios nuevos" y que se use `gemini-3.6-flash`. Motivo
para desconfiar de nombres de modelo sacados solo de búsquedas web sin
probarlos contra la API real cuando cambian con esta frecuencia.

**Verificado en directo (25/08/2026)**: con la clave real del usuario,
"¿qué jugadores han marcado en total 2 goles?" devolvió exactamente los
5 jugadores que dice `puntos_jornada_detalle` de verdad (Raphinha,
Fermín, Aubameyang, Roberto, Mariano) — comprobado con una consulta SQL
directa aparte para confirmar que no se inventaba nada. Una segunda
pregunta en la misma conversación ("de esos, ¿cuál tiene el valor más
alto?") entendió correctamente el "esos" referido a la lista anterior,
confirmando que el historial multi-turno funciona.

**Requiere `GEMINI_API_KEY`** en `Web/.env.local` (local, se consigue
gratis en aistudio.google.com) y como variable de entorno de Vercel
cuando se despliegue — **ya puesta y probada en local (25/08/2026)**.
Si falta, `preguntarSobreJugadores()` (`lib/ia.ts`) devuelve un mensaje
de error
dentro del propio chat en vez de reventar la página (comprobación
explícita de `process.env.GEMINI_API_KEY` antes de instanciar el
cliente).

## Decimoctava ronda: Grupo B/C de Telegram, histórico real de valor, bug de "inicio de jornada" (25/08/2026)

Se cerró casi todo el bloque "Pendiente" de investigación/trabajo técnico que quedaba abierto desde la Decimoséptima ronda. `LALIGA_FANTASY_TEAM_ID` ya estaba añadido en GitHub por el usuario; la captura de referencia del banquillo de `/equipos/[id]` se dio por resuelta sin necesidad de la imagen; Vercel se deja explícitamente para el final, cuando se despliegue la web de verdad.

**Descubrimiento clave, investigando el proyecto de referencia
[Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp)**: el mismo
endpoint que ya se llamaba para la cláusula
(`GET /leagues/{id}/teams/{teamId}`) trae, sin ninguna petición extra, TODO
lo que hacía falta para Grupo B y media Grupo C: `manager.managerName` (el
dueño), `buyoutClauseLockedEndTime` (la fecha exacta en que se desbloquea
la protección de 14 días, el dato que se pensaba había que calcular a
mano) y `playerMarket` (si el propio dueño lo ha puesto en venta dentro de
la liga). Verificado en directo contra la liga real: 123 jugadores con
dueño, 123 con fecha de protección, 64 en mercado en el momento de la
prueba.

**Tres endpoints nuevos, todos verificados en directo contra la API real
antes de usarlos** (ninguno documentado oficialmente, todos descubiertos
leyendo el código fuente de LaLigaApp):
- `GET /league/{id}/market?x-lang=es` (nota: `league` en singular, no
  `leagues` como el resto) — jugadores libres puestos en venta por el
  sistema, para completar "en mercado" también para jugadores que hoy no
  pertenecen a ningún equipo de la liga.
- `GET /leagues/{id}/standing/{semana}?x-lang=es` — clasificación de la
  liga en una jornada concreta (no solo el total de temporada). Resuelve
  el pendiente de "clasificación por jornada". `Ingestar datos liga.py`
  la pide una vez por ciclo, para la última jornada con `weekPoints` en el
  catálogo (sin coste extra relevante: 1 petición más).
- `GET /leagues/{id}/activity/{indice}?x-lang=es` — feed de operaciones
  de mercado de la liga (fichajes, ventas, ofertas entre mánagers).
  Resuelve el pendiente de "panel de actividad". El significado de
  `activityTypeId` no está documentado en ningún sitio; se dedujo
  cruzando el feed real contra el estado actual de propiedad de cada
  jugador: `31` = compra de un jugador libre del mercado (`user1` pasa a
  ser el dueño, sin `user2`), `33` = venta de un jugador al mercado
  (`user1` deja de aparecer como dueño de nadie, sin `user2`), `1` =
  compra directa a otro mánager (`user1` compra, `user2` es quien vende).
  Otros valores de `activityTypeId` no vistos en la prueba real quedan sin
  interpretar.

**Tres columnas nuevas en `jugadores`**: `dueno` (texto, `null` si el
jugador no está en ninguna plantilla de la liga), `protegido_hasta`
(`timestamptz`, la fecha real de `buyoutClauseLockedEndTime`), `en_mercado`
(booleano). Se rellenan en `Ingestar datos liga.py`
(`construir_propiedad_liga()`, que sustituye a la antigua
`construir_valores_liga()`) en el mismo bucle que ya recorría cada equipo
de la liga para la cláusula — sin peticiones extra salvo la del mercado
libre. Van en `Datos Jugadores.csv` (columnas `Dueño`, `Protegido hasta`,
`En mercado`) y las sube `sincronizar_jugadores()`.

**Dos tablas nuevas**: `clasificacion_jornada` (`jornada, manager` PK, se
borra y reinserta solo para la jornada que se acaba de descargar, el
resto de jornadas históricas se quedan intactas) y `actividad_mercado`
(`id` PK = el id real de la operación en LaLiga Fantasy, `insert ... on
conflict do nothing`, va creciendo sin borrar nunca). Ninguna de las dos
tiene todavía un aviso de Telegram ni un sitio en la web — son la base de
datos para construirlos, pendiente de que el usuario concrete el mensaje
exacto que quiere para "puntos DAZN de la jornada" (necesita saber en qué
puesto quedó su equipo esa jornada, ya disponible en
`clasificacion_jornada`) y para el aviso/panel de actividad de mercado
(¿todas las operaciones de la liga, o solo las de jugadores en
seguimiento/mi equipo? ¿aviso en Telegram o vista en la web?).

**Aviso nuevo de Telegram, Grupo B**: "cambio de valor de un jugador en
seguimiento sin cambiar de dueño" (`revisar_seguimiento_sin_cambio_dueno()`
en `Notificar Telegram.py`). Guarda el último dueño conocido de cada
jugador en seguimiento (`mi_equipo_jugadores.estado = 'seguimiento'`); si
el dueño no ha cambiado desde la última vez y `diferencia_valor` (ya
calculado a diario por `calcular_tendencias`) no es cero, avisa — usando
una marca `dueño:diferencia` para no repetir el mismo aviso en cada ciclo
del cron mientras no cambie ni el dueño ni la diferencia del día. Si el
dueño sí cambió, no avisa esa vuelta (un cambio de dueño ya explica por sí
solo cualquier variación de valor) y solo actualiza el dueño guardado.
(Cuadragésima primera ronda: pasó a comparar `valor_liga` en vez de
`diferencia_valor`.)

**Bug real encontrado y arreglado: avisos de "inicio de jornada" con la
jornada equivocada**. El usuario reportó un aviso real de "hoy a las
21:00 h empieza una nueva jornada" para lo que en realidad era un partido
aplazado de la Jornada 1 (ya casi terminada) — confirmado contra la base
de datos real: 8 de 20 equipos todavía tenían pendiente su partido
aplazado de la Jornada 1 (fechas 25-27/08), mientras los otros 12 ya
tenían la Jornada 3 como su próximo partido (la Jornada 2 ya se había
jugado entera). `obtener_proxima_jornada()` cogía sin más la fila de
`calendario` con la fecha más próxima entre *todos* los equipos —
como ese aplazado de Jornada 1 caía antes que el arranque real de la
Jornada 3, se colaba como si fuera el inicio de una jornada nueva.
Arreglado calculando, por cada equipo, cuál es la jornada de su próximo
partido, y quedándose con la jornada que sea la próxima para más equipos
(la mayoría, no la fecha más temprana) — con eso los partidos aplazados
sueltos de una jornada que para el resto de la liga ya pasó dejan de
disparar el aviso. Verificado en directo contra los datos reales: antes
del arreglo la función devolvía la Jornada 1 (el aplazado del
25/08); después, la Jornada 3 (28/08 19:00), la jornada real que
arranca para la mayoría de la liga.

**Histórico real de `valor` (marketValue oficial), backfill hecho**:
nuevo script manual `Rellenar historial valor.py` (utilidad de un solo
uso, como `Descubrir liga.py` — sí imprime progreso). Pide
`GET /player/{id}/market-value` para cada jugador del catálogo actual
(~58 días de histórico real por jugador, confirmado en directo) y lo
inserta en `historial_valor` con `on conflict (id, fecha) do nothing` —
solo rellena huecos del pasado, nunca toca una fila que ya existiera. Ese
histórico es de `marketValue` (valor oficial), no de `valor_liga` (la
cláusula no tiene histórico en ningún endpoint conocido) — se acepta
igual que en la Decimocuarta ronda ("esa tabla guarda esencialmente el
mismo dato salvo para los pocos jugadores con la cláusula subida a
mano"), y de hecho es más correcto que no tener nada: para cualquier día
anterior a que alguien subiera la cláusula a mano, `valor_liga` de ese día
habría sido exactamente `marketValue`.

**Pendiente de que el usuario ejecute en el SQL Editor de Supabase** (la
base de datos real ya tiene datos, así que el esquema nuevo no sirve
solo, hay que aplicar el cambio a mano — mismo patrón que el Paso 9):
```sql
alter table jugadores add column dueno text;
alter table jugadores add column protegido_hasta timestamptz;
alter table jugadores add column en_mercado boolean not null default false;

create table clasificacion_jornada (
    jornada integer not null,
    posicion integer not null,
    manager text not null,
    puntos integer,
    primary key (jornada, manager)
);

create table actividad_mercado (
    id bigint primary key,
    tipo integer not null,
    jugador_id integer,
    usuario_id bigint,
    usuario_destino_id bigint,
    importe bigint,
    fecha timestamptz not null
);
```
Hasta que no se ejecute esto, `sincronizar_jugadores()` vuelve a fallar
entera en cada ciclo (mismo patrón de siempre: no solo se pierde el dato
nuevo, se detiene la actualización normal de `jugadores`) y
`clasificacion_jornada`/`actividad_mercado` fallan también (tablas que
todavía no existen) — sin bloquear el resto del pipeline, gracias al
try/except por tabla de `Sincronizar`.

**Rol de Postgres de solo lectura para la web, hecho y verificado en
directo (25/08/2026)**: nuevo rol `web_solo_lectura` en la base de datos
real (contraseña generada al azar, guardada solo en
`Web/.env.local`, nunca en el chat ni en este documento). Con `grant
select on all tables` no bastaba — el proyecto tiene RLS activado en
todas las tablas ("por si acaso", ver Paso 5 en memoria), así que sin una
política explícita el rol nuevo veía 0 filas pese a tener permiso a nivel
de tabla; se añadió `create policy ... for select to web_solo_lectura
using (true)` en cada tabla. **Descubierto a mitad de la tarea: la web no
es 100% de solo lectura** — `Mi equipo` sí escribe en
`mi_equipo_jugadores` (Decimotercera ronda). Un rol estrictamente de solo
lectura habría roto esa función; se le concedió también INSERT/UPDATE/
DELETE (con su política `for all using (true) with check (true)`)
**únicamente** en esa tabla, confirmado en directo con una prueba real
(UPDATE en `mi_equipo_jugadores` funciona, UPDATE en `jugadores` da
`InsufficientPrivilege`). `Web/.env.local` ya apunta al rol nuevo — falta
reiniciar el servidor de desarrollo para que Next.js recargue la variable
de entorno (no se recarga en caliente). Cuando se despliegue en Vercel,
usar esta misma cadena de conexión (con el rol de solo lectura) como
`DATABASE_URL` de la web, **no** la de `Sincronizar`.

**Dos avisos nuevos de Telegram, con el mensaje exacto que pidió el
usuario**:
- `revisar_puntos_dazn_jornada()`: "Terminaste la jornada X en la
  posición Y de la clasificación, con Z puntos." Se dispara cuando la
  jornada más reciente en `clasificacion_jornada` ya no aparece en
  `calendario` de ningún equipo (esa tabla solo guarda partidos
  *futuros*, así que su ausencia total confirma que la jornada ya
  terminó del todo para toda la liga) — evita avisar con una
  clasificación a medias. **(Eliminado en la Cuadragésima primera ronda.)**
- `revisar_actividad_mercado()`: un mensaje por cada operación nueva de
  cualquier mánager de la liga (fichaje del mercado, venta al mercado, o
  compra directa a otro mánager — los 3 tipos identificados de
  `activityTypeId`), usando los nombres reales vía la tabla `managers`
  nueva. La primera vez que corre no manda nada de golpe (solo fija el id
  más alto ya visto como punto de partida, mismo patrón que el resto de
  avisos con "primera vez que se ve algo") — si no, el primer ciclo tras
  activarse habría mandado un aviso por cada operación de mercado de toda
  la temporada.

**Deduplicación de `extraer_formacion()`, causa real encontrada y
arreglada**: no eran 2-3 equipos por incertidumbre de rotación como se
pensaba — probando en directo contra los 20 equipos reales, **6** tenían
más de 11 candidatos (Valencia 15, Rayo 14, Athletic/Atlético/Getafe 13,
Osasuna 12). Inspeccionando el HTML real de Valencia se encontró que la
ficha de equipo tiene **dos widgets `.camiseta-wrapper` distintos**: el
real (11 markers, con `data-probabilidad` y metadatos de posición
completos, clase `tipo_campo`) y otro con nombres **parcialmente
distintos** (jugadores que ni siquiera aparecían en el primero: De Haas,
Gayà, Rioja, Sato en el caso de Valencia), sin `data-probabilidad` y sin
la clase `tipo_campo` — no era la misma alineación duplicada por vista
escritorio/móvil como se documentó en el Paso 9, sino un widget
completamente distinto (probablemente una plantilla genérica de otro
sitio de la página) colándose por el mismo selector CSS.
`extraer_formacion()` ahora descarta cualquier marcador sin la clase
`tipo_campo` antes de deduplicar por slot/nombre. Verificado en directo
contra los 20 equipos reales: los 6 afectados bajan exactamente a 11,
los otros 14 se quedan igual (ya estaban en 11) — 0 equipos con más o
menos de 11 tras el cambio. `extraer_suplentes()` no tenía este problema
(comprobado: el widget intruso nunca marca a nadie como `suplente`, solo
como `titular`), así que no hizo falta tocarlo.

## Decimonovena ronda: Revalorización en vivo cada 5 min, aviso de retraso de ingesta, mensaje de revalorización con la plantilla real completa (25/08/2026)

**Bug de fondo encontrado revisando el código con el usuario**: `diferencia_valor`
("Revalorización") nunca se calculó con `historial_valor` pese a lo que
decían las notas hasta ahora — en realidad venía directamente de la
columna `Diferencia` que futbolfantasy.com ya trae en su propia tabla de
mercado (`Ingestar datos 1.py`, vía `Común._leer_fila_mercado()`,
`data-diferencia1`). Aunque ese scrape corre cada 5 min como el resto,
no había garantía de que el número que trae futbolfantasy.com cambie con
esa frecuencia — dependía enteramente de cuándo decida actualizarlo su
propia web, fuera de nuestro control. El usuario pidió que este dato
"se coja cada 5 minutos" de verdad, así que se cambió a calcularlo
nosotros mismos:

- `sincronizar_jugadores()` ya no lee `Diferencia`/`Diferencia
  porcentaje` del scrape de futbolfantasy.com (se sigue leyendo
  `Tendencia` para `tendencia_dias`, eso no cambió).
- Nueva `calcular_revalorizacion()` en `Sincronizar`, un paso más del
  pipeline que corre en cada sincronización (cada 5 min): compara el
  `valor_liga` **actual y en vivo** de cada jugador contra el último
  snapshot de `historial_valor` de un día **anterior** a hoy (la
  fotografía de "ayer", que sigue tomándose una sola vez al día, sin
  cambios ahí). Como el lado "actual" es siempre el valor recién
  sincronizado, el número de Revalorización ahora sí cambia cada 5
  minutos, en cuanto cambia el valor oficial del jugador — verificado en
  directo (Pepe: `valor_liga` 83.250.805, `diferencia_valor` +22.017.908,
  +35,96%, coherente con que tiene la cláusula subida a mano).
- La web ya lo refleja al momento sin cambios: `/mi-equipo` no tiene
  `revalidate` (se renderiza contra la base de datos en cada carga), así
  que en cuanto el dato cambia en Postgres se ve en la siguiente vez que
  se entra a la página — cumple el escenario que pidió el usuario
  (cambia a las 00:20, se ve actualizado entrando a las 00:25).
  `/jugadores` y `/comparador` sí tienen `revalidate = 300` (caché de 5
  min, decisión de rendimiento de antes) — pueden tardar hasta 5 min
  extra en reflejarlo ahí; no se tocó porque no se pidió explícitamente,
  pero queda anotado por si el usuario también lo quiere sin caché.

**Aviso de Telegram si algún dato de 5 min se retrasa más de 15 min**
(`revisar_retraso_ingesta()`): en vez de depender de que alguien esté
vigilando el pipeline a mano, ahora el propio sistema avisa solo. Como
`Ingestar datos liga.py`/`1.py`/`estado.py` no tocan Postgres (solo CSV),
y `Sincronizar` corre en los tres disparos del cron (5, 15 y 5h) —
comparar solo la hora de `jugadores.actualizado_en` no serviría, porque
esa columna se actualiza en cualquier disparo aunque el CSV de 5 min no
se haya vuelto a generar. Se resolvió con una huella (`sha256`) de cada
uno de los 3 CSV de 5 min (`Datos Jugadores.csv`, `Datos
Titularidad.csv`, `Datos Estado.csv`) guardada en
`notificaciones_estado`: si la huella cambia respecto al ciclo anterior,
es que el script sí trajo datos nuevos de verdad, y se anota la hora.
`revisar_retraso_ingesta()` compara esa hora contra ahora; si pasan más
de 20 min (5 esperados + 15 de margen, el número exacto que pidió el
usuario) sin huella nueva, avisa una sola vez por episodio de retraso
("Ingestar datos liga.py (Valor, Valor en la liga, Puntos) lleva 23
minutos sin traer datos nuevos..."), y dispara el reset del aviso en
cuanto vuelve a haber huella nueva.

**Mensaje de revalorización diaria, texto y alcance nuevos**: "Buenos
días, tu club hoy se ha revalorizado X de euros" → "Tu equipo hoy se ha
revalorizado X euros." Y deja de sumar solo `mi_equipo_jugadores` en
estado titular/suplente (el subconjunto que el usuario gestiona a mano
en la web) — ahora suma **toda la plantilla real** de la app oficial de
LaLiga Fantasy, identificada por `jugadores.dueno` (que ya se sincroniza
cada 5 min) comparado contra el nombre de mánager del propio usuario.
Ese nombre no estaba guardado en ningún sitio — se añadió captura en
`Ingestar datos liga.py` (mismo punto donde ya se construye `mi_club`,
sin petición extra) y una columna nueva `mi_club.manager`.

**Pendiente de que el usuario ejecute en Supabase**:
```sql
alter table mi_club add column manager text;
```
Hasta entonces, `sincronizar_mi_club()` falla (columna inexistente) sin
afectar al resto del pipeline (ya probado en directo: todas las demás
tablas, incluidas `revalorizacion` y `frescura_ingesta`, sincronizan
bien) — y el aviso de revalorización diaria no podrá mandarse (necesita
`mi_club.manager` para saber qué `dueno` sumar) hasta que se aplique.

## Vigésima ronda: `/jugadores` en directo, bug real de duplicados en el aviso de actividad de mercado (25/08/2026)

**`/jugadores` deja de tener caché de 5 min**: `export const revalidate = 300`
sustituido por `export const dynamic = "force-dynamic"` — ahora se
renderiza contra la base de datos en cada petición, igual que `/mi-equipo`.
Verificado en directo pidiendo el HTML crudo dos veces: `Cache-Control:
no-cache, must-revalidate` en la respuesta, y el valor de Revalorización
de un jugador de prueba (Pepe, `diferenciaValor: 22017908`) coincidiendo
exacto con la base de datos en ese mismo instante. `/comparador` y
`/equipos` se quedan con su caché de 5 min tal cual estaban (no se pidió
tocarlas).

**Bug real de duplicados en `revisar_actividad_mercado()`, encontrado y
arreglado**: el usuario reportó recibir el mismo aviso de actividad
repetido 4 veces la misma madrugada. Causa real, confirmada contra la
base de datos: existe un `activityTypeId` = **6** sin identificar hasta
ahora (ni fichaje, ni venta, ni compra directa) que representa el reparto
de "ganancia de la jornada" — un lote de 9 filas (una por cada mánager de
la liga, el usuario incluido) que la API de LaLiga Fantasy graba **todas
con el mismo `fecha` exacto** (mismo segundo). La consulta ordenaba por
`am.fecha`, y Postgres no garantiza un orden estable entre filas con
fecha idéntica — en ejecuciones distintas del cron, ese lote podía
devolverse en un orden distinto cada vez, lo que hacía que el marcador
`actividad_mercado_ultimo_id` (que se guarda como el último `id`
procesado) retrocediera por debajo de un `id` ya avisado, y ese aviso se
reenviaba en el siguiente ciclo. Arreglado ordenando por `am.id` en su
lugar (determinista, sin empates posibles). Tipo `6` ("ganancia de la
jornada") además se añade a `TIPOS_ACTIVIDAD_EXCLUIDOS` — el usuario
confirmó que no quiere recibir avisos de este tipo (ni el suyo propio ni
el de otros mánagers), así que se descarta sin enviar nada, avanzando
igualmente el marcador para no quedarse atascado reintentándolo. La
plantilla de mensaje "literal como en la app" que dio el usuario ("En la
jornada 2, victordevera0 ha ganado 3.700.000€.") sirvió para confirmar
qué tipo de evento era exactamente — no se implementa porque el tipo
entero queda excluido.

## Vigesimoprimera ronda: bug de formato de números, limpieza de Comparador, revalorización por día, y rediseño de anchos en Equipos/Jugadores/Mi equipo (26/08/2026)

**Bug real de formato encontrado y arreglado, afectaba a toda la web**:
`toLocaleString('es-ES')` en el entorno donde corre esta web no añade el
punto de los miles justo para números de 4 cifras (1000-9999) — `9583`
sale como `"9583"` en vez de `"9.583"`, pero con 5+ cifras sí funciona
bien (`22017908` → `"22.017.908"`). Confirmado con Node directamente.
Sustituido por una función propia (`formatearNumeroEs` en
`lib/formato.ts`, usada también desde `lib/columnas.ts`) que hace el
agrupado de miles a mano con regex, sin depender de `Intl`/`toLocaleString`
para nada. Afecta a todos los números de la web (Valor, Revalorización,
Puntos, etc.), no solo a un sitio.

**Otros arreglos pequeños de esta ronda**:
- "1 puntos" → "1 punto" en el desglose de puntos por jornada
  (`HistorialPuntos.tsx`), tanto en cada línea de estadística como en el
  total de la jornada.
- **Comparador eliminado por completo** (página, componente, enlace del
  menú) — el usuario decidió que ya no hace falta porque en Jugadores ya
  se puede comparar bien con la selección múltiple.
- **`/jugadores` ya no tiene caché de 5 min** (`revalidate = 300` →
  `dynamic = "force-dynamic"`), igual que `/mi-equipo` — se renderiza
  contra la base de datos en cada petición, para que la Revalorización en
  vivo (ver ronda anterior) se vea al momento sin esperar el ISR.
- **Nueva lista "Revalorización por día"** dentro del modal de la gráfica
  de Valor (`GraficaValor.tsx`): debajo de la gráfica y de Mínimo/Máximo,
  un desglose día a día calculado en el propio navegador a partir del
  mismo array de `historial_valor` que ya usa la gráfica (mismo rango,
  el último mes) — sin llamada nueva al servidor.

**Telegram, ajustes del usuario tras probarlo en real**:
- El aviso de "actividad de mercado" mandaba **duplicados** (el mismo
  aviso 4 veces) — causa real: un tipo de evento (`activityTypeId = 6`,
  "ganancia de la jornada", sin jugador) llega en lotes donde varias
  filas comparten el mismo `fecha` exacto (un mismo segundo, una fila por
  cada mánager de la liga); `order by am.fecha` no tiene desempate
  determinista entre esas filas, así que el marcador de "último
  procesado" podía retroceder entre ejecuciones y reenviar avisos ya
  mandados. Arreglado ordenando por `am.id` en su lugar. Tipo `6`
  excluido del todo (el usuario no quiere avisos de "gananciales de
  jornada" de nadie, ni los suyos).
- El usuario decidió excluir **también** los tipos `31` (fichaje del
  mercado) y `33` (venta al mercado) — de este aviso solo queda activo
  el de compra directa entre mánagers (`activityTypeId = 1`).
- Cualquier operación donde el usuario mismo ("Vicent") sea comprador o
  vendedor tampoco genera aviso ("ya sé lo que hago").

**Rediseño de anchos/márgenes en Equipos, Jugadores y Mi equipo (pantalla
de escritorio)**: el usuario pidió aprovechar mejor una pantalla normal
de ordenador. Cambios, todos con clases `lg:` (por encima de ~1024px de
ancho) para no tocar el comportamiento en pantallas pequeñas:
- **Equipos** (rejilla de escudos): mantiene el tamaño exacto de cada
  recuadro de antes (255px), ahora en 5 columnas × 4 filas en vez de
  4×5 — el contenedor se ensanchó (`max-w-[1483px]`) en vez de encoger
  las tarjetas, usando columnas de ancho fijo (`grid-cols-[repeat(5,255px)]`)
  para que el tamaño no dependa del ancho del contenedor.
- **Ficha de equipo** (`/equipos/[id]`): campo+banquillo a la izquierda,
  "Próximos partidos" a la derecha, **los dos con el mismo ancho, 700px**
  (antes "Próximos partidos" ocupaba lo que sobraba), separados 80px
  (`lg:gap-20`, antes 32px). Márgenes laterales de 48px (`px-6 sm:px-12`,
  antes solo 24px) — mismo valor de margen que ya usaba la rejilla de
  Equipos, ahora consistente entre las dos.
- **Mi equipo**: mismo esquema que la ficha de equipo — campo+banquillo a
  la izquierda (700px), a la derecha (también 700px) las 4 tarjetas de
  estadísticas **en una sola fila** (antes 2×2) con "En duda"/"Seguimiento"
  debajo, separación de 80px entre los dos grupos.
- **Jugadores**: el ancho total pasa a **1576px** (antes 1104px) — el
  mismo ancho combinado que la ficha de equipo (700 + 80 de hueco + 700).
  La barra de "Buscar a un jugador" dejó de estirarse con el espacio
  extra (`flex-1` → `w-64` fijo); los botones de Equipos/Posiciones/
  Filtros no se tocaron.
- Todas las páginas afectadas comparten ahora el mismo margen lateral
  (48px) como criterio explícito, y el criterio "campo = próximos
  partidos = 700px" es la referencia para futuras páginas similares.
  `/` (Inicio) se dejó intacta a propósito, según pidió el usuario.

**Verificación de que nada de esto rompe el móvil**: como todos los
cambios de ancho van con el prefijo `lg:`, por debajo de ese punto de
corte cae al diseño de una sola columna que ya existía (pensado para
móvil desde el Paso 8). Comprobado a 375px de ancho en las 4 páginas:
`document.documentElement.scrollWidth` coincide exacto con el ancho de
pantalla en las cuatro (sin desbordamiento horizontal), y capturado en
directo que la ficha de equipo cae a una columna centrada con el campo
reducido a su ancho. La tabla de Jugadores ya tenía scroll horizontal
propio (`overflow-x-auto`) desde antes de esta ronda.

## Vigesimosegunda ronda: bug real de la revalorización diaria (26/08/2026)

**Aviso de Telegram con una cifra imposible, encontrado y arreglado**: el
usuario recibió "tu equipo hoy se ha revalorizado 38.488.526 euros" a las
8:06 de la mañana, cuando la cifra real (la que da la propia app de LaLiga
Fantasy) era de ~3.460.000€. Tres cosas revisadas:

- **Texto**: "euros" → "€" (`"Tu equipo hoy se ha revalorizado
  38.488.526€."`).
- **Bug real de fondo, confirmado contra la base de datos real**:
  `revisar_revalorizacion_diaria()` sumaba `diferencia_valor` de
  `jugadores`, que `calcular_revalorizacion()` calcula sobre `valor_liga`
  (la cláusula) — decisión explícita de la Decimonovena ronda, correcta
  para la columna "Revalorización" que se ve en Jugadores/Comparador
  (coherente con que la web muestra `valor_liga` como "Valor"). El
  problema es que **el usuario tiene la cláusula subida a mano en todos
  sus jugadores** (protegerlos de compra) y esas subidas manuales se
  contaban como si fueran revalorización real de mercado. Verificado
  jugador a jugador: los 13 jugadores de la suma tenían todos
  `valor_liga` muy por encima de `valor` (oficial) — ej. Mikautadze
  69.651.107 de valor oficial contra 76.621.325 de cláusula, con la
  cláusula de ayer en 68.330.131 (casi igual al valor oficial de hoy) y
  la de hoy subida de golpe a 76.621.325. El valor oficial, en cambio,
  apenas se había movido — la cifra real del usuario (~3,46M) es la
  variación del valor oficial, no de la cláusula.
- **Arreglo, sin tocar `calcular_revalorizacion()` ni la columna
  "Revalorización" del resto de la web** (sigue siendo sobre
  `valor_liga`, a propósito): nueva columna `historial_valor.valor_oficial`,
  rellenada cada día junto a la cláusula (`guardar_historial()` en
  `Ingestar datos liga.py` ahora también escribe "Valor oficial" en
  `Datos Historial valor.csv`, `sincronizar_historial()` la inserta).
  `revisar_revalorizacion_diaria()` ahora suma `valor` (oficial, en vivo)
  menos el último `valor_oficial` de `historial_valor` anterior a hoy,
  por jugador de `dueno = mi_manager` — mismo patrón que
  `calcular_revalorizacion()` pero sobre el valor oficial en vez de la
  cláusula. Un jugador sin ningún `valor_oficial` histórico todavía
  (ningún día lo tiene hasta que se aplique el `alter table` de abajo y
  corra un ciclo del cron) simplemente no entra en la suma esa vez, no
  cuenta como 0 erróneo.
- **Timing (a las 8:06, no "cuando se actualiza de verdad")**: no es un
  bug — es la misma ventana de las 8:00 que el usuario pidió
  explícitamente en la Décima ronda (el valor justo después de
  medianoche a veces sale mal y se autocorrige a los pocos minutos, así
  que se espera a las 8:00 para coger un valor ya asentado). Se explicó
  al usuario y se dejó tal cual a petición suya.

**`alter table historial_valor add column valor_oficial bigint;` ya
aplicado (26/08/2026)**: ejecutado directamente contra la base de datos
real con las credenciales de `DATABASE_URL` del propio proyecto, a
petición explícita del usuario (en vez del patrón habitual de pegarlo a
mano en el SQL Editor de Supabase). El aviso de revalorización diaria no
tendrá ningún jugador con `valor_oficial` histórico hasta el primer día
completo después de aplicarlo (necesita al menos una fila de ayer para
tener con qué comparar hoy).

## Vigesimotercera ronda: fallo real en GitHub Actions tras la ronda anterior (26/08/2026)

Las dos primeras ejecuciones del cron después de subir la Vigesimosegunda
ronda fallaron en el step "Sincronizar con Supabase" (`Process completed
with exit code 1`). Causa real, mismo patrón que ya pasó en la Décima
ronda: `guardar_historial()` añadió una columna nueva ("Valor oficial") a
`Datos Historial valor.csv`, pero la caché de `actions/cache`
(`datos-fantasy-v3-`) restauraba el CSV de una ejecución de hoy anterior
al commit, con la cabecera vieja de 5 columnas (sin "Valor oficial"). Al
leerlo con `csv.DictReader`, `sincronizar_historial()` hacía
`fila["Valor oficial"]` sobre filas sin esa clave → `KeyError`, la tabla
`historial_valor` fallaba, y como cualquier fallo de tabla hace
`sys.exit(1)` en `main()`, el step entero se marcaba como fallido (sin
bloquear el resto de tablas, que sí se sincronizaron bien — solo faltó
`historial_valor`/`revalorizacion` esos dos ciclos). Arreglado subiendo la
clave de `actions/cache` a `datos-fantasy-v4-` en `scraping.yml`, para que
el CSV arranque limpio con la cabecera nueva. **Lección para el futuro**:
cualquier cambio de columnas en un CSV que `actions/cache` persiste entre
ejecuciones (los archivos que se van acumulando día a día, no los que se
regeneran enteros en cada corrida) necesita subir también la clave de
caché en el mismo commit, si no la ejecución en GitHub Actions puede
fallar aunque en local funcione perfecto (en local no hay caché vieja).

**Segundo fallo real, justo después de aplicar el arreglo anterior**: la
primera ejecución tras subir la clave de caché a `v4` también falló en
"Sincronizar con Supabase", por una causa distinta. Con la caché recién
reseteada (sin nada que restaurar), esa ejecución concreta fue del cron
de **15 minutos** (`Ingestar datos 3`/`detalle`, ver los `if:` de cada
step en `scraping.yml`) — `Ingestar datos liga.py` (el único script que
genera `Datos Historial valor.csv`) solo corre en el cron de **5**
minutos, así que ese archivo directamente no existía todavía en el disco
del runner. `sincronizar_historial()` lo leía con `leer_csv()` (exige que
el archivo exista, lanza `FileNotFoundError` si no), a diferencia de
`leer_csv_opcional()` que ya usan otras tablas para CSV que pueden no
estar aún generados. Arreglado cambiando esa lectura a
`leer_csv_opcional()` — se autocura solo en cuanto corre el siguiente
cron de 5 minutos, sin bloquear el resto del pipeline mientras tanto
(mismo patrón de try/except por tabla de siempre). **Lección añadida a la
de arriba**: un reseteo de caché no solo pierde el contenido acumulado,
también puede dejar sin generar aún cualquier CSV cuyo script fuente no
corra en *todos* los disparos del cron — hay que leerlo siempre como
opcional salvo que se sepa con certeza que el disparo que llama a
`Sincronizar` es siempre el mismo que genera ese CSV.

**Tercer fallo, mismo origen, encontrado reproduciendo en local antes de
que volviera a pasar en producción**: reproducido el escenario exacto de
una caché fría en un cron de 5 minutos (mover `Datos/` aparte, correr
solo `Ingestar datos 1.py`/`estado.py`/`liga.py`, y llamar a cada función
de `Sincronizar` una a una contra la base de datos real, con rollback
después de cada una para no tocar nada) — con eso se vio en directo, con
el traceback completo (que en producción queda oculto a propósito por la
regla de no imprimir detalle de excepciones), que la tabla que fallaba de
verdad en la ejecución de las 13:26 era **`calendario`**, no
`historial_valor`: `sincronizar_calendario()` leía `Datos 3.csv` con
`leer_csv()` (obligatorio), y ese archivo solo lo genera `Ingestar datos
3.py`, que corre en el cron de **15** minutos — en una ejecución del cron
de 5 minutos con la caché recién reseteada, ese archivo no existe. Mismo
patrón exacto que el fallo anterior, en una tabla distinta.

Revisado el resto de `Sincronizar` por el mismo problema, encontradas
**dos tablas más** en riesgo:
- `sincronizar_jugadores()` leía `Datos Jugadores.csv`/`Titularidad.csv`/
  `Estado.csv` con `leer_csv()` obligatorio — las tres pasadas a
  `leer_csv_opcional()`. Seguro: si no hay filas, la función devuelve 0
  antes de tocar la base de datos (ni upsert ni el `delete from
  posicion_sin_oficial` de más abajo se ejecutan).
- `sincronizar_puntos()` leía `Datos Puntos jornada.csv` con `leer_csv()`
  obligatorio, y además hacía `delete from puntos_jornada_detalle` /
  `delete from puntos_jornada` **antes** de comprobar si había filas —
  con `leer_csv_opcional()` a secas esto habría sido peor que el bug
  original: en vez de fallar (y hacer rollback, sin perder nada), habría
  **vaciado en silencio** esas dos tablas cada vez que el CSV no
  existiera todavía, sin ningún error que avisara. Arreglado pasando a
  `leer_csv_opcional()` **y** moviendo el `if not filas: return 0` antes
  de los `delete` (no solo evita el fallo, corrige un riesgo real de
  pérdida de datos silenciosa que ya existía desde antes, solo que nunca
  se había disparado porque la caché nunca había estado vacía de verdad
  hasta este reseteo).
- `sincronizar_calendario()`: `leer_csv("Datos 3.csv")` → `leer_csv_opcional`.
  El `delete from calendario where equipo = %s` ya estaba dentro del
  bucle por fila, así que no hacía falta reordenar nada — con el CSV
  vacío el bucle simplemente no itera, cero riesgo de borrado.

Verificado en local, dos veces, contra la base de datos real (con
rollback tras cada función, nada quedó escrito): las 13 tablas
sincronizan sin error con `Datos/` reconstruida desde cero solo con los 3
scripts del cron de 5 minutos (antes fallaba en `calendario`).

## Vigesimocuarta ronda: aviso de Telegram por logo de competición que falta (26/08/2026)

El usuario preguntó de dónde salen las imágenes de la web (fotos de
jugador y escudos: API oficial de LaLiga Fantasy, ver "Descargar
imágenes.py" más arriba; logo de competición: **no automático**, mapeo a
mano en `urlLogoCompeticion()` que hasta ahora solo cubría "LaLiga",
cualquier otra competición cae a un fallback silencioso de 3 letras en
`ImagenCuadrada.tsx`, nunca una imagen rota) y si se le podía avisar por
Telegram de una imagen que falte o de una falta de ortografía en la web.
Se le explicó la diferencia de dificultad entre las dos cosas — la
ortografía necesitaría revisión con IA bajo demanda, no es automatizable
como aviso recurrente de cron sin muchos falsos positivos con nombres
propios — y eligió implementar solo el aviso de competición sin logo.

Nueva `revisar_competicion_sin_logo()` en `Notificar Telegram.py`, mismo
patrón que el resto (una vez por competición nueva, vía
`notificaciones_estado`): compara las competiciones distintas de
`calendario` contra `COMPETICIONES_CON_LOGO` (constante en Python, `{"LaLiga"}`,
duplica a mano el mismo conjunto que `urlLogoCompeticion()` en el lado
web — no hay ninguna tabla ni fuente compartida entre los dos lados, así
que si algún día se añade el logo de otra competición en la web hay que
quitarla también de aquí o el aviso seguiría diciendo que falta). Probado
en directo contra la base de datos real: había "Conference League" sin
logo en `calendario` en ese momento, el aviso llegó de verdad por
Telegram y quedó marcado como avisado (no se repite).

**El mismo día, el usuario subió el PNG real** a `Datos/Imágenes/Competiciones/Conference League.png`
(mismo sitio donde ya tenía guardado `LaLiga.png` de referencia). Copiado a
`Web/public/conference-league.png` y añadida la entrada en
`urlLogoCompeticion()` (`imagenes.ts`); `COMPETICIONES_CON_LOGO` en
`Notificar Telegram.py` actualizada a la vez para mantener las dos listas
sincronizadas, tal y como queda dicho arriba. Verificado por red (sin
panel de navegador visible en esta sesión): tanto `/conference-league.png`
como su versión optimizada por Next.js devuelven `200 image/png`, y el
`<img>` de la tarjeta del partido de Conference League del Getafe
(jueves 27/08, playoff contra el Partizan) apunta a la ruta correcta.

## Vigesimoquinta ronda: 10 retoques de Jugadores — orden alfabético con 3 estados, recuadro de equipo, modal de puntos, escudos del modal de dificultad, filtros por defecto (26/08/2026)

El usuario pidió 10 cambios sobre `/jugadores` en un solo mensaje. El
único ambiguo ("ordénalos siempre por orden alfabético") se aclaró con el
usuario antes de tocar código: no es quitar el orden por columna, es que
al pulsar una columna por tercera vez (ya en ascendente) vuelva al orden
alfabético en vez de quedarse encadenada para siempre entre asc/desc —
`orden.clave` pasa a admitir `null` (estado "sin orden", el inicial),
`alternarOrden()` cicla ahora en 3 pasos: sin orden → descendente →
ascendente → sin orden.

- **"Equipo" y "Posición" dejan de ser ordenables** (`CLAVES_NO_ORDENABLES`,
  se les une a "Estado" que ya lo era desde la Octava ronda) — no son un
  valor cuantificable, mismo razonamiento que ya se aplicó entonces.
- **Recuadro de totales de un equipo seleccionado**: usa
  `equipoNombreOficial` en vez del nombre largo interno de `MAPA_EQUIPOS`
  (ej. "FC Barcelona", no "Fútbol Club Barcelona"); quitada la línea
  "N jugadores"; "Valor en la liga" añadida a `CLAVES_EXCLUIDAS_TOTALES`
  (no se suma en ese recuadro, sigue existiendo como columna normal de la
  tabla).
- **Modal de puntos (`HistorialPuntos.tsx`)**: título "Puntos **en** la
  última jornada de..." (antes "de", sin "en", en el modo
  `soloUltimaJornada`); fondo del modal a `bg-[#F5F5F7]` (el gris de toda
  la web, mismo valor que ya usaba `ModalPartido.tsx`) y los recuadros de
  cada jornada a `bg-white` (antes al revés: modal blanco, recuadros
  grises).
- **Flechas de orden de columna, `↑`/`↓` → `▴`/`▾`**: mismo estilo
  (`text-neutral-400 text-xs`) que ya usaban el desplegable de Filtros y
  el desglose de jornada de `HistorialPuntos.tsx`, para que las tres
  fuentes de "esto es ordenable/expandible" se vean iguales en toda la
  web.
- **Escudos del modal de "Dificultad del calendario" (`ModalPartido.tsx`)
  no llevaban a la ficha del equipo**: solo los nombres de equipo del VS
  grande eran `next/link`, los escudos (`ImagenCuadrada`) no — a
  diferencia de `TarjetaProximoPartido.tsx`, que sí envuelve ambos
  (nombre y escudo) desde la Decimoquinta ronda. Añadido el mismo
  envoltorio `Link` a los dos escudos del VS.
- **Filtros activos por defecto en `/jugadores`**: `COLUMNAS_DEFECTO_VISIBLES`
  sustituye al `{}` que traía la Sexta ronda — ahora arrancan activas
  Equipo, Posición, Titularidad, Valor, Valor en la liga, Revalorización,
  Puntos en la última jornada y Dificultad del calendario, en ese orden
  (solo afecta a quien no tenga ya un valor guardado en `localStorage`,
  mismo patrón de "el valor por defecto solo aplica a estado nuevo" que ya
  se aceptó en la Decimotercera ronda para Comparador).

**Verificación de esta ronda, limitada de verdad por primera vez**: el
navegador integrado no llegó a hidratar `/jugadores` en ningún momento de
la sesión (`document.hidden` se quedó en `true` incluso frontando la
pestaña, y frontar no lo cambió) — se investigó a fondo antes de darlo
por un límite del entorno: `/equipos` (sin `<Suspense>`, todo SSR
síncrono) sí hidrataba y medía bien: layout, refs de accesibilidad y
`getBoundingClientRect` reales. `/jugadores` va envuelto en `<Suspense>`
por el `useSearchParams()` de la Decimoquinta ronda, así que necesita el
paso de "reveal" del streaming de React para mostrar el contenido — ese
paso nunca llegó a completarse con la pestaña sin pintar frames, dejando
el HTML real correcto pero enterrado en un `<div style="display:none">`
que nunca se intercambia con el contenedor visible (confirmado leyendo el
árbol completo de `document.body.children`). Sin verificación por clic
posible, se confirmó lo que sí se pudo por lectura directa del HTML
sin pintar (`tsc --noEmit` limpio, cabeceras/orden de columnas exactos,
orden alfabético por defecto, `Filtros (8)` con las claves pedidas) y se
le pidió al usuario que confirmara en su navegador real las 3 piezas que
dependen de verdad de un clic: el ciclo de 3 estados al ordenar, el color
del modal de puntos, y el enlace de los escudos del modal de dificultad.

**Bug real encontrado por el usuario probando en su propio navegador,
mismo día**: los filtros nuevos por defecto (y el orden alfabético)
aparecían un instante al recargar y luego desaparecían — el propio
`localStorage` del navegador del usuario, de sesiones anteriores, ya
tenía guardado el valor **antiguo** (`columnas: {}`, sin ningún filtro
activo) bajo la misma clave `fantasy.jugadores.columnas`. `usePersistedState`
siempre pinta primero con `valorInicial` (tanto en el render de servidor
como en el primer pintado de cliente, porque `getServerSnapshot` devuelve
`null` a propósito, ver Decimoquinta ronda) y solo después, al hidratar,
lee el `localStorage` real — con un valor antiguo ya guardado, ese
segundo pintado pisa el nuevo valor por defecto casi al instante, dando
la sensación de "aparece y desaparece". Mismo problema en potencia para
`orden` si el usuario había dejado guardada alguna vez una columna
distinta a "nombre". Arreglado igual que ya se hace con la clave de
`actions/cache` de GitHub Actions cuando cambia el formato de un CSV
persistido (ver "Vigesimotercera ronda"): las claves de `localStorage`
pasan a `fantasy.jugadores.columnas.v2` y `fantasy.jugadores.orden.v2`,
para que el navegador del usuario arranque limpio con el valor nuevo en
vez de arrastrar el antiguo. Solo afecta al propio `localStorage` del
navegador de cada visitante (no hay nada compartido en servidor), así que
es un cambio sin riesgo — el valor viejo bajo la clave sin `.v2` queda
huérfano sin más.

**Dos retoques más el mismo día**: quitado el escudo del recuadro de
totales de un equipo en `/jugadores` (solo queda el nombre oficial),
`totalesEquipo.equipoId` eliminado del `useMemo` por quedarse sin ningún
uso. Y el recuadro que abre "Dificultad del calendario" en Jugadores
dejó de usar `ModalPartido` (VS grande + alineación completa + banquillo,
pensado para el partido concreto de una tarjeta de "Próximos partidos")
y pasó a usar `ProximosPartidos` — el mismo componente, más simple (solo
título + lista de partidos, sin alineación), que ya usa Mi equipo para
el mismo click. No tenía sentido mostrar la alineación probable del
equipo rival al consultar solo su calendario de dificultad. `ModalPartido`
se queda igual para su uso real: el modal que abre cada tarjeta de
"Próximos partidos" en la ficha de equipo (`ListaProximosPartidos.tsx`),
donde sí hace falta ver la alineación de un partido concreto.

## Vigesimosexta ronda: borrado real de jugadores que desaparecen de la app oficial (26/08/2026)

Hasta ahora un jugador que dejaba de existir en el catálogo oficial de
LaLiga Fantasy (baja definitiva, error de la API, lo que sea) se quedaba
para siempre en `jugadores` con el último dato que tuvo — nada lo volvía
a tocar ni para bien ni para mal, exactamente el mismo patrón de "basura
que nadie limpia" que ya motivó la Novena/Décima rondas para
`minutos_jugados`/`puntos_jornada`. El usuario pidió borrarlo del todo en
vez de dejarlo huérfano, para no gastar espacio guardando algo que ya no
existe.

Nueva `eliminar_jugadores_desaparecidos()` en `Sincronizar base de
datos.py`, paso propio del pipeline justo después de `sincronizar_jugadores`:
compara los `id` que trae ahora mismo `Datos Jugadores.csv` (el catálogo
completo de `/players`, ya filtrado) contra los `id` que ya hay en
`jugadores`, y borra los que sobran — en cascada manual por las FK que
apuntan a `jugadores(id)` sin `on delete cascade`: primero
`mi_equipo_jugadores`, luego `puntos_jornada_detalle` (por FK compuesta a
`puntos_jornada`), `puntos_jornada`, `historial_valor`, y por último la
fila de `jugadores`. `actividad_mercado.jugador_id` no tiene FK real (es
un registro histórico de operaciones de mercado, no un dato en vivo del
jugador) así que se deja intacta a propósito — el `left join` que ya usa
la web/Telegram cae solo a "un jugador" si el id ya no existe.

**Límite de seguridad, `MAXIMO_JUGADORES_A_ELIMINAR_POR_CICLO = 20`**: si
en un ciclo aparecen más de 20 jugadores "desaparecidos" de golpe, no se
borra nada esa vuelta — un salto así de grande es mucho más probable que
sea un fallo del catálogo (API caída a medias, `Datos Jugadores.csv`
corrupto o viejo) que 20 bajas reales a la vez, y el coste de esperar al
siguiente ciclo es cero (la próxima vez que la app oficial reporte un
catálogo real, se vuelve a intentar solo). Mismo criterio de cautela que
ya se aplicó en la Vigesimotercera ronda para no vaciar tablas enteras por
un CSV que no debía estar vacío.

**Probado en directo, encontrando de paso un peligro real de mi propio
método de prueba**: la primera vez que se probó la función contra la base
de datos real dio "2 jugadores eliminados" (Van Oevelen y A. De Pablo) —
alarmante, pero resultó ser un falso positivo: el `Datos Jugadores.csv`
local llevaba desde el día anterior sin refrescar (el cron real de
GitHub Actions sí lo mantiene fresco cada 5 min, pero el `Datos/` de este
PC no se toca solo). Al volver a ejecutar `Ingestar datos liga.py` de
verdad contra la API antes de repetir la prueba, el resultado pasó a 0
(la base de datos y el catálogo real están sincronizados, como debía
ser) — confirma en la práctica el motivo de tener el límite de seguridad
de arriba, y sirve de aviso para cualquier prueba futura de este tipo:
refrescar el CSV real antes de comparar, nunca fiarse de uno viejo en
local. La cadena completa de `delete` también se probó de verdad contra
un jugador real (`A. De Pablo`, id 3233) dentro de una transacción con
`rollback` al final, para confirmar que el orden evita cualquier error de
clave foránea sin llegar a borrar nada de verdad.

## Vigesimoséptima ronda: 8 retoques de Mi equipo (26/08/2026)

- **Botón "+" del campo, 50% transparente** (`opacity-50` añadido solo a
  esa instancia de `BotonAgregar` en `MiEquipo.tsx` — los otros tres "+"
  de banquillo/en duda/seguimiento, misma clase pero sin `opacity-50`, se
  quedan igual).
- **"Valor" quitado del botón de Filtros del campo**: `CLAVES_PERMITIDAS`
  en `MiEquipo.tsx` pasa de 4 a 3 claves (Titularidad, Revalorización,
  Dificultad del calendario) — el `if (columnasVisibles.valorSinClausula)`
  de `lineasParaJugador()` se quitó también, ya no había forma de que
  fuera `true` nunca.
- **`ProximosPartidos.tsx`** (el recuadro que abre cualquier etiqueta de
  dificultad — tanto en Mi equipo como en Jugadores desde la ronda
  anterior, mismo componente compartido): fondo del modal de blanco a
  `bg-[#F5F5F7]`, tarjetas de partido de gris a blancas
  (`fondoTarjeta="#FFFFFF"` a `ListaProximosPartidos`) — mismo patrón que
  ya se aplicó a `HistorialPuntos.tsx` en la Vigesimoquinta ronda.
- **`BuscadorJugador.tsx`, equipo alineado a la derecha**: cada fila pasa
  de texto corrido (nombre + equipo pegados) a `flex justify-between`,
  con el nombre truncado (`min-w-0 truncate`) para que un nombre largo no
  empuje el equipo fuera de la fila.
- **`TarjetaEstadistica.tsx` sin recuadro**: quitado `rounded-[18px]
  bg-white p-[18px]` — se queda en título gris pequeño + dato grande
  debajo, sin caja ni fondo, manteniendo el color de
  `colorRevalorizacion` que ya se le pasaba.
- **"Revalorización" → "Revalorización de mi equipo"** (solo el texto de
  la etiqueta en `MiEquipo.tsx`, el dato detrás no cambió).
- **"En duda"/"Seguimiento", mismo tamaño que "Valor de mi club" etc.**:
  de `text-[20px]` a `text-sm` (14px, el mismo tamaño que ya usa la
  etiqueta gris de `TarjetaEstadistica`) — se dejó el `font-bold` tal
  cual, el usuario solo pidió igualar el tamaño, no el peso ni el color.
- **Nombre del jugador alineado a la izquierda en el menú de
  titular/suplente/duda/seguimiento**: le faltaba `text-left` explícito
  — heredaba el `text-center` del contenedor raíz de la página (el mismo
  que ya centra todo `/mi-equipo` en pantallas pequeñas), a diferencia de
  los botones de debajo que sí llevaban `text-left` desde siempre.

Verificado en directo en el navegador integrado (esta página sí hidrata
en esta sesión, a diferencia de `/jugadores` con `Suspense` — ver
Vigesimoquinta ronda): opacidad `0.5` solo en el botón de 52px del campo,
"Filtros (1)" con solo 3 opciones tras quitar Valor, modal de dificultad
con `rgb(245, 245, 247)` de fondo y 5 tarjetas blancas dentro, fila del
buscador con `justify-content: space-between`, y `text-align: left`
confirmado en el nombre del menú de jugador.

**El mismo día, dos correcciones sobre esta misma ronda** (el usuario
aclaró que el primer intento de los títulos de Mi equipo no era lo que
pedía):

- **Botón "+" del campo, transparencia solo del fondo**: `opacity-50`
  (Vigesimoséptima ronda) hacía translúcido el botón entero, incluido el
  propio símbolo "+" — el usuario quería el fondo difuminado pero el "+"
  a plena opacidad. `opacity` de CSS afecta a todo el elemento y a sus
  hijos por igual, así que no vale para esto; cambiado a
  `bg-[#F5F5F7]/50` (modificador de opacidad de Tailwind 4 sobre un color
  arbitrario), que solo pone alfa en el `background-color` — el color del
  texto del "+" no lleva alfa y se queda opaco del todo.
- **Títulos de "Valor de mi club" etc., estilo real pedido**: no era solo
  iguales entre sí (lo que se hizo en la Vigesimoséptima ronda), sino que
  siguieran el mismo estilo que el título "Posible alineación..." de la
  ficha de equipo (`text-[32px] font-bold text-left`, `letterSpacing:
  "-1px"`) — mismas clases exactas, copiadas de
  `app/equipos/[id]/page.tsx`. `TarjetaEstadistica.tsx` cambia su
  etiqueta de un `<p className="text-sm text-neutral-500">` a un `<h2>`
  con ese estilo grande; el dato sigue debajo (`text-xl font-bold
  tabular-nums`, con el color de revalorización intacto). El grid de 2×4
  de las 4 tarjetas se sustituyó por una sola columna (`flex flex-col
  gap-8`) para que cada título quede seguido de su dato y luego venga el
  siguiente título, tal y como se pidió — ya no hay tarjetas en fila,
  todo es una lista vertical. "En duda" y "Seguimiento" pasan del
  `text-sm` de la ronda anterior al mismo `text-[32px]` grande, con el
  mismo `style` de `letterSpacing`.

Verificado en directo: los 6 títulos (4 datos + En duda + Seguimiento)
salen con `fontSize: 32px`, `fontWeight: 700`, `letterSpacing: -1px` y
`textAlign: left` idénticos entre sí, cada dato en la línea siguiente a
su título; y el botón "+" del campo con `opacity: 1` en el propio
elemento pero `background-color` con alfa `0.5` (formato `lab(... / 0.5)`
que usa Tailwind 4 internamente) y el color del texto sin alfa.

**Tercera corrección sobre la misma ronda, mismo día**: el usuario aclaró
que no se le había entendido del todo bien:

- **`BotonAgregar.tsx`, refactor real (no solo este botón)**: el color
  del icono (`text-neutral-500`) y el fondo de hover (`hover:bg-[#FAFAFC]`)
  estaban fijos en la clase base del componente, igual que le pasaba a
  `bg-white` antes de la Decimocuarta ronda — mismo bug de fondo (dos
  clases de color compitiendo, el orden en el HTML no decide cuál gana en
  el CSS compilado de Tailwind), solo que esta vez en `color` y en
  `hover:background-color` en vez de en `background-color` normal. Se
  comprobó que este componente **solo se usa una vez en toda la web** (el
  "+" del campo de Mi equipo), así que se pudo mover sin riesgo todo el
  color (fondo, texto, hover) al valor por defecto de `className`, dejando
  en la clase base solo estructura/tipografía — mismo patrón exacto que ya
  se estableció entonces, aplicado ahora también a texto y hover.
- **El "+" del campo, blanco y con más transparencia al pasar el ratón**:
  `className="bg-[#F5F5F7]/50 text-white hover:bg-[#F5F5F7]/30"` — el
  icono en `color: white` sin alfa (no se ve afectado por la transparencia
  del fondo, son propiedades CSS distintas) y el fondo baja de 50% a 30%
  de opacidad al pasar el ratón (más transparente, no menos).
- **"En duda"/"Seguimiento" no debían seguir el estilo de "Posible
  alineación..."**: revertidos a como estaban antes de esta ronda entera
  (`text-[20px] font-bold`, sin el `letterSpacing` que sí llevan los 4
  títulos de arriba) — el usuario solo quería ese estilo grande para los
  4 datos del club, no para estos dos títulos.
- **El dato de cada estadística (no el título)**: de `text-xl font-bold`
  a `text-2xl` sin negrita (`font-bold` quitado del todo) y en gris
  (`text-neutral-500` como color por defecto en la clase, con el `color`
  que ya se le pasaba por `style` — el verde/rojo de Revalorización — 
  ganando por especificidad de un estilo inline sobre una clase, sin tocar
  nada de esa lógica).

Verificado en directo: el botón "+" con `color: rgb(255, 255, 255)` y
fondo con alfa `0.5`; "En duda"/"Seguimiento" de vuelta a `20px`/`700`;
los 4 datos a `24px`/`400` (sin negrita) en gris para los tres neutros y
en verde (`rgb(59, 181, 104)`) para Revalorización con valor positivo —
confirma que el color de revalorización se mantiene intacto sobre el
nuevo gris por defecto.

**Cuarta corrección, mismo día**: los datos vuelven a llevar negrita
(`font-bold` restaurado en el `<p>` de `TarjetaEstadistica.tsx`, el resto
de esa línea intacta — `text-2xl`, gris, color de revalorización) y los 4
títulos ("Valor de mi club" etc.) pasan de `text-[32px]` a `text-[20px]`
sin `letterSpacing`, para quedar exactamente del mismo tamaño que "En
duda"/"Seguimiento" — ya no siguen el estilo de "Posible alineación..."
en absoluto, esa referencia queda descartada del todo tras esta ronda de
correcciones. Verificado en directo: los 6 títulos a `20px`/`700`
idénticos, los 4 datos a `24px`/`700`.

**Quinta corrección, mismo día**: el dato de cada tarjeta (24px) se veía
grande respecto al título (20px) — bajado a `text-lg` (18px), verificado
en directo, negrita intacta.

**Sexta corrección/ampliación, mismo día**: los 4 datos vuelven a ir en
una fila (`grid grid-cols-2 sm:grid-cols-4`, la rejilla que se había
quitado en la Vigesimoctava ronda para apilarlos en columna) — con el
título/dato ya sin caja de por sí, la fila no necesita ningún ajuste
visual extra. **Nuevo recuadro "Banquillo" en la columna derecha,
justo encima de "En duda"**: mismo patrón exacto que "En duda"/
"Seguimiento" (título + caja blanca con `FotoJugadorSlot` por cada
suplente + `RanuraAgregar` para añadir), usando el array `suplentes` que
ya existía (el mismo que alimenta el banquillo táctico de debajo del
campo, en la columna izquierda) — el usuario pidió **añadirlo** aquí, no
moverlo, así que el banquillo sigue apareciendo también bajo el campo
como hasta ahora; se muestra en los dos sitios a propósito, con dos
estilos distintos (alineado en filas bajo el campo vs. tarjetas sueltas
como En duda/Seguimiento). Verificado en directo: los 4 datos comparten
el mismo `top` de posición (misma fila), "Banquillo" aparece entre las 4
tarjetas y "En duda", con las mismas 4 fotos que ya se ven bajo el campo.

**Séptima corrección, mismo día**: el usuario aclaró que sí quería
moverlo, no duplicarlo — quitado el `<Banquillo>` táctico de debajo del
campo (columna izquierda) junto con su import, ya no usado en este
archivo. `formacion.banquillo` se sigue calculando igual
(`suplentes.map(aProbable)`) porque el tipo `Formacion` que exige
`CampoTactico` lo requiere como campo, aunque ya no se use para renderizar
nada aquí — solo lo consume ahora el nuevo recuadro "Banquillo" de la
columna derecha, vía el array `suplentes` directamente. Verificado en
directo: la columna izquierda solo tiene ya el campo (1 solo hijo), y
"Banquillo" como título aparece una única vez en toda la página.

## Vigesimoctava ronda: "Revalorización de mi equipo" pasa a ser el dato real de la plantilla oficial (27/08/2026)

El usuario preguntó de dónde salía "Revalorización de mi equipo" en
`/mi-equipo` — sumaba `diferenciaValor` (columna `jugadores.diferencia_valor`,
calculada sobre `valor_liga`/la cláusula) de solo los jugadores marcados
como titular/suplente **dentro de esta web** (`mi_equipo_jugadores`), no
la plantilla real completa de la app oficial. Un cálculo totalmente
distinto al que ya usaba el aviso diario de Telegram
("Tu equipo hoy se ha revalorizado X€"), que suma `valor` (el oficial,
`marketValue`) de **toda la plantilla real** vía `jugadores.dueno`. El
usuario pidió que los dos usen exactamente el mismo número — el de la
plantilla real oficial, sumando también las revalorizaciones negativas
(restan) — y que sea ese número el que vea tanto la web como Telegram.

**Antes de este cambio, ese cálculo "oficial" no se guardaba en ningún
sitio** — solo existía como una consulta SQL suelta dentro de
`revisar_revalorizacion_diaria()` en `Notificar Telegram.py`, calculada
una vez al día. Para que la web lo pueda mostrar en vivo (igual que ya
hace con `diferencia_valor`, actualizado cada 5 min por
`calcular_revalorizacion()`) hacía falta guardarlo en algún sitio que
ambos lados pudieran leer — nueva columna `mi_club.revalorizacion`,
calculada en cada sincronización por la nueva
`calcular_revalorizacion_mi_equipo()` en `Sincronizar base de datos.py`
(paso nuevo del pipeline, el último de todos, después de `mi_club` —
necesita que la fila de `mi_club` y el `manager` ya estén frescos esa
misma vuelta). La consulta es literalmente la misma que ya tenía
`revisar_revalorizacion_diaria()` — se movió de sitio, no se reinventó.
`Notificar Telegram.py` ahora solo lee `mi_club.revalorizacion` en vez de
recalcularlo, así los dos lados leen exactamente el mismo número por
construcción, no por casualidad de tener la misma fórmula copiada dos
veces. El aviso de Telegram **sigue siendo una vez al día** (gate de las
8:00 + `notificaciones_estado`, sin cambios) — "en cuanto se actualicen
los datos" se entendió como "que use el dato fresco calculado cada 5 min
por el pipeline", no como mandar el aviso varias veces al día (el propio
texto del mensaje dice "hoy", y el patrón de toda la web es evitar avisos
repetidos, no generarlos más a menudo).

**Web**: `MiClub` en `db.ts` gana el campo `revalorizacion`,
`obtenerMiClub()` lo lee de la columna nueva. `MiEquipo.tsx` ya no calcula
nada localmente — `revalorizacion = miClub.revalorizacion` directo, y
`colorRevalorizacion` contempla el caso `null` (antes de que el pipeline
calcule algo la primera vez).

**Pendiente de que el usuario ejecute en el SQL Editor de Supabase**
(mismo patrón de siempre — la base de datos real ya existe, el esquema
nuevo no se aplica solo):
```sql
alter table mi_club add column revalorizacion bigint;
```
Hasta entonces, `calcular_revalorizacion_mi_equipo()` falla sola en cada
ciclo (columna inexistente) sin afectar al resto del pipeline —
confirmado en directo reproduciendo el error exacto
(`UndefinedColumn: column "revalorizacion" of relation "mi_club" does
not exist`) contra la base de datos real, con `rollback` después, sin
dejar nada escrito. El resto de la consulta (la suma en sí) ya está
probada porque es la misma que llevaba usando el aviso de Telegram desde
la Vigesimosegunda ronda.

**El usuario ejecutó el `alter table` el mismo día**: confirmado en
directo (`information_schema.columns` ya lista `revalorizacion`) y una
sincronización real de verdad rellenó la columna sin error
(`revalorizacion_mi_equipo: 1 filas sincronizadas`, valor `0` porque
ningún jugador de la plantilla real había cambiado de valor oficial
todavía ese día). **Aviso para la próxima vez que se toque el esquema**:
justo después del `alter table`, la web dio `column "revalorizacion" does
not exist` — no porque no existiera (sí existía, confirmado por Python),
sino porque el servidor de desarrollo (`next dev`) ya tenía la conexión a
Postgres abierta desde antes del cambio y el catálogo de esa conexión no
se había refrescado. Un reinicio del servidor de desarrollo lo arregló al
momento. Mismo tipo de aviso que ya existía para variables de entorno
nuevas (Decimoctava ronda) — un `alter table` en producción también pide
reiniciar `next dev` si lo tienes abierto en local, no solo desplegar.

## Vigesimonovena ronda: rediseño del chat con IA — centrado, flecha dentro del recuadro, y capacidad de recomendar precios (27/08/2026)

El usuario pidió 8 retoques sobre `/chat` en un solo mensaje, todos en
`Chat.tsx` salvo el último:

- **Estado vacío, centrado en toda la pantalla**: antes la barra de
  "Escribe tu pregunta" siempre estaba pegada abajo, incluso sin ningún
  mensaje. Ahora, mientras `mensajes.length === 0`, el contenedor añade
  `justify-center` (en vez de `gap-6` normal) y muestra un bloque
  centrado con el texto "Tu asistente deportivo con IA." encima de la
  barra — en cuanto se envía el primer mensaje, `hayConversacion` pasa a
  `true` y todo cae a la posición de siempre (abajo, con la lista de
  mensajes ocupando el hueco de arriba) — exactamente la disposición que
  ya existía antes de esta ronda, sin tocarla.
- **Botón "Enviar" → flecha "↑" dentro del propio recuadro**: el `<input>`
  y el botón dejan de ser dos cajas separadas en fila; el botón pasa a
  `position: absolute` dentro de un contenedor `relative` que envuelve al
  input, centrado verticalmente a la derecha (`right-2 top-1/2
  -translate-y-1/2`), como un círculo rojo de 32px con la flecha en
  texto plano (mismo criterio del resto de la web: iconos como caracteres
  Unicode, no SVG). Solo se renderiza `{pregunta.trim() && (...)}` — no
  hay que ocultarlo con CSS, directamente no existe en el DOM mientras el
  campo está vacío.
- **Márgenes iguales al resto de la web**: `px-6` solo → `px-6 sm:px-12`,
  el mismo patrón de 48px en pantallas grandes que ya comparten Equipos,
  Jugadores y Mi equipo desde la Vigesimoprimera ronda (a esta página
  se le había olvidado entonces).
- **Burbuja del mensaje propio**: ya era `rounded-[18px]`, un rectángulo
  con esquinas redondeadas — no hizo falta ningún cambio, solo se
  confirmó en directo que seguía así tras el resto de la reestructuración.
- **`lib/ia.ts`, capacidad de recomendar precios**: las instrucciones del
  sistema decían "nunca inventes un dato que no esté ahí", y el modelo lo
  interpretaba también para negarse a dar una cifra de precio recomendable
  (no es una columna literal del CSV). Añadida una aclaración explícita:
  calcular una recomendación razonada a partir de los datos reales
  (Valor, Tendencia, Revalorización, Dificultad del calendario...) no
  cuenta como inventar, siempre que lo diga como una estimación propia.

Verificado en directo con una pregunta real ("¿Qué precio recomendable
pagarías por la cláusula de Lamine Yamal?"): la IA calculó y explicó una
recomendación concreta (precio de cláusula justo, o subir un 2-3% como
mucho) razonando con datos reales (tendencia de 3 días bajando,
revalorización de -1.396.208€, dificultad del calendario), dejando claro
que era una estimación suya — y el contenedor cayó solo a la posición de
abajo (`gap-6`, sin `justify-center`) en cuanto hubo conversación,
confirmando el comportamiento pedido en el punto 3.

## Trigésima ronda: 6 correcciones sobre el chat — centrado real, sombra roja, degradado, burbujas rectangulares y ancho alineado con Jugadores (27/08/2026)

El usuario vio el resultado de la ronda anterior en su propio navegador y
pidió 6 ajustes más, todos en `Chat.tsx`:

- **Centrado vertical real**: el `pt-14 pb-10` que llevaba el contenedor
  siempre (incluso en el estado vacío) desequilibraba el `justify-center`
  — 56px arriba contra 40px abajo, empujando el bloque hacia abajo.
  Ahora ese padding solo se aplica cuando `hayConversacion` es `true`; en
  el estado vacío no hay padding vertical en absoluto, así que
  `justify-center` centra de verdad dentro de los `calc(100vh - 48px)`
  completos.
- **Texto "Tu asistente deportivo con IA"** (sin punto final, como pidió
  el usuario esta vez): de `text-sm text-neutral-500` a `text-3xl
  font-bold`, con un degradado de máscara CSS
  (`mask-image`/`-webkit-mask-image: linear-gradient(to bottom, black
  55%, transparent 100%)`) para que la parte de abajo del texto se
  desvanezca — no es un color de fondo degradado, es la máscara la que
  hace transparente el propio texto progresivamente.
- **Sombra roja alrededor del recuadro de escribir**: `shadow-[0_0_28px_rgba(254,100,95,0.4)]`
  en el `<input>` — mismo rojo exacto (`#FE645F`) que ya usa la burbuja
  del mensaje propio, solo que como sombra difusa en vez de fondo sólido.
- **Burbujas de mensaje, de `rounded-[18px]` a `rounded-[12px]`**: con
  mensajes cortos, un radio de 18px en una burbuja de ~36px de alto
  consumía toda la altura y se veía como una píldora/círculo en vez de un
  rectángulo — 12px (el mismo radio que ya usan los botones tipo
  `BotonAgregar`/`MenuFiltros` en el resto de la web) se nota claramente
  rectangular. Aplicado a las tres burbujas (usuario, IA y "Pensando…").
- **Ancho del chat igualado al de la tabla de Jugadores**: el contenedor
  pasó de `max-w-[700px]` a `max-w-[1576px]` (idénticas clases —
  `mx-auto w-full px-6 sm:px-12` — que ya usa `/jugadores`), así que el
  borde derecho de mis mensajes (`justify-end`) y el izquierdo de los de
  la IA (`justify-start`) caen exactamente donde cae el borde de la tabla
  de jugadores, por construcción CSS, no por coincidencia — misma fórmula
  de márgenes en las dos páginas. El estado vacío (texto + recuadro de
  escribir) se queda en un bloque interior de `max-w-[700px] mx-auto`
  para no verse absurdamente ancho y solo mientras no hay conversación;
  en cuanto hay mensajes, la lista y la barra de abajo ocupan el ancho
  completo de 1576px.

**Verificación de esta ronda, con una limitación real de nuevo**: no se
pudo medir en directo el borde de la tabla de `/jugadores` porque esa
página sigue sin hidratar en esta sesión (ver Vigesimoquinta ronda) — el
contenido real queda enterrado en el `<div style="display:none">` del
streaming de Suspense. Se verificó en su lugar: (1) que el chat usa
exactamente las mismas clases de ancho/márgenes que ya se leyeron del
código fuente de `/jugadores` (garantiza el mismo resultado por
construcción, sin depender de medir la otra página), y (2) con una
pregunta real ("Hola"), que el borde derecho de la burbuja del usuario
cae exactamente a 48px del borde del contenedor (el `sm:px-12` esperado),
con `border-radius: 12px` confirmado por estilo computado. Sombra roja y
máscara de degradado confirmadas también por estilo computado
(`box-shadow` con `rgba(254, 100, 95, 0.4)`, `mask-image` con el
`linear-gradient` esperado).

**Corrección inmediata, mismo día, con una captura de referencia de la
UI de Gemini**: la sombra roja de la ronda anterior (`0.4` de opacidad,
28px de difuminado) se veía demasiado intensa comparada con el halo suave
que el usuario quería — bajada a `0_0_40px_rgba(254,100,95,0.18)` (menos
opacidad, más difuminado, mismo efecto "resplandor ambiental" que la
captura de Gemini). El recuadro de escribir pasó de `w-full` (dentro de
un contenedor de hasta 700px, o de los 1576px completos abajo) a un ancho
fijo de `max-w-[560px] mx-auto` en los **dos** estados — bastante más
estrecho que antes, tanto vacío como una vez hay conversación. El fondo
del botón de enviar pasó de `rounded-full` (círculo) a `rounded-[10px]`
(cuadrado con esquinas redondeadas, el mismo radio que ya usan las
burbujas de mensaje). Y la sombra roja **solo se aplica en el estado
vacío** — se extrajo la barra a un componente `BarraInput` con un prop
`conSombra` para no duplicar el marcado del input/botón entre los dos
sitios donde aparece.

Verificado en directo: `560px` de ancho real en los dos estados,
`box-shadow: none` una vez hay conversación (antes llevaba la sombra
roja sin querer), `border-radius: 10px` en el botón "↑" (ya no
`border-radius: 9999px` de un círculo).

**Ajuste inmediato, mismo día**: la sombra roja se quedaba corta
comparada con el halo amplio de la captura de Gemini — de `0_0_40px` a
`0_0_140px_40px` (difuminado de 40 a 140px, más un `spread` de 40px que
antes no tenía), misma opacidad `0.18`. Verificado por estilo computado.

**El degradado del título, ida y vuelta el mismo día**: se ajustó dos
veces más (`black 55%→transparent 100%` original, luego `black
15%→transparent 85%` por pedir "más transparente", luego `black
40%→transparent 100%` por pedir "no tanto, baja un poco el degradado")
antes de que el usuario decidiera simplemente **quitarlo del todo** — el
`<p>` del título se quedó sin `style` ni `mask-image`, texto sólido sin
ningún efecto de desvanecido. Verificado por estilo computado
(`mask: none`).

## Trigésima primera ronda: la causa real de por qué el borrado de jugadores nunca actuaba — `playerStatus`, no ausencia del catálogo (27/08/2026)

El usuario reportó que "Ferran" le seguía saliendo en `/jugadores` aunque
ya no aparecía en su app oficial (ni en búsqueda ni en mercado) —
contradecía la premisa completa de la Vigesimosexta ronda
(`eliminar_jugadores_desaparecidos()`, "un jugador se borra cuando
desaparece del catálogo de `/players`").

**Investigado en directo contra la API real**: `/players` **nunca quita**
a un jugador de la lista — cuando sale de la competición (traspaso fuera
de LaLiga, etc.) le pone un campo `playerStatus: "out_of_league"` en vez
de eliminarlo del array. Nuestro filtro de `Ingestar datos liga.py` solo
miraba `positionId` y `teamId`, así que estos jugadores seguían pasando
el filtro y quedándose en la base de datos para siempre — el borrador de
la Vigesimosexta ronda nunca tenía nada que borrar porque su condición
("falta del catálogo") jamás se cumplía. Confirmado el resto de valores
de `playerStatus` en el catálogo real: `ok` (485), `out_of_league` (266),
`injured` (38), `doubtful` (9), `suspended` (6) — los tres últimos son
disponibilidad normal (el jugador sigue en la liga, ya tenemos ese dato
por otra vía con `estado`), solo `out_of_league` significa "ya no existe
para nosotros".

**Verificado con dos casos reales antes de tocar nada**: se le pidió al
usuario que confirmara en su propia app dos jugadores `out_of_league` de
alto valor — Ferran (ya sabíamos que sí) y Rashford (sorprendía, en
teoría sigue cedido en el Barça) — los dos confirmados como desaparecidos
de verdad en la app real, validando el criterio antes de borrar 263
filas de golpe.

**Dos cambios**:
1. `Ingestar datos liga.py` descarta ahora también a cualquier jugador
   con `playerStatus == "out_of_league"` en el bucle del catálogo (junto
   al filtro ya existente de posición/equipo) — de 781 a 518 filas en
   `Datos Jugadores.csv` tras el cambio, verificado en local con la API
   real.
2. **Limpieza puntual de una sola vez, no parte del pipeline recurrente**:
   los 263 jugadores de la diferencia estaban muy por encima de
   `MAXIMO_JUGADORES_A_ELIMINAR_POR_CICLO = 20` (puesto justo para evitar
   borrados masivos accidentales) — sin una limpieza manual, el cron
   normal se habría quedado bloqueado para siempre viendo 263
   "desaparecidos" cada ciclo sin actuar nunca. Ejecutada a mano contra la
   base de datos real (mismo orden de cascada que
   `eliminar_jugadores_desaparecidos()`: `mi_equipo_jugadores` →
   `puntos_jornada_detalle` → `puntos_jornada` → `historial_valor` →
   `jugadores`) y confirmado el `commit`: 263 jugadores borrados, 4.652
   filas de `historial_valor`, 38 de `puntos_jornada_detalle`, 26 de
   `puntos_jornada`, 0 de `mi_equipo_jugadores` (ninguno de los borrados
   estaba en el equipo del usuario). Verificado que Ferran y Rashford ya
   no existen en `jugadores`. A partir de ahora, cualquier jugador que
   pase a `out_of_league` lo detectará y borrará solo el paso normal del
   pipeline (dentro del límite de 20 por ciclo, más que de sobra para el
   ritmo normal de bajas, no 263 de golpe como este backlog acumulado).

## Trigésima segunda ronda: icono de chat que se quedaba "en hover", y animación de deslizamiento al enviar el primer mensaje (27/08/2026)

**Bug real: el icono flotante del chat se quedaba pintado del color de
hover para siempre**. Causa: `BotonChatFlotante.tsx` guarda el estado de
"ratón encima" en React (`onMouseEnter`/`onMouseLeave`), no con `hover:`
de Tailwind — decisión de otra sesión para que el hover se notara también
en dispositivos táctiles (`hover:` de CSS nunca se activa ahí). El
componente vive en el layout raíz, así que **nunca se desmonta** al
navegar entre páginas — solo `return null` mientras `pathname === "/chat"`,
pero su estado interno sigue vivo. Para llegar a `/chat` hay que hacer
clic en este mismo botón, lo que dispara `onMouseEnter` (`resaltado =
true`); en cuanto la página cambia a `/chat`, el botón desaparece del
DOM sin que el ratón haya "salido" de verdad, así que `onMouseLeave`
nunca llega a dispararse — `resaltado` se queda en `true` para siempre, y
la próxima vez que el botón reaparece (al navegar a cualquier otra
página) sale ya con el color de hover puesto. Arreglado con un
`useEffect` que resetea `resaltado` a `false` en cuanto `pathname` pasa a
`"/chat"` — se cura solo, sin depender de que llegue un evento de ratón
que en la práctica nunca llega en este caso concreto.

**Chat, retoques de la pantalla vacía y animación al enviar**:
- El bloque de título + recuadro subió un poco respecto al centro exacto
  de la pantalla (de `top: 50%` a `top: 42%`).
- **El recuadro de escribir ya no se desmonta/remonta entre el estado
  vacío y el de conversación** — es el mismo elemento en las dos
  situaciones, posicionado con `position: absolute` + `top`/`transform`
  en vez de con `flex`/`justify-center` (que no se puede animar). Al
  enviar el primer mensaje, `top`/`transform` cambian de los valores de
  "centrado en pantalla" a los de "40px sobre el borde inferior", con
  `transition-[top,transform] duration-200 ease-out` — un deslizamiento
  rápido hacia abajo en vez de un salto instantáneo.
- El título "Tu asistente deportivo con IA" y la sombra roja **no**
  llevan ninguna transición — siguen condicionados a `!hayConversacion`
  tal cual, así que desaparecen de golpe en el mismo instante en que se
  envía el mensaje, tal y como se pidió (solo el recuadro debía animarse,
  no estos dos).

**Verificación con una limitación real más de esta sesión**: el panel del
navegador no compone frames aquí (mismo aviso de siempre en las capturas
de pantalla), y una transición CSS depende de ese mismo pintado
fotograma a fotograma para avanzar — así que `getComputedStyle` se quedó
congelado en el valor de a medio camino para siempre en vez de llegar al
valor final, aunque el atributo `style` en crudo ya mostraba el valor
correcto. Se confirmó que la lógica es correcta forzando
`transition: none` + un reflow manual en la consola: con eso,
`top`/`transform` saltaron al momento a los valores exactos esperados
(40px sobre el borde inferior del contenedor) — la animación en sí no se
pudo ver completarse en este entorno, pero los números de destino son
correctos y la transición se ejecutará con normalidad en un navegador
real.

**Ida y vuelta el mismo día, terminó sin cambios**: se probó a mover el
título debajo del recuadro (malentendido de un mensaje ambiguo — el
usuario en realidad pedía que se notara el difuminado rojo detrás de las
propias letras, no cambiar su posición), luego se revirtió la posición y
se añadió un `text-shadow` rojo de dos capas sobre el texto para lograr
ese efecto — y finalmente el usuario pidió dejarlo tal cual estaba **antes
de todo este intercambio**. Resultado final: sin cambios respecto a la
Trigésima segunda ronda (título encima del recuadro,
`translateY(calc(-100% - 40px))`, sin `text-shadow`). Verificado en
directo: `text-shadow: none`, `color: rgb(29, 29, 31)` (negro plano).

**El usuario pidió el degradado de vuelta, esta vez explícitamente
"sutil"**: `mask-image: linear-gradient(to bottom, black 70%, transparent
100%)` — solo el 30% inferior del texto se desvanece (frente al 15%/45%/
100% de los intentos de la ronda anterior, todos descartados). Verificado
por estilo computado.

**El usuario pidió que se notara un poco más pero que no fuera un
degradado lineal, sino "esporádico"**: sustituido el `mask-image` de una
sola capa por 6 capas — 5 `radial-gradient` con un círculo transparente
cada uno, repartidos a distintas alturas/posiciones cerca del borde
inferior (18%/38%/58%/74%/90% de ancho, 88-100% de alto), más el
`linear-gradient` de base (ahora empieza a desvanecer en el 55% en vez
del 70%, para que se note más) — con `mask-composite: intersect` para
que las 6 capas se combinen restando "agujeros" en vez de sumarse (el
valor por defecto, `add`, no crea huecos visibles). Da un patrón
irregular de desvanecido en vez de una línea recta. **Sin verificación
visual posible en esta sesión** (el panel no compone frames) — solo se
confirmó que el CSS es válido y se aplica (`mask-composite: intersect`
en las 6 capas, sin caer a `none`); pendiente de que el usuario confirme
si el patrón resultante es el que buscaba.

**Confirmado el problema que se temía**: el usuario reportó que las
manchas se comían trozos reales de la "u" de "Tu" y la "c" de "con" — los
círculos (hasta 9px de radio, huecos completamente transparentes) caían
sobre tinta real de las letras, no solo en el hueco de debajo. Arreglado
con una versión mucho más conservadora: radio de los círculos bajado a
2-3px, posición bajada a pegada del todo al borde inferior (98-100% en
vez de 88-100%), el centro de cada círculo ya no es `transparent` sino
`rgba(0,0,0,0.5)` (nunca llega a hueco completo, como mucho un aclarado
suave), y la base `linear-gradient` amplía la zona 100% intacta de 55% a
70%. Con este margen, "Tu" y el resto del texto por encima del 70% de
alto quedan fuera de cualquier posible interferencia por construcción,
no por suerte.

**Efecto de ola en "Pensando…"**: nuevo `@keyframes ola` en `globals.css`
(`translateY(0) → translateY(-4px) → translateY(0)`, 1s, `ease-in-out`,
infinito) y clase `.letra-ola` (`display: inline-block` — necesario para
que `transform` tenga efecto sobre un elemento de texto en línea).
Componente nuevo `TextoOla` en `Chat.tsx`: separa el texto en letras,
cada una en su propio `<span className="letra-ola">` con
`animationDelay: {índice * 0.08}s` — el retraso creciente por letra es
lo que crea el efecto de ola recorriendo la palabra en vez de que suba y
baje entera a la vez. Usado en el bloque "Pensando…" que ya existía.
Verificado que el CSS (`@keyframes`/clase) se registra correctamente en
la hoja de estilos real de la página; no se pudo capturar en directo el
instante exacto en que se muestra "Pensando…" para verlo animado (Gemini
responde más rápido que el tiempo que tarda cada comprobación desde
fuera), pero la lógica y el CSS están confirmados por separado.

**Corrección el mismo día**: la ola no debía mover las letras arriba/abajo
— el usuario quería el efecto solo en el **color**. `@keyframes ola`
cambiado de `transform: translateY` a `color` (gris `#6E6E73` → rojo de
marca `#FE645F` → gris), y quitado el `display: inline-block` de
`.letra-ola` (ya no hace falta, no se anima ningún `transform`). Mismo
retraso escalonado por letra de siempre, así que ahora es una ola de
color roja recorriendo "Pensando…" en vez de un rebote. También se pidió
"un poco más" de degradado en el título — el `linear-gradient` de base
subió su punto de corte de 70% a 60% (los agujeros pequeños siguen igual
de seguros, pegados al 98-100%, sin tocar la zona segura de arriba).
Verificado por estilo computado: `@keyframes ola` con `color` en vez de
`transform`, y el degradado con el nuevo corte en 60%.

**Dos ajustes más, mismo día**: la ola pasó de gris↔rojo a dos tonos de
gris (`#A1A1A6` ↔ `#3A3A3D`, sin ningún rojo). Y el degradado del título
no debía subir el punto de corte (se queda en 60%) pero sí ser más
intenso — añadida una parada intermedia
(`black 60%, rgba(0,0,0,0.15) 80%, transparent 100%`) para que caiga
mucho más rápido nada más empezar en vez de una rampa lineal suave hasta
el 100%, sin tocar la zona segura de arriba (0-60% sigue intacta).
Verificado por estilo computado.

**El mismo día, definitivo esta vez**: el usuario pidió quitar el
degradado del título del todo — quitado el `mask-image`/`mask-composite`
por completo del `<p>`, solo se queda `top`/`transform` para la
posición. Verificado por estilo computado (`mask: none`). El efecto de
ola en color de "Pensando…" no se tocó, sigue en pie.

## Trigésima tercera ronda: transparencia del botón "+" del campo en Mi equipo (27/08/2026)

El usuario pidió invertir la transparencia del botón "+" del campo
(`MiEquipo.tsx`): el color que hasta ahora se veía **al pasar el ratón**
(30% de opacidad) pasa a ser el color **por defecto**, y el nuevo hover
baja un poco más, a 20% — más transparente aún al pasar el ratón, en vez
de menos. `className` de `BotonAgregar` cambiado de
`bg-[#F5F5F7]/50 text-white hover:bg-[#F5F5F7]/30` a
`bg-[#F5F5F7]/30 text-white hover:bg-[#F5F5F7]/20`. Verificado por
estilo computado: fondo por defecto con alfa `0.3`.

## Trigésima cuarta ronda: "Revalorización de mi equipo" en 0, y la columna "Revalorización" de Jugadores pasa a ser oficial en vez de cláusula (27/08/2026)

El usuario reportó dos cosas: "Revalorización de mi equipo" en 0, y que
la "Revalorización" de Pathé I. Ciss en `/jugadores` (2.552.561) no
coincidía con lo que muestra su app real (266.838).

**Investigado en directo contra la base de datos real**:
- El "0" tiene una causa real y esperada: `historial_valor.valor_oficial`
  es una columna de ayer (26/08) — de los 13 jugadores reales del
  usuario, 12 no tienen ni un solo día con ese dato, y el que sí lo
  tiene solo para un día. Como `historial_valor` nunca corrige un día ya
  guardado (`on conflict do nothing`, por diseño), ese primer día se
  quedó sin dato para casi todos los jugadores del catálogo completo (solo
  262 de 779 lo consiguieron esa vez) — sin acceso a los logs de GitHub
  Actions no se pudo confirmar por qué falló para el resto ese primer
  día, pero el código y la API funcionan bien ahora mismo (los 804
  jugadores del catálogo parsean su `marketValue` sin error), así que
  debería ir rellenándose solo a partir de hoy, un día nuevo cada vez.
- El caso de Ciss **no era un bug**: mismo patrón que Mikautadze
  (Vigesimosegunda ronda) — su cláusula (19.723.883) está subida a mano
  muy por encima de su valor oficial (17.847.266), así que la columna
  "Revalorización" (que hasta ahora reflejaba el cambio de **cláusula**,
  a propósito) mostraba el salto de cláusula, no el cambio de valor
  oficial que ve la app real.

**El usuario decidió que quiere que la columna sea la del valor oficial
en vez de la cláusula** (revierte la decisión de la Séptima ronda para
esta columna en concreto — no para `mi_club.revalorizacion`, que ya era
oficial desde la Vigesimoctava ronda). `calcular_revalorizacion()` en
`Sincronizar` cambiada para leer `valor`/`historial_valor.valor_oficial`
en vez de `valor_liga`/`historial_valor.valor` — misma fórmula exacta
que ya usa `calcular_revalorizacion_mi_equipo()`, ahora también aplicada
por jugador. Afecta a `jugadores.diferencia_valor`/`porcentaje_diferencia`,
que alimentan tanto la columna "Revalorización" de `/jugadores` como las
líneas de revalorización de Mi equipo y el aviso de Telegram de
seguimiento sin cambio de dueño — los tres pasan a reflejar el valor
oficial por igual, sin ningún cambio de código adicional en esos sitios
(ya leían la misma columna).

**Aviso claro dado al usuario antes de subirlo, y aceptado
explícitamente**: probado en directo (`rollback`, sin escribir nada)
que ahora mismo la función devuelve **0 actualizaciones** — casi ningún
jugador tiene todavía un valor oficial histórico válido de un día
anterior a hoy. Esto significa que nada más desplegarse, la columna
"Revalorización" (y su porcentaje) mostrarán "—" para casi todos los
jugadores durante uno o dos días, hasta que se acumule histórico
suficiente — mismo hueco temporal que ya tiene "Revalorización de mi
equipo" desde la ronda anterior, ahora también aquí. El usuario lo
aceptó y pidió subirlo así.

## Trigésima quinta ronda: flechas de tendencia junto a la revalorización (27/08/2026)

El usuario pidió indicadores visuales junto a "el dato de revalorización
de toda la web" que reflejen si esa revalorización está acelerando o
frenando respecto al día anterior: ▲▲ verde si sube mucho, ▲ verde si
sube normal, — gris si está estable, ▼ rojo si baja, ▼▼ rojo si baja
mucho.

**No hizo falta ningún cálculo nuevo**: `jugadores.aceleracion` ya
existía (`calcular_tendencias()` en Sincronizar, clasifica en 7
categorías: "Acelera mucho", "Acelera", "Estable", "Desacelera",
"Desacelera mucho", "Inflexión positiva", "Inflexión negativa") — se
dejó de mostrar en la web en la Sexta ronda pero el dato seguía
calculándose y guardándose. Nueva `indicadorAceleracion()` en
`lib/formato.ts` traduce esas 7 categorías a `{texto, color}` (las dos
"Inflexión" se tratan como su extremo correspondiente — positiva como
"mucho arriba", negativa como "mucho abajo" — mismos verdes/rojos ya
usados en toda la web, `#3BB568`/`#FE645F`).

**Dos sitios, sin tocar la agregada**:
- `/jugadores`, columna "Revalorización": nuevo caso especial en
  `Explorador.tsx` que pinta el valor y la flecha en `<span>` separados
  (cada uno con su propio color — el signo del valor y la tendencia de
  aceleración son cosas distintas y pueden no coincidir).
- Mi equipo, líneas bajo cada foto: `FotoJugadorSlot.tsx` gana un
  `sufijo?: {texto, color}` opcional por línea (no se podía mezclar dos
  colores en un mismo `<span>` de texto plano) — `lineasParaJugador()` en
  `MiEquipo.tsx` se lo pasa a la línea de revalorización.
- **La tarjeta agregada "Revalorización de mi equipo" se quedó fuera** —
  no existe ningún histórico del total del equipo día a día (solo el
  valor actual, sobrescrito cada ciclo), haría falta guardar una serie
  temporal nueva para poder comparar contra "ayer". Se le explicó esto al
  usuario en vez de construirlo a ciegas; queda pendiente de que confirme
  si lo quiere de todos modos.

Verificado en directo: Mi equipo mostrando `3.293.302 ▲▲` en verde
(`rgb(59, 181, 104)`), y las 7 categorías reales confirmadas en la base
de datos (`Acelera mucho` 253, `Inflexión positiva` 131, `Desacelera
mucho` 51, `Acelera` 39, `Estable` 19, `Desacelera` 12, `Inflexión
negativa` 12, más 264 jugadores todavía sin dato — no muestran nada, no
un "—" a propósito, para no confundir "sin dato" con "estable").

## Trigésima sexta ronda: fuera las "Inflexión", flechas de aceleración pasan a SVG (27/08/2026)

**Dos cambios sobre la Trigésima quinta ronda.**

**1. Se eliminan las categorías "Inflexión".** El usuario pidió quedarse
solo con las aceleraciones y "Estable". `clasificar_aceleracion()` en
`Sincronizar` pierde las dos primeras ramas (signo opuesto → "Inflexión
positiva" / "Inflexión negativa"); ahora clasifica **solo por umbrales
del cambio de velocidad** (`velocidad_hoy - velocidad_ayer`) en 5
categorías: "Acelera mucho", "Acelera", "Estable", "Desacelera",
"Desacelera mucho". Un cambio de signo entre ayer y hoy ya no es un caso
aparte — cae en la categoría que le corresponda por magnitud del cambio.
Los ~143 jugadores que hoy tienen `aceleracion = "Inflexión ..."` en la
base dejan de mostrar flecha hasta el siguiente ciclo de `Sincronizar`,
que los reclasifica. Hueco temporal de un ciclo, se cura solo.

**2. Las flechas pasan de texto (▲▲/▲/▼/▼▼) a SVG.** El usuario dejó
PNGs en `Datos/Imágenes/Web`, pero eran heterogéneos (las dobles planas y
nítidas, las simples con un resplandor difuso y otra proporción), así que
por decisión suya se rehacen como SVG. Nuevo componente
`components/FlechaAceleracion.tsx`: recibe la cadena `aceleracion` y pinta
un chevron (verde `#3BB568` hacia arriba si acelera, rojo `#FE645F` hacia
abajo si frena, doble si es "mucho"). **"Estable" y "sin dato" no pintan
nada** (antes "Estable" pintaba un "—" gris — a petición del usuario ya
no). Se borran `FLECHAS_ACELERACION` e `indicadorAceleracion()` de
`lib/formato.ts`.

Sitios (los mismos que la ronda anterior): `Explorador.tsx` monta
`<FlechaAceleracion>` directamente tras el `<span>` del valor; en Mi
equipo, `FotoJugadorSlot.tsx` cambia su `sufijo` de `{texto, color}` a
`ReactNode` y `lineasParaJugador()` en `MiEquipo.tsx` le pasa el
componente ya montado. La tarjeta agregada "Revalorización de mi equipo"
sigue sin flecha (sin histórico del total del equipo, igual que antes).

## Trigésima séptima ronda: primer bloque grande de la versión móvil (27–28/08/2026)

Antecedentes: el usuario abrió la web desde el móvil por la IP local
(`192.168.1.33:3000`). Dos ajustes de infraestructura, **solo para
`next dev`, sin efecto en producción ni en escritorio**:

- `next.config.ts` → `allowedDevOrigins: ["192.168.1.33"]`. Sin esto, Next
  bloquea los bundles `/_next/static/*` pedidos desde esa IP y la página
  carga el HTML pero sin JS → framer-motion no anima y todo se queda en
  `opacity:0` (Inicio salía en blanco).
- El servidor de preview de la herramienta se moría al poco de arrancar
  (el envoltorio `cmd.exe` de `launch.json`); se arranca `npm run dev`
  directo.

Convención de la versión móvil: **todo con breakpoints de Tailwind**, base
= móvil y `sm:`/`lg:` protegen escritorio; el corte "móvil" es `<640px`
(`max-sm:` / `sm:`), el mismo que la regla de `font-size: 87.5%` de
`globals.css`. Cambios de esta ronda (todos móvil salvo aviso):

1. **NavBar fijo**: `max-sm:sticky max-sm:top-0 max-sm:z-40`. En escritorio
   sigue estático. El botón de chat ya era `fixed`.
2. **No zoom al enfocar inputs**: `export const viewport` en `layout.tsx`
   con `maximumScale: 1, userScalable: false`.
3. **Sin rebote elástico**: `globals.css` → `overscroll-behavior: none` en
   `html, body` y `contain` en `.overflow-x/y-auto/scroll` (adiós al fondo
   blanco al pasarse del tope en tablas/listas).
4. **Campo y banquillo, mismo tamaño de foto/nombre**: `CampoTactico` y
   `Banquillo` comparten `DIM_FOTO = "min(62px, calc(8.8571cqw * 1.2))"` y
   textos con suelo (`max(11px, 2cqw)` / `max(10px, 1.5714cqw)`). En
   escritorio (contenedor 700px, o modal ~624px) el `min()`/`max()` deja
   los valores de siempre; en móvil la foto sale ~35px (antes campo ~29,
   banquillo 62 y desbordaba) y el nombre no baja de 10px (antes ~5px,
   ilegible). `Banquillo` gana `container-type: inline-size` y padding/gap
   responsive. `FotoJugadorSlot`, `ImagenCuadrada` y `RanuraAgregar`
   aceptan `size` como `string`.
5. **/jugadores**: el buscador ocupa todo el ancho y los 3 botones
   (Equipos/Posiciones/Filtros) van en una fila de 3 (`grid grid-cols-3` +
   `sm:contents` para que en escritorio vuelvan al `flex-wrap` de antes).
   `MenuFiltros` y `MenuMultiSeleccion` reciben prop `className` para el
   ancho.
6. **ModalPartido** (alineación probable desde la dificultad del
   calendario): nombres de equipo `text-[13px] sm:text-[16px]`, escudos
   `size="min(72px, 15vw)"`, gaps e interior (`p-4 sm:p-6`) más ajustados
   para que no toquen los bordes.
7. **Mi equipo**: botones Filtros y "+" del campo más pequeños en móvil
   (`max-sm:h-9` etc.; el "+" con `!` porque su tamaño va en `style`
   inline). El bloque de "Valor de mi club…" pasa al final con
   `max-lg:order-last` — tras el campo van banquillo/en duda/seguimiento y
   las estadísticas al final.
8. **Inicio**: "Juega cada jornada con ventaja" `text-[32px] sm:text-6xl`
   (tracking `-2px sm:-4px`), subtítulo `text-base sm:text-xl`.
9. **Chat**: título "Tu asistente…" `text-xl sm:text-3xl`, sombra del
   recuadro más pequeña en móvil, el recuadro **más estrecho**
   (`max-w-[320px] sm:max-w-[560px]`) pero con alto/tipografía fijos
   (`h-[48px] text-[14px]`, para que no encoja con el `font-size: 87.5%`
   global). Además el input recibe el foco al entrar (`useEffect` + `ref`).

## Trigésima octava ronda: retoques del bloque móvil anterior (28/08/2026)

Sobre la ronda 37, todo móvil salvo aviso:

- **NavBar sin transparencia en móvil**: `max-sm:bg-[#F5F5F7]` (sólido, sin
  alpha) + `max-sm:[backdrop-filter:none]`. En escritorio conserva el
  `bg-[#F5F5F7]/[0.82] backdrop-blur-[18px]`.
- **Overscroll de scrollers de `contain` → `none`** en `globals.css`
  (`.overflow-x/y-auto/scroll`). `contain` cortaba el encadenado pero no el
  rebote local del elemento; la tabla de Jugadores seguía "tirando" y
  asomando blanco. `none` mata el rebote del propio scroll.
- **Botones Filtros y "+" de Mi equipo**: esquinas menos redondeadas en
  móvil, `max-sm:rounded-[8px]` (antes 14 y 12).
- **Inicio**: se probaron saltos de línea forzados y márgenes más
  estrechos, pero **el usuario lo revirtió** — `page.tsx` vuelve al
  original. Único añadido que sobrevive: el `<h1>` tenía `leading-[0.95]`
  que, al envolver en 2 líneas en móvil (con la fuente al 87.5%), solapaba
  las líneas ("jornada" con descendente encima de "con ventaja"). Fix
  quirúrgico: `max-sm:leading-[1.15]` (escritorio sigue en 0.95).
- **Chat sin scroll al abrir + teclado**: la altura del contenedor pasa de
  `calc(100vh - 48px)` a **`calc(100svh - 48px)`** (`svh` no crece con la
  barra de URL ni encoge con el teclado → sin scroll y sin reflow al
  aparecer el teclado). El scroll interno solo se activa cuando hay
  conversación.
- **El teclado no desplaza el contenido**: `viewport` gana
  `interactiveWidget: "resizes-visual"` (Chrome/Android; Safari iOS aún no
  lo soporta). Además el modal de buscar jugador de Mi equipo se alinea
  arriba en móvil (`max-sm:items-start max-sm:pt-20`) para que el input
  quede por encima del teclado y no haga falta desplazar.

## Trigésima novena ronda: título de Inicio más pequeño y ancla de scroll para el teclado (28/08/2026)

- **Inicio, solo móvil**: `<h1>` `max-sm:text-[36px]` (antes `text-5xl`,
  42px), `<p>` `max-sm:text-[15px]` (antes `text-xl`, 17,5px). Escritorio
  intacto (`text-5xl sm:text-6xl md:text-7xl` / `text-xl md:text-[22px]`,
  verificado 72/22px).
- **`AnclaTeclado`** (nuevo componente en `layout.tsx`, `return null`):
  `resizes-visual` no bastó en iOS. Mientras hay un campo de texto enfocado
  **y `matchMedia("(pointer: coarse) and (hover: none)")`** (móvil/tablet en
  cualquier orientación), guarda `window.scrollY` al enfocar y lo restaura
  ante cualquier `scroll`/`resize` de `window` o de `visualViewport` (los
  que dispara el navegador al abrir/cerrar el teclado). Se suelta 400 ms
  después del `blur`. Los scrolls internos (mensajes del chat, tabla de
  Jugadores) no disparan `scroll` de `window`, así que no se tocan. En
  escritorio no hace nada (verificado: el scroll deliberado sigue
  funcionando a 1400px).

## Cuadragésima ronda: retoques de la 39 (28/08/2026)

- **Inicio, `<h1>` en móvil**: idas y vueltas de estilo; final =
  **mismo estilo que la versión escritorio de este propio título**, solo
  más pequeño: `max-sm:text-[32px]` + `leading-[0.95]` (de la base, sin
  override — interlineado apretado como escritorio) + `max-sm:tracking-[-2px]`
  (proporcional al `-4px` a 72px de escritorio). El `letterSpacing: -4px`
  inline pasó a `tracking-[-4px]` en clase. Escritorio intacto (`text-7xl` /
  `leading-[0.95]` / `-4px`, verificado 72/68,4/-4). Salto forzado en móvil
  con `<br className="sm:hidden" />` tras "jornada" → "Juega cada jornada" /
  "con ventaja" en cualquier ancho.
- **Modal de buscar jugador de Mi equipo**: se quita el
  `max-sm:items-start max-sm:pt-20` de la ronda 39 — el usuario lo quiere
  **centrado** siempre. Con `AnclaTeclado` la página ya no se desplaza al
  abrir el teclado, así que centrado funciona.
- **Barra de filtros de `/jugadores`**: el breakpoint pasa de `sm:` a
  `lg:` (input arriba a todo el ancho + 3 botones en fila de 3). Con `sm:`
  el móvil en horizontal (≥640px) volvía al layout de escritorio; con
  `lg:` aguanta hasta 1024px, cubriendo cualquier orientación de móvil.
  Efecto lateral aceptado: una ventana de escritorio de 640–1023px ve el
  layout apilado.
- **`<h2>` "Próximos partidos"** de `equipos/[id]`: `text-[32px]` →
  `text-[20px] sm:text-[32px]` — en móvil al tamaño de los `<h2>` de Mi
  equipo (Banquillo / En duda / Seguimiento). "Posible alineación" se
  queda en 32px. Escritorio intacto. (Se probó bajar ambos a 20px también
  en escritorio pero el usuario lo revirtió.)
- **Inicio, `<p>`**: salto forzado en móvil tras "definitiva"
  (`<br className="sm:hidden" />`) → "Bienvenido a la herramienta
  definitiva" / "para LaLiga Fantasy".
- **Botón de chat flotante**: seguía `fixed bottom-6 right-6` (no hay
  ningún ancestro con transform/filter que rompa el `fixed` — comprobado),
  pero en iOS al hacer scroll el `fixed` "salta"/parpadea. Se le añade
  `transform: translateZ(0)` + `will-change: transform` para promocionarlo
  a su propia capa de composición y que quede clavado durante el scroll.

## Cuadragésima primera ronda: avisos de Telegram para jugadores en seguimiento (28/08/2026)

Tres cambios en `Notificar Telegram.py`, todos sobre jugadores de
`mi_equipo_jugadores` en estado `seguimiento`:

1. **Nueva `revisar_clausula_seguimiento()`** (en la lista de `main()`,
   tras `revisar_seguimiento_sin_cambio_dueno`). Para cada jugador en
   seguimiento con `j.protegido_hasta` no nulo, calcula las horas que
   faltan (`protegido_hasta` vuelve de psycopg2 como `datetime` con tz, se
   resta `datetime.now(timezone.utc)`). Dos avisos, cada uno una sola vez
   por fecha de desbloqueo (la `marca` en `notificaciones_estado` es
   `protegido_hasta.isoformat()`; si la cláusula se vuelve a bloquear con
   otra fecha, se repite):
   - `≤ 48 h`: "La cláusula del jugador X se desbloquea en menos de 48 horas."
   - `≤ 2 h`: "La cláusula del jugador X se desbloquea en menos de 2 horas."

2. **`revisar_titularidad()`**: se probó avisar de cualquier cambio (sube
   o baja) para los de seguimiento, pero el usuario lo revirtió — vuelve a
   avisar **solo cuando la titularidad baja**, igual para plantilla y
   seguimiento (código idéntico al original).

3. **`revisar_seguimiento_sin_cambio_dueno()`**: pasa de comparar
   `j.diferencia_valor` (valor **oficial**) a comparar `j.valor_liga` (el
   **valor en la liga / la cláusula**, que es lo que pidió el usuario).
   Guarda el último `valor_liga` visto en `seguimiento_valor:{id}` y, si
   cambia con el mismo dueño, avisa con la variación desde la última vez:
   "…ha cambiado de valor en la liga (X) sin cambiar de dueño."

Verificado contra la BD real: las tres queries corren; `protegido_hasta`
llega con tz UTC. Ahora mismo hay 0 jugadores en seguimiento (8 titular,
2 suplente, 2 duda), así que no dispara nada todavía.

**Además**: se elimina `revisar_puntos_dazn_jornada()` ("Terminaste la
jornada X en la posición Y, con Z puntos") de `Notificar Telegram.py` y de
la lista de `main()` — el usuario ya no lo quiere. La tabla
`clasificacion_jornada` y su ingesta en `Ingestar datos liga.py` se
quedan (sin consumidor por ahora; puede servir para una vista web futura).

**Y después**: nueva `revisar_clausula_mi_equipo()` (misma lógica que
`revisar_clausula_seguimiento` pero para **jugadores propios**:
`jugadores.dueno = (select manager from mi_club where id = 1)`, que es
`'Vicent Blanquez'` — mismo patrón que `calcular_revalorizacion_mi_equipo`).
Avisa cuando a la cláusula de un jugador tuyo le quedan ≤48 h y ≤2 h para
abrirse (que otros puedan pagarla): "La cláusula de tu jugador X se abre
en menos de 48/2 horas." Verificado contra la BD real: 13 jugadores
propios con `protegido_hasta`, 4 de ellos ya dentro de las 48 h.

**Y el aviso de cierre de mercado** (`revisar_cierre_mercado`) pasa a
decir: "En X se cerrará el mercado de hoy. Añade a todos tus jugadores al
mercado."

## Cuadragésima segunda ronda: repaso de textos y comportamiento de los avisos de Telegram (28/08/2026)

Varios cambios en `Notificar Telegram.py`:

- **`revisar_revalorizacion_diaria`**: fuera la franja "a partir de las
  8:00". Se mira en cada ciclo; solo se ignora cuando `mi_club.revalorizacion`
  es 0 (aún no ha llegado el nuevo "Valor general" del día → hoy = baseline
  de ayer). En cuanto es distinto de 0, avisa (una vez al día por el dedup
  de fecha).
- **`revisar_fichas`**: "…a tu club." → "…a tu **equipo**." ("Ya no puedes
  incorporar más jugadores a tu equipo.")
- **Los tres avisos de seguimiento pasan a cubrir también "en duda"**
  (`mej.estado in ('seguimiento', 'duda')`):
  - `revisar_seguimiento_sin_cambio_dueno`: además cambia el texto — de
    "…que tienes en seguimiento, ha cambiado de valor en la liga (±N) sin
    cambiar de dueño." a **"El jugador X, ha cambiado de valor de A€ a B€."**
    (A y B son el `valor_liga` antiguo y nuevo). La lógica sigue igual:
    solo si cambió con el mismo dueño.
  - `revisar_clausula_seguimiento`: además **excluye los jugadores propios**
    (`j.dueno is distinct from (select manager from mi_club where id = 1)`)
    para no duplicar con `revisar_clausula_mi_equipo` (p. ej. "Arana", que
    es tuyo y está en duda).
- **`revisar_clausula_mi_equipo`**: "se abre" → "se **desbloquea**" ("La
  cláusula de tu jugador X se desbloquea en menos de 48/2 horas.").
- **`revisar_cierre_mercado`**: "…de hoy. Añade a todos tus jugadores al
  mercado." → "…de hoy, añade a todos tus jugadores **en el** mercado."
- **Nuevo aviso técnico `revisar_salud_telegram`** (último de `main()`).
  Todos los envíos pasan por un wrapper local `enviar_telegram()` que
  marca `_algun_envio_fallo` cuando `Común.enviar_telegram` falla y las
  credenciales están puestas. `revisar_salud_telegram` cuenta los ciclos
  con fallo en `notificaciones_estado['telegram_ciclos_fallidos']` y, en
  cuanto Telegram vuelve a responder, manda "Aviso técnico: el envío de
  avisos a Telegram falló durante N ciclos. Ya se ha recuperado." (si
  Telegram está caído del todo no se puede avisar, pero el mensaje sale en
  cuanto se recupera).

Verificado contra la BD real: todas las queries corren; ahora mismo
`revalorizacion` = 0 (no dispara), "A. Alti" y "Arana" entran en los
avisos de duda, "Arana" queda fuera de `revisar_clausula_seguimiento` por
ser propio.

## Cuadragésima tercera ronda: despliegue real en Vercel + web protegida con contraseña (28/08/2026)

Se cerró el pendiente 6 (desplegar de verdad en Vercel), que estaba
pospuesto a propósito para el final.

**Estado encontrado** (el usuario ya había creado el proyecto días antes):
proyecto `vicent-blanquez/fantasy` en Vercel, repo `vicentbzc/Fantasy`
conectado, rama de producción `main`, **auto-deploy en cada push a `main`
funcionando** (Vercel clonó y compiló `d1ee358` solo al hacer push). Root
Directory = `Web` (correcto). Faltaban tres cosas:

1. **La web tenía Vercel Authentication activada** (Deployment Protection)
   → toda visita redirigía a `vercel.com/login`, no era pública. El
   usuario lo desactivó a mano (no se toca desde el CLI).
2. **Faltaba `GEMINI_API_KEY`** en las variables de entorno de Vercel
   (solo estaba `DATABASE_URL`, en Production + Preview). Sin ella `/chat`
   peta con `Falta configurar GEMINI_API_KEY`. Añadida a Production +
   Preview vía `vercel env add`.
   - **Ojo con las comillas**: la primera vez se subió el valor tal cual
     salía de `.env.local`, que lo tiene **entre comillas dobles**
     (`GEMINI_API_KEY="AQ.Ab…"`). Next.js quita las comillas al leer `.env`,
     pero `vercel env add` las guardó literales → Gemini devolvía
     `API_KEY_INVALID`. Se borró y se volvió a añadir sin comillas, y se
     quitaron también las comillas de `Web/.env.local` para que no vuelva
     a pasar. La clave real empieza por `AQ.` (formato nuevo de Google, no
     el `AIzaSy…` clásico) y son 53 caracteres.
3. **Restringir el acceso "solo a mis dispositivos"**: Vercel no filtra
   por dispositivo. Se descartó reactivar Vercel Authentication (flujo
   tosco en móvil) y se implementó un **proxy de Next 16** (`Web/src/proxy.ts`).
   Primero con **Basic Auth** (usuario/contraseña), pero en móvil el
   diálogo nativo se atascaba (el teclado autocorregía/autocapitalizaba
   usuario y contraseña, "iniciar sesión" parecía borrar el texto). Se
   cambió el mismo día a **acceso por enlace + cookie** (ver abajo).

### `Web/src/proxy.ts` (acceso por enlace + cookie)

En Next.js 16 el *middleware* se llama ahora **proxy** (`middleware.ts`
sigue funcionando pero está deprecado; el fichero va en `src/proxy.ts`,
al lado de `app/`). Corre en **runtime Node.js** por defecto (no Edge),
así que `Buffer` está disponible.

- `matcher` excluye `_next/static`, `_next/image`, `favicon.ico`,
  `icon.svg`, `apple-icon.png` y `apple-touch-icon` (iOS sondea
  `/apple-touch-icon.png` y `-precomposed.png` directamente; mejor un 404
  limpio que un 401 HTML). Los iconos hay que dejarlos pasar: si
  `/icon.svg` o `/apple-icon.png` devuelven 401, iOS al "añadir a pantalla
  de inicio" no puede cargar el apple-touch-icon y usa una **captura de la
  página** (que se ve con efecto glass), y Safari en la vista de pestañas
  enseña un icono genérico / el de Vercel. Los `.png` de `public/` (fotos
  de relleno, ilustración de inicio) sí siguen pasando por el proxy. La
  página de "Acceso restringido" también enlaza los iconos en su `<head>`.
- En **desarrollo** (`process.env.NODE_ENV === "development"`, es decir
  `npm run dev`) **no pide nada** — el bloqueo solo aplica en el
  despliegue.
- Variable **`SITE_ACCESS_KEY`** (Vercel Production + Preview, y
  `Web/.env.local`). Si no está, el proxy deja pasar (fail-open). El
  valor y el enlace listo para usar están en `Web/.env.local` (línea
  `SITE_ACCESS_KEY=` y un comentario con el enlace). Nunca en git ni
  aquí.
- Flujo: se abre **una vez por dispositivo**
  `https://…/?acceso=SITE_ACCESS_KEY` → el proxy pone una cookie
  `fantasy_acceso` (httpOnly, secure, sameSite lax, 1 año) y redirige
  (307) a la URL sin el parámetro. A partir de ahí, la cookie basta y no
  se vuelve a pedir nada hasta que caduque o se borre.
- Sin cookie ni parámetro válido → `401` con una **página HTML mínima**
  ("Acceso restringido"), no un diálogo nativo (por eso ya no se atasca
  en móvil).
- Se mantiene aceptar la cabecera `Authorization: Basic …` (cualquier
  usuario, contraseña = `SITE_ACCESS_KEY`) solo para poder probar con
  `curl`.
- Los Server Actions (el chat) son un `POST` a la ruta donde se usan
  (`/chat`), que el `matcher` cubre → también quedan protegidos por la
  cookie.

### Verificado en directo contra la web pública ya desplegada

- Sin cookie ni parámetro → `401` (página HTML). `?acceso=` con clave
  incorrecta → `401`. `?acceso=` con la clave buena → `307` a `/` +
  `Set-Cookie: fantasy_acceso`. Con la cookie → `/`, `/jugadores`,
  `/equipos`, `/mi-equipo`, `/chat` todas `200`.
- `/jugadores`, `/equipos`, `/mi-equipo` renderizan datos reales → el
  **pooler de Supabase llega bien desde las funciones serverless de
  Vercel** (era una duda abierta; funciona sin tocar nada, la cadena de
  `.env.local` ya usaba el pooler y el rol `web_solo_lectura`).
- Chat con IA probado en el navegador tras arreglar la clave: "Dame los 3
  jugadores más caros" → responde con datos reales (Mbappé 130.648.539 €,
  Lamine Yamal, Raphinha). (Nota: preguntar por "Lewandowski" a secas
  falla porque en el CSV está como "R. Lewandowski" y el modelo es
  estricto con los nombres — no es un problema del despliegue.)
- (Durante la fase de Basic Auth) al probar el chat con la URL en formato
  `https://user:pass@host` el `fetch` del Server Action fallaba ("Request
  cannot be constructed from a URL that includes credentials"). Otra razón
  más para haber pasado al acceso por cookie.

### Detalles operativos

- `vercel link` (al enlazar el proyecto desde el CLI) añadió `.vercel` y
  `.env*` a `Web/.gitignore` y creó `Web/.vercel/` (ignorada). Correcto,
  se dejó así.
- Dominio: **`analisisfantasy.vercel.app`** (28/08/2026), añadido como
  dominio de producción del proyecto (`vercel domains add
  analisisfantasy.vercel.app fantasy`) → se re-asigna solo en cada deploy.
  Siguen funcionando `fantasy-vicent-blanquez.vercel.app` y
  `fantasy-two-beige.vercel.app`. Se descartó `analisisfantasy.js.org`
  (js.org exige que la web trate *sobre* JavaScript y que el revisor vea
  contenido — con el muro de acceso no cuela). Dominio propio de pago,
  pendiente si el usuario lo quiere algún día.
- El título de pestaña / `applicationName` / nombre para "añadir a
  pantalla de inicio" es **"Análisis Fantasy"** (`Web/src/app/layout.tsx`).
- **Logo / favicon**: historia larga el 28/08 (silueta de futbolista PNG
  → línea+círculo SVG → esquinas redondeadas → transparente+blanco → opaco
  `#FFFEFF`). Safari se empeñaba en mostrar el icono de Vercel **cacheado**
  (su caché de favicons es independiente de la HTTP y de lo que sirva el
  servidor). Se llegó a **quitar todo** (`f720335`) y luego a **restaurarlo**
  (`e8dd531`, revert) para que el usuario añadiera la web a la pantalla de
  inicio de iOS **con el icono ya puesto** (el web-clip captura el
  `apple-touch-icon` en ese momento y lo conserva pase lo que pase después
  en el servidor). Hecho eso, el usuario decidió **quedarse el icono**.
  - Estado **final**:
    - **Favicon del PC** (`Web/src/app/icon.svg` + `favicon.ico` 48px
      RGBA): **fondo transparente, trazo blanco `#fff`**, sin fondo ni
      esquinas (`abe318e`). Se ve en pestañas de tema oscuro; en tema
      claro el trazo blanco queda casi invisible — asumido por el usuario.
    - **Icono de iOS** (`Web/src/app/apple-icon.png` 180px + copias en
      `Web/public/apple-touch-icon.png` y `-precomposed.png`): **`#FFFEFF`
      opaco, trazo `#000`**. **No se toca** — ya capturado en el acceso
      directo del usuario.
  - El `.ico` de Turbopack exige que el PNG interno sea RGBA
    (`.ensureAlpha()`).
  - **La caché de favicon de Safari es independiente de la HTTP** (base de
    datos propia + snapshot del web-clip). Aunque el servidor devuelva 404,
    Safari puede seguir enseñando el icono viejo hasta: iOS → Ajustes →
    Safari → Borrar historial y datos de sitios web **+ reiniciar el
    móvil**; y borrar/rehacer el acceso directo de la pantalla de inicio.
    macOS → cerrar Safari, borrar `~/Library/Safari/Favicon Cache/` y
    `~/Library/Safari/Touch Icons Cache/`.
- La cookie de acceso (`fantasy_acceso`) es **por dominio**: hay que abrir
  el enlace `?acceso=` una vez en cada dominio nuevo además de en cada
  dispositivo.
- La `GEMINI_API_KEY` que faltaba en Vercel era el pendiente 12; el
  pendiente 7 (reiniciar para que el rol de solo lectura surta efecto)
  queda cubierto: producción arranca de cero con la variable ya puesta.

## Cuadragésima cuarta ronda: categoría "Próximo partido", móvil de Jugadores, "Suplentes", aviso de titularidad al alza (29/08/2026)

**Nueva categoría de filtro "Próximo partido"** (`/jugadores` y
`/mi-equipo`), **sustituye a "Dificultad del calendario"**:
- Muestra el **nombre del próximo rival** (jornada 1 del calendario),
  usando `equipos.nombre_oficial` — `db.ts` añade un `left join equipos re
  on re.nombre = c.rival` y devuelve `proximoRivalNombreOficial`. Si no
  hay rival, "—".
- Coloreado por la **dificultad de ESE partido** (`c.dificultad` =
  `proximaDificultad`, "Muy baja".."Muy alta"), con `COLOR_DIFICULTAD` de
  `formato.ts` (mismos colores que ya usaban campo y lista). Ojo: NO es la
  media de los próximos 5 (`dificultadProximos5`) — esa se dejó calculada
  en el SQL pero ya no se usa en ningún sitio.
- **Clicable** → abre `ProximosPartidos` (mismo modal de siempre, lleva al
  once posible de la jornada). En `/jugadores` es la columna clave
  `proximoRival` (texto), con orden especial por dificultad
  (`ORDEN_DIFICULTAD` en `compararPorClave`).
- `FotoJugadorSlot`: nueva opción `wrap` en las líneas. El nombre del
  rival puede ser largo ("Atlético de Madrid", "Rayo Vallecano") y con
  `whitespace-nowrap` se solapaba entre fotos del banquillo/duda/
  seguimiento y se salía del campo en móvil. Con `wrap` la línea usa
  `whitespace-normal text-center max-w-[76px]`. También se subió un poco
  el `gap` de esas tres cajas (`gap-x-5 sm:gap-x-11`).

**Móvil de `/jugadores`** (solo `max-sm:`, escritorio intacto):
- La columna fija "Jugador" baja de 300px a **184px** en móvil
  (`w-[184px] sm:w-[300px]`), que era lo que hacía que nombres como
  "Manuel Fernández" salieran cortados y que la columna tapase a Equipo al
  hacer scroll.
- En móvil se **oculta el checkbox** (la fila entera ya selecciona) y las
  **columnas Equipo y Posición** (`max-sm:hidden` en su `th`/`td`).
- Bajo el nombre sale un **subtítulo** `Equipo · Posición` (`sm:hidden`),
  que también resuelve lo de que equipo y posición "se juntaban".

**`/mi-equipo`**: el título **"Banquillo" pasa a "Suplentes"** (todas las
versiones; solo el `<h2>`, el componente `Banquillo.tsx` y su uso en
`/equipos/[id]` no se tocan).

**`Notificar Telegram.py` — `revisar_titularidad`**: antes solo avisaba
si la titularidad **bajaba** (`float(actual) < float(anterior)`). Ahora
avisa **también si sube** (`!=`), con el texto "ha subido/bajado de un A%
a un B%". El scope ya era correcto (todos los de `mi_equipo_jugadores`:
titular, suplente, duda, seguimiento).

## Historia breve

Hasta agosto de 2026 el proyecto raspaba **solo** futbolfantasy.com
(incluida una ficha de ~2 MB por jugador, ~600 jugadores, la parte más
cara de todo el scraping), justo para no arriesgar la cuenta real de
LaLiga Fantasy del usuario. El **Paso 8** (14/08/2026) invirtió esa
decisión: el usuario quería el valor real de su liga privada (que sube
por pujas y no existe en ninguna web pública), y una vez comprobado en
directo que la API oficial da mucho más que solo el valor, pasó a ser la
fuente principal — asumiendo explícitamente el riesgo de automatizar con
la cuenta real, con la cadencia más frecuente posible (cada hora). Esto
implicó eliminar y recrear la base de datos (el id de cada jugador pasa a
ser el oficial de LaLiga Fantasy, no el de futbolfantasy.com) y sustituir
por completo los scripts de ingesta. En el proceso hubo un incidente real
(ver la regla sobre `git push` al principio de este documento): no subir
los cambios a GitHub a tiempo dejó el workflow automático corriendo
código viejo contra la base de datos nueva durante varias horas,
duplicando datos — arreglado, y la lección quedó como regla del proyecto.

Plan completo de la conversación donde se hizo el Paso 8:
`C:\Users\vicen\.claude\plans\shiny-frolicking-neumann.md`.
