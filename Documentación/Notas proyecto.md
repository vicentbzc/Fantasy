# Proyecto Fantasy — notas y decisiones

Este documento existe para que el contexto de por qué está hecho así **no dependa
de recordar una conversación de chat**. Si alguna vez abres una conversación
nueva con Claude (o retomas esto dentro de meses), este archivo debería bastar
para que se entienda todo sin tener que volver a explicar nada.

## Qué es esto

Sistema personal para analizar y comparar jugadores de LaLiga Fantasy Oficial.
Sin ánimo de lucro, sin publicidad, sin marca de LaLiga. El código será público
en GitHub más adelante; **los datos (los CSV) no**.

## Estructura de carpetas

```
Fantasy/
├── .claude/          (config de Claude Code, no tocar ni mover — ver más abajo)
├── Datos/            (los CSV que generan los scripts — no es público, ver "Qué es esto")
├── Documentación/    (este documento)
└── Scripts/          (Común.py, los tres Ingestar datos N.py,
                       Sincronizar base de datos.py, Esquema base de datos.sql,
                       Configuración local.py — este último nunca a GitHub)
```

`.claude` es la carpeta de configuración de la propia herramienta Claude
Code (ajustes, permisos, memoria del proyecto), no una carpeta de
organización del usuario. Se busca por ese nombre exacto en la raíz del
proyecto, igual que Git busca `.git`; si se renombra o se mueve, la
herramienta deja de encontrar la configuración de este proyecto. Por eso
no se toca, aunque el nombre con el punto delante llame la atención al
lado de las demás carpetas.

Desde agosto de 2026 los CSV generados (`Datos 1.csv` … `Datos 5.csv`,
`Datos 6.csv`) viven en `Fantasy/Datos/`, no en `Fantasy/Scripts/`
(decisión explícita del usuario, para separar código de datos). La ruta
se calcula sola en `Común.ruta_datos()` a partir de dónde está el propio
`Común.py` (`Fantasy/Scripts/` más una carpeta arriba, más `Datos/`), así
que **da igual desde qué carpeta se lancen los scripts** — no hace falta
estar dentro de `Scripts/` para ejecutarlos. Esa misma función crea la
carpeta `Datos/` si no existiera.

## Por qué esta fuente de datos

Hasta agosto de 2026 los datos salían solo de **futbolfantasy.com** (pública,
sin login), precisamente para no arriesgar la cuenta de jugador personal del
usuario. Desde el Paso 8 (ver más abajo) esa regla cambió a propósito: el
usuario decidió explícitamente asumir el riesgo de usar su cuenta real contra
la API oficial de LaLiga Fantasy, porque es la única forma de conseguir el
valor real de los jugadores **dentro de su liga privada** (que sube por
pujas entre amigos) — ese dato no existe en ninguna web pública. La API
oficial es ahora la fuente principal de casi todo; futbolfantasy.com se
quedó solo para lo que la API no da (ver Paso 8).

## Reglas que hay que respetar siempre

- **Excepción desde el Paso 8**: sí se usa la cuenta real del usuario, pero
  solo contra la API oficial de LaLiga Fantasy (nunca contra futbolfantasy.com
  ni ningún otro sitio), solo en modo lectura, y las credenciales viven solo
  en `Configuración local.py` (fuera de git) o como secreto de GitHub
  Actions — nunca en el código ni en el chat.
- No publicar los CSV en bruto en ningún sitio público.
- Peticiones espaciadas, nunca en ráfaga. La tabla de frecuencias recomendadas
  de este documento (más abajo) dice con qué frecuencia se puede ejecutar cada
  script sin machacar el servidor — **respetarlo**.
- El código sí puede ser público; la base de datos con datos reales no.
- **Ningún archivo de código de este proyecto lleva comentarios ni
  docstrings — nunca, en ninguno, presente ni futuro** (decisión
  explícita del usuario, agosto de 2026, confirmada de nuevo más
  adelante). Esto aplica a todos los `.py` (`Común.py`, los scripts
  `Ingestar datos ...py`, `Sincronizar base de datos.py`,
  `Configuración local.py`) y también a `Esquema base de datos.sql`.
  Todo el porqué de cada cosa vive únicamente en este documento. **No
  añadir comentarios a ningún archivo de código en el futuro**, ni
  siquiera al tocar o ampliar código, ni siquiera en archivos nuevos que
  se creen más adelante — si hace falta dejar constancia de un porqué,
  se apunta aquí.
