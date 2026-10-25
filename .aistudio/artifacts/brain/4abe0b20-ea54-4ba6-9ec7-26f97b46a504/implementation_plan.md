# Rearmado Integral y Rediseño Minimalista del Sistema Editorial

Plan integral de reestructuración visual, arquitectónica y operativa del sistema editorial: unificación centrada estrictamente en los **3 procesos base** del flujo editorial más un **panel de Auditoría Técnica y Código en Vivo (Paso 0)**, eliminación total de fuentes serif para adoptar una tipografía sans-serif moderna y espaciada, rediseño del detector automático de índice/TOC en el pipeline de Fase 2 con métricas explicadas en lenguaje natural, y optimización radical del consumo de IA mediante macro-bloques y motor local determinista de 0 tokens.

---

### Decisiones Críticas y Preferencias Confirmadas

> [!IMPORTANT]
> A continuación se resumen las elecciones confirmadas en la fase de consulta y los compromisos de diseño para la ejecución:

- **Estética & Tipografía**: Adopción de tipografía Sans-serif moderna, limpia y geométrica (`Plus Jakarta Sans` / `Outfit` / `DM Sans`), eliminando por completo las fuentes serif (`font-serif`, `Cinzel`, `Playfair Display`) y el abarrotamiento visual. Espaciado generoso, líneas sutiles y ausencia de cajas píldora decorativas.
- **Estructura de Navegación**: Reducción de 5 pestañas dispersas a **3 procesos esenciales + 1 panel de Auditoría y Código en vivo**:
  1. **Paso 1: Ingesta y Limpieza** (Carga paralela, disolución de cabeceras/pies, unión de guiones y párrafos continuos sin artefactos).
  2. **Paso 2: Estructura e Índice** (Detección automática garantizada del Índice/TOC, demarcación de capítulos I-XX, diálogos con raya y métricas claras).
  3. **Paso 3: Edición Espejo & Exportación** (Cotejo bilingüe sincronizado por contenido 1:1, pliegos enfrentados y exportación a Word DOCX/Docs).
  4. **Paso 0: Auditoría Técnica y Código en Vivo** (Visualización explicativa de algoritmos, supervisión interna entre fases, invariantes anti-colapso e inspección del pipeline en tiempo real).
- **Estrategia de Tokens e IA**: Despacho por macro-bloques con motor local determinista (0 tokens) como base sólida. Se eliminan los despachos microscópicos párrafo por párrafo que agotan cuotas y dejan huérfano el final de la obra; cuando se use Gemini, se enviarán macro-lotes estructurados con esquemas JSON consistentes.

---

### 1. Visión General y Flujo de Usuario

El sistema transformará documentos crudos (PDF, DOCX, TXT) en libros electrónicos y ediciones paralelas bilingües de alta precisión tipográfica y filológica.

```
┌────────────────────────────────────────────────────────────────────────┐
│               BARRA DE NAVEGACIÓN SUPERIOR MINIMALISTA                 │
│  [Logo / Título] · [0. Auditoría] [1. Ingesta] [2. Estructura] [3. Espejo]  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
┌─────────────┐             ┌─────────────┐             ┌─────────────┐
│   PASO 1    │             │   PASO 2    │             │   PASO 3    │
│  Ingesta y  │ ──────────► │ Estructura  │ ──────────► │   Edición   │
│  Limpieza   │             │  e Índice   │             │   Espejo    │
└─────────────┘             └─────────────┘             └─────────────┘
      ▲                            ▲                            ▲
      │                            │                            │
      └────────────────────────────┴────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │      PASO 0 (AUDITORÍA)     │
                    │ Invariantes, Código en Vivo │
                    │ y Verificación de Flujo     │
                    └─────────────────────────────┘
```

#### Flujo Unificado Paso a Paso:
1. **Paso 1 (Ingesta y Limpieza)**:
   - Carga simple o dual (Libro A / Libro B).
   - Extracción de texto y depuración automática: disolución de cortes de página (`[PÁGINA X]`), unión de palabras con guión partido (`re- \n doblado` $\rightarrow$ `redoblado`), y purificación de párrafos continuos sin pérdida de letras.
2. **Paso 2 (Estructura e Índice)**:
   - Algoritmo de detección automática de Índice/TOC en el pipeline que censa números romanos (`CAPÍTULO I`), arábigos (`Capítulo 1`, `Chapter 1`), divisiones temáticas y títulos.
   - Demarcación editorial precisa: títulos principales, notas preliminares, cuerpo narrativo y diálogos con raya española (`—`).
   - Métricas transparentes en lenguaje cotidiano (p. ej. *Consistencia de Capítulos: 100%*, *Párrafos con Diálogo: 42*, *Palabras Conservadas: 100%*) en lugar de siglas enigmáticas.
