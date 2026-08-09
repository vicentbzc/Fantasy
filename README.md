# Fantasy

Sistema personal de análisis de jugadores de **LaLiga Fantasy Oficial**. Recopila datos públicos de [futbolfantasy.com](https://www.futbolfantasy.com) mediante scraping y los sincroniza con una base de datos PostgreSQL (Supabase) para poder consultarlos y analizarlos.

Proyecto personal, sin ánimo de lucro y sin afiliación ni marca de LaLiga. El código es público; los datos generados (CSV y base de datos) no se distribuyen.

## Qué recopila

| Script | Genera | Contenido |
|---|---|---|
| `Ingestar datos 1.py` | `Datos 1.csv`, `Datos 6.csv` | Valores de mercado y su evolución diaria |
| `Ingestar datos 2.py` | `Datos 2.csv`, `Datos 4.csv` | Estado físico, minutos jugados, puntuación y desglose de estadísticas por jornada |
| `Ingestar datos 3.py` | `Datos 3.csv` | Calendario y dificultad de los próximos partidos de cada equipo |
| `Descargar imágenes.py` | `Datos/Imágenes/` | Fotos de jugadores y escudos de equipo (solo descarga lo que falte) |
| `Sincronizar base de datos.py` | Base de datos PostgreSQL | Sube los CSV anteriores a Supabase (6 tablas relacionales) |

## Decisiones técnicas

Algunas de las cosas en las que se puso más cuidado, no solo "que funcione":

- **Peticiones respetuosas con el servidor de origen**: espaciadas, sin ráfagas, con backoff automático ante errores temporales — y corte inmediato de la ejecución (sin reintentar) si el servidor responde 403/429, en vez de insistir.
- **Robustez ante fallos parciales**: un jugador o equipo con un dato inesperado no tira la ejecución completa; se salta y el resto se guarda igual. Escritura de CSV atómica (a un archivo temporal + renombrado) para no dejar nunca un archivo a medio escribir.
- **Optimización medida, no adivinada**: antes de cualquier cambio de rendimiento se verificó en directo contra la web real qué endpoints existen y cuánto pesan, en vez de asumir. Varias optimizaciones propuestas se descartaron explícitamente por no compensar el riesgo (paralelizar peticiones) o no aportar ahorro real tras comprobarlo (buscar una fuente de datos más ligera).
- **Revisión de seguridad del código**: gestión de credenciales fuera del repositorio, validación de los identificadores extraídos de la web antes de usarlos para construir URLs propias, verificación de certificado TLS activa en todas las peticiones, selectores HTML acotados para no depender de "contiene esta cadena en cualquier parte de la página".
- **Diseño de base de datos pensado para consulta, no solo para volcar CSV**: claves primarias reales, `UPSERT` donde los datos históricos pueden corregirse (pasó de verdad: un fallo de scraping hacía que faltara una categoría de puntos en el desglose, y se corrigió sin duplicar datos), y reemplazo completo (no acumulación) de las tablas que representan un estado "actual" como el calendario de próximos partidos.

## Arquitectura

```
Fantasy/
├── Datos/            (CSV generados — no se publica)
├── Documentación/     (notas de diseño y decisiones)
└── Scripts/
    ├── Común.py                    (sesión HTTP, mapeos, utilidades compartidas)
    ├── Ingestar datos 1.py         (mercado)
    ├── Ingestar datos 2.py         (ficha de jugador y puntuación)
    ├── Ingestar datos 3.py         (calendario)
    ├── Descargar imágenes.py       (fotos de jugadores y escudos)
    ├── Sincronizar base de datos.py
    ├── Esquema base de datos.sql
    └── Configuración local.py      (credenciales — no versionado)
```

## Instalación

```bash
pip install -r requirements.txt
```

Cada script se ejecuta de forma independiente (`python "Ingestar datos 1.py"`, etc.), en cualquier orden, desde cualquier carpeta. `Sincronizar base de datos.py` necesita la variable `DATABASE_URL` apuntando a tu propio proyecto de Supabase (crea las tablas antes con `Esquema base de datos.sql` en el *SQL Editor* de Supabase) — en local, en `Scripts/Configuración local.py`; en GitHub Actions, como secreto del repositorio.

## Automatización

`.github/workflows/scraping.yml` ejecuta los scripts en GitHub Actions respetando la tabla de frecuencias de arriba: `Ingestar datos 1.py` cada hora, `Ingestar datos 2.py` y `3.py` cada 5 horas, sincronizando con Supabase después de cada ejecución. También se puede lanzar a mano desde la pestaña *Actions* del repositorio.

## Licencia

MIT — ver [`LICENSE`](LICENSE). La licencia cubre el código; no otorga ningún derecho sobre los datos de futbolfantasy.com.
