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
| `minutos_jugados`, `puntos_jornada`, `puntos_jornada_detalle` | API LaLiga Fantasy (`playerStats`) | **pendiente** — vacío hasta que empiecen a jugarse partidos de 2026/27 |

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
| `Ingestar datos liga.py` | API LaLiga Fantasy | `Datos Jugadores.csv`, `Datos Historial valor.csv`, `Datos Puntos jornada.csv` | 1 + 1 + N peticiones autenticadas (N = equipos de tu liga) | Cada hora |
| `Ingestar datos 1.py` | futbolfantasy.com | `Datos Titularidad.csv` | 1 petición | Cada hora |
| `Ingestar datos estado.py` | futbolfantasy.com | `Datos Estado.csv` | 2 peticiones | Cada hora |
| `Ingestar datos 3.py` | futbolfantasy.com | `Datos 3.csv` (calendario), `Datos Posicion.csv` (formación real) | ~20-40 peticiones | Cada 4-6 horas |
| `Descargar imágenes.py` | API LaLiga Fantasy (escudos + nombre oficial) + `Datos Fotos.csv` (fotos, ya con URL oficial) | Sube a Supabase Storage, `Datos Equipos.csv` | 1 petición autenticada + Gratis salvo la primera vez para las imágenes | Cada 4-6 horas |
| `Sincronizar base de datos.py` | CSV → Postgres | — | — | Después de cualquiera de los anteriores |
| `Descubrir liga.py` | API LaLiga Fantasy | imprime tus ligas | 1 petición | Manual, un solo uso |

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
(validado contra `Común.PREFIJO_ASSETS_LALIGA_FANTASY`). `Datos Puntos
jornada.csv` se escribe con cabecera pero sin filas — pendiente del
formato real de `playerStats` (vacío mientras no haya partidos jugados).

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