3. **Paso 3 (Edición Espejo & Exportación)**:
   - Alineación bilingüe sincronizada por acontecimiento narrativo y oraciones homólogas (evitando saltos asimétricos entre páginas).
   - Visualizador de pliegos enfrentados (*Facing Pages*) y cotejo filológico 1:1.
   - Centro de descarga unificado: Word DOCX con formato profesional, copiado a Google Docs y ePub.
4. **Paso 0 (Auditoría Técnica y Código en Vivo)**:
   - Panel accesible en todo momento que expone el funcionamiento exacto del motor (`cleanAndPurifyEbookTexts`, `runPureMirrorHarmonizer`, `detectBookTableOfContents`, `alignBilingualTexts`).
   - Monitor de supervisión interna que audita las 4 invariantes que impiden fallos o colapsos entre procesos.

---

### 2. Experiencia de Usuario y Diseño Visual

#### A. Dirección Estética y Tipografía
- **Fuentes Prohibidas**: Se retiran todas las clases `font-serif` y tipografías con serifa.
- **Fuentes Seleccionadas**: Tipografía Sans-serif contemporánea (`font-sans`, con variables de sistema limpias y escalables como `Plus Jakarta Sans` y `DM Sans`), combinada con fuentes monoespaciadas (`font-mono tabular-nums`, `JetBrains Mono` / `IBM Plex Mono`) para métricas numéricas y fragmentos de código.
- **Jerarquía y Contención**:
  - Títulos principales en display sans geométrico (`text-2xl`, `font-bold`, `tracking-tight`).
  - Textos de lectura en cuerpo legible (`text-sm` o `text-base`, interlineado `leading-relaxed`).
  - Metadatos presentados como texto limpio con separadores tipográficos (`·`, `/`), eliminando el efecto de "caja de píldoras" o botones falsos.

#### B. Paleta de Color y Espaciado (Regla 60-30-10)
- **60% Lienzo Neutro**: Fondo gris oscuro mate profundo (`#0b0d10`), sin gradientes chillones ni reflejos fluorescentes.
- **30% Superficies Estructurales**: Paneles y tarjetas en tonos grafito neutros (`#12161b` / `#161b22`) con bordes finos de 1px (`border-stone-800/80`).
- **10% Acentos Funcionales**: Tonos ámbar cálido suave (`#d97706` / `#f59e0b`) y esmeralda calmado (`#10b981`) reservados estrictamente para estados activos, progreso y botones de acción principal.

#### C. Despeje de Clutter e Incompatibilidades
- Eliminación de barras inferiores de telemetría artificial ("PING", "LATENCY").
- Sustitución de cajas anidadas infinitas por divisores de 1px y márgenes generosos de 24px a 32px (`gap-6`, `p-6`).

---

### 3. Decisiones de Producto y Estrategia Técnica

#### Decisión 1: Unificación de Pestañas (3 Fases + 1 Auditoría)
- **Enfoque**: De 5 pestañas redundantes (`ingesta`, `curaduria`, `estilos`, `paralelo`, `generacion`, `pruebas`) a 3 pasos directos de producción + 1 pestaña de inspección y código.
- **Por qué**: Elimina la duplicidad entre "Curaduría", "Estilos" y "Purificación", guiando al usuario de forma lineal sin perder ninguna herramienta especializada.

#### Decisión 2: Detección Automática de Índice/TOC en el Pipeline
- **Enfoque**: Implementar un motor determinista en Fase 2 que escanee el texto en una pasada inicial buscando patrones de índice (`ÍNDICE`, `TABLA DE CONTENIDOS`, `TABLE OF CONTENTS`, seguidos de listados de capítulos y páginas o títulos), y que identifique automáticamente las cabeceras canónicas (`CAPÍTULO I`, `Capítulo 1`, `ACTO I`, `PARTE PRIMERA`, `CHAPTER 1`).
- **Por qué**: El usuario señaló que la fase 2 "nunca encuentra en auto en su pipeline el índice". Con esta mejora, el pipeline extraerá y enlazará el índice sin intervención manual.

#### Decisión 3: Macro-Bloques y Motor Local Determinista para Ahorro de Tokens
- **Enfoque**:
  1. El **Motor Semántico Local Determinista** (0 tokens) realiza el 90% del trabajo pesado de tokenización, cálculo de afinidad de oraciones, detección de fronteras de párrafo y simetría.
  2. Si el usuario activa IA o requiere resolución inteligente de pasajes asimétricos complejos, el despacho se realiza en **macro-bloques** de capítulos completos o lotes de 15 a 20 párrafos en una sola llamada estructurada con esquema JSON predefinido (usando `gemini-3.8-flash` o `gemini-3.1-flash-lite`), en lugar de 50 peticiones microscópicas de 1 párrafo.
- **Por qué**: Evita el agotamiento súbito de cuota (error 429/ResourceExhausted), previene que los últimos párrafos de un libro queden sin procesar o huérfanos, y mantiene la homogeneidad estilística de principio a fin.

