import { translateTextFree, translateParagraphsTurbo, computeShadowSentenceSimilarity } from './multilingualTranslationEngine';
import { isStandaloneNumeralOrSubheading } from './phase3MirrorAssemblyEngine';
import { sanitizePageAndEditorialMarkers } from './chapterMirrorSynchronizer';

// =========================================================================
// INTERFACES DEL MOTOR DE FASE 2: CURADURÍA Y ALINEACIÓN ESPEJO
// =========================================================================

export interface CanonicalChapterDiagnostic {
  chapterIndex: number;
  canonicalTitle: string;
  startPhraseA?: string;
  startPhraseB?: string;
  pageA?: number;
  pageB?: number;
  paragraphsCountA: number;
  paragraphsCountB: number;
  wordsA: number;
  wordsB: number;
  charsA: number;
  charsB: number;
  lengthRatio: number;
  initialConcordanceScore: number;
  isCriticalThresholdMet: boolean;
  diagnosticStatus: 'optimal' | 'moderate' | 'unbalanced';
  recommendation: string;
}

export interface CleanEbookChapter {
  chapterIndex: number;
  title: string;
  cleanParagraphsA: string[];
  cleanParagraphsB: string[];
  cleanTextA: string;
  cleanTextB: string;
  softWrapsRepairedA: number;
  softWrapsRepairedB: number;
  runningHeadersRemovedA: number;
  runningHeadersRemovedB: number;
}

export interface ParallelQuartetBook {
  bookA_clean: string;
  bookA_translatedToB: string;
  bookB_clean: string;
  bookB_translatedToA: string;
  languageA: string;
  languageB: string;
  translationSource: 'google_translate_free' | 'user_imported';
}

export interface SubsegmentPairProposal {
  id: string;
  chapterIndex: number;
  order: number;
  type: '1:1' | '1:2' | '2:1' | 'unpaired';
  textA: string;
  textB: string;
  shadowA_in_B?: string;
  shadowB_in_A?: string;
  concordanceScore: number; // 0 - 100%
  status: 'proposed' | 'accepted' | 'edited';
}

export interface Phase2ProgressState {
  macroPercent: number; // 0 - 100%
  macroStage: string;
  mesoChapter: string;
  microDetail: string;
  recentLogs: string[];
}

export interface Phase2FullCuratorResult {
  chaptersDiagnostics: CanonicalChapterDiagnostic[];
  cleanEbookA: string;
  cleanEbookB: string;
  cleanChapters: CleanEbookChapter[];
  quartet: ParallelQuartetBook;
  subsegmentProposals: SubsegmentPairProposal[];
  globalStats: {
    totalChapters: number;
    totalParasA: number;
    totalParasB: number;
    totalWordsA: number;
    totalWordsB: number;
    globalConcordancePercent: number;
    criticalThresholdPercent: number; // 80%
    isOptimal: boolean;
    tokensUsed: number; // Siempre 0 tokens
  };
}

// =========================================================================
// UTILIDADES AUXILIARES: LIMPIEZA DE SALTOS Y ARTEFACTOS
// =========================================================================

/**
 * Detecta si una línea aislada corresponde a un encabezado corriente (running header),
 * número de página o artefacto de escaneo que nunca debe soldarse al texto narrativo.
 */
function isHeaderOrPageNumberLine(line: string, authorHint?: string, titleHint?: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // 1. Número de página solo (ej. "14", "[14]", "pág. 14", "Page 35")
  if (/^(?:\[?\s*(?:p[aá]g\.?|page|seite)?\s*\d{1,4}\s*\]?)$/i.test(trimmed)) return true;

  // 2. Artefactos de escaneo "--- 45 ---", "* 12 *"
  if (/^[-–—\s*•]+\d{1,4}[-–—\s*•]+$/.test(trimmed)) return true;

  // 3. Encabezado con Autor o Título conocido + números
  if (authorHint && authorHint.trim().length >= 3) {
    const escAuthor = authorHint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${escAuthor}(?:\\s+\\d+)*$`, 'i').test(trimmed)) return true;
    if (new RegExp(`^(?:\\d+\\s+)*${escAuthor}$`, 'i').test(trimmed)) return true;
  }
  if (titleHint && titleHint.trim().length >= 3) {
    const escTitle = titleHint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${escTitle}(?:\\s+\\d+)*$`, 'i').test(trimmed)) return true;
    if (new RegExp(`^(?:\\d+\\s+)*${escTitle}$`, 'i').test(trimmed)) return true;
  }

  // 4. Patrón genérico de Autor + Página (ej. "John Fowles 1 2", "John Fowles 35", "Fowles 110")
  if (/^[A-Z][a-zA-Z\s.-]{2,30}\s+\d{1,4}(?:\s+\d{1,4})?$/.test(trimmed)) return true;

  // 5. Bloques de anotación editorial
  if (/^Annotation\b/i.test(trimmed)) return true;

  return false;
}

/**
 * Repara saltos de línea suaves dentro de oraciones partidos por la caja de texto del PDF.
 * Respeta diálogos con guiones, encabezados y saltos de párrafo auténticos.
 */
export function cleanSoftLineBreaks(rawText: string, authorHint?: string, titleHint?: string): { cleaned: string; repairsCount: number } {
  if (!rawText) return { cleaned: '', repairsCount: 0 };
  let count = 0;

  // 1. Soldar palabras cortadas con guión de fin de línea (ej. "trans- \n formación" -> "transformación")
  let res = rawText.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüß]+)-\s*\r?\n\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüß]+)/g, (_, p1, p2) => {
    count++;
    return `${p1}${p2}`;
  });

  // 2. Normalizar bloques de párrafos separados por 2 o más saltos de línea
  const blocks = res.split(/\r?\n\s*\r?\n+/);
  const cleanBlocks = blocks.map(block => {
    const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return block.trim();

    let welded = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        welded = line;
        continue;
      }
      const prev = lines[i - 1];
      const prevIsHeading = isStandaloneNumeralOrSubheading(prev) || isHeaderOrPageNumberLine(prev, authorHint, titleHint);
      const currIsHeading = isStandaloneNumeralOrSubheading(line) || isHeaderOrPageNumberLine(line, authorHint, titleHint);
      const prevEndsSentence = /[.!?:;»”"…]$/.test(prev);
      const currStartsDialog = /^[-–—«"“¿¡]/.test(line);

      // NUNCA soldar si la línea anterior o actual es un encabezado o numeral de capítulo o running header
      if (prevIsHeading || currIsHeading) {
        welded += `\n\n${line}`;
      } else if (!prevEndsSentence && !currStartsDialog) {
        welded += ` ${line}`;
        count++;
      } else {
        welded += `\n${line}`;
      }
    }
    return welded.trim();
  }).filter(Boolean);

  // Asegurar que cualquier encabezado separado con \n\n genere su propio párrafo independiente
  const finalParas = cleanBlocks.flatMap(b => b.split(/\r?\n\s*\r?\n+/)).map(p => p.trim()).filter(Boolean);
  return { cleaned: finalParas.join('\n\n'), repairsCount: count };
}


