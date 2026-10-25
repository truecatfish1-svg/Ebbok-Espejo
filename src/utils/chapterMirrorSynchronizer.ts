import { MULTILINGUAL_LEXICON } from './multilingualTranslationEngine';

export interface ParallelChapterMatchResult {
  matchedText: string;
  matchedSnippet: string;
  paraIndex: number;
  pageNumber?: number;
  confidence: 'high' | 'medium' | 'estimated';
  charOffset: number;
}

export interface SynchronizedChapterResult {
  number: number;
  title: string;
  hasPrintedTitleA: boolean;
  hasPrintedTitleB: boolean;
  startPhraseA: string;
  startPhraseB: string;
  pageNumberA?: number;
  pageNumberB?: number;
  confidence: 'high' | 'medium' | 'estimated' | 'confirmed';
  source: 'canonical_auto_match' | 'manual_mirror';
}

/**
 * Limpia marcas de página, separadores y artefactos editoriales de cualquier fragmento de texto
 */
export function sanitizePageAndEditorialMarkers(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:^|\n)\s*[-–—=]*\s*\[?\s*[-–—]*\s*(?:P[ÁA]GINA|PAGE|SEITE|P[ÁA]G\.?)\s*\d+\s*[-–—]*\s*\]?\s*[-–—=]*/gi, ' ')
    .replace(/^[-–—=*•#\s]+/gm, '')
    .trim();
}

/**
 * Detecta si unos caracteres o líneas antes del párrafo de inicio existe
 * un título o encabezado formal de capítulo impreso (ej: "Capítulo II", "II", "Parte 2").
 */
export function detectPrecedingChapterTitle(
  fullText: string,
  paraSnippet: string
): { hasPrintedTitle: boolean; title?: string } {
  if (!fullText || !paraSnippet) return { hasPrintedTitle: false };

  const sanitizedSample = sanitizePageAndEditorialMarkers(paraSnippet);
  const snippetSample = sanitizedSample.slice(0, 45).trim();
  if (snippetSample.length < 5) return { hasPrintedTitle: false };

  const idx = fullText.indexOf(snippetSample);
  if (idx <= 0) return { hasPrintedTitle: false };

  // Tomar una ventana de hasta 300 caracteres antes del párrafo
  const precedingWindow = fullText.slice(Math.max(0, idx - 300), idx);
  const lines = precedingWindow.split(/\r?\n/).map(l => sanitizePageAndEditorialMarkers(l)).filter(Boolean);

  const headingRx = /^(?:#+\s*)?(?:(CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PARTE|PART|TEIL|ACTO|LIBRO|BOOK)\s+([0-9IVXLCDM]+|[a-záéíóúñ]+)|([IVXLCDM]{1,6})\.?|([0-9]{1,3})\.?)\s*[-–—:.]*\s*(.*?)$/i;

  // Revisar las últimas 3 líneas previas al párrafo
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
    const l = lines[i];
    if (l.length < 80 && headingRx.test(l)) {
      return {
        hasPrintedTitle: true,
        title: l.replace(/^#+\s*/, '').trim()
      };
    }
  }

  // Revisar si el párrafo mismo inicia con un encabezado en su primera línea
  const firstLine = sanitizedSample.split(/\r?\n/)[0].trim();
  if (firstLine.length < 80 && headingRx.test(firstLine)) {
    return {
      hasPrintedTitle: true,
      title: firstLine.replace(/^#+\s*/, '').trim()
    };
  }

  return { hasPrintedTitle: false };
}

/**
 * Encuentra de forma analógica y determinista el punto de inicio correspondiente
 * en el libro espejo paralelo (Libro B) a partir de un punto marcado en el Libro A.
 */
export function findAnalogousParallelChapterStart(params: {
  sourceText: string;
  targetText: string;
  sourceSnippet: string;
  sourceCharOffset?: number;
  sourcePageNumber?: number;
  targetPdfPages?: { pageNumber: number; text: string }[];
  chapterNumber?: number;
}): ParallelChapterMatchResult | null {
  const {
    sourceText,
    targetText,
    sourceSnippet,
    sourceCharOffset,
    targetPdfPages,
    chapterNumber
  } = params;

  if (!targetText || targetText.trim().length < 50) return null;

  const targetParas = targetText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  if (targetParas.length === 0) return null;

  // 1. Calcular proporción relativa de avance en el texto origen
  let ratio = 0.05;
  if (sourceCharOffset !== undefined && sourceText && sourceText.length > 0) {
    ratio = Math.max(0, Math.min(1, sourceCharOffset / sourceText.length));
  } else if (sourceText && sourceSnippet) {
    const idx = sourceText.indexOf(sourceSnippet.trim().slice(0, 40));
    if (idx !== -1) {
      ratio = Math.max(0, Math.min(1, idx / sourceText.length));
    }
  }

  // 2. Definir ventana de búsqueda en Libro B alrededor del porcentaje proporcional
  const targetEstimatedIdx = Math.floor(ratio * targetParas.length);
  const windowRadius = Math.max(10, Math.floor(targetParas.length * 0.12)); // +/- 12% del libro
  const startIdx = Math.max(0, targetEstimatedIdx - windowRadius);
  const endIdx = Math.min(targetParas.length - 1, targetEstimatedIdx + windowRadius);

  // 3. Extraer palabras clave, nombres propios y números del fragmento de origen
  const cleanSnippet = sourceSnippet.replace(/[«»""''.,;:!?¿¡()\[\]]/g, ' ');
  const words = cleanSnippet.split(/\s+/).filter(w => w.length >= 3);
  const properNouns = words.filter(w => /^[A-ZÁÉÍÓÚÑÄÖÜ]/.test(w) && w.length >= 4);
  const numbers = cleanSnippet.match(/\b(?:\d+|[IVXLCDM]{1,6})\b/gi) || [];

  // Buscar conceptos semánticos del léxico multilingüe presentes en el fragmento origen
  const matchedConcepts: string[] = [];
  const lowerSnippet = cleanSnippet.toLowerCase();
  for (const concept of MULTILINGUAL_LEXICON) {
    const hasInES = concept.es.some(k => lowerSnippet.includes(k));
    const hasInEN = concept.en.some(k => lowerSnippet.includes(k));
    const hasInDE = concept.de?.some(k => lowerSnippet.includes(k));
    const hasInFR = concept.fr?.some(k => lowerSnippet.includes(k));
    if (hasInES || hasInEN || hasInDE || hasInFR) {
      matchedConcepts.push(concept.id);
    }
  }

  let bestIdx = targetEstimatedIdx;
  let bestScore = -1;
  let bestConfidence: 'high' | 'medium' | 'estimated' = 'estimated';

  // 4. Evaluar cada párrafo dentro de la ventana de búsqueda
  for (let i = startIdx; i <= endIdx; i++) {
    const p = targetParas[i];
    const lowerP = p.toLowerCase();
    let score = 0;

    // A. ¿Tiene encabezado de capítulo o número romano semejante?
    const isChapHeading = /^(?:#+\s*)?(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PARTE|PART|TEIL|ACTO|LIBRO|BOOK)\b/i.test(p) ||
      /^(?:#+\s*)?[IVXLCDM]{1,6}\.?$/i.test(p) ||
      /^(?:#+\s*)?\d{1,3}\.?$/i.test(p);

    if (isChapHeading) {
      score += 40;
      if (chapterNumber) {
        const numMatch = p.match(/\b(\d+|[IVXLCDM]{1,6})\b/i);
        if (numMatch && (numMatch[1] === String(chapterNumber) || numMatch[1].toLowerCase() === toRoman(chapterNumber).toLowerCase())) {
          score += 60;
          bestConfidence = 'high';
        }
      }
    }

    // B. Coincidencia de nombres propios (Gregor, Alice, Winston, etc.)
    for (const pn of properNouns) {
      if (p.includes(pn)) {
        score += 25;
      }
    }

    // C. Coincidencia de números
    for (const n of numbers) {
      const rx = new RegExp(`\\b${n}\\b`, 'i');
      if (rx.test(p)) {
        score += 20;
      }
    }

    // D. Coincidencia de conceptos semánticos multilingües
    for (const cId of matchedConcepts) {
      const concept = MULTILINGUAL_LEXICON.find(c => c.id === cId);
      if (concept) {
        const terms = [...concept.es, ...concept.en, ...(concept.de || []), ...(concept.fr || []), ...(concept.it || [])];
        if (terms.some(t => lowerP.includes(t))) {
          score += 15;
        }
      }
    }

    // E. Penalización suave por lejanía del punto proporcional
    const distance = Math.abs(i - targetEstimatedIdx);
    const distancePenalty = (distance / (windowRadius || 1)) * 15;
    score -= distancePenalty;

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
      if (score >= 45) {
        bestConfidence = 'high';
      } else if (score >= 20) {
        bestConfidence = 'medium';
      }
    }
  }

  const bestPara = sanitizePageAndEditorialMarkers(targetParas[bestIdx] || targetParas[0]);
  const charOffsetInTarget = targetText.indexOf(bestPara);

  // Calcular número de página en Libro B si hay páginas disponibles
  let pageNumber: number | undefined = undefined;
  if (targetPdfPages && targetPdfPages.length > 0) {
    const cleanSample = bestPara.slice(0, 50).toLowerCase();
    const foundPage = targetPdfPages.find(page => page.text.toLowerCase().includes(cleanSample));
    if (foundPage) {
      pageNumber = foundPage.pageNumber;
    } else {
      const estimatedP = Math.max(1, Math.min(targetPdfPages.length, Math.ceil(ratio * targetPdfPages.length)));
      pageNumber = estimatedP;
    }
  }

  return {
    matchedText: bestPara,
    matchedSnippet: bestPara.length > 180 ? bestPara.slice(0, 180) + '...' : bestPara,
    paraIndex: bestIdx,
    pageNumber,
    confidence: bestConfidence,
    charOffset: charOffsetInTarget >= 0 ? charOffsetInTarget : 0
  };
}

/**
 * Sincroniza automáticamente los capítulos de la obra a partir de su esquema canónico,
 * de manera 100% agnóstica a la obra, buscando las frases o transiciones de inicio
 * en ambos textos delimitados sin ningún hardcode de libros específicos.
 */
export function autoSynchronizeChaptersByCanonicalPhrases(params: {
  delimitedTextA: string;
  delimitedTextB: string;
  pdfPagesA?: { pageNumber: number; text: string }[];
  pdfPagesB?: { pageNumber: number; text: string }[];
  canonicalChapters: { number: number; title: string; startPhrase?: string }[];
  workTitleHint?: string;
}): SynchronizedChapterResult[] {
  const {
    delimitedTextA,
    delimitedTextB,
    pdfPagesA,
    pdfPagesB,
    canonicalChapters
  } = params;

  if (!delimitedTextA || !delimitedTextB) return [];

  const parasA = delimitedTextA.split(/\n\s*\n+/).map(p => sanitizePageAndEditorialMarkers(p)).filter(Boolean);
  const totalCount = Math.max(canonicalChapters.length, 1);
  const results: SynchronizedChapterResult[] = [];

  for (let cIdx = 0; cIdx < totalCount; cIdx++) {
    const cNum = cIdx + 1;
    const canChap = canonicalChapters[cIdx] || { number: cNum, title: `Capítulo ${cNum}` };
    const propRatio = cIdx / totalCount;

    let targetParaA: string;
    let targetPageA: number | undefined = undefined;

    if (cIdx === 0) {
      // Capítulo 1 siempre arranca en el primer párrafo del cuerpo delimitado
      targetParaA = parasA[0] || '';
      targetPageA = pdfPagesA?.[0]?.pageNumber;
    } else {
      let foundIndex = -1;

      // 1. Buscar por startPhrase si existe
      if (canChap.startPhrase && canChap.startPhrase.length >= 6) {
        const cleanPhrase = sanitizePageAndEditorialMarkers(canChap.startPhrase).toLowerCase().slice(0, 30);
        foundIndex = parasA.findIndex(p => p.toLowerCase().includes(cleanPhrase));
      }

      // 2. Si no, buscar encabezado explícito alrededor de la proporción esperada
      if (foundIndex === -1) {
        const targetIdx = Math.floor(propRatio * parasA.length);
        const radius = Math.max(8, Math.floor(parasA.length * 0.15));
        const s = Math.max(1, targetIdx - radius);
        const e = Math.min(parasA.length - 1, targetIdx + radius);

        const chapHeadRx = new RegExp(`^(?:#+\\s*)?(?:(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PARTE|PART)\\s+(?:${cNum}|${toRoman(cNum)})|${toRoman(cNum)}\\.|${cNum}\\.)\\b`, 'i');

        for (let i = s; i <= e; i++) {
          if (chapHeadRx.test(parasA[i])) {
            foundIndex = i;
            break;
          }
        }

        if (foundIndex === -1) {
          // Tomar el párrafo más cercano al corte proporcional
          foundIndex = targetIdx;
        }
      }

      targetParaA = parasA[foundIndex] || parasA[0];

      // Hallar página en A
      if (pdfPagesA && pdfPagesA.length > 0) {
        const sample = targetParaA.slice(0, 40).toLowerCase();
        const pObj = pdfPagesA.find(p => p.text.toLowerCase().includes(sample));
        targetPageA = pObj ? pObj.pageNumber : Math.ceil(propRatio * pdfPagesA.length);
      }
    }

    // Detectar si en Libro A hay un título impreso previo al párrafo
    const titleDetectionA = detectPrecedingChapterTitle(delimitedTextA, targetParaA);

    // Encontrar contraparte analógica en Libro B
    const matchB = findAnalogousParallelChapterStart({
      sourceText: delimitedTextA,
      targetText: delimitedTextB,
      sourceSnippet: targetParaA,
      targetPdfPages: pdfPagesB,
      chapterNumber: cNum
    });

    const targetParaB = matchB?.matchedText || '';
    const titleDetectionB = detectPrecedingChapterTitle(delimitedTextB, targetParaB);

    const resolvedTitle = titleDetectionA.hasPrintedTitle && titleDetectionA.title
      ? titleDetectionA.title
      : (canChap.title || `Capítulo ${cNum}`);

    results.push({
      number: cNum,
      title: resolvedTitle,
      hasPrintedTitleA: titleDetectionA.hasPrintedTitle,
      hasPrintedTitleB: titleDetectionB.hasPrintedTitle,
      startPhraseA: targetParaA.slice(0, 150),
      startPhraseB: targetParaB.slice(0, 150),
      pageNumberA: targetPageA,
      pageNumberB: matchB?.pageNumber,
      confidence: matchB?.confidence || 'estimated',
      source: 'canonical_auto_match'
    });
  }

  return results;
}

function toRoman(num: number): string {
  const map: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let res = '';
  let n = num;
  for (const [v, r] of map) {
    while (n >= v) {
      res += r;
      n -= v;
    }
  }
  return res || 'I';
}
