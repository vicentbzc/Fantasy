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
| `porcentaje_titularidad` | futbolfantasy.com | `Ingestar datos 1.py` |
| `estado` (tiempo de baja, no la descripción de la lesión) | futbolfantasy.com | `Ingestar datos estado.py` |
| `calendario`, escudos de equipo | futbolfantasy.com | `Ingestar datos 3.py` / `Descargar imágenes.py` |
| `diferencia_valor`, `porcentaje_diferencia`, `tendencia_dias`, `aceleracion` | Calculado por nosotros | `Sincronizar`, comparando contra `historial_valor` |
| `minutos_jugados`, `puntos_jornada`, `puntos_jornada_detalle` | API LaLiga Fantasy (`playerStats`) | **pendiente** — vacío hasta que empiecen a jugarse partidos de 2026/27 |

futbolfantasy.com se raspa **solo** para lo que la API no da. No hay
solapamiento entre las dos fuentes en ninguna columna.

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
  mercado de futbolfantasy.com (`tr.elemento_jugador`), de donde salen
  `equipo`, `nombre`, `titularidad` y `foto` — nada más, el resto de
  columnas que esa tabla trae (valor, diferencia, aceleración...) no se
  usan porque vienen de la API.

## Los scripts

| Script | Fuente | Genera | Coste | Cadencia actual |
|---|---|---|---|---|
| `Ingestar datos liga.py` | API LaLiga Fantasy | `Datos Jugadores.csv`, `Datos Historial valor.csv`, `Datos Puntos jornada.csv` | 1 + 1 + N peticiones autenticadas (N = equipos de tu liga) | Cada hora |
| `Ingestar datos 1.py` | futbolfantasy.com | `Datos Titularidad.csv` | 1 petición | Cada hora |
| `Ingestar datos estado.py` | futbolfantasy.com | `Datos Estado.csv` | 2 peticiones | Cada hora |
| `Ingestar datos 3.py` | futbolfantasy.com | `Datos 3.csv` (calendario) | ~20-40 peticiones | Cada 4-6 horas |
| `Descargar imágenes.py` | futbolfantasy.com (escudos) + `Datos Fotos.csv` (fotos) | Sube a Supabase Storage | Gratis salvo la primera vez | Cada 4-6 horas |
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
`marketValue` si nadie lo tiene. La foto **no** sale de aquí (ver
`Ingestar datos 1.py`). `Datos Puntos jornada.csv` se escribe con cabecera
pero sin filas — pendiente del formato real de `playerStats` (vacío
mientras no haya partidos jugados).

### `Ingestar datos 1.py`

Descarga la tabla de mercado de futbolfantasy.com (1 petición, trae los
~600 jugadores de golpe) y guarda solo `Equipo, Jugador, Porcentaje de
titularidad, Foto` — el resto de columnas de esa tabla (valor, tendencia,
aceleración...) se descartan porque ya vienen de la API.

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
propósito). Único script que no ha cambiado desde que se escribió.

### `Descargar imágenes.py`

Escudos de equipo: predecibles por id
(`static.futbolfantasy.com/uploads/images/cabecera/hd/{id}.png`). Fotos de
jugador: se leen de `Datos Fotos.csv` (`ID, Foto` con el id oficial —
generado por `Sincronizar`, ver más abajo), no directamente de
`Datos Jugadores.csv`. No vuelve a descargar/subir lo que ya tiene en
disco. Sube cada archivo primero a Supabase Storage y solo si funciona lo
guarda en local (si se hiciera al revés, un fallo de subida quedaría
escondido para siempre).

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
    42 clubes de Primera y Segunda con nombre oficial. `GET /teams` (sin
    `v3`) no existe (404). Los 20 de esta temporada se identificaron a
    mano por nombre y quedaron fijos en
    `Común.MAPA_EQUIPO_ID_OFICIAL_A_CORTO` — el `teamId` oficial **no**
    coincide con el id que usa futbolfantasy.com.
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

- `equipos` (`nombre` PK, `id` del escudo).
- `jugadores` (`id` PK = id oficial de LaLiga Fantasy): `nombre`, `equipo`,
  `posicion`, `porcentaje_titularidad`, `valor`, `valor_liga`,
  `diferencia_valor`, `porcentaje_diferencia`, `aceleracion`,
  `tendencia_dias`, `estado`, `minutos_jugados`. UPSERT en cada
  sincronización.
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
  `LALIGA_FANTASY_LEAGUE_ID` (**pendientes de añadir**, ver "Pendiente").

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

Rutas: `/` (inicio), `/equipos` y `/equipos/[id]` (alineación probable de
un club real según `porcentaje_titularidad`, no relacionado con tu liga),
`/jugadores` (tabla filtrable/ordenable con comparación de hasta 3),
`/comparador` (hoy idéntica a `/jugadores`), `/mi-equipo` (placeholder,
sin implementar).

## Seguridad — lo que ya está resuelto

- HTTPS con verificación de certificado siempre activa, nunca
  `verify=False`. Todas las peticiones llevan `timeout`.
- No hay `eval`/`exec`/`pickle`/`subprocess`/`os.system` en ningún sitio.
- No hay SQL construido con texto (todo `execute_values`/parámetros).
- Credenciales solo en `Configuración local.py` (en `.gitignore`) o
  secretos de GitHub Actions — nunca en código ni en logs.
- URLs de imágenes validadas por dominio antes de guardarse
  (`Común.PREFIJO_FOTO_FUTBOLFANTASY`) — no se confía en que un `src`
  scrapeado apunte de verdad a donde debería.
- `Sincronizar` nunca imprime el detalle de una excepción (los logs de
  Actions son públicos), solo el nombre de la tabla que falló.

## Dependencias

```
pip install requests beautifulsoup4 psycopg2-binary
```

## Pendiente

1. **Añadir los secretos que faltan en GitHub** (`LALIGA_FANTASY_EMAIL`,
   `LALIGA_FANTASY_PASSWORD`, `LALIGA_FANTASY_LEAGUE_ID`) en *Settings →
   Secrets and variables → Actions* — sin esto el workflow horario no
   puede tocar la API de LaLiga Fantasy todavía.
2. **`minutos_jugados` / `puntos_jornada` / `puntos_jornada_detalle`**: en
   cuanto se jueguen partidos de LaLiga 2026/27, mirar el formato real de
   `playerStats` y escribir el parser (hoy vacío en toda respuesta de la
   API).
3. **Histórico real de `valor` (marketValue oficial)**: se descubrió
   `GET /player/{id}/market-value` con hasta 47 días de histórico real por
   jugador — no integrado todavía en el pipeline (solo se ha usado para
   consultas puntuales). Si se quiere, se puede rellenar `historial_valor`
   de golpe con este endpoint en vez de esperar día a día — pero ojo, ese
   histórico es de `valor` (marketValue), no de `valor_liga` (la cláusula
   no tiene histórico en ningún endpoint conocido).
4. La liga privada "Prueba" (`leagueId` `018053483`) solo tiene al usuario
   (`managersNumber: 1`) — el emparejador de `valor_liga` por
   `buyoutClause` ya recorre todos los equipos de `standing`, pero no se
   ha probado todavía con la cláusula de un compañero real.
5. Desplegar de verdad en Vercel (conectar repo, `DATABASE_URL` como
   variable de entorno del proyecto).
6. Rol de Postgres de solo lectura para la web, en vez de reutilizar el
   de `Sincronizar`.
7. `/mi-equipo` sigue sin implementar (placeholder "Próximamente").

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