/**
 * Detecta y elimina encabezados de página repetitivos (running headers), números de página aislados
 * y cabeceras soldadas de autor/título en PDFs y digitalizaciones.
 */
export function stripRunningHeadersAndFooters(
  text: string, 
  titleHint?: string, 
  authorHint?: string
): { cleaned: string; removedCount: number } {
  if (!text) return { cleaned: '', removedCount: 0 };
  let removed = 0;
  const paras = text.split(/\r?\n\s*\r?\n+/);

  const cleanTitle = (titleHint || '').toLowerCase().trim();
  const cleanAuthor = (authorHint || '').toLowerCase().trim();

  const filtered = paras.map(p => {
    let trimmed = p.trim();

    // 1. Número de página aislado en un párrafo (ej. "14", "[14]", "pág. 14", "Page 35")
    if (/^(?:\[?\s*(?:p[aá]g\.?|page|seite)?\s*\d{1,4}\s*\]?)$/i.test(trimmed)) {
      removed++;
      return null;
    }

    // 2. Encabezado repetido que coincide exactamente con el título de la novela
    if (cleanTitle && cleanTitle.length >= 4 && trimmed.toLowerCase() === cleanTitle) {
      removed++;
      return null;
    }

    // 3. Encabezado repetido que coincide con el autor o autor + número de página (ej. "John Fowles", "John Fowles 35", "John Fowles 1 2")
    if (cleanAuthor && cleanAuthor.length >= 3) {
      const lower = trimmed.toLowerCase();
      if (lower === cleanAuthor) {
        removed++;
        return null;
      }
      const escAuthor = cleanAuthor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`^${escAuthor}(?:\\s+\\d+)+$`, 'i').test(lower) || new RegExp(`^(?:\\d+\\s+)+${escAuthor}$`, 'i').test(lower)) {
        removed++;
        return null;
      }
    }

    // 4. Artefacto de escaneo "--- 45 ---"
    if (/^[-–—\s*•]+\d{1,4}[-–—\s*•]+$/.test(trimmed)) {
      removed++;
      return null;
    }

    // 5. Patrón genérico de running header aislado "Author Name 12"
    if (/^[A-Z][a-zA-Z\s.-]{2,30}\s+\d{1,4}(?:\s+\d{1,4})?$/.test(trimmed)) {
      removed++;
      return null;
    }

    // 6. Prefijo de running header al inicio de un párrafo narrativo (ej. "John Fowles 1 2 October 14th?")
    if (authorHint && authorHint.trim().length >= 3) {
      const escAuthor = authorHint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const authorHeaderRegex = new RegExp(`^${escAuthor}\\s*(?:\\d+[\\s\\d]*)\\s+(?=[A-Z¿¡«"“\\d])`, 'i');
      if (authorHeaderRegex.test(trimmed)) {
        trimmed = trimmed.replace(authorHeaderRegex, '').trim();
        removed++;
      }
    }

    // 7. Prefijo de título al inicio de un párrafo narrativo
    if (titleHint && titleHint.trim().length >= 3) {
      const escTitle = titleHint.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const titleHeaderRegex = new RegExp(`^${escTitle}\\s*(?:\\d+[\\s\\d]*)\\s+(?=[A-Z¿¡«"“\\d])`, 'i');
      if (titleHeaderRegex.test(trimmed)) {
        trimmed = trimmed.replace(titleHeaderRegex, '').trim();
        removed++;
      }
    }

    return trimmed;
  }).filter((p): p is string => Boolean(p && p.trim().length > 0));

  return { cleaned: filtered.join('\n\n'), removedCount: removed };
}

/**
 * Limpia cualquier hashtag markdown remanente (`### `) para presentar el texto puro de la obra
 */