Por cada uno de los 20 equipos, descarga su ficha (hasta 5 próximos
partidos con dificultad) y, si hace falta completar 5 partidos de LIGA,
también el calendario mensual. Guarda `Datos 3.csv`:
`Equipo, Siguientes rivales, Competición, Jornada, Día, Hora, Estadio,
Dificultad de los rivales` (varios partidos separados por ` | `).
Dificultad traducida a mano de la imagen que usa la web: 1=Muy baja,
2=Baja, 3=Media, 4=Alta, 5=Muy alta (amistosos sin dificultad, a
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
Posicion Y` (valores 0-100, un jugador por fila, solo los titulares).

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
  inventa un dato.

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
- `historial_valor` (`id, fecha` PK): solo `valor_liga` de cada jugador,
  un snapshot por día. Solo se insertan filas nuevas (`ON CONFLICT DO
  NOTHING`), nunca se corrigen las que ya había.
- `puntos_jornada` (`id, jornada` PK): UPSERT — pendiente de datos reales.
- `puntos_jornada_detalle`: tabla creada, **sin sincronizar por ahora** —
  el parser que existía dependía del formato de texto de un script ya
  eliminado; hay que escribir uno nuevo cuando se conozca el formato real
  de `playerStats`.
- `calendario` (`equipo, orden` PK): se borra y reinserta por equipo en
  cada sincronización (la lista de próximos partidos se reemplaza entera).

**`Esquema base de datos.sql` es el esquema de una base de datos nueva, no
una migración** — para una base de datos que ya existe (como la real de
este proyecto), las columnas nuevas hay que añadirlas a mano en el SQL
Editor de Supabase:
```sql
alter table equipos add column nombre_oficial text;
alter table jugadores add column posicion_x numeric;
alter table jugadores add column posicion_y numeric;
```
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

- Dos cron: `0 * * * *` (cada hora — `Ingestar datos liga.py`, `1.py`,
  `estado.py`) y `0 */5 * * *` (cada 4-6h — `3.py`,
  `Descargar imágenes.py`). `Sincronizar` corre al final de cualquiera de
  los dos disparos.
- `concurrency: group: fantasy-scraping, cancel-in-progress: false` —
  ejecuciones que coinciden se encolan, nunca corren en paralelo (evita
  que dos procesos escriban a la vez sobre la caché de `Datos/`).
- `actions/cache` sobre toda la carpeta `Datos/` (clave
  `datos-fantasy-${{ github.run_id }}` + `restore-keys`) — necesario para
  que `Token LaLiga Fantasy.json` sobreviva entre ejecuciones (si no, cada
  hora tocaría loguear con contraseña en vez de solo refrescar).
- `workflow_dispatch` con input `modo` (`todo` / `solo-barato` /
  `solo-pesado`) para lanzarlo a mano sin esperar al cron.
- **Secretos usados**: `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (ya configurados desde antes del Paso 8) +
  `LALIGA_FANTASY_EMAIL`, `LALIGA_FANTASY_PASSWORD`,
  `LALIGA_FANTASY_LEAGUE_ID` (**pendientes de añadir**, ver "Pendiente") —
  desde el 19/08/2026 `Descargar imágenes.py` (cron de cada 4-6h) **también**
  necesita estos 3 secretos para pedir el token y leer `teams-master`; antes
  de esa fecha era el único script del cron pesado que no los necesitaba.

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
pip install requests beautifulsoup4 psycopg2-binary
```

## Pendiente

1. **Añadir los secretos que faltan en GitHub** (`LALIGA_FANTASY_EMAIL`,
   `LALIGA_FANTASY_PASSWORD`, `LALIGA_FANTASY_LEAGUE_ID`) en *Settings →
   Secrets and variables → Actions* — diagnosticado el 19/08/2026: es la
   causa de que **todas** las ejecuciones horarias (`Ingestar datos
   liga.py`) fallen desde el Paso 8, y desde el Paso 9 también hace falta
   para el cron de cada 4-6h (`Descargar imágenes.py` necesita el token
   para leer `teams-master`).
2. **Ejecutar en el SQL Editor de Supabase** las 3 columnas nuevas del
   Paso 9 (ver "Base de datos" más arriba) — sin esto `/equipos/[id]` y
   `/mi-equipo` dan error en la web.
3. **`minutos_jugados` / `puntos_jornada` / `puntos_jornada_detalle`**: en
   cuanto se jueguen partidos de LaLiga 2026/27, mirar el formato real de
   `playerStats` y escribir el parser (hoy vacío en toda respuesta de la
   API).
4. **Histórico real de `valor` (marketValue oficial)**: se descubrió
   `GET /player/{id}/market-value` con hasta 47 días de histórico real por
   jugador — no integrado todavía en el pipeline (solo se ha usado para
   consultas puntuales). Si se quiere, se puede rellenar `historial_valor`
   de golpe con este endpoint en vez de esperar día a día — pero ojo, ese
   histórico es de `valor` (marketValue), no de `valor_liga` (la cláusula
   no tiene histórico en ningún endpoint conocido).
5. La liga privada "Prueba" (`leagueId` `018053483`) solo tiene al usuario
   (`managersNumber: 1`) — el emparejador de `valor_liga` por
   `buyoutClause` ya recorre todos los equipos de `standing`, pero no se
   ha probado todavía con la cláusula de un compañero real.
6. Desplegar de verdad en Vercel (conectar repo, `DATABASE_URL` como
   variable de entorno del proyecto).
7. Rol de Postgres de solo lectura para la web, en vez de reutilizar el
   de `Sincronizar`.
8. `/mi-equipo` ya tiene diseño e interfaz (ver "Rediseño de la web" más
   abajo) pero **sin datos reales todavía** — no existe el concepto de
   "mi plantilla" en la base de datos, hoy usa como relleno los 25
   jugadores de mayor valor. Falta la funcionalidad real (elegir tus
   jugadores de verdad, guardarlo).
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
