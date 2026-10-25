import React, { useState } from 'react';
import { 
  BookOpen, 
  Sparkles, 
  CheckCircle2, 
  Eye, 
  Columns, 
  FileText, 
  ArrowRight,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  HelpCircle
} from 'lucide-react';
import { useSape } from '../context/SapeContext';
import { MathRenderer } from './MathRenderer';

export const BookProcessShowcase: React.FC = () => {
  const { metadata, chunks, addMultipleChunks, clearAllChunks, setMetadata, setActiveTab } = useSape();
  const [viewMode, setViewMode] = useState<'spread' | 'single' | 'diff'>('spread');
  const [activeDemo, setActiveDemo] = useState<'novel' | 'academic'>('novel');
  const [zoomPage, setZoomPage] = useState(false);

  // Cargar Demostración de Novela / Ficción con Diálogos y Poemas
  const loadNovelDemo = () => {
    setActiveDemo('novel');
    setMetadata({
      title: 'La Sombra del Farolero',
      author: 'E. S. de Santillana',
      subject: 'Novela Literaria & Relato Histórico',
      educationLevel: 'Narrativa Clásica',
      language: 'Español',
      publisherOrSource: 'Edición Tipográfica Tradicional',
      editorialNotes: 'Conservación estricta de rayas de diálogo (—), descansos ornamentales, fragmentos poéticos y sangría de primera línea (1.25 cm).'
    });

    clearAllChunks();
    addMultipleChunks([
      {
        title: 'Capítulo I: El Reloj de la Abadía',
        sourceType: 'txt',
        pageNumber: 1,
        content: `CAPÍTULO I: EL RELOJ DE LA ABADÍA

«La memoria es una lámpara que parpadea en la niebla del invierno.»
— Crónica de San Lorenzo, 1842

Aquella noche el viento arrastraba las hojas secas por el atrio de piedra. Ernesto ajustó su abrigo de paño grueso y contempló las campanas mudas de la torre. Nadie en el pueblo recordaba cuándo había sonado por última vez la campana mayor.

—¿No piensas aguardar a que amanezca? —preguntó la voz temblorosa del anciano desde el umbral.
—Si espero al alba, el carromato de postas habrá cruzado el desfiladero —respondió Ernesto, comprobando el seguro de la linterna de latón—. No hay tiempo para vacilaciones.
—Entonces lleva contigo este talismán —insistió el viejo, tendiéndole un estuche de terciopelo desgastado—. Te protegerá de los lobos y de los hombres sin palabra.

* * *

En el cuaderno de viaje de su abuelo, encontrado entre los manuscritos del ático, rezaban estos versos desvaídos:

Navega el sueño en barcas de cristal,
calla la brisa en la alta serranía;
quien busca lumbre en noche de vendaval,
halla en su pecho la única alegría.

La carta hallada en el bolsillo interior confirmaba la cita secreta a orillas del río Ebro.`
      },
      {
        title: 'Capítulo II: Las Horas Contadas',
        sourceType: 'txt',
        pageNumber: 2,
        content: `CAPÍTULO II: LAS HORAS CONTADAS

TABLA DE REGISTRO DE DILIGENCIAS Y HORARIOS:
| Posta | Salida | Llegada Estimada | Estado del Camino |
| Estación Central | 05:30 h | 08:45 h | Despejado / Pavimento seco |
| Venta del Molino | 09:15 h | 12:00 h | Neblina densa en vado |
| Puerto de la Horca | 13:00 h | 17:30 h | Nieve compacta / Requiere cadenas |

—La nieve impedirá el paso antes del crepúsculo —advirtió el cochero, fustigando suavemente a los percherones.
—Mantenga el paso firme; pagaremos el doble en la fonda de la ermita —replicó Ernesto sin apartar la mirada del horizonte blanco.`
      }
    ]);
  };

  // Cargar Demostración Científica / Académica con Tablas y Fórmulas
  const loadAcademicDemo = () => {
    setActiveDemo('academic');
    setMetadata({
      title: 'Mecánica Clásica y Termodinámica Aplicada',
      author: 'Dr. Fernando M. Varela & Colaboradores',
      subject: 'Física y Matemáticas Universitarias',
      educationLevel: 'Grado en Ingeniería',
      language: 'Español',
      publisherOrSource: 'Textos de Referencia Científica',
      editorialNotes: 'Preservación de fórmulas en Cambria Math ($...$), matrices de cálculo, tablas con bordes precisos y bancos de preguntas.'
    });

    clearAllChunks();
    addMultipleChunks([
      {
        title: 'Tema 1: Conservación del Momento y Energía',
        sourceType: 'txt',
        pageNumber: 1,
        content: `1.1 TEOREMA DE LAS FUERZAS VIVAS Y ENERGÍA CINÉTICA

En un sistema inercial de partículas, el trabajo neto realizado por las fuerzas exteriores es igual a la variación de la energía cinética del cuerpo:
$$W_{neto} = \\Delta E_k = \\frac{1}{2} m v_f^2 - \\frac{1}{2} m v_0^2$$

Si consideramos una partícula sometida a una fuerza elástica tipo Hooke $F(x) = -kx$, el potencial elástico acumulado responde a la integral:
$$E_p(x) = \\int_0^x k s \\, ds = \\frac{1}{2} k x^2$$

TABLA DE COEFICIENTES DE FRICCIÓN ESTÁTICO Y CINÉTICO:
| Material en Contacto | $\\mu_s$ (Estático) | $\\mu_k$ (Cinético) | Aplicación Típica |
| Acero sobre Acero | 0.74 | 0.57 | Rodamientos y engranajes |
| Caucho sobre Pavimento Seco | 1.00 | 0.80 | Frenado de vehículos de carga |
| Teflón sobre Teflón | 0.04 | 0.04 | Juntas y sellos de baja fricción |`
      }
    ]);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
      {/* Barra de Control del Demostrador */}
      <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>Demostración Visual en Vivo: Maqueta Editorial</span>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                Word / Docs Real
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Observa cómo se visualizan las páginas impresas con niveles H1-H4, tablas con formato no genérico y ortotipografía literaria.
            </p>
          </div>
        </div>

        {/* Acciones y Selectores */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          {/* Cargar Demos Rápidas */}
          <span className="text-slate-400 font-medium hidden sm:inline">Ejemplos:</span>
          <button
            id="btn-load-novel-demo"
            onClick={loadNovelDemo}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeDemo === 'novel' 
                ? 'bg-amber-100 dark:bg-amber-950 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800' 
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            📖 Novela & Ficción
          </button>
          <button
            id="btn-load-academic-demo"
            onClick={loadAcademicDemo}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              activeDemo === 'academic' 
                ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-900 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-800' 
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            📐 Manual Técnico
          </button>

          <div className="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-1 hidden sm:block" />

          {/* Selector de Modo de Maqueta */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('spread')}
              className={`px-2 py-1 rounded text-xs font-medium transition ${
                viewMode === 'spread' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
              title="Ver libro en pliego (doble página enfrentada)"
            >
              Doble Página
            </button>
            <button
              onClick={() => setViewMode('single')}
              className={`px-2 py-1 rounded text-xs font-medium transition ${
                viewMode === 'single' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
              title="Ver una página en gran detalle"
            >
              Página Única
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`px-2 py-1 rounded text-xs font-medium transition ${
                viewMode === 'diff' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
              }`}
              title="Comparar texto crudo vs maqueta terminada"
            >
              Antes / Después
            </button>
          </div>
        </div>
      </div>

      {/* Visor de Pliego de Libro (Book Mockup) */}
      <div className="p-4 sm:p-8 bg-stone-100/80 dark:bg-slate-950 flex items-center justify-center min-h-[460px]">
        {viewMode === 'spread' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 max-w-4xl w-full">
            {/* Página Izquierda (Par) */}
            <div className="bg-[#fefdfb] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 sm:p-8 shadow-sm flex flex-col justify-between min-h-[440px] font-sans text-stone-900 dark:text-stone-100 relative">
              {/* Encabezado de Libro Superior */}
              <div className="border-b border-stone-200 dark:border-stone-800 pb-2 mb-4 flex justify-between text-[11px] uppercase tracking-widest text-stone-500 font-sans">
                <span>{metadata.title || 'Título de la Obra'}</span>
                <span>Pág. 14</span>
              </div>

              {/* Contenido de Página Izquierda */}
              <div className="space-y-3.5 text-xs sm:text-sm leading-relaxed text-justify flex-1">
                {activeDemo === 'novel' ? (
                  <>
                    <h2 className="text-base sm:text-lg font-bold font-sans text-stone-900 dark:text-white uppercase tracking-wider text-center pt-2 mb-3">
                      Capítulo I: El Reloj de la Abadía
                    </h2>
                    
                    <div className="text-right text-xs italic text-stone-600 dark:text-stone-400 mb-4 pr-2">
                      «La memoria es una lámpara que parpadea en la niebla del invierno.»
                      <span className="block text-[10px] font-sans text-stone-500">— Crónica de San Lorenzo, 1842</span>
                    </div>

                    <p style={{ textIndent: '1.25rem' }}>
                      Aquella noche el viento arrastraba las hojas secas por el atrio de piedra. Ernesto ajustó su abrigo de paño grueso y contempló las campanas mudas de la torre. Nadie en el pueblo recordaba cuándo había sonado por última vez la campana mayor.
                    </p>

                    <p className="pl-1">
                      <span className="font-semibold text-stone-700 dark:text-stone-300 select-none">— </span>
                      ¿No piensas aguardar a que amanezca? —preguntó la voz temblorosa del anciano desde el umbral de madera carcomida.
                    </p>

                    <p className="pl-1">
                      <span className="font-semibold text-stone-700 dark:text-stone-300 select-none">— </span>
                      Si espero al alba, el carromato de postas habrá cruzado el desfiladero —respondió Ernesto, comprobando el seguro de la linterna de latón.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="text-base sm:text-lg font-bold font-sans text-stone-900 dark:text-white tracking-wide border-b border-stone-300 pb-1">
                      1.1 Teorema de las Fuerzas Vivas
                    </h2>
                    <p style={{ textIndent: '1.25rem' }}>
                      En un sistema inercial de partículas materiales, el trabajo mecánico neto realizado por las fuerzas exteriores es exactamente igual a la variación de la energía cinética del cuerpo en movimiento:
                    </p>
                    <div className="my-3 py-2 px-3 bg-stone-50 dark:bg-stone-800/60 rounded border border-stone-200 dark:border-stone-700 text-center font-mono text-xs">
                      <MathRenderer content="$$W_{neto} = \Delta E_k = \frac{1}{2} m v_f^2 - \frac{1}{2} m v_0^2$$" />
                    </div>
                    <p>
                      Para una fuerza elástica tipo Hooke $F(x) = -kx$, el potencial elástico acumulado responde a la integración directa de la trayectoria.
                    </p>
                  </>
                )}
              </div>

              {/* Pie de Página */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 text-center text-[10px] text-stone-400 font-sans">
                — 14 —
              </div>
            </div>

            {/* Página Derecha (Impar) */}
            <div className="bg-[#fefdfb] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-6 sm:p-8 shadow-sm flex flex-col justify-between min-h-[440px] font-sans text-stone-900 dark:text-stone-100 relative">
              {/* Encabezado de Libro Superior */}
              <div className="border-b border-stone-200 dark:border-stone-800 pb-2 mb-4 flex justify-between text-[11px] uppercase tracking-widest text-stone-500 font-sans">
                <span>{metadata.author || 'Autor'}</span>
                <span>Pág. 15</span>
              </div>

              {/* Contenido de Página Derecha */}
              <div className="space-y-3.5 text-xs sm:text-sm leading-relaxed text-justify flex-1">
                {activeDemo === 'novel' ? (
                  <>
                    <div className="text-center text-stone-500 tracking-[0.5em] text-sm my-3 select-none">
                      ⁂ ⁂ ⁂
                    </div>

                    <div className="my-3 pl-8 pr-4 text-xs italic text-stone-800 dark:text-stone-200 border-l-2 border-purple-300 dark:border-purple-700 space-y-1">
                      <div>Navega el sueño en barcas de cristal,</div>
                      <div>calla la brisa en la alta serranía;</div>
                      <div>quien busca lumbre en noche de vendaval,</div>
                      <div>halla en su pecho la única alegría.</div>
                    </div>

                    <p style={{ textIndent: '1.25rem' }}>
                      La carta hallada en el bolsillo interior confirmaba la cita secreta a orillas del río Ebro. Ernesto dobló el pliego con lentitud y emprendió la marcha a través del pinar cubierto de escarcha.
                    </p>

                    {/* Tabla de Postas no genérica */}
                    <div className="my-3 overflow-x-auto">
                      <table className="w-full text-[11px] border border-stone-300 dark:border-stone-700 font-sans">
                        <thead className="bg-stone-200/80 dark:bg-stone-800 text-stone-900 dark:text-stone-200 font-bold">
                          <tr>
                            <th className="p-1.5 text-left border-b border-stone-300">Posta</th>
                            <th className="p-1.5 text-center border-b border-stone-300">Salida</th>
                            <th className="p-1.5 text-left border-b border-stone-300">Estado del Camino</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                          <tr className="hover:bg-stone-50 dark:hover:bg-stone-800/40">
                            <td className="p-1.5 font-medium">Estación Central</td>
                            <td className="p-1.5 text-center font-mono">05:30 h</td>
                            <td className="p-1.5 text-stone-600 dark:text-stone-300">Despejado</td>
                          </tr>
                          <tr className="bg-stone-50/50 dark:bg-stone-800/20">
                            <td className="p-1.5 font-medium">Venta del Molino</td>
                            <td className="p-1.5 text-center font-mono">09:15 h</td>
                            <td className="p-1.5 text-stone-600 dark:text-stone-300">Neblina densa</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-sm font-bold font-sans text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      Tabla 1.1 — Coeficientes de Fricción
                    </h3>
                    
                    <div className="overflow-x-auto my-2">
                      <table className="w-full text-xs border border-slate-300 dark:border-slate-700 font-sans">
                        <thead className="bg-indigo-900 text-white font-semibold">
                          <tr>
                            <th className="p-2 text-left">Material en Contacto</th>
                            <th className="p-2 text-center">μs</th>
                            <th className="p-2 text-center">μk</th>
                            <th className="p-2 text-left">Aplicación Típica</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2 font-medium">Acero sobre Acero</td>
                            <td className="p-2 text-center font-mono">0.74</td>
                            <td className="p-2 text-center font-mono">0.57</td>
                            <td className="p-2 text-slate-600 dark:text-slate-300">Rodamientos</td>
                          </tr>
                          <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                            <td className="p-2 font-medium">Caucho sobre Pavimento</td>
                            <td className="p-2 text-center font-mono">1.00</td>
                            <td className="p-2 text-center font-mono">0.80</td>
                            <td className="p-2 text-slate-600 dark:text-slate-300">Frenado vial</td>
                          </tr>
                          <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2 font-medium">Teflón sobre Teflón</td>
                            <td className="p-2 text-center font-mono">0.04</td>
                            <td className="p-2 text-center font-mono">0.04</td>
                            <td className="p-2 text-slate-600 dark:text-slate-300">Baja fricción</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border-l-4 border-amber-500 rounded text-xs text-amber-900 dark:text-amber-200 font-sans">
                      <span className="font-bold block">Nota Clave para Examen:</span>
                      El coeficiente cinético $\mu_k$ es invariablemente inferior al estático $\mu_s$ debido a la ruptura de las micro-soldaduras superficiales en reposo.
                    </div>
                  </>
                )}
              </div>

              {/* Pie de Página */}
              <div className="pt-3 border-t border-stone-200 dark:border-stone-800 text-center text-[10px] text-stone-400 font-sans">
                — 15 —
              </div>
            </div>
          </div>
        )}

        {viewMode === 'diff' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl w-full">
            {/* Antes: Texto Crudo / Escaneado */}
            <div className="bg-slate-900 text-slate-300 p-5 rounded-xl border border-slate-800 space-y-2 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[11px] text-rose-400">Antes: OCR / PDF Crudo</span>
                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded">Sin estructura</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                CAPITULO I EL RELOJ DE LA ABADIA -- Pagina 14 -- La memoria es una lampara que parpadea... Aquella noche el viento arrastraba las hojas secas. - No piensas aguardar? pregunto el anciano. - Si espero al alba el carromato habra cruzado respondio Ernesto.
              </p>
              <div className="p-2 bg-slate-950/80 rounded border border-slate-800 text-slate-500 text-[11px]">
                ⚠️ Problemas comunes: Guiones cortos en vez de rayas de diálogo, notas al pie pegadas al cuerpo, títulos en mayúscula desjerarquizados y fórmulas rotas.
              </div>
            </div>

            {/* Después: Maquetación Editorial Word & Docs */}
            <div className="bg-white dark:bg-stone-900 p-5 rounded-xl border border-emerald-300 dark:border-emerald-800 space-y-3 font-sans text-xs sm:text-sm text-slate-900 dark:text-slate-100 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 font-sans">
                <span className="font-bold uppercase tracking-wider text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Después: Maquetación Editorial Word
                </span>
                <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded font-bold">
                  Estricto ECMA-376
                </span>
              </div>
              <h4 className="font-bold text-base text-center font-sans text-slate-900 dark:text-white uppercase tracking-wider">
                Capítulo I: El Reloj de la Abadía
              </h4>
              <p style={{ textIndent: '1.25rem' }} className="leading-relaxed">
                Aquella noche el viento arrastraba las hojas secas por el atrio de piedra.
              </p>
              <p className="pl-1 leading-relaxed">
                <span className="font-semibold select-none">— </span>
                ¿No piensas aguardar a que amanezca? —preguntó la voz temblorosa del anciano desde el umbral.
              </p>
            </div>
          </div>
        )}

        {viewMode === 'single' && (
          <div className="max-w-xl w-full bg-[#fefdfb] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-xl p-8 shadow-md font-sans text-stone-900 dark:text-stone-100 space-y-4 text-sm leading-relaxed">
            <div className="border-b border-stone-200 dark:border-stone-800 pb-2 flex justify-between text-xs uppercase tracking-widest text-stone-500 font-sans">
              <span>{metadata.title || 'Manuscrito Editorial'}</span>
              <span>Pág. 1</span>
            </div>
            
            <h1 className="text-xl font-bold font-sans text-center uppercase tracking-wider pt-2">
              {metadata.title || 'Capítulo I'}
            </h1>
            
            <p style={{ textIndent: '1.25rem' }}>
              Los procesos de conversión editorial requieren una cuidadosa calibración de márgenes, anchos de columna y estilos tipográficos para garantizar que la experiencia de lectura en papel y en pantalla sea fluida y digna de imprenta.
            </p>

            <div className="my-4 text-center text-stone-400 tracking-[0.5em] text-sm select-none">
              ⁂ ⁂ ⁂
            </div>

            <div className="pt-4 border-t border-stone-200 dark:border-stone-800 text-center text-xs text-stone-400 font-sans">
              — 1 —
            </div>
          </div>
        )}
      </div>

      {/* Pie de Demostrador con Acceso a Producción */}
      <div className="px-5 py-3 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          <span>Formatos procesados: Word DOCX, Google Docs, OpenXML y Markdown</span>
        </span>
        <button
          onClick={() => setActiveTab('estilos')}
          className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
        >
          <span>Ajustar Estilos y Tipografía</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