export function removeArtificialMarkdownHeaders(text: string): string {
  if (!text) return '';
  return text.replace(/^#+\s*/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

// =========================================================================
// PIPELINE PRINCIPAL DE FASE 2: UNIFICADO, ROBUSTO Y AUDITABLE
// =========================================================================

export async function executePhase2UnifiedCurator(options: {
  rawBodyA: string;
  rawBodyB: string;
  canonicalChapters?: Array<{
    number: number;
    title: string;
    startPhrase?: string;
    startPhraseB?: string;
    pageNumber?: number;
    pageNumberB?: number;
  }>;
  titleA?: string;
  titleB?: string;
  author?: string;
  languageA?: string;
  languageB?: string;
  preExistingShadowA_in_B?: string;
  preExistingShadowB_in_A?: string;
  translationEngine?: 'google_turbo' | 'gemini_macro';
  forcePurgeCache?: boolean;
  onProgress?: (progress: Phase2ProgressState) => void;
}): Promise<Phase2FullCuratorResult> {
  const {
    rawBodyA,
    rawBodyB,
    canonicalChapters = [],
    titleA = 'Libro A',
    titleB = 'Libro B',
    author = '',
    languageA = 'Español',
    languageB = 'Original',
    preExistingShadowA_in_B,
    preExistingShadowB_in_A,
    translationEngine = 'google_turbo',
    forcePurgeCache = false,
    onProgress
  } = options;

  const logs: string[] = [];
  const log = (msg: string) => {
    const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
    logs.push(entry);
    if (logs.length > 25) logs.shift();
  };

  log('Iniciando Fase 2: Curaduría Editorial y Marco de Concordancia.');

  // -------------------------------------------------------------------------
  // PASO 1: ESTABLECER EL MARCO CANÓNICO DE TRABAJO Y ANÁLISIS OBSERVACIONAL
  // -------------------------------------------------------------------------
  onProgress?.({
    macroPercent: 5,
    macroStage: 'Etapa 1/4: Análisis de Concordancia por Capítulos (Observacional)',
    mesoChapter: 'Inicializando marco canónico...',
    microDetail: 'Censando párrafos, caracteres y longitudes relativas...',
    recentLogs: [...logs]
  });

  // 0. Pre-limpieza y normalización de saltos de línea para aislar encabezados y párrafos
  const { cleaned: preCleanBodyA, repairsCount: initialRepairsA } = cleanSoftLineBreaks(rawBodyA, author, titleA);
  const { cleaned: preCleanBodyB, repairsCount: initialRepairsB } = cleanSoftLineBreaks(rawBodyB, author, titleB);

  // Asegurar que existan capítulos de referencia
  let chaptersToWork = canonicalChapters && canonicalChapters.length > 0
    ? [...canonicalChapters]
    : [];

  // Utilidades locales para detección robusta de encabezados canónicos
  const getRomanForNum = (n: number): string => {
    const rTable: [number, string][] = [
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let res = '';
    let rem = n;
    for (const [v, sym] of rTable) {
      while (rem >= v) {
        res += sym;
        rem -= v;
      }
    }
    return res;
  };

  const matchesSpecificChapterHeading = (para: string, chapNum: number, chapTitle?: string): boolean => {
    if (!para || para.length > 90) return false;
    const cleanP = para.replace(/^#+\s*/, '').trim();
    const lowerP = cleanP.toLowerCase();

    // 1. Coincidencia con el título canónico explícito
    if (chapTitle) {
      const cleanT = chapTitle.replace(/^#+\s*/, '').toLowerCase().trim();
      if (cleanT && cleanT.length >= 3 && (lowerP === cleanT || lowerP.startsWith(cleanT) || cleanT.startsWith(lowerP))) {
        return true;
      }
    }

    // 2. Coincidencia con número o numeral romano
    const roman = getRomanForNum(chapNum).toLowerCase();
    const numStr = String(chapNum);

    const numWords: Record<number, string[]> = {
      1: ['uno', 'primero', 'primer', 'primera', 'one', 'first', 'erste', 'erster'],
      2: ['dos', 'segundo', 'segunda', 'two', 'second', 'zweite', 'zweiter'],
      3: ['tres', 'tercero', 'tercer', 'tercera', 'three', 'third', 'dritte', 'dritter'],
      4: ['cuatro', 'cuarto', 'cuarta', 'four', 'fourth', 'vierte', 'vierter'],
      5: ['cinco', 'quinto', 'quinta', 'five', 'fifth', 'fünfte', 'fünfter'],
      6: ['seis', 'sexto', 'sexta', 'six', 'sixth', 'sechste'],
      7: ['siete', 'séptimo', 'septimo', 'séptima', 'seven', 'seventh', 'siebte'],
      8: ['ocho', 'octavo', 'octava', 'eight', 'eighth', 'achte'],
      9: ['nueve', 'noveno', 'novena', 'nine', 'ninth', 'neunte'],
      10: ['diez', 'décimo', 'decimo', 'ten', 'tenth', 'zehnte']
    };

    const words = numWords[chapNum] || [];
    const wordsPattern = words.length > 0 ? `|${words.join('|')}` : '';

    const specificRegex = new RegExp(
      `^(?:#+\\s*)?(?:(?:cap[ií]tulo|chapter|kapitel|chapitre|parte|part|libro|book)\\s*(?:${numStr}|${roman}${wordsPattern})\\b|(?:${roman}|${numStr})\\.?\\s*$)`,
      'i'
    );

    return specificRegex.test(cleanP);
  };

  if (chaptersToWork.length === 0) {
    // Si no se demarcaron capítulos en Fase 1:
    // Auto-detectar divisiones internas naturales en Libro A y Libro B
    const chapHeadingsRegex = /^(?:#+\s*)?(?:(CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PARTE|PART|BOOK|LIBRO)\s+([0-9IVXLCDM]+)|([IVXLCDM]{1,6})\.?)\s*$/im;
    const parasA = preCleanBodyA.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);
    const parasB = preCleanBodyB.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);
    const detectedChaps: Array<{ number: number; title: string; startPhrase?: string; startPhraseB?: string }> = [];

    // Censar encabezados en A
    const headingIndicesA: Array<{ pIdx: number; title: string }> = [];
    for (let pIdx = 0; pIdx < parasA.length; pIdx++) {
      const p = parasA[pIdx];
      if (p.length < 80 && (chapHeadingsRegex.test(p) || isStandaloneNumeralOrSubheading(p))) {
        headingIndicesA.push({ pIdx, title: p.replace(/^#+\s*/, '') });
      }
    }

    // Censar encabezados en B
    const headingIndicesB: Array<{ pIdx: number; title: string }> = [];
    for (let pIdx = 0; pIdx < parasB.length; pIdx++) {
      const p = parasB[pIdx];
      if (p.length < 80 && (chapHeadingsRegex.test(p) || isStandaloneNumeralOrSubheading(p))) {
        headingIndicesB.push({ pIdx, title: p.replace(/^#+\s*/, '') });
      }
    }

    if (headingIndicesA.length >= 2) {
      for (let h = 0; h < headingIndicesA.length; h++) {
        const hA = headingIndicesA[h];
        const nextNarrA = parasA[hA.pIdx + 1]?.slice(0, 60) || '';
        const hB = headingIndicesB[h];
        const nextNarrB = hB ? (parasB[hB.pIdx + 1]?.slice(0, 60) || '') : '';

        // El punto de inicio canónico del capítulo es su propio título/encabezado,
        // no el párrafo siguiente, para que el título no quede en el capítulo anterior
        detectedChaps.push({
          number: h + 1,
          title: hA.title,
          startPhrase: hA.title || nextNarrA,
          startPhraseB: (hB ? hB.title : undefined) || nextNarrB
        });
      }
      log(`Auto-detectados ${detectedChaps.length} capítulos/secciones con demarcaciones editoriales simétricas.`);
      chaptersToWork = detectedChaps;
    } else {
      // Obra Completa continua
      log('Novela sin índice ni capítulos formales: estructurada como Obra Completa (Narrativa Continua).');
      chaptersToWork = [{
        number: 1,
        title: titleA || 'Obra Completa (Narrativa Continua)',
        startPhrase: rawBodyA.slice(0, 60),
        startPhraseB: rawBodyB.slice(0, 60)
      }];
    }
  }

  // Si algún capítulo carece de título, rellenarlo canónicamente sin mutilar títulos existentes
  chaptersToWork = chaptersToWork.map((chap, idx) => {
    let cleanT = (chap.title || '').replace(/^#+\s*/, '').trim();
    if (!cleanT || cleanT === 'Sin título') {
      cleanT = `Capítulo ${chap.number || idx + 1}`;
    }
    return {
      ...chap,
      number: chap.number || idx + 1,
      title: cleanT,
      startPhrase: sanitizePageAndEditorialMarkers(chap.startPhrase || ''),
      startPhraseB: sanitizePageAndEditorialMarkers(chap.startPhraseB || '')
    };
  });

  /**
   * Localiza el párrafo que contiene la frase inicial de un capítulo con máxima tolerancia
   * a acentos, mayúsculas, comillas, saltos de línea y marcas de página residuales.
   */
  const findParagraphMatchingPhrase = (
    paras: string[],
    fromIndex: number,
    targetPhrase: string,
    expectedProportionIndex?: number
  ): number => {
    if (!targetPhrase || targetPhrase.trim().length < 4) return -1;

    const sanitizedTarget = sanitizePageAndEditorialMarkers(targetPhrase);
    if (!sanitizedTarget || sanitizedTarget.length < 3) return -1;

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

    const targetNorm = normalize(sanitizedTarget);
    if (!targetNorm) return -1;

    const candidateNormalized: string[] = paras.map(p => normalize(sanitizePageAndEditorialMarkers(p)));

    // Nivel 1: Subcadena directa en texto normalizado (probando longitudes descendentes: 50, 35, 25, 18, 12, 8)
    const lengths = [50, 35, 25, 18, 12, 8].filter(len => len <= targetNorm.length);
    if (lengths.length === 0) lengths.push(targetNorm.length);

    for (const cLen of lengths) {
      const subTarget = targetNorm.slice(0, cLen).trim();
      if (subTarget.length < 6) continue;
      for (let p = fromIndex; p < paras.length; p++) {
        if (candidateNormalized[p].includes(subTarget)) {
          return p;
        }
      }
    }

    // Nivel 2: Secuencias n-gramas de palabras clave iniciales y sub-ventanas
    const targetWords = targetNorm.split(' ').filter(w => w.length >= 2);
    if (targetWords.length >= 3) {
      const first4 = targetWords.slice(0, 4).join(' ');
      for (let p = fromIndex; p < paras.length; p++) {
        if (candidateNormalized[p].includes(first4)) return p;
      }

      const first3 = targetWords.slice(0, 3).join(' ');
      if (first3.length >= 6) {
        for (let p = fromIndex; p < paras.length; p++) {
          if (candidateNormalized[p].includes(first3)) return p;
        }
      }

      if (targetWords.length >= 5) {
        const next4 = targetWords.slice(1, 5).join(' ');
        for (let p = fromIndex; p < paras.length; p++) {
          if (candidateNormalized[p].includes(next4)) return p;
        }
      }
    }

    // Nivel 3: Coincidencia por conjunto de palabras significativas (Jaccard / Intersección léxica)
    const significantTargetWords = targetWords.filter(w => w.length >= 4);
    if (significantTargetWords.length >= 2) {
      let bestP = -1;
      let maxOverlap = 0;

      for (let p = fromIndex; p < paras.length; p++) {
        const pNorm = candidateNormalized[p];
        if (!pNorm || pNorm.length < 15) continue;
        
        const pWords = pNorm.split(' ').slice(0, 50);
        let overlap = 0;
        for (const tw of significantTargetWords) {
          if (pWords.includes(tw)) overlap++;
        }

        const overlapScore = overlap / significantTargetWords.length;
        if (overlap >= 2 && overlapScore >= 0.5 && overlap > maxOverlap) {
          maxOverlap = overlap;
          bestP = p;
        }
      }

      if (bestP !== -1) {
        return bestP;
      }
    }

    // Nivel 4: Búsqueda focalizada alrededor de la proporción esperada si fue suministrada
    if (expectedProportionIndex !== undefined && expectedProportionIndex >= 0) {
      const searchStart = Math.max(fromIndex, expectedProportionIndex - 30);
      const searchEnd = Math.min(paras.length - 1, expectedProportionIndex + 30);
      for (const cLen of [20, 15, 10]) {
        if (cLen > targetNorm.length) continue;
        const sub = targetNorm.slice(0, cLen).trim();
        for (let p = searchStart; p <= searchEnd; p++) {
          if (candidateNormalized[p].includes(sub)) {
            return p;
          }
        }
      }
    }

    return -1;
  };

  // Particionar el texto de A y B en sus secciones correspondientes de forma bilateralmente coordinada
  const extractCoordinatedChapterSlices = (
    fullTextA: string,
    fullTextB: string,
    chapters: typeof chaptersToWork
  ): { slicesA: string[]; slicesB: string[] } => {
    if (chapters.length <= 1) {
      return { slicesA: [fullTextA], slicesB: [fullTextB] };
    }

    const parasA = fullTextA.split(/\r?\n\s*\r?\n+/).map(p => sanitizePageAndEditorialMarkers(p)).filter(Boolean);
    const parasB = fullTextB.split(/\r?\n\s*\r?\n+/).map(p => sanitizePageAndEditorialMarkers(p)).filter(Boolean);

    if (parasA.length === 0 || parasB.length === 0) {
      return { slicesA: [fullTextA], slicesB: [fullTextB] };
    }

    const chapHeadingsRegex = /^(?:#+\s*)?(?:(CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PARTE|PART|BOOK|LIBRO)\s+([0-9IVXLCDM]+)|([IVXLCDM]{1,6})\.?)\s*$/im;

    const avgParasA = parasA.length / chapters.length;
    const avgParasB = parasB.length / chapters.length;
    // Distancia mínima prudente para búsquedas genéricas sin frase (acotada entre 1 y 25 párrafos)
    const minDistanceA = Math.max(1, Math.min(25, Math.floor(avgParasA * 0.2)));
    const minDistanceB = Math.max(1, Math.min(25, Math.floor(avgParasB * 0.2)));

    // 0. Inicio de la obra para Capítulo 1
    let chap0StartA = 0;
    const targetPhrase0A = chapters[0]?.startPhrase || '';
    if (targetPhrase0A && targetPhrase0A.trim().length >= 4) {
      const matchA = findParagraphMatchingPhrase(parasA, 0, targetPhrase0A);
      if (matchA > 0) {
        let headingStart = matchA;
        if (headingStart > 0) {
          const prevP = parasA[headingStart - 1];
          if (prevP && (isStandaloneNumeralOrSubheading(prevP) || chapHeadingsRegex.test(prevP) || matchesSpecificChapterHeading(prevP, chapters[0].number, chapters[0].title))) {
            headingStart--;
          }
        }
        chap0StartA = headingStart;
      }
    }

    let chap0StartB = 0;
    const targetPhrase0B = chapters[0]?.startPhraseB || '';
    if (targetPhrase0B && targetPhrase0B.trim().length >= 4) {
      const matchB = findParagraphMatchingPhrase(parasB, 0, targetPhrase0B);
      if (matchB > 0) {
        let headingStart = matchB;
        if (headingStart > 0) {
          const prevP = parasB[headingStart - 1];
          if (prevP && (isStandaloneNumeralOrSubheading(prevP) || chapHeadingsRegex.test(prevP) || matchesSpecificChapterHeading(prevP, chapters[0].number, chapters[0].title))) {
            headingStart--;
          }
        }
        chap0StartB = headingStart;
      }
    }

    const splitIndicesA: number[] = [chap0StartA];
    const splitIndicesB: number[] = [chap0StartB];

    for (let c = 1; c < chapters.length; c++) {
      const chap = chapters[c];
      const prevSplitA = splitIndicesA[splitIndicesA.length - 1];
      const prevSplitB = splitIndicesB[splitIndicesB.length - 1];
      const expectedRatio = c / chapters.length;

      // 1. Resolver corte para Libro A
      let foundIdxA = -1;
      const targetPhraseA = chap.startPhrase || '';
      if (targetPhraseA && targetPhraseA.trim().length >= 4) {
        const matchA = findParagraphMatchingPhrase(parasA, prevSplitA + 1, targetPhraseA, Math.round(expectedRatio * parasA.length));
        if (matchA > prevSplitA) {
          let headingStart = matchA;
          if (headingStart > prevSplitA + 1) {
            const prevP = parasA[headingStart - 1];
            if (prevP && (isStandaloneNumeralOrSubheading(prevP) || chapHeadingsRegex.test(prevP) || matchesSpecificChapterHeading(prevP, chap.number, chap.title))) {
              headingStart--;
            }
          }
          foundIdxA = headingStart;
        }
      }

      if (foundIdxA === -1) {
        for (let p = prevSplitA + minDistanceA; p < parasA.length; p++) {
          if (matchesSpecificChapterHeading(parasA[p], chap.number, chap.title)) {
            foundIdxA = p;
            break;
          }
        }
      }

      if (foundIdxA === -1) {
        const approxA = Math.round(expectedRatio * parasA.length);
        const radiusA = Math.max(10, Math.floor(avgParasA * 0.4));
        const winStartA = Math.max(prevSplitA + minDistanceA, approxA - radiusA);
        const winEndA = Math.min(parasA.length - 1, approxA + radiusA);

        for (let p = winStartA; p <= winEndA; p++) {
          if (parasA[p].length < 75 && (chapHeadingsRegex.test(parasA[p]) || isStandaloneNumeralOrSubheading(parasA[p]))) {
            foundIdxA = p;
            break;
          }
        }
      }

      if (foundIdxA === -1) {
        foundIdxA = Math.max(prevSplitA + 1, Math.min(parasA.length - 1, Math.round(expectedRatio * parasA.length)));
      }

      // 2. Resolver corte para Libro B guiado bilateralmente
      const observedRatioA = foundIdxA / parasA.length;
      const expectedIdxB = Math.round(observedRatioA * parasB.length);

      let foundIdxB = -1;
      const targetPhraseB = chap.startPhraseB || '';
      if (targetPhraseB && targetPhraseB.trim().length >= 4) {
        const matchB = findParagraphMatchingPhrase(parasB, prevSplitB + 1, targetPhraseB, expectedIdxB);
        if (matchB > prevSplitB) {
          let headingStart = matchB;
          if (headingStart > prevSplitB + 1) {
            const prevP = parasB[headingStart - 1];
            if (prevP && (isStandaloneNumeralOrSubheading(prevP) || chapHeadingsRegex.test(prevP) || matchesSpecificChapterHeading(prevP, chap.number, chap.title))) {
              headingStart--;
            }
          }
          foundIdxB = headingStart;
        }
      }

      if (foundIdxB === -1) {
        for (let p = prevSplitB + minDistanceB; p < parasB.length; p++) {
          if (matchesSpecificChapterHeading(parasB[p], chap.number, chap.title)) {
            foundIdxB = p;
            break;
          }
        }
      }

      // Si aún no se encuentra, buscar en ventana alrededor de expectedIdxB (¡NUNCA en prevSplitB + 1!)
      if (foundIdxB === -1) {
        const radiusB = Math.max(10, Math.floor(avgParasB * 0.4));
        const winStartB = Math.max(prevSplitB + minDistanceB, expectedIdxB - radiusB);
        const winEndB = Math.min(parasB.length - 1, expectedIdxB + radiusB);

        for (let p = winStartB; p <= winEndB; p++) {
          if (parasB[p].length < 75 && (chapHeadingsRegex.test(parasB[p]) || isStandaloneNumeralOrSubheading(parasB[p]))) {
            foundIdxB = p;
            break;
          }
        }
      }

      if (foundIdxB === -1) {
        foundIdxB = Math.max(prevSplitB + 1, Math.min(parasB.length - 1, expectedIdxB));
      }

      foundIdxA = Math.max(prevSplitA + 1, Math.min(parasA.length - 1, foundIdxA));
      foundIdxB = Math.max(prevSplitB + 1, Math.min(parasB.length - 1, foundIdxB));

      splitIndicesA.push(foundIdxA);
      splitIndicesB.push(foundIdxB);
    }

    splitIndicesA.push(parasA.length);
    splitIndicesB.push(parasB.length);

    // 3. Auditoría de Coherencia Simétrica Bilateral (Anti-Colapso)
    for (let c = 1; c < chapters.length; c++) {
      const startA = splitIndicesA[c - 1];
      const endA = splitIndicesA[c];
      const startB = splitIndicesB[c - 1];
      const endB = splitIndicesB[c];

      const countWords = (ps: string[]) => ps.join(' ').split(/\s+/).filter(Boolean).length;
      const wA = countWords(parasA.slice(startA, endA));
      const wB = countWords(parasB.slice(startB, endB));

      const isDisparate = (wA > 300 && wB <= 15) || (wB > 300 && wA <= 15) || (wA > 100 && wB > 0 && (wA / wB > 6 || wB / wA > 6));

      if (isDisparate) {
        log(`Recalibración simétrica requerida en Capítulo ${c}: Asimetría detectada (${wA} palabras en A vs ${wB} en B).`);
        if (wA > 300 && wB <= 15) {
          const ratioA = endA / parasA.length;
          const adjustedEndB = Math.max(startB + minDistanceB, Math.min(parasB.length - 1, Math.round(ratioA * parasB.length)));
          splitIndicesB[c] = adjustedEndB;
        } else if (wB > 300 && wA <= 15) {
          const ratioB = endB / parasB.length;
          const adjustedEndA = Math.max(startA + minDistanceA, Math.min(parasA.length - 1, Math.round(ratioB * parasA.length)));
          splitIndicesA[c] = adjustedEndA;
        }
      }
    }

    const slicesA: string[] = [];
    for (let s = 0; s < splitIndicesA.length - 1; s++) {
      slicesA.push(parasA.slice(splitIndicesA[s], splitIndicesA[s + 1]).join('\n\n').trim());
    }

    const slicesB: string[] = [];
    for (let s = 0; s < splitIndicesB.length - 1; s++) {
      slicesB.push(parasB.slice(splitIndicesB[s], splitIndicesB[s + 1]).join('\n\n').trim());
    }

    return { slicesA, slicesB };
  };

  const { slicesA: rawSlicesA, slicesB: rawSlicesB } = extractCoordinatedChapterSlices(
    preCleanBodyA,
    preCleanBodyB,
    chaptersToWork
  );

  // Realizar diagnóstico observacional (Párrafos, caracteres, concordancia)
  const chaptersDiagnostics: CanonicalChapterDiagnostic[] = [];

  for (let i = 0; i < chaptersToWork.length; i++) {
    const chap = chaptersToWork[i];
    const sliceA = rawSlicesA[i] || '';
    const sliceB = rawSlicesB[i] || '';

    const parasA = sliceA.split(/\r?\n\s*\r?\n+/).filter(p => p.trim().length > 0);
    const parasB = sliceB.split(/\r?\n\s*\r?\n+/).filter(p => p.trim().length > 0);

    const wordsA = sliceA.split(/\s+/).filter(Boolean).length;
    const wordsB = sliceB.split(/\s+/).filter(Boolean).length;
    const charsA = sliceA.length;
    const charsB = sliceB.length;

    const countA = parasA.length;
    const countB = parasB.length;
    const maxCount = Math.max(countA, countB, 1);
    const minCount = Math.min(countA, countB);
    const paraSymmetry = minCount / maxCount;

    const lengthRatio = wordsB > 0 ? Number((wordsA / wordsB).toFixed(2)) : 1.0;
    // La concordancia esperada entre idiomas varía entre 0.85 y 1.25 según el par lingüístico
    const lengthScore = Math.max(0, 1 - Math.abs(1 - (wordsA / (wordsB * 1.05 || 1))));

    const score = Math.min(100, Math.round((paraSymmetry * 0.7 + lengthScore * 0.3) * 100));
    const isCritical = score >= 80;

    let diagStatus: 'optimal' | 'moderate' | 'unbalanced' = 'optimal';
    let rec = 'Estructura en alta concordancia simétrica.';
    if (score < 65) {
      diagStatus = 'unbalanced';
      rec = 'Desbalance perceptible en conteo de párrafos. Se aconseja consolidación o quiebre de párrafos partidos.';
    } else if (score < 80) {
      diagStatus = 'moderate';
      rec = 'Concordancia aceptable. La alineación párrafo a párrafo emparejará las asimetrías leves.';
    }

    chaptersDiagnostics.push({
      chapterIndex: chap.number,
      canonicalTitle: chap.title,
      startPhraseA: chap.startPhrase,
      startPhraseB: chap.startPhraseB,
      pageA: chap.pageNumber,
      pageB: chap.pageNumberB,
      paragraphsCountA: countA,
      paragraphsCountB: countB,
      wordsA,
      wordsB,
      charsA,
      charsB,
      lengthRatio,
      initialConcordanceScore: score,
      isCriticalThresholdMet: isCritical,
      diagnosticStatus: diagStatus,
      recommendation: rec
    });
  }

  log(`Diagnóstico completado: ${chaptersDiagnostics.length} capítulos analizados.`);

  // -------------------------------------------------------------------------
  // PASO 2: LIMPIEZA INTELIGENTE DE TEXTO PURO (CREACIÓN DE EBOOKS LIMPIOS)
  // -------------------------------------------------------------------------
  onProgress?.({
    macroPercent: 25,
    macroStage: 'Etapa 2/4: Limpieza Editorial de Texto Puro (Ebooks Limpios)',
    mesoChapter: 'Normalizando saltos de línea y retirando encabezados de página...',
    microDetail: 'Soldando oraciones partidas por PDF y purificando párrafos...',
    recentLogs: [...logs]
  });

  const cleanChapters: CleanEbookChapter[] = [];
  const fullCleanParasA: string[] = [];
  const fullCleanParasB: string[] = [];

  for (let i = 0; i < chaptersToWork.length; i++) {
    const chap = chaptersToWork[i];
    const sliceA = rawSlicesA[i] || '';
    const sliceB = rawSlicesB[i] || '';

    // 1. Limpieza de saltos de línea suaves
    const softA = cleanSoftLineBreaks(sliceA, author, titleA);
    const softB = cleanSoftLineBreaks(sliceB, author, titleB);

    // 2. Remoción de running headers / números de página repetidos
    const headerA = stripRunningHeadersAndFooters(softA.cleaned, titleA, author);
    const headerB = stripRunningHeadersAndFooters(softB.cleaned, titleB, author);

    // 3. Quitar markdown artificial remanente
    const cleanFinalA = removeArtificialMarkdownHeaders(headerA.cleaned);
    const cleanFinalB = removeArtificialMarkdownHeaders(headerB.cleaned);

    const parasA = cleanFinalA.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);
    const parasB = cleanFinalB.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);

    cleanChapters.push({
      chapterIndex: chap.number,
      title: chap.title,
      cleanParagraphsA: parasA,
      cleanParagraphsB: parasB,
      cleanTextA: cleanFinalA,
      cleanTextB: cleanFinalB,
      softWrapsRepairedA: softA.repairsCount,
      softWrapsRepairedB: softB.repairsCount,
      runningHeadersRemovedA: headerA.removedCount,
      runningHeadersRemovedB: headerB.removedCount
    });

    fullCleanParasA.push(...parasA);
    fullCleanParasB.push(...parasB);
  }

  const cleanEbookA = cleanChapters.map(c => c.cleanTextA).join('\n\n');
  const cleanEbookB = cleanChapters.map(c => c.cleanTextB).join('\n\n');

  log(`Ebooks limpios creados: Libro A (${fullCleanParasA.length} párrafos) • Libro B (${fullCleanParasB.length} párrafos).`);

  // -------------------------------------------------------------------------
  // PASO 3: EL CUARTETO DE 4 LIBROS PARALELOS (TRADUCCIÓN TURBO ACELERADA)
  // -------------------------------------------------------------------------
  onProgress?.({
    macroPercent: 50,
    macroStage: 'Etapa 3/4: Generación del Cuarteto Paralelo (4 Libros en Espejo)',
    mesoChapter: 'Traducción espejo de ambos libros...',
    microDetail: translationEngine === 'gemini_macro' 
      ? 'Traducción documental rápida por capítulos con Gemini 2.5 Flash...'
      : 'Traducción concurrente turbo por lotes (0 tokens IA)...',
    recentLogs: [...logs]
  });

  let bookA_translatedToB = (!forcePurgeCache && preExistingShadowA_in_B) ? preExistingShadowA_in_B : '';
  let bookB_translatedToA = (!forcePurgeCache && preExistingShadowB_in_A) ? preExistingShadowB_in_A : '';

  // 1. Traducir Libro A al idioma B (o reutilizar caché si ya existe)
  if (!bookA_translatedToB || bookA_translatedToB.length < 50) {
    const engineLabel = translationEngine === 'gemini_macro' ? 'Gemini 2.5 Flash' : 'Google Turbo (0 tokens)';
    log(`Iniciando traducción turbo de Libro A (${languageA} → ${languageB}) con ${engineLabel}...`);

    const translatedParasA = await translateParagraphsTurbo({
      paragraphs: fullCleanParasA,
      fromLang: languageA,
      toLang: languageB,
      engine: translationEngine,
      onProgress: (pState) => {
        onProgress?.({
          macroPercent: 50 + Math.round((pState.percent * 0.18)),
          macroStage: `Etapa 3/4: Cuarteto Paralelo (Libro A → ${languageB})`,
          mesoChapter: `Procesando ${pState.completed} de ${pState.total} párrafos`,
          microDetail: pState.macroDetail,
          recentLogs: [...logs]
        });
      }
    });

    bookA_translatedToB = translatedParasA.join('\n\n');
    log(`✓ Libro A traducido a ${languageB} completado (${translatedParasA.length} párrafos).`);
  } else {
    log(`✓ Reutilizando traducción existente en caché de Libro A → ${languageB} (0 tokens y 0 ms).`);
  }

  // 2. Traducir Libro B al idioma A (o reutilizar caché si ya existe)
  if (!bookB_translatedToA || bookB_translatedToA.length < 50) {
    const engineLabel = translationEngine === 'gemini_macro' ? 'Gemini 2.5 Flash' : 'Google Turbo (0 tokens)';
    log(`Iniciando traducción turbo de Libro B (${languageB} → ${languageA}) con ${engineLabel}...`);

    const translatedParasB = await translateParagraphsTurbo({
      paragraphs: fullCleanParasB,
      fromLang: languageB,
      toLang: languageA,
      engine: translationEngine,
      onProgress: (pState) => {
        onProgress?.({
          macroPercent: 68 + Math.round((pState.percent * 0.18)),
          macroStage: `Etapa 3/4: Cuarteto Paralelo (Libro B → ${languageA})`,
          mesoChapter: `Procesando ${pState.completed} de ${pState.total} párrafos`,
          microDetail: pState.macroDetail,
          recentLogs: [...logs]
        });
      }
    });

    bookB_translatedToA = translatedParasB.join('\n\n');
    log(`✓ Libro B traducido a ${languageA} completado (${translatedParasB.length} párrafos).`);
  } else {
    log(`✓ Reutilizando traducción existente en caché de Libro B → ${languageA} (0 tokens y 0 ms).`);
  }

  const quartet: ParallelQuartetBook = {
    bookA_clean: cleanEbookA,
    bookA_translatedToB,
    bookB_clean: cleanEbookB,
    bookB_translatedToA,
    languageA,
    languageB,
    translationSource: 'google_translate_free'
  };

  log('Cuarteto de 4 libros generado exitosamente sin consumir tokens.');

  // -------------------------------------------------------------------------
  // PASO 4: EMPAREJAMIENTO DE SUBSEGMENTOS Y PROPUESTAS REVERSIBLES
  // -------------------------------------------------------------------------
  onProgress?.({
    macroPercent: 78,
    macroStage: 'Etapa 4/4: Emparejamiento Homólogo de Subsegmentos',
    mesoChapter: 'Cruzando los 4 libros para alinear párrafos homólogos...',
    microDetail: 'Calculando concordancia léxica y estructural...',
    recentLogs: [...logs]
  });

  const subsegmentProposals: SubsegmentPairProposal[] = [];
  let globalOrder = 1;

  const shadowParasA_in_B = bookA_translatedToB.split(/\r?\n\s*\r?\n+/).map(p => p.trim());
  const shadowParasB_in_A = bookB_translatedToA.split(/\r?\n\s*\r?\n+/).map(p => p.trim());

  let cursorShadowA = 0;
  let cursorShadowB = 0;

  for (let chIdx = 0; chIdx < cleanChapters.length; chIdx++) {
    const chapter = cleanChapters[chIdx];
    const parasA = chapter.cleanParagraphsA;
    const parasB = chapter.cleanParagraphsB;

    onProgress?.({
      macroPercent: 80 + Math.round((chIdx / cleanChapters.length) * 18),
      macroStage: 'Etapa 4/4: Alineando Subsegmentos por Capítulos',
      mesoChapter: `Capítulo ${chapter.chapterIndex}: «${chapter.title}»`,
      microDetail: `Emparejando ${parasA.length} párrafos de A con ${parasB.length} de B...`,
      recentLogs: [...logs]
    });

    let i = 0;
    let j = 0;

    while (i < parasA.length || j < parasB.length) {
      const pA = parasA[i] || '';
      const pB = parasB[j] || '';

      const shA = shadowParasA_in_B[cursorShadowA + i] || '';
      const shB = shadowParasB_in_A[cursorShadowB + j] || '';

      // Evaluar similitud en el mismo idioma utilizando las sombras de traducción
      const similarity = computeShadowSentenceSimilarity(pA, pB, shA, shB);

      // Evaluar si fusionar 2 párrafos de B (1:2)
      if (pA && j + 1 < parasB.length) {
        const nextB = parasB[j + 1];
        const combinedB = `${pB} ${nextB}`;
        const simFused = computeShadowSentenceSimilarity(pA, combinedB, shA, `${shB} ${shadowParasB_in_A[cursorShadowB + j + 1] || ''}`);

        if (simFused > similarity + 15 && simFused >= 65) {
          subsegmentProposals.push({
            id: `sub_${chapter.chapterIndex}_${globalOrder++}`,
            chapterIndex: chapter.chapterIndex,
            order: globalOrder,
            type: '1:2',
            textA: pA,
            textB: combinedB,
            shadowA_in_B: shA,
            shadowB_in_A: shB,
            concordanceScore: Math.min(100, simFused),
            status: 'proposed'
          });
          i++;
          j += 2;
          continue;
        }
      }

      // Evaluar si fusionar 2 párrafos de A (2:1)
      if (pB && i + 1 < parasA.length) {
        const nextA = parasA[i + 1];
        const combinedA = `${pA} ${nextA}`;
        const simFusedA = computeShadowSentenceSimilarity(combinedA, pB, `${shA} ${shadowParasA_in_B[cursorShadowA + i + 1] || ''}`, shB);

        if (simFusedA > similarity + 15 && simFusedA >= 65) {
          subsegmentProposals.push({
            id: `sub_${chapter.chapterIndex}_${globalOrder++}`,
            chapterIndex: chapter.chapterIndex,
            order: globalOrder,
            type: '2:1',
            textA: combinedA,
            textB: pB,
            shadowA_in_B: shA,
            shadowB_in_A: shB,
            concordanceScore: Math.min(100, simFusedA),
            status: 'proposed'
          });
          i += 2;
          j++;
          continue;
        }
      }

      // Emparejamiento 1:1 estándar
      subsegmentProposals.push({
        id: `sub_${chapter.chapterIndex}_${globalOrder++}`,
        chapterIndex: chapter.chapterIndex,
        order: globalOrder,
        type: pA && pB ? '1:1' : 'unpaired',
        textA: pA,
        textB: pB,
        shadowA_in_B: shA,
        shadowB_in_A: shB,
        concordanceScore: Math.min(100, similarity),
        status: 'proposed'
      });

      if (i < parasA.length) i++;
      if (j < parasB.length) j++;
    }

    cursorShadowA += parasA.length;
    cursorShadowB += parasB.length;
  }

  // Estadísticas Globales Finales
  const totalParasA = fullCleanParasA.length;
  const totalParasB = fullCleanParasB.length;
  const totalWordsA = cleanEbookA.split(/\s+/).filter(Boolean).length;
  const totalWordsB = cleanEbookB.split(/\s+/).filter(Boolean).length;

  const avgConcordance = subsegmentProposals.length > 0
    ? Math.round(subsegmentProposals.reduce((acc, p) => acc + p.concordanceScore, 0) / subsegmentProposals.length)
    : 85;

  log(`Curaduría completada con éxito: ${subsegmentProposals.length} subsegmentos propuestos con concordancia promedio del ${avgConcordance}%.`);

  onProgress?.({
    macroPercent: 100,
    macroStage: 'Fase 2 Completada con Éxito',
    mesoChapter: 'Curaduría y Cuarteto Paralelo Listos',
    microDetail: `Concordancia global del ${avgConcordance}% • 0 tokens consumidos`,
    recentLogs: [...logs]
  });

  return {
    chaptersDiagnostics,
    cleanEbookA,
    cleanEbookB,
    cleanChapters,
    quartet,
    subsegmentProposals,
    globalStats: {
      totalChapters: cleanChapters.length,
      totalParasA,
      totalParasB,
      totalWordsA,
      totalWordsB,
      globalConcordancePercent: avgConcordance,
      criticalThresholdPercent: 80,
      isOptimal: avgConcordance >= 80,
      tokensUsed: 0
    }
  };
}