#### Decisión 4: Supervisión Interna entre Procesos (Invariantes sin Colapso)
- **Invariante 1 (Conservación de Masa Textual)**: El total de palabras sustanciales antes y después de la limpieza debe coincidir al $\ge 99.5\%$. Si hay pérdida anómala, el sistema alerta y no descarta texto.
- **Invariante 2 (Isomorfismo de Capítulos)**: Si el Libro A tiene $N$ capítulos y el Libro B tiene $M$, el sistema homogeniza los anclajes de capítulo antes de emparejar los párrafos internos.
- **Invariante 3 (Alineación Oracional de Frontera)**: Cada par bilingüe valida la concordancia semántica de su oración inicial y terminal; si detecta desfase, el pipeline auto-armoniza sin duplicar bloques.
- **Invariante 4 (Seguridad Anti-Congelamiento & Desduplicación)**: Paquetes de procesamiento con pausas periódicas para el *event loop* (`setTimeout`) y clonado estricto de identificadores con `sanitizeAndDeduplicatePairs`.

---

### 4. Arquitectura del Sistema y Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 SAPE CONTEXT & STORAGE                                  │
│   • metadata · chunks · parallelPairs · parallelSpreads · auditReport · phase3Checkpoint│
│   • IndexedDB Persistence (appStorage) · Supervision Invariants Engine                 │
└───────────────────────────────────────────┬─────────────────────────────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
┌──────────────────────────────────────────────┐ ┌────────────────────────────────────────┐
│             NAVIGATION HEADER                │ │          PROCESSING OVERLAY            │
│   • 3 Core Process Tabs + Step 0 Audit Tab   │ │   • Real-time Macro-Batch Progress     │
│   • Clean Sans-Serif Layout & Quick Save     │ │   • Resilient Local / Flash Indicator  │
└───────────────────────┬──────────────────────┘ └────────────────────────────────────────┘
                        │
    ┌───────────────────┼───────────────────┬───────────────────┐
    ▼                   ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐   ┌───────────────────────────┐
│  PASO 1 VIEW  │   │  PASO 2 VIEW  │   │  PASO 3 VIEW  │   │        PASO 0 VIEW        │
│ IngestPanel   │   │ CuratedEbook  │   │ ParallelPanel │   │ LiveCodeAuditPanel        │
│ & Clean Engine│   │ & Auto TOC    │   │ & FacingPages │   │ (Explicación de Lógicas,  │
│               │   │ & Structure   │   │ & Export Hub  │   │ Supervisión e Invariantes)│
└───────────────┘   └───────────────┘   └───────────────┘   └───────────────────────────┘
```

#### Mapeo de Componentes y Vistas:
- **`NavigationHeader.tsx`**: Barra simplificada con 4 accesos claros:
  - `Paso 0: Auditoría Técnica y Lógica en Vivo`
  - `Paso 1: Ingesta y Limpieza`
  - `Paso 2: Estructura e Índice`
  - `Paso 3: Edición Espejo & Exportación`
- **`IngestPanel.tsx` (Paso 1)**: Carga dual/unitaria de archivos, visualizador de texto crudo vs texto purificado, y controles de disolución de cabeceras.
- **`CuratedEbookPanel.tsx` (Paso 2)**: Detector automático de índice y TOC, visualizador de capítulos estructurados, diálogo con raya, y panel de indicadores explicados en lenguaje común.
- **`ParallelPanel.tsx` (Paso 3)**: Motor de pliegos enfrentados, cotejo bilingüe 1:1, auditoría de concordancia oracional y centro de exportación integrado (DOCX / Google Docs).
- **`LiveCodeAuditPanel.tsx` (Paso 0 - Nuevo)**: Panel interactivo que expone:
  - Explicación didáctica y fragmentos de código de cada algoritmo clave.
  - Monitor en vivo de las 4 invariantes de supervisión interna.
  - Estado del pipeline y flujo de datos verificado paso a paso.
- **`gemini.ts` & `parallelMatcher.ts`**: Macro-batching estructurado para llamadas de IA y motor local determinista como estándar por defecto de alta velocidad.
- **Estilos Globales (`index.css` / Tailwind)**: Limpieza de fuentes serif, establecimiento de fuentes sans-serif modernas con buen espaciado y legibilidad.

---

### Verificación y Garantía de Calidad
1. **Verificación Estética**: Cero clases `font-serif`, espaciado fluido sin sobrecarga de cajas, etiquetas y números con fuentes legibles y monoespaciadas.
2. **Verificación Funcional de Pasos**: Transición fluida entre los 3 pasos esenciales y el panel de auditoría, con guardado persistente en IndexedDB.
3. **Verificación de Índice/TOC**: Detección probada de índices con capítulos en números romanos y arábigos sin intervención manual.
4. **Verificación de Tokens**: Pruebas de macro-lotes que demuestren que el motor local opera al 100% sin agotar cuota ni dejar fragmentos huérfanos.
5. **Compilación y Linteo**: Compilación exitosa con `compile_applet` y linteo limpio con `lint_applet` (`tsc --noEmit`).
