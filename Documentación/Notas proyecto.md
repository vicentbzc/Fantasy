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
| `Ingestar datos liga.py` | API LaLiga Fantasy | `Datos Jugadores.csv`, `Datos Historial valor.csv`, `Datos Puntos jornada.csv` | 1 + 1 + N peticiones autenticadas (N = equipos de tu liga) | Cada 15 minutos |
| `Ingestar datos 1.py` | futbolfantasy.com | `Datos Titularidad.csv` | 1 petición | Cada 5 minutos |
| `Ingestar datos estado.py` | futbolfantasy.com | `Datos Estado.csv` | 2 peticiones | Cada 5 minutos |
| `Ingestar datos 3.py` | futbolfantasy.com | `Datos 3.csv` (calendario), `Datos Posicion.csv` (formación real) | ~20-40 peticiones | Cada 15 minutos |
| `Descargar imágenes.py` | API LaLiga Fantasy (escudos + nombre oficial) + `Datos Fotos.csv` (fotos, ya con URL oficial) | Sube a Supabase Storage, `Datos Equipos.csv` | 1 petición autenticada + Gratis salvo la primera vez para las imágenes | Cada 5 horas |
| `Ingestar datos detalle.py` | API LaLiga Fantasy | `Datos Puntos jornada detalle.csv`, `Datos Minutos.csv` | 1 + N peticiones autenticadas (N = jugadores con algún punto esta temporada, ~254 a fecha de hoy) | Cada 15 minutos |
| `Sincronizar base de datos.py` | CSV → Postgres | — | — | Después de cualquiera de los anteriores |
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
7 categorías (`clasificar_aceleracion()`: "Inflexión" si cambia de signo
respecto a ayer, si no por umbrales de variación). **Es una aproximación
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
4. **Histórico real de `valor` (marketValue oficial)**: se descubrió
   `GET /player/{id}/market-value` con hasta 47 días de histórico real por
   jugador — no integrado todavía en el pipeline (solo se ha usado para
   consultas puntuales). Si se quiere, se puede rellenar `historial_valor`
   de golpe con este endpoint en vez de esperar día a día — pero ojo, ese
   histórico es de `valor` (marketValue), no de `valor_liga` (la cláusula
   no tiene histórico en ningún endpoint conocido).
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
6. Desplegar de verdad en Vercel (conectar repo, `DATABASE_URL` como
   variable de entorno del proyecto).
7. Rol de Postgres de solo lectura para la web, en vez de reutilizar el
   de `Sincronizar`.
8. ~~`/mi-equipo` ya tiene diseño e interfaz...~~ **Resuelto (24/08/2026)**:
   ver "Decimotercera ronda" más abajo — plantilla real vía
   `mi_equipo_jugadores` (gestionada a mano por el usuario desde la web,
   primera tabla que la web escribe) y dinero/fichas reales vía
   `mi_club`. Falta que el usuario añada el secreto
   `LALIGA_FANTASY_TEAM_ID` en GitHub para que el cron real lo sincronice
   (ya funciona en local).
9. **Consultas en vivo para datos de liga privada** (ej. cláusula de
   jugadores de compañeros): el usuario planteó el 19/08/2026 que el
   pipeline por lotes (cada hora) no es suficientemente rápido para esto
   y que puede pedir una notificación/aviso — todavía no ha dado los
   detalles de qué debe avisar ni cuándo, decisión aplazada explícitamente
   a una conversación futura, no implementar nada de esto todavía.
10. Disposición exacta de los jugadores del banquillo en `/equipos/[id]`:
    el usuario mencionó una captura de pantalla de referencia que no
    llegó adjunta al mensaje del 19/08/2026 — pendiente de que la reenvíe.
11. La deduplicación de `extraer_formacion()` dentro de `Ingestar datos
    3.py` (ver arriba) deja 2-3 equipos con más de 11 candidatos cuando
    futbolfantasy.com muestra mucha incertidumbre de rotación — la web
    recorta al mejor 11, funciona pero no es perfecto; revisar si conviene
    afinar más el `data-probabilidad` como desempate.

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

Pendiente de aclarar con el usuario (no se ha podido confirmar en
directo): si el `teamMoney` de la API ya descuenta o no una puja activa
en curso — no había ninguna puja pendiente al comprobarlo. El usuario
pidió expresamente comparar las 3 tarjetas de dinero/valor contra su
app real; queda a la espera de que lo haga y confirme si cuadra.

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