- **`Común.py` y los scripts `Ingestar datos ...py` no imprimen nada por
  terminal** (decisión explícita del usuario, agosto de 2026; ver "Sin
  salida por terminal" más abajo). **No añadir `print()` de vuelta al
  tocar o ampliar esos archivos**, ni siquiera para mostrar
  progreso — si hace falta depurar algo puntualmente, se añade un
  `print()` temporal y se quita otra vez antes de terminar.
  `Sincronizar base de datos.py` es la única excepción a esto (sí
  informa por pantalla, también decisión explícita del usuario) — pero
  tampoco lleva comentarios, esa parte de la regla no tiene excepción.
  `Scripts/Descubrir liga.py` es una segunda excepción: es una utilidad
  manual de un solo uso (no forma parte del pipeline automático), así que
  también informa por pantalla a propósito.

## El módulo común (`Común.py`)

Desde la optimización de agosto de 2026, `MAPA_EQUIPOS`, `POSICIONES_
VALIDAS`, `HEADERS`, la sesión HTTP y el lector de la tabla de mercado
viven en un único archivo, `Común.py`, que importan los tres scripts. Antes
estaban duplicados: `Ingestar datos 1.py` y `Ingestar datos 2.py`
tenían cada uno su propia copia de `MAPA_EQUIPOS` y su propia función casi
idéntica para leer la tabla de mercado (una lee todas las columnas, la
otra solo id/nombre/equipo). Un solo sitio para esto significa que un
ascenso/descenso o un cambio de la web solo hay que corregirlo una vez.

Esto es una extracción de código, **no** un cambio de comportamiento:
ningún selector, cálculo o formato de columna se ha tocado al mover el
código a `Común.py` (comprobado ejecutando el script 1 en directo antes y
después del cambio: mismas cabeceras, mismo número de filas, mismo
formato de valores).

## Los scripts y sus salidas (reescrito en el Paso 8, agosto de 2026)

**Este apartado describe el pipeline actual.** Hasta el Paso 8 había tres
scripts de ingesta que sacaban casi todo de futbolfantasy.com — esa versión
ya no existe; se sustituyó por la de abajo. Ver Paso 8 para el porqué
completo del cambio.

| Script | Fuente | Genera | Coste | Frecuencia |
|---|---|---|---|---|
| `Ingestar datos liga.py` | API LaLiga Fantasy (cuenta real) | `Datos Jugadores.csv`, `Datos Historial valor.csv`, `Datos Puntos jornada.csv` | ~1 + 1 + N equipos de tu liga peticiones autenticadas | Cada hora |
| `Ingestar datos 1.py` | futbolfantasy.com | `Datos Titularidad.csv` | 1 petición (barato) | Cada hora |
| `Ingestar datos estado.py` | futbolfantasy.com | `Datos Estado.csv` | 2 peticiones (barato) | Cada hora |
| `Ingestar datos 3.py` | futbolfantasy.com | `Datos 3.csv` (calendario) | ~20-40 peticiones (barato) | Cada 4-6 horas |
| `Descargar imágenes.py` | API LaLiga Fantasy (fotos) + futbolfantasy.com (escudos) | Sube a Supabase Storage | Prácticamente gratis salvo la primera vez | Cada 4-6 horas |
| `Sincronizar base de datos.py` | Postgres (Supabase) | — | — | Cada vez que corre cualquiera de los anteriores |

### Ingestar datos liga.py — API oficial de LaLiga Fantasy (fuente principal)

Ver la sección completa del Paso 8 más abajo para el detalle de
autenticación, endpoints y decisiones de diseño — aquí solo el resumen de
salida:

- `Datos Jugadores.csv`: `ID, Jugador, Equipo, Posición, Valor, Foto` — el
  catálogo oficial completo (~690 jugadores de los 20 clubes de esta
  temporada), con `Valor` ya resuelto (cláusula de la liga si el jugador
  está en alguna plantilla, si no el valor oficial del juego).
- `Datos Historial valor.csv`: mismo patrón idempotente por día que tenía
  el antiguo `Datos 6.csv` (una fila por jugador y día, no se duplica si ya
  hay una de hoy).
- `Datos Puntos jornada.csv`: mismas columnas que el antiguo `Datos 4.csv`
  (`ID, Jugador, Equipo, Jornada, Puntos, Estadísticas, Tarjetas amarillas
  acumuladas`), pero **vacío por ahora** — sale de `playerStats`, que la API
  no rellena hasta que se juegan partidos de la temporada 2026/27. Pendiente
  de verificar el formato real en cuanto haya jornadas jugadas.

### Ingestar datos 1.py — titularidad (reducido en el Paso 8)

Descarga `https://www.futbolfantasy.com/analytics/laliga-fantasy/mercado`
(1 sola petición) pero **ya solo guarda** `Datos Titularidad.csv`:
`Equipo, Jugador, Porcentaje de titularidad`. El resto de columnas que
antes salían de aquí (Valor, Diferencia, Aceleración, Tendencia) ahora
vienen de la API oficial o se calculan en `Sincronizar` — ver Paso 8.

### Ingestar datos estado.py — lesionados y sancionados (nuevo en el Paso 8)

Descarga `https://www.futbolfantasy.com/laliga/lesionados` y
`.../laliga/sancionados` (~400 KB + ~225 KB, 2 peticiones en total) y
guarda `Datos Estado.csv`: `Equipo, Jugador, Estado`, **solo para los
jugadores que aparecen en alguna de las dos páginas**. Reutiliza la misma
lógica de lectura de `.datos .comentario` que antes vivía en la ficha
individual del jugador (`Ingestar datos 2.py`, ya eliminado) — mismo
formato de texto exacto, incluida la corrección de "lig." → "ligamento".
Un jugador que no aparece en ninguna de las dos páginas se considera
"Disponible" por defecto (se rellena en `Sincronizar`, no aquí).

### Ingestar datos 3.py — calendario y dificultad por equipo

Por cada uno de los 20 equipos, descarga su ficha
(`laliga/equipos/{slug}`, trae hasta 5 próximos partidos con dificultad) y,
si hace falta completar hasta 5 partidos de LIGA, también consulta el
calendario mensual del equipo (`equipos/{slug}/calendario/{mes}/{año}`, sin
límite de partidos pero sin dificultad).

**Regla de cuántos partidos guardar:** se guardan **todos** los partidos
que tenga el equipo por delante (amistosos incluidos), pero solo hasta
llegar como mínimo a **5 partidos de LIGA**. Si entre medias hay un
amistoso, Champions, Copa del Rey o cualquier otra competición, también se
guarda — solo cuentan los de LaLiga para decidir cuándo parar.

`Datos 3.csv`: `Equipo, Siguientes rivales, Competición, Jornada, Día,
Hora, Estadio, Dificultad de los rivales` (todas con varios partidos
separados por ` | `).

- `Siguientes rivales` usa el nombre oficial completo (mismo `MAPA_EQUIPOS`
  invertido), no el nombre corto de la web.
- `Dificultad de los rivales`: la web la pinta como una imagen
  (`vertical_1.jpg` a `vertical_5.jpg`, sin texto), traducida a mano:
  1=Muy baja, 2=Baja, 3=Media, 4=Alta, 5=Muy alta. Los amistosos no llevan
  dificultad (la web no la calcula para ellos) — celda vacía a propósito,
  no es un fallo.

## Optimización de agosto de 2026

Se revisaron los tres scripts a fondo para reducir tiempo y peso, unificar
lo que estaba duplicado y evitar redundancia de datos, pensando en que
esto va a alimentar una base de datos. Resumen de lo que se hizo y por
qué:

- **Código común (`Común.py`)**: ver sección de arriba. Elimina la
  duplicación de `MAPA_EQUIPOS`, `POSICIONES_VALIDAS`, `HEADERS` y del
  lector de la tabla de mercado entre los scripts 1 y 2.
- **Sesión HTTP compartida (keep-alive)**: los tres scripts usaban
  `requests.get()` suelto, que abre una conexión TCP+TLS nueva en CADA
  petición. Ahora usan una `requests.Session()` (`Común.crear_sesion()`)
  que reutiliza la conexión entre peticiones seguidas al mismo servidor.
  En el script 2, con varios cientos de peticiones por ejecución, esto
  ahorra tiempo real sin cambiar ni el número de peticiones ni las pausas
  entre ellas. También añade 2 reintentos automáticos ante errores
  temporales del servidor (500/502/503/504) — nunca ante 403/429 (si la
  web nos frena, hay que parar, no insistir).
- **Un fallo puntual ya no tira la ejecución entera**: los scripts 2 y 3
  solo escribían el CSV al final, después de recorrer todos los
  jugadores/equipos. Si UNA sola petición fallaba a mitad de camino
  (timeout, un jugador con la ficha movida...), se perdía todo el trabajo
  ya hecho con los demás. Ahora cada jugador/equipo va en su propio
  `try/except`: si falla, se salta y el resto del CSV se guarda igual (en
  silencio, sin avisar por pantalla — ver "Sin salida por terminal" más
  abajo).
- **Datos 2.csv sin columnas redundantes**: ver sección del script 2 más
  arriba.
- **Se evaluó y se descartó paralelizar peticiones** (pedir varios
  jugadores/equipos a la vez). Habría sido la mejora de tiempo más grande
  (script 2 podría bajar de ~40-60 min a ~10-15 min), pero choca
  directamente con la regla del proyecto de "peticiones espaciadas, nunca
  en ráfaga" y sube el riesgo de que la web limite o bloquee peticiones.
  Decisión tomada explícitamente con el usuario: se prioriza no arriesgar
  el acceso a la web sobre ganar velocidad.
- **Por qué las frecuencias recomendadas NO cambian**: el coste dominante
  de los scripts 2 y 3 no es el código (ya optimizado) sino (a) el peso en
  bytes de las páginas que hay que descargar sí o sí para sacar los datos
  (la ficha de cada jugador pesa ~2 MB completa; no existe en la web una
  versión más ligera con Estado/Minutos/Puntos — se comprobó en directo
  que `mercado/detalle/{id}`, con solo ~170 KB, NO trae esos datos, solo
  sirve para descubrir el slug) y (b) las pausas entre peticiones, que se
  han dejado intactas a propósito por la razón del punto anterior.

### Comprobado en directo el 09/08/2026 (para dar confianza de cara a la temporada 2026/27)

- **El mapa de 20 equipos ya es el de la temporada 2026/27**, no el de la
  temporada pasada: incluye a los tres ascendidos (Racing de Santander,
  Deportivo de La Coruña y Málaga) y NO incluye a los tres descendidos
  (Real Oviedo, Mallorca y Girona). Fuente: [LALIGA - clubes ascendidos
  2026/27](https://www.laliga.com/noticias/laliga-da-la-bienvenida-a-los-siete-clubes-ascendidos-para-la-temporada-2026-27),
  y confirmado también contra la tabla de mercado en directo (los 20
  equipos del filtro de la web coinciden exactamente con `MAPA_EQUIPOS`).
  **Aun así, hay que revisar este mapa cada verano** cuando cambien los 3
  ascendidos/descendidos — esto no se puede automatizar del todo porque
  hace falta el nombre oficial completo de cada equipo nuevo, no solo el
  corto.
- **La estructura HTML de la web sigue coincidiendo con lo que leen los
  scripts**, comprobado fila a fila contra la página en directo: la tabla
  de mercado (`tr.elemento_jugador` y sus atributos `data-*`), la ficha de
  jugador (`.disponible`/`.lesionado`/`.sancionado`, `.bigstat`, la tabla
  de desglose de puntos) y la ficha de equipo (`section.proximos`,
  `a.partido`, `.dificultad-container img.dificultad`). El "Estado" con
  estructura autoexplicativa funcionó correctamente con un caso real no
  visto antes ("Molestias en el pubis, disponible para la jornada 2"),
  confirmando que ese diseño (leer por estructura, no por palabras clave)
  sigue siendo robusto.
- Ahora mismo (pretemporada) la ficha de varios equipos mezcla amistosos
  con los primeros partidos de LaLiga antes de llegar a 5 de liga — se
  comprobó que la lógica de "rellenar con el calendario mensual hasta 5
  partidos de liga, contando también los amistosos de por medio" funciona
  bien con datos reales de este escenario.

### Cosas que hoy funcionan bien pero pueden romperse en el futuro

- **El mapa de equipos** (arriba): se rompe cada vez que hay ascensos o
  descensos (una vez al año, en verano). Si un jugador o equipo no
  reconocido empieza a desaparecer silenciosamente de los CSV, es la
  primera causa a mirar.
- **Cambios de diseño de la web**: todo el scraping depende de nombres de
  clase CSS y de la estructura del HTML de futbolfantasy.com. Si la web
  rediseña una página, los selectores dejan de encontrar filas y hay que
  ajustarlos. Como los scripts no imprimen nada (ver "Sin salida por
  terminal" más abajo), esto no se ve por pantalla: la señal es que
  `Datos 1.csv` sale vacío (solo cabecera) o deja de crecer.
- **`Datos 5.csv` (caché de slugs) puede quedar obsoleta**: si algún día
  la web cambia el slug de un jugador ya cacheado (p. ej. tras corregir un
  nombre), la petición a ese slug antiguo devolverá error 404. Con la
  mejora de robustez de esta optimización, eso ya NO tira la ejecución
  entera: se avisa y se salta ese jugador, pero se queda con el slug
  antiguo en caché para siempre. Si un jugador desaparece de forma
  persistente de `Datos 2.csv`/`Datos 4.csv`, conviene borrar su fila en
  `Datos 5.csv` para forzar que se vuelva a descubrir el slug.
- **Los IDs de equipo del calendario mensual** (`ID_A_NOMBRE_CORTO` en el
  script 3) son números fijos sacados a mano del desplegable de la web.
  Un ascenso/descenso puede introducir un ID nuevo que no esté en este
  mapa: el rival de ese partido concreto se quedaría con el campo "rival"
  vacío en vez de romper el script entero.

### Ideas evaluadas y descartadas (o aplazadas)

- **Paralelizar peticiones**: descartado, ver arriba.
- **Sustituir la ficha de 2 MB por páginas "masivas" de la web para Estado
  y Minutos jugados** (investigado el 09/08/2026, descartado con el
  usuario): existen `/laliga/lesionados` y `/laliga/sancionados` (todos
  los jugadores lesionados/sancionados en una sola página, ~400 KB) y una
  tabla masiva de Partidos/Minutos jugados en
  `/laliga/estadisticas/jugador` (formulario POST a
  `/filtrostatsliga/laliga` con `year`/`equipo`/`posicion`/`lado`) — se
  comprobó que el valor de "Minutos jugados" coincide exactamente con el
  de la ficha individual. **Pero no ahorra nada para la mayoría de
  jugadores**: el desglose de puntos por jornada (columna "Estadísticas"
  de `Datos 4.csv`) NO existe en ninguna página ligera de la web, solo en
  la ficha completa — así que cualquier jugador con partidos jugados
  sigue necesitando la ficha de 2 MB igualmente. El único ahorro real
  sería saltarse la ficha para jugadores sin ningún partido jugado (0
  filas en `Datos 4.csv` de todas formas), usando la página de
  lesionados/sancionados para su Estado. Se descartó porque, comparando el
  HTML exacto de un jugador lesionado en su ficha contra la página masiva
  de lesionados, **la página masiva tiene un `<span>` extra** ("Desde
  07/08 (2 días)") que la ficha no tiene — reproducir el mismo texto de
  Estado exigiría verificar a fondo varios casos (sancionado, disponible,
  distintas gravedades) para no arriesgarse a cambiar el formato de
  "Estado" en algún caso raro, y el ahorro solo beneficia a una minoría de
  jugadores (los que nunca han jugado ningún partido). Si en el futuro
  interesa revisarlo, este es el punto de partida.
- **Reescribir la ficha de jugador (~2 MB) por una fuente más ligera**:
  se comprobó en directo que no existe ninguna alternativa más ligera en
  la web con los mismos datos (Estado/Minutos/Puntos). No hay margen aquí
  sin arriesgarse a que el dato deje de ser fiable.
- **Escribir los CSV de forma incremental** (fila a fila, en vez de solo
  al final): reduciría la pérdida de trabajo si el script se interrumpe a
  mitad de ejecución (Ctrl+C, corte de luz...), pero es un cambio más
  grande que toca la forma de generar los ficheros. Se ha dejado fuera de
  esta ronda de optimización; el `try/except` por jugador/equipo ya cubre
  el caso más probable (que falle una petición, no que se interrumpa el
  proceso entero).

## Robustez añadida (agosto de 2026)

Además de la optimización de tiempo/peso, se revisaron los tres scripts
buscando puntos donde un fallo pudiera perder trabajo o dejar un CSV a
medio escribir. Todo esto es transparente: no cambia ningún valor ni
formato de columna, solo hace que los scripts aguanten mejor los
imprevistos.

- **Escritura de CSV "atómica"** (`Común.guardar_csv()`): los `Datos
  X.csv` se escriben primero a un archivo temporal (`Datos X.csv.tmp`) y
  solo al final se renombran sobre el definitivo. Si el proceso se corta
  justo durante la escritura (corte de luz, cierre forzado de la
  terminal...), el CSV bueno de la ejecución anterior se queda intacto en
  vez de quedar corrupto o a medias. Aplica a `Datos 1.csv`, `Datos
  2.csv`, `Datos 3.csv` y `Datos 4.csv`. (`Datos 5.csv` y `Datos 6.csv`
  siguen en modo "añadir al final" porque crecen fila a fila; no aplica
  ahí de la misma forma.)
- **Se distingue "la web nos bloquea" de "un jugador/equipo concreto ha
  fallado"** (`Común.ErrorBloqueo`): antes, un error 403/429 (bloqueo o
  límite de peticiones) se trataba igual que un fallo puntual — se
  saltaba ESE jugador y se seguía insistiendo con los siguientes 500, que
  es justo lo contrario de lo que dice la regla del proyecto ("si la web
  nos frena, hay que parar"). Ahora, si la web responde 403/429, el
  script entero **para ahí mismo** (no sigue pidiendo nada más) y guarda
  lo que ya tenía reunido hasta ese punto. Un timeout, un 404 puntual o un
  error 500 sigue tratándose como antes (se salta ese jugador/equipo y se
  continúa).
- **No se pierde el trabajo si se interrumpe a mano** (Ctrl+C): antes,
  interrumpir el script 2 o el 3 a mitad de ejecución perdía toda la
  sesión porque el CSV solo se escribe al final del bucle. Ahora el bucle
  principal está dentro de un `try/except KeyboardInterrupt`, así que al
  interrumpirlo se guarda igualmente lo que ya se había reunido hasta ese
  momento (con la escritura atómica de arriba, sin riesgo de corromper el
  archivo anterior).
- **`leer_tabla_mercado()` ya no se cae entera por una fila rota**: si un
  jugador concreto de la tabla de mercado trae un dato mal formado (ej.
  un `data-tendencia` que no es un número), antes esa excepción tiraba la
  lectura completa de los ~600 jugadores. Ahora esa fila se salta (en
  silencio, ver "Sin salida por terminal" más abajo) y el resto se
  procesa con normalidad.
- **Caché de slugs (`Datos 5.csv`) más defensiva**: si alguna fila de la
  caché quedase incompleta (ID sin Slug), antes podía reventar con
  `KeyError` al leerla. Ahora esa fila se ignora y ese jugador
  simplemente vuelve a descubrir su slug, como si fuera la primera vez.
- **Más margen de tiempo para la ficha del jugador**: al pesar ~2 MB, se
  le da un poco más de margen (30 s en vez de 20 s) antes de darla por
  fallida, para no perder jugadores válidos solo por una conexión lenta
  puntual.

## Revisión de seguridad (agosto de 2026)

Se revisó el código de los cuatro archivos (`Común.py` + los tres
scripts) buscando problemas de ciberseguridad. Resumen:

**Ya estaba bien, comprobado y confirmado:**
- No hay `eval`, `exec`, `pickle`, `subprocess` ni `os.system` en ningún
  sitio: nada ejecuta código ni comandos a partir de lo que trae la web.
- No hay SQL (todo son CSV), así que no hay inyección SQL posible.
- No hay contraseñas, tokens ni claves de ningún tipo en el código.
- Todas las peticiones son HTTPS, con verificación de certificado activa
  (nunca se usa `verify=False`).
- Todas las peticiones llevan `timeout` (nunca se pueden quedar colgadas
  para siempre).
- `BeautifulSoup` se usa siempre en modo HTML (`"html.parser"` / `"lxml"`
  para HTML), nunca en modo XML: el problema clásico de XXE de `lxml` es
  de su parser de XML, no del de HTML que usamos aquí.

**Corregido en esta revisión** (no cambia ningún valor ni formato de
columna, solo valida datos ANTES de usarlos para construir las URLs que
pedimos nosotros mismos):
- **`Común.PATRON_ID_JUGADOR`**: el "id" de cada jugador (`data-id` en la
  tabla de mercado) se usa tal cual dentro de URLs
  (`.../mercado/detalle/{id}`, `.../stats/detalle/{id}`). Ahora se
  comprueba que sea solo dígitos antes de aceptar esa fila; si no lo es,
  la fila se descarta igual que una fila con equipo o posición
  desconocidos. Antes de este cambio no había ninguna comprobación: si la
  web (o alguien interceptando la respuesta) hubiera devuelto algo raro
  en ese atributo, hubiera acabado igualmente dentro de una URL.
- **`PATRON_SLUG` (script 2)**: mismo razonamiento para el "slug" de la
  ficha del jugador (ej. "joan-garcia"), que también se usa dentro de una
  URL. Se comprueba que solo tenga minúsculas, dígitos y guiones, tanto
  al descubrirlo por primera vez como al leerlo de la caché
  (`Datos 5.csv`).
- **Selector de descubrimiento del slug más estricto**: buscaba
  `a[href*="/jugadores/"]` (cualquier enlace que CONTENGA esa cadena en
  cualquier parte de la página, incluida publicidad de terceros si la
  hubiera). Ahora exige que el enlace EMPIECE por la URL completa
  esperada (`a[href^="https://www.futbolfantasy.com/jugadores/"]`), para
  no arriesgarse a coger por error un enlace de otro sitio.

Con la verificación de certificado activa (nunca desactivada) el margen
real para que alguien manipule lo que llega desde `futbolfantasy.com` es
ya muy pequeño; estos cambios son una capa extra de por-si-acaso, no una
corrección de un fallo que se haya visto ocurrir.

**Detectado pero NO corregido sin preguntar primero** (implica cambiar
valores guardados en los CSV, o añadir bastante más complejidad para un
riesgo bajo):
- **Inyección de fórmulas en CSV**: si algún texto que raspamos de la web
  (nombre de jugador, descripción de una lesión...) empezara alguna vez
  por `=`, `+`, `-` o `@`, y ese CSV se abriera en Excel/Google
  Sheets/LibreOffice, esa celda podría interpretarse como una fórmula en
  vez de como texto (es un problema conocido y documentado, "CSV/Formula
  Injection"). No se ha visto ningún caso real en los datos actuales. La
  forma estándar de evitarlo es anteponer una comilla a esos valores,
  pero eso cambiaría el contenido exacto de esa celda — que es justo lo
  que se pidió no hacer sin confirmarlo antes. Si algún día se abren estos
  CSV en una hoja de cálculo (en vez de solo en la futura base de datos),
  avisa y se añade la protección.
- **Límite de tamaño de las respuestas**: `descargar_pagina()` no pone
  límite a cuánto puede pesar una respuesta antes de leerla entera en
  memoria. Con la verificación de certificado activa, solo sería
  explotable si `futbolfantasy.com` mismo estuviera comprometido — pero
  añadir un límite implica cambiar cómo se descarga cada página (leer a
  trozos en vez de de golpe), con algo más de complejidad para un riesgo
  bajo. Se puede añadir si se prefiere.

**Ideas de bajo interés, solo mencionadas** (no se han aplicado, impacto
menor para un script personal de un solo usuario): fijar las versiones
exactas de `requests`/`beautifulsoup4`/`lxml` en un `requirements.txt`
(protege ante una versión futura comprometida en PyPI); restringir a qué
dominios se puede seguir una redirección HTTP.

### Segunda revisión de seguridad (agosto de 2026, tras Paso 6 y las imágenes)

Al añadir la automatización con GitHub Actions y `Descargar imágenes.py`
se repasó otra vez el código en busca de problemas nuevos, con la misma
lógica que la primera revisión. Dos hallazgos:

- **Corregido**: `obtener_foto()` (`Ingestar datos 2.py`) leía el `src`
  de `.jugador-foto img` sin comprobar que viniera del dominio esperado
  antes de guardarlo — el mismo tipo de fallo que ya se había corregido
  para el slug del jugador (`PATRON_SLUG` + `href^=...`). Ahora se
  descarta cualquier URL que no empiece por
  `https://media.futbolfantasy.com/` (`PREFIJO_FOTO_ESPERADO`), igual
  que el slug se descarta si no empieza por la URL completa esperada.
- **Corregido**: con el repositorio ya público (ver Paso 6), los logs
  de las ejecuciones de GitHub Actions también son públicos.
  `Sincronizar base de datos.py` imprimía el mensaje de la excepción
  entero si algo fallaba al sincronizar una tabla — un mensaje de error
  concreto podría llegar a incluir un valor scrapeado (dato que el
  proyecto define como no público) dentro de su propio texto. Se
  cambió a `print(f"Error sincronizando {nombre}")` sin el detalle de
  la excepción, a petición explícita del usuario, priorizando no
  exponer datos sobre la comodidad de depurar directamente desde el
  log de Actions (para depurar un fallo real hay que reproducirlo en
  local).

## Sin salida por terminal (agosto de 2026)

A petición explícita del usuario, los cuatro archivos (`Común.py` y los
tres `Ingestar datos N.py`) ya no imprimen nada por pantalla: se quitó
todo `print()`. Un script terminado sin errores no deja ningún rastro en
la terminal; toda su salida real son los CSV.

Esto no cambia ningún comportamiento de fondo: los `try/except` que
saltan un jugador/equipo con fallos, el corte inmediato si la web
responde 403/429 (`Común.ErrorBloqueo`), y el guardado de lo ya reunido
al interrumpir con Ctrl+C, todo eso se mantiene exactamente igual — solo
que ahora ocurre en silencio.

**Cómo comprobar que algo ha ido mal, ya que no hay avisos por pantalla:**
- Revisar el número de filas del CSV correspondiente (una caída brusca
  respecto a ejecuciones anteriores es la señal más clara).
- El código de salida del proceso (`echo $?` / `$LASTEXITCODE`) solo
  avisa de un fallo si el script entero revienta con una excepción no
  controlada (algo que, con la robustez añadida antes, ya no debería
  pasar en el camino normal).
- Si hace falta depurar algo puntualmente, no hay que "reactivar" ningún
  interruptor: basta con añadir un `print()` temporal a mano en el sitio
  que se quiera investigar y quitarlo después (recordar la regla de más
  arriba: no dejar comentarios ni prints permanentes al terminar).

## Dependencias

```
pip install requests beautifulsoup4 lxml psycopg2-binary
```

## Columna `ID` en los CSV (agosto de 2026)

`Datos 1.csv`, `Datos 2.csv`, `Datos 4.csv` y `Datos 6.csv` llevan ahora
una columna `ID` justo a la izquierda de `Jugador` (decisión explícita
del usuario, para el Paso 5 de abajo). Es el mismo id numérico que ya se
usaba internamente para construir las URLs de la web y que vive en
`Datos 5.csv` (`ID, Slug`) — ahora también queda guardado en estos otros
cuatro archivos. `Datos 3.csv` no lleva `ID` porque no tiene columna
`Jugador` (es por equipo).

Al añadir esta columna, `Datos 6.csv` (que solo añade filas, no se
sobrescribe) tenía ya una fila de un día con el formato antiguo — se
guardó como `Datos 6.csv.bak-sin-id` en `Datos/` antes de dejar que el
archivo se regenerase limpio. Se puede borrar esa copia cuando ya no
haga falta.

## Paso 5: base de datos en la nube (Supabase)

Implementado en agosto de 2026. Los tres `Ingestar datos N.py` **no
cambian**: siguen escribiendo los CSV en `Datos/` exactamente igual que
antes (más la columna `ID`). Se añadió un cuarto script,
**`Scripts/Sincronizar base de datos.py`**, que lee esos CSV y los sube
a PostgreSQL (Supabase) — así, si algo falla al subir, los CSV siguen
intactos como respaldo.

- **`Scripts/Esquema base de datos.sql`**: se pega una vez en el *SQL
  Editor* de Supabase para crear las 5 tablas. No es un script de
  Python, no se ejecuta con `python`.
  - `equipos` (`nombre` PK): los 20 equipos, para poder enlazar el resto
    de tablas.
  - `jugadores` (`id` PK, el id real de la web): foto actual de cada
    jugador, combina `Datos 1.csv` + `Datos 2.csv`. Se hace UPSERT en
    cada sincronización.
  - `historial_valor` (`id, fecha` PK): viene de `Datos 6.csv`. Solo se
    insertan filas nuevas (`ON CONFLICT DO NOTHING`), nunca se
    actualizan las que ya había.
  - `puntos_jornada` (`id, jornada` PK): viene de `Datos 4.csv`. Se hace
    UPSERT (no solo INSERT) a propósito: `Datos 4.csv` se reconstruye
    entero en cada ejecución de `Ingestar datos 2.py`, y los valores de
    jornadas pasadas pueden corregirse (pasó de verdad con el fallo de
    "Puntos DAZN" que faltaba en el desglose).
  - `calendario` (`equipo, orden` PK): viene de "explotar" las columnas
    separadas por ` | ` de `Datos 3.csv` en una fila por partido
    (`orden` = posición en la lista, 1 es el más próximo). Antes de
    insertar se borran las filas de ese equipo (`DELETE` + `INSERT`),
    porque la lista de próximos partidos hay que reemplazarla entera,
    no acumularla — si no, quedarían partidos ya jugados colgando.
  - `Datos 5.csv` (caché de slugs) **no** se sincroniza: es un detalle
    interno del scraper, no un dato de análisis.
- Los valores de texto de los CSV se convierten a tipos numéricos al
  sincronizar (quitar puntos de miles de `Valor`, quitar el `%` de los
  porcentajes, sacar solo el número de "N días" de `Tendencia`...). Los
  CSV en sí **no cambian de formato** por esto — la conversión pasa solo
  dentro de `Sincronizar base de datos.py`.
- A diferencia de los otros 4 archivos de código, este **sí informa por
  pantalla** (cuántas filas se han sincronizado por tabla, y cualquier
  error) — decisión explícita del usuario, porque al mover datos a un
  sistema externo conviene poder confirmar que ha ido bien sin tener que
  entrar a Supabase cada vez. Sigue sin llevar comentarios en el código.
- **Credenciales**: `Scripts/Configuración local.py` tiene una sola línea,
  `DATABASE_URL = "postgresql://..."`, que el usuario rellena a mano con
  el connection string de su proyecto de Supabase (*Project Settings →
  Database → Connection string*). **Este archivo no debe subirse nunca a
  GitHub** — cuando este proyecto se suba a un repositorio, lo primero
  que hay que hacer es añadir `Configuración local.py` a `.gitignore`, antes de
  cualquier `git add`.

## Paso 6: automatización con GitHub Actions

Implementado en agosto de 2026. `.github/workflows/scraping.yml` ejecuta
los cuatro scripts en runners de GitHub, sin tocar su código de fondo
(solo se les añadió lo mínimo para poder correr sin `Configuración
local.py`, ver más abajo).

- **Dos horarios distintos en el mismo workflow** (`on.schedule` acepta
  varias entradas `cron`): `0 * * * *` (cada hora, para
  `Ingestar datos 1.py`, el barato) y `0 */5 * * *` (cada 5 horas, para
  `Ingestar datos 2.py` y `3.py`, los caros), respetando exactamente la
  tabla de frecuencias de más arriba. Cada disparo llega como una
  ejecución de workflow separada con `github.event.schedule` igual al
  cron que lo lanzó; cada paso comprueba ese valor para decidir si le
  toca correr. En las horas en que ambos cron coinciden (0, 5, 10...) se
  lanzan dos ejecuciones independientes, no una que haga las dos cosas.
- **`concurrency: group: fantasy-scraping, cancel-in-progress: false`**:
  si dos ejecuciones coinciden en el tiempo (ver punto anterior), se
  encolan en vez de correr en paralelo. Evita que dos procesos escriban
  a la vez sobre la misma caché de `Datos/` (ver siguiente punto).
- **La caché de slugs (`Datos 5.csv`) tiene que sobrevivir entre
  ejecuciones**, o cada ejecución de `Ingestar datos 2.py` volvería a
  descubrir el slug de los ~600 jugadores desde cero (multiplica las
  peticiones y va exactamente en contra de para qué existe esa caché).
  Como `Datos/` nunca se sube al repositorio (no es público, ver "Qué es
  esto"), un runner de GitHub Actions empieza cada vez desde cero salvo
  que se persista aparte. Se usa `actions/cache` sobre la carpeta
  `Datos/` con clave `datos-fantasy-${{ github.run_id }}` (única en cada
  ejecución, así el guardado nunca choca con una caché ya existente) y
  `restore-keys: datos-fantasy-` (restaura la más reciente que empiece
  por ese prefijo). Esta caché es privada del repositorio en GitHub
  (no descargable públicamente aunque el repositorio en sí sea público),
  así que no contradice la regla de "los CSV no son públicos".
- **`workflow_dispatch` con un input `modo`** (`todo` / `solo-mercado` /
  `solo-pesado`): permite lanzar el workflow a mano desde GitHub (para
  probarlo) sin esperar a que llegue la hora en punto correspondiente.
- **`Scripts/Sincronizar base de datos.py` ya no depende solo de
  `Configuración local.py`**: se añadió `obtener_database_url()`, que
  mira primero la variable de entorno `DATABASE_URL` (así es como se le
  pasa el secreto del repositorio en GitHub Actions) y, si no existe,
  cae al `Configuración local.py` de siempre (así sigue funcionando
  igual en local, sin cambiar nada de cómo lo usa el usuario en su
  propio PC). El resto del script no cambia.
- **`requirements.txt` en la raíz del repositorio**: hasta ahora las
  dependencias solo estaban escritas como texto en el README; hacía
  falta un archivo real para que el workflow pudiera instalarlas con
  `pip install -r requirements.txt`.
- **El repositorio pasó de privado a público** (decisión tomada
  explícitamente con el usuario en esta conversación, con tres
  alternativas descartadas: seguir privado aceptando el coste, seguir
  privado bajando la frecuencia, o usar un runner propio). El motivo es
  puramente económico: `Ingestar datos 2.py` tarda ~40-60 min por
  ejecución (ver la sección de optimización de arriba, donde se
  descartó paralelizar peticiones), y a razón de ~144 ejecuciones/mes
  (cada 5h) eso son varios miles de minutos de GitHub Actions al mes —
  muy por encima de los 2.000 minutos/mes gratis que da GitHub en un
  repositorio **privado** (se habría facturado aparte, unos $35-45/mes
  estimados). Un repositorio **público** tiene minutos de Actions
  ilimitados y gratis. Esto no contradice ninguna regla del proyecto:
  las notas de este documento ya decían desde el principio que "el
  código sí puede ser público; la base de datos con datos reales no" —
  `Datos/` sigue en `.gitignore`, `Configuración local.py` sigue en
  `.gitignore`, y `DATABASE_URL` sigue viviendo solo como secreto de
  GitHub Actions, nunca como archivo ni en el propio código.
- **Dos pasos que no se pudieron automatizar desde aquí** (cambiar la
  visibilidad del repositorio y añadir el secreto `DATABASE_URL` son
  ambos cambios de configuración/credenciales que le tocan al usuario
  directamente, y además este entorno no tenía `gh` CLI ni token de
  GitHub disponible): el propio usuario tuvo que entrar a GitHub y (1)
  cambiar la visibilidad del repositorio a público desde *Settings →
  General → Danger Zone → Change visibility*, y (2) añadir
  `DATABASE_URL` en *Settings → Secrets and variables → Actions → New
  repository secret* con el mismo connection string que ya tiene en su
  `Configuración local.py` local.

## Normalización de `puntos_jornada.estadisticas`

Implementado en agosto de 2026. La columna `estadisticas` de
`puntos_jornada` sigue existiendo tal cual (el texto en bruto que trae
`Datos 4.csv`, ej. "45 minutos jugados: 1 punto, 2 goles en contra: -1
punto") — no se ha tocado ni el CSV ni esa columna, para no perder el
dato original. Lo que se añadió es una tabla nueva,
**`puntos_jornada_detalle`** (`id, jornada, orden, estadistica,
cantidad, puntos`, con FK compuesta a `puntos_jornada(id, jornada)`),
con una fila por cada estadística individual de cada jornada de cada
jugador, para poder analizarlas por separado (ej. "cuántos puntos ha
sacado este jugador solo de asistencias en toda la temporada").

- **El parseo pasa solo dentro de `Sincronizar base de datos.py`**
  (`parsear_detalle_estadisticas()`), igual que las demás conversiones
  de texto a tipos numéricos de este script — no en los scripts de
  ingesta, que no cambian su salida. La regex
  (`PATRON_PARTE_ESTADISTICA`) es literalmente el reverso de cómo
  `obtener_desglose_puntos()` en `Ingestar datos 2.py` construye ese
  texto (`{cantidad opcional} {nombre}: {puntos} punto(s)`, partes
  separadas por ", "), así que si algún día cambia el formato de ese
  texto en el scraper, hay que actualizar la regex a la vez.
- **`cantidad` es nullable**: no todas las líneas del desglose llevan un
  número delante del nombre de la estadística (ej. "Puntos DAZN: 1.5
  puntos" no lleva cantidad, "45 minutos jugados: 1 punto" sí). Si
  `cantidad` no se puede convertir a número por lo que sea, se guarda
  `NULL` en vez de reventar esa fila entera.
- **Se borra y se vuelve a insertar por `(id, jornada)`**, no `UPSERT`
  fila a fila: como el desglose es una lista de longitud variable (y
  `Datos 4.csv` se reconstruye entero cada vez que corre
  `Ingestar datos 2.py`, pudiendo corregir jornadas pasadas — pasó de
  verdad con el fallo de "Puntos DAZN" mencionado más arriba), un
  `UPSERT` por fila dejaría basura de versiones anteriores si el número
  de líneas del desglose cambia. Mismo razonamiento que ya se usaba
  para `calendario` (borrar todo el equipo antes de reinsertar), aquí
  aplicado por jugador+jornada en vez de por equipo.
- **Nueva tabla en `Esquema base de datos.sql`**: como el archivo no usa
  `create table if not exists` en ninguna de las tablas existentes (a
  propósito, para no enmascarar un error si se intenta crear una tabla
  que ya existe), hay que pegar en el *SQL Editor* de Supabase
  **solo el bloque nuevo** de `puntos_jornada_detalle`, no el archivo
  entero otra vez.

## Descargar imágenes.py — fotos de jugadores y escudos de equipo

Implementado en agosto de 2026. Antes de escribir código se comprobó en
directo el patrón real de las dos URLs, porque lo que decía este mismo
documento no era del todo exacto:

- **Escudos de equipo**: `static.futbolfantasy.com/uploads/images/cabecera/hd/{id_equipo}.png`
  sí es predecible solo por ID, tal cual se pensaba (confirmado con
  Barcelona=3 y Racing=42 devolviendo 200, y un ID inventado devolviendo
  404).
- **Fotos de jugador**: `media.futbolfantasy.com/thumb/{tamaño}/v{versión}/uploads/images/jugadores/ficha/{id}.png`
  **no** es solo por ID: lleva un segmento de versión (ej.
  `v202607300329`) que cambia de un jugador a otro y no se puede
  deducir. Hay que sacarlo de una página que ya se descarga.

Decisiones de diseño (confirmadas con el usuario):

- **Se descargan los archivos de verdad** (no solo se guarda la URL) a
  `Datos/Imágenes/Jugadores/{id}.png` y `Datos/Imágenes/Equipos/{id}.png`.
- **La foto se captura sin gastar ninguna petición nueva**: `Ingestar
  datos 2.py` ya descarga la ficha completa de cada jugador cada 5h
  (`obtener_foto()`, selector `.jugador-foto img`, la misma página de
  la que ya salen `Estado`/`Minutos jugados`/desglose de puntos). Se
  añadió una columna `Foto` a `Datos 2.csv` con esa URL completa
  (cambio aditivo, igual que se hizo antes con la columna `ID`).
- **`ID_A_NOMBRE_CORTO` (el mapa de 20 IDs de equipo) se movió de
  `Ingestar datos 3.py` a `Común.py`**, porque ahora lo necesitan dos
  scripts distintos (el 3, para el calendario mensual, y este, para los
  escudos) — mismo razonamiento que llevó a crear `Común.py` en la
  optimización de agosto: un solo sitio para no tener que corregir dos
  veces un ascenso/descenso. Es una extracción de código, no cambia
  ningún comportamiento de `Ingestar datos 3.py`.
- **`Común.py` gana dos funciones nuevas**: `descargar_binario()` (como
  `descargar_pagina()` pero devuelve bytes en vez de texto, con la
  misma detección de 403/429) y `guardar_binario()` (como
  `guardar_csv()` pero para binario: escritura atómica a un `.tmp` y
  renombrado).
- **No vuelve a descargar lo que ya tiene**: antes de pedir una imagen,
  `Descargar imágenes.py` comprueba si el archivo ya existe en disco;
  si existe, no hace ninguna petición. La primera vez cuesta ~600-650
  peticiones (fotos + escudos, del mismo orden que arrancar la caché de
  slugs de `Ingestar datos 2.py`); a partir de ahí el coste de cada
  ejecución es prácticamente cero, solo se piden fotos de jugadores
  nuevos. Esto es lo que hace seguro meterlo en el mismo hueco de cada
  5h del workflow de GitHub Actions (junto a los scripts 2 y 3) sin
  machacar el servidor — la caché de `Datos/` entre ejecuciones (ver
  Paso 6) es imprescindible para que este ahorro funcione en GitHub
  Actions y no solo en local.

**Actualizado en el Paso 8 (agosto de 2026)**: `Ingestar datos 2.py` (de
donde salía la `Foto`) se eliminó. `listar_fotos_jugadores()` ahora lee la
columna `Foto` de `Datos Jugadores.csv` (generado por
`Ingestar datos liga.py`), con la URL que da directamente la API oficial
(`assets-fantasy.llt-services.com`, validada contra
`Común.PREFIJO_FOTO_LALIGA_FANTASY` antes de guardarse en el CSV, mismo
criterio de siempre de no confiar en una URL externa sin comprobar el
dominio). Los escudos de equipo **no cambian**, siguen saliendo de
futbolfantasy.com igual que aquí arriba.
- **Limitación conocida, igual que la caché de slugs**: si
  futbolfantasy.com actualiza la foto de un jugador ya descargado, no
  se vuelve a pedir sola — hay que borrar el archivo local
  correspondiente en `Datos/Imágenes/Jugadores/` para forzar que se
  vuelva a descargar.
- Igual que los tres `Ingestar datos N.py`, este script tampoco imprime
  nada por pantalla ni lleva comentarios.

## Paso 7: web de comparación de jugadores

Implementado (v1) en agosto de 2026, en `Fantasy/Web/` (Next.js 16, App
Router, TypeScript, Tailwind). Decisiones tomadas explícitamente con el
usuario:

- **Stack**: Next.js + React, pensado también como pieza de portfolio
  para entrevistas de trabajo (mismo motivo que ya guiaba el README).
- **Acceso**: pública, mismo criterio que el código del repositorio ("el
  código sí puede ser público; la base de datos con datos reales no" —
  aquí es al revés a propósito: la web sí expone los datos ya
  procesados en modo solo lectura, no las peticiones en bruto ni
  ninguna credencial).
- **Alcance v1**: una tabla filtrable/ordenable de los ~595 jugadores
  (buscar por nombre, filtrar por posición/equipo, ordenar por
  valor/puntos/nombre) y comparación lado a lado de hasta 3 jugadores
  seleccionados (valor, puntos totales, titularidad, minutos, estado,
  próximo rival y dificultad). Sin gráficas todavía (se dejó fuera a
  propósito de la v1, ver más abajo).

**Cómo lee los datos**: la web NO usa el cliente JS de Supabase ni su
API REST (`Data API desactivada`, ver Paso 5) — usa `pg` directamente
desde Server Components de Next.js, con el mismo `DATABASE_URL` que ya
usa `Sincronizar base de datos.py` (guardado en `Web/.env.local` en
local, y como variable de entorno del proyecto en Vercel al desplegar,
nunca en el código). Esto evita tener que activar la Data API de
Supabase o escribir políticas RLS: el control de qué se puede leer/
escribir vive enteramente en el código del propio Next.js (que solo
hace `SELECT`), no en la base de datos. Nota de mejora futura, no
aplicada: para no reutilizar el mismo rol con permisos de escritura
que usa el script de sincronización, lo más estricto sería crear un rol
de Postgres aparte solo con `SELECT`, igual que se dejaron anotadas
otras mejoras de seguridad de bajo riesgo sin aplicar en el Paso 5.

**Cómo sirve las fotos/escudos**: se decidió explícitamente subir las
imágenes descargadas a un bucket público de **Supabase Storage**
(`imagenes/jugadores/{id}.png`, `imagenes/equipos/{id}.png`) en vez de
enlazar directo a futbolfantasy.com, porque ya se había decidido antes
"descargar los archivos de verdad" (ver sección de `Descargar
imágenes.py`) y una web en Vercel no tiene acceso al disco local ni a
la caché de GitHub Actions donde viven esos archivos.

- **`Común.subir_a_storage()`** (nuevo, en `Común.py`) sube el
  contenido ya descargado al bucket vía la API REST de Storage
  (`PUT .../storage/v1/object/{bucket}/{ruta}`) con la clave
  `service_role` (nunca la `anon`, para que solo el propio proceso de
  scraping pueda escribir en el bucket).
- **Orden importante en `descargar_si_falta()`**: primero se sube a
  Storage y solo si eso funciona se guarda el archivo local. Si se
  hiciera al revés (guardar local primero), un fallo de subida a
  Storage quedaría escondido para siempre: la próxima ejecución vería
  el archivo local ya presente y no reintentaría la subida jamás. Con
  el orden actual, si falla la subida, tampoco se guarda local, así que
  la próxima ejecución vuelve a intentar las dos cosas juntas.
- **Coste**: el mismo razonamiento de "no descargar lo que ya se tiene"
  ya cubre esto — solo se sube a Storage lo que se acaba de descargar
  por primera vez de futbolfantasy.com, prácticamente gratis en
  ejecuciones sucesivas.
- El bucket y la clave `service_role` se crean/consiguen a mano en el
  panel de Supabase (no automatizable sin dar más permisos de los
  necesarios); `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` siguen el
  mismo patrón que `DATABASE_URL`: variable de entorno primero,
  `Configuración local.py` como respaldo en local
  (`Común.obtener_configuracion()`, que sustituye a la función que
  antes solo tenía `Sincronizar base de datos.py` para `DATABASE_URL`
  — ahora la usan los dos scripts que necesitan credenciales).

**Cambio de esquema para poder enlazar los escudos**: la tabla
`equipos` solo tenía `nombre` (texto, el oficial largo) como clave. Los
escudos se guardan con el ID numérico corto que ya usaba
`ID_A_NOMBRE_CORTO`, así que se añadió una columna `id integer unique`
a `equipos`, rellenada en la sincronización a partir de un mapa nuevo
en `Común.py` (`NOMBRE_OFICIAL_A_ID`, compuesto de `MAPA_EQUIPOS` +
`ID_A_NOMBRE_CORTO`). `sincronizar_equipos()` pasó de
`on conflict do nothing` a `on conflict do update set id = excluded.id`
a propósito, para que los 20 equipos ya existentes en la base de datos
(insertados antes de que existiera esta columna) se actualicen con su
`id` la primera vez que se vuelve a sincronizar.

**Pendiente dentro de Paso 7** (no bloquea la v1):
- Desplegar de verdad en Vercel (conectar el repositorio de GitHub,
  configurar `DATABASE_URL` como variable de entorno del proyecto).
- Gráficas de evolución de valor / puntos por jornada (se dejaron fuera
  de la v1 a petición explícita del usuario, para no complicar el
  primer alcance).
- Rol de Postgres de solo lectura para la web, en vez de reutilizar el
  de `Sincronizar base de datos.py` (ver nota de seguridad más arriba).

## Paso 8: la API oficial de LaLiga Fantasy pasa a ser la fuente principal

Empezado y terminado en agosto de 2026 (14/08/2026), en dos rondas dentro de
la misma conversación. **Ronda 1**: solo se quería que `jugadores.valor`
reflejara el valor real de la liga privada del usuario (sube por pujas entre
amigos, dato que no existe en ninguna web, solo en la app oficial con la
cuenta real) en vez de la estimación de futbolfantasy.com. **Ronda 2**: una
vez visto en directo que la API oficial da mucho más que el valor (nombre,
equipo, posición, minutos, puntos...), el usuario decidió invertir la fuente
principal: la API pasa a alimentar casi todo, y futbolfantasy.com se queda
solo para lo que la API no da. Esto implicó **eliminar y recrear las tablas
`jugadores`, `historial_valor`, `puntos_jornada` y `puntos_jornada_detalle`**
(backup previo en `Datos/Backup antes de pivote LaLiga Fantasy.json`, hecho
con Python/psycopg2 porque `pg_dump` no estaba instalado en el entorno) —
el `id` de `jugadores` pasa a ser el id oficial de LaLiga Fantasy en vez del
de futbolfantasy.com, así que el histórico viejo queda huérfano de todas
formas. `Esquema base de datos.sql` **no cambió de contenido** (mismas
columnas exactas) — solo se ejecutó `DROP TABLE` + las mismas `CREATE TABLE`
de siempre contra Supabase.

**Decisión explícita del usuario, la más importante de este paso**: se
acepta el riesgo de automatizar con la cuenta real (contradice la regla
original de "nunca usar la cuenta real", que existía justo para evitar
esto) porque el valor de la liga privada no existe en ningún otro sitio;
cadencia elegida: **cada hora**, la más arriesgada de las opciones
planteadas, elegida explícitamente por el usuario sabiendo el riesgo mayor
de peticiones automáticas frecuentes contra una cuenta personal.

**Regla de formato, no negociable**: el origen del dato cambia, pero el
formato final de cada columna no — mismas etiquetas en español
("Delantero", no un código de la API), mismo tipo de dato, mismo
significado que antes.

### Mapa de fuente por columna (decidido con el usuario)

| Columna / tabla | Fuente | Detalle |
|---|---|---|
| `nombre`, `equipo`, `posicion`, `valor`, foto | API LaLiga Fantasy | ver abajo |
| `diferencia_valor`, `porcentaje_diferencia`, `tendencia_dias`, `aceleracion` | Calculado en `Sincronizar` | comparando contra `historial_valor` ya guardado, la API no da esto |
| `minutos_jugados`, `puntos_jornada`, `puntos_jornada_detalle` | API LaLiga Fantasy (`playerStats`) | **vacío hasta que empiece la temporada 2026/27 de verdad** |
| `porcentaje_titularidad`, `estado`, `calendario` | futbolfantasy.com | lo único que se sigue raspando |

**API usada (no oficial, no documentada por LaLiga, descubierta investigando
proyectos de la comunidad — [Externoak/LaLigaApp](https://github.com/Externoak/LaLigaApp)
y [alxgarci/marca-fantasy-api-scraper-updated](https://github.com/alxgarci/marca-fantasy-api-scraper-updated),
este último roto porque el acceso web del juego se retiró y ahora es solo
por app):**
- Host: `https://fantasy-api.llt-services.com/api/v1/competition/1`.
- Login (usuario/contraseña reales) y refresco de token: OAuth2 ROPC contra
  el tenant Azure B2C de LaLiga (`login.laliga.es`), token Bearer válido
  ~24h. Ver `Común._iniciar_sesion_laliga_fantasy()` /
  `Común._refrescar_token_laliga_fantasy()` para las URLs y parámetros
  exactos.
- Mercado de la liga: `GET /league/{leagueId}/market`. Tu plantilla:
  `GET /leagues/{leagueId}/teams/{teamId}`. Tus ligas (para descubrir los
  dos ids anteriores): `GET /leagues`.

**Nuevo en `Común.py`**: `obtener_token_laliga_fantasy()` (cachea el token en
`Datos/Token LaLiga Fantasy.json`, refresca en cada ejecución en vez de
loguear con contraseña cada vez — solo hace login completo si no hay caché o
el refresco falla), `descargar_json_autenticado()` (como
`descargar_pagina()`/`descargar_binario()` pero para la API con Bearer token,
trata 401/403/429 como `ErrorBloqueo`), `guardar_json()`/`leer_json()` (mismo
patrón atómico `.tmp` + `os.replace` que `guardar_csv`/`guardar_binario`).
Credenciales nuevas en `Configuración local.py` (ya cubierto por
`.gitignore`, rellenar a mano, nunca por chat): `LALIGA_FANTASY_EMAIL`,
`LALIGA_FANTASY_PASSWORD`, `LALIGA_FANTASY_LEAGUE_ID`,
`LALIGA_FANTASY_TEAM_ID`.

**`Scripts/Descubrir liga.py`** (nuevo, utilidad manual de un solo uso, NO
forma parte de la automatización): loguea y imprime `GET /leagues` en bruto
para poder leer a mano el `leagueId`/`teamId` reales y rellenarlos en
`Configuración local.py`. A diferencia de los `Ingestar datos N.py`, este sí
imprime por pantalla a propósito (igual que `Sincronizar base de datos.py`
es la única excepción a la regla de "sin salida por terminal") porque es una
herramienta de un solo uso para el propio usuario, no parte del pipeline
silencioso.

**Verificado en directo (14/08/2026) con la cuenta real del usuario** — su
liga privada se llama "Prueba" (`leagueId` interno `018053483`,
`managersNumber: 1` por ahora, confirmado con el usuario que es la liga
real, de momento sin compañeros unidos):

- **El endpoint de refresco documentado por terceros no funciona**
  (`AADB2C90090`, política incorrecta). El refresco real usa el **mismo**
  endpoint que el login (`URL_LOGIN_LALIGA_FANTASY`), con
  `grant_type=refresh_token` y el mismo `scope` que el login. Corregido en
  `Común._refrescar_token_laliga_fantasy()` — ya no existe
  `URL_REFRESCO_LALIGA_FANTASY`.
- **El "valor" de un jugador NO es un solo campo.** Hay dos:
  - `playerMaster.marketValue`: valor oficial de LaLiga Fantasy, igual en
    cualquier liga (no es el de futbolfantasy.com, pero tampoco es
    "el de tu liga" — es el valor base del juego).
  - `buyoutClause`: la **cláusula de rescisión**, solo existe para
    jugadores que ya están en la plantilla de algún equipo. Es el valor que
    el propio manager puede subir a mano (confirmado con un caso real: Robin
    Le Normand, `marketValue` 9.843.374 pero `buyoutClause` 16.405.623 ya
    subida). **Decisión explícita del usuario**: el "Valor" de la web debe
    ser `marketValue` para jugadores libres, pero `buyoutClause` para
    cualquier jugador que esté en la plantilla de **cualquier** equipo de
    la liga (el suyo o el de un compañero) — no solo los propios.
- **Endpoints confirmados que sí existen** (base
  `Común.URL_BASE_LALIGA_FANTASY`):
  - `GET /players?x-lang=es`: catálogo oficial completo (715 elementos,
    más que los ~595 de futbolfantasy.com — incluye más jugadores, motivo
    sin investigar todavía). Cada elemento: `id`, `positionId` (1=Portero,
    2=Defensa, 3=Centrocampista, 4=Delantero, 5=Entrenador — **ojo, los
    nombres de posición de esta fuente NO coinciden con
    `Común.POSICIONES_VALIDAS`**, que usa "Mediocampista" en vez de
    "Centrocampista"), `nickname`, `marketValue`, `teamId` (numérico).
    **No trae nombre de equipo**, solo el id numérico.
  - `GET /leagues/{leagueId}/standing?x-lang=es`: lista de equipos de la
    liga con `team.id`, `team.managerId`, `team.manager.managerName`.
  - `GET /leagues/{leagueId}/teams/{teamId}?x-lang=es`: plantilla de un
    equipo concreto (no solo el propio — funciona para cualquier `teamId`
    visto en `standing`), con `players[].buyoutClause` y
    `players[].playerMaster` (aquí sí trae `team.name` anidado, ej.
    "Valencia CF", "Atlético de Madrid").
  - `GET /player/{id}/league/{leagueId}?x-lang=es`: ficha de un jugador
    suelto — tampoco trae nombre de equipo, solo `teamId`.
- **`GET /teams?x-lang=es` NO existe** (404). El nombre de los 20 equipos de
  esta temporada sale de **`GET /v3/teams-master?x-lang=es`** (nota: `v3`,
  no `v1/competition/1` como el resto de endpoints) — 42 clubes de Primera y
  Segunda con `id`, `name`, `shortName`. Los 20 de 2026/27 se identificaron
  a mano por nombre contra `Común.ID_A_NOMBRE_CORTO` (incluye los tres
  ascendidos: Racing=49, Deportivo=26, Málaga=12) y quedaron fijos en
  `Común.MAPA_EQUIPO_ID_OFICIAL_A_CORTO` + `Común.equipo_oficial_a_nombre_largo()`.
  El `teamId` oficial **no coincide** con el de futbolfantasy.com (se
  comprobó que Valencia y Atlético sí coinciden por casualidad, Elche y
  Villarreal no), por eso hace falta este mapa fijo en vez de asumir que
  son el mismo esquema de ids.

### Emparejador de jugadores entre las dos fuentes

futbolfantasy.com y la API oficial no comparten ninguna clave — el
emparejamiento es por **nombre + equipo** (`Sincronizar base de
datos.py`: `normalizar_nombre()` en `Común.py` quita acentos/mayúsculas,
`tokenizar_nombre()` + `nombres_coinciden()` en `Sincronizar` comparan por
tokens en vez de por string exacto). Hacía falta tolerancia porque las dos
fuentes no usan la misma convención de nombre corto: la API a veces da solo
el apellido ("Laporte", "Vencedor"), a veces con inicial abreviada
("O. Sancet"), futbolfantasy a veces el nombre completo ("Aymeric
Laporte", "Oihan Sancet"). El emparejador hace **coincidencia de
subconjunto de tokens, tratando un token de una sola letra como comodín de
inicial** — probado en directo con los datos reales: subió el acierto de
titularidad del 24% (comparación exacta) al **86%** (512/598), y el de
estado del 20% al **80%** (48/60). Los nombres sin emparejar se quedan con
`NULL` (titularidad) o `"Disponible"` por defecto (estado) — nunca se
inventa un dato.

### Cálculo de tendencias (`diferencia_valor`, `porcentaje_diferencia`, `tendencia_dias`, `aceleracion`)

La API no da estos cuatro campos (solo el valor actual). `Sincronizar base
de datos.py` los calcula él mismo, en `calcular_tendencias()`, después de
sincronizar `historial_valor`: lee las últimas 15 filas de cada jugador
(vía `row_number() over (partition by id order by fecha desc)`), calcula la
diferencia contra el valor de ayer, cuenta cuántos días seguidos lleva la
misma dirección (`tendencia_dias`), y aproxima `aceleracion` a las mismas 7
categorías que ya usaba la web (`clasificar_aceleracion()`: compara la
variación de hoy contra la de ayer, "Inflexión" si cambia de signo, si no
por umbrales de `UMBRAL_ACELERACION_MUCHO`/`NORMAL`). **Aprobado
explícitamente por el usuario que esto es una aproximación, no la fórmula
real de futbolfantasy.com** (que nunca se conoció). Los primeros días tras
la migración estos campos quedan vacíos por falta de histórico — necesitan
al menos 2 días de `historial_valor` para calcular nada, y 3 para
`aceleracion`.

### Estado final verificado en directo (14/08/2026)

- Esquema recreado en Supabase (backup previo confirmado: 608 jugadores,
  2.961 historial, 8.341 puntos, 30.974 detalle, en
  `Datos/Backup antes de pivote LaLiga Fantasy.json`).
- Pipeline completo corrido en local: `equipos` (20), `jugadores` (692,
  filtrando los que no son de los 20 clubes de esta temporada ni tienen
  posición de jugador real), `historial_valor` (692, primer día),
  `tendencias` (0, sin histórico suficiente todavía), `puntos_jornada` /
  `puntos_jornada_detalle` (0, pretemporada), `calendario` (109) — sin
  errores, confirmado además que correr `Sincronizar` dos veces seguidas no
  duplica filas.
- Comprobado en la web en local (`/jugadores`): posiciones en español
  completo, equipos con nombre oficial largo, estado emparejado
  correctamente para jugadores lesionados/sancionados reales (ej.
  "Yeremay — Pubalgia, desde 08/07"), Le Normand con `valor` = 16.405.623
  (su cláusula real, no el `marketValue` de 9.843.374).
- `requirements.txt`: se quitó `lxml` (ya no lo usa ningún script, era solo
  para la ficha pesada de `Ingestar datos 2.py`, eliminado).
- `.github/workflows/scraping.yml` actualizado: `Ingestar datos liga.py` +
  `Ingestar datos 1.py` + `Ingestar datos estado.py` en el cron horario
  (`0 * * * *`), `Ingestar datos 3.py` + `Descargar imágenes.py` en el de
  4-6h, `Sincronizar base de datos.py` al final de cualquiera de los dos.
  `workflow_dispatch.modo` renombrado de `solo-mercado`/`solo-pesado` a
  `solo-barato`/`solo-pesado`. Nuevos secretos del repo (pendiente de que
  el usuario los añada en GitHub, igual que en su día con `DATABASE_URL`):
  `LALIGA_FANTASY_EMAIL`, `LALIGA_FANTASY_PASSWORD`,
  `LALIGA_FANTASY_LEAGUE_ID`.

**Pendiente de verdad (no se puede avanzar más sin datos reales o sin más
managers en la liga)**:
- `minutos_jugados`/`puntos_jornada`/`puntos_jornada_detalle`: en cuanto se
  jueguen partidos de LaLiga 2026/27, hay que volver a mirar `playerStats`
  con datos reales y escribir el parser — hoy está vacío en todas las
  respuestas de la API, formato desconocido.
- La liga privada "Prueba" solo tiene al usuario (`managersNumber: 1`). El
  emparejador de `valor` por `buyoutClause` ya está preparado para varios
  equipos (recorre todos los de `standing`), pero no se ha probado todavía
  con la cláusula de un compañero, solo con la propia.

Plan completo de esta conversación:
`C:\Users\vicen\.claude\plans\shiny-frolicking-neumann.md`.

## Lo que queda pendiente (no implementado todavía)

- Ver "Pendiente dentro de Paso 7" arriba (Vercel, gráficas ya hechas en
  realidad — ver `Web/src/components/GraficaValor.tsx` y
  `HistorialPuntos.tsx`, este documento no se había actualizado con eso;
  rol de Postgres de solo lectura para la web).
- Ver "Pendiente de verdad" al final del Paso 8 (puntos/minutos por
  jornada, cláusula de un compañero de liga).
- Añadir los secretos nuevos de GitHub Actions (`LALIGA_FANTASY_EMAIL`,
  `LALIGA_FANTASY_PASSWORD`, `LALIGA_FANTASY_LEAGUE_ID`) — el usuario tiene
  que hacerlo a mano en *Settings → Secrets and variables → Actions*, igual
  que hizo con `DATABASE_URL` en el Paso 6.
