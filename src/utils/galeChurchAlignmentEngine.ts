/**
 * Motor Determinista de Alineación Bitextual Agnóstico al Idioma (Gale-Church Mejorado)
 * 
 * Implementación de 5 Capas:
 * 1. Atomización Sintáctica y Desacoplamiento Topológico (Intl.Segmenter + fallback Unicode)
 * 2. Normalización Estadística Agnóstica del Sistema de Escritura (informative characters + scale factor)
 * 3. Extracción de Señales Invariantes (Dígitos, modalidad ?/!, entidades, cognados)
 * 4. Programación Dinámica Bandada (Gale-Church con transiciones 1:1, 1:2, 2:1, 1:3, 3:1, 2:2, 1:0, 0:1)
 * 5. Reconstrucción Topológica de Párrafos Espejo (Proyección sin huecos ni marcas ficticias)
 */

export interface SentenceUnit {
  id: number;
  text: string;
  charCount: number;
  informativeCharCount: number;
  paragraphIndex: number;
  isParagraphStart: boolean;
  isParagraphEnd: boolean;
  numbers: string[];
  hasQuestion: boolean;
  hasExclamation: boolean;
  entities: string[];
}

export type TransitionType = '1:1' | '1:2' | '2:1' | '1:3' | '3:1' | '2:2' | '1:0' | '0:1';

export interface AlignedSentenceBead {
  sentencesA: SentenceUnit[];
  sentencesB: SentenceUnit[];
  transitionType: TransitionType;
  cost: number;
  confidence: number; // 0 a 100%
}

export interface MirrorParagraphBlock {
  order: number;
  textA: string;
  textB: string;
  sentencesCountA: number;
  sentencesCountB: number;
  charCountA: number;
  charCountB: number;
  wordCountA: number;
  wordCountB: number;
  confidenceScore: number;
  beads: AlignedSentenceBead[];
  status: 'balanced' | 'rhythm_warning';
  headMatch: boolean;
  tailMatch: boolean;
  note: string;
}

// =========================================================================
// FASE 1: ATOMIZACIÓN SINTÁCTICA Y DESACOPLAMIENTO TOPOLÓGICO
// =========================================================================

/**
 * Mapeo de nombres comunes o códigos de idioma a locales BCP 47 válidos
 */
function resolveLocale(langHint?: string): string {
  if (!langHint) return 'en';
  const clean = langHint.toLowerCase().trim();
  if (clean.includes('español') || clean.includes('spanish') || clean.startsWith('es')) return 'es';
  if (clean.includes('inglés') || clean.includes('ingles') || clean.includes('english') || clean.startsWith('en')) return 'en';
  if (clean.includes('alemán') || clean.includes('aleman') || clean.includes('german') || clean.startsWith('de')) return 'de';
  if (clean.includes('francés') || clean.includes('frances') || clean.includes('french') || clean.startsWith('fr')) return 'fr';
  if (clean.includes('italiano') || clean.includes('italian') || clean.startsWith('it')) return 'it';
  if (clean.includes('portugués') || clean.includes('portugues') || clean.includes('portuguese') || clean.startsWith('pt')) return 'pt';
  if (clean.includes('ruso') || clean.includes('russian') || clean.startsWith('ru')) return 'ru';
  if (clean.includes('chino') || clean.includes('chinese') || clean.startsWith('zh')) return 'zh';
  if (clean.includes('japonés') || clean.includes('japones') || clean.includes('japanese') || clean.startsWith('ja')) return 'ja';
  return 'en';
}

/**
 * Segmenta una cadena de texto en oraciones individuales utilizando Intl.Segmenter
 * con fallback robusto por expresiones regulares Unicode.
 */
export function segmentParagraphIntoSentences(paragraphText: string, localeCode: string): string[] {
  const trimmed = paragraphText.trim();
  if (!trimmed) return [];

  // 1. Intentar Intl.Segmenter estándar
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    try {
      const segmenter = new (Intl as any).Segmenter(localeCode, { granularity: 'sentence' });
      const rawSentences: string[] = [];
      for (const segment of segmenter.segment(trimmed)) {
        const s = segment.segment.trim();
        if (s) rawSentences.push(s);
      }
      if (rawSentences.length > 0) {
        return rawSentences;
      }
    } catch {
      // Fallback
    }
  }

  // 2. Fallback por expresiones regulares con soporte Unicode para diálogos y puntuación
  const parts = trimmed
    .split(/(?<=[.?!…¿¡\u3002\uFF01\uFF1F])\s+(?=[A-ZÁÉÍÓÚÑÄÖÜ0-9"“«—\p{Lu}])/u)
    .map(s => s.trim())
    .filter(Boolean);

  return parts.length > 0 ? parts : [trimmed];
}

/**
 * Calcula la longitud en caracteres informativos (excluyendo espacios y puntuación tipográfica)
 */
export function countInformativeChars(text: string): number {
  if (!text) return 0;
  // Excluye espacios y signos de puntuación / símbolos
  const informative = text.replace(/[\s\p{P}\p{S}]/gu, '');
  return Math.max(1, informative.length);
}

/**
 * Extrae entidades y cognados invariantes (palabras en mayúscula no iniciales, secuencias de dígitos)
 */
function extractEntitiesAndInvariants(text: string): { numbers: string[]; entities: string[] } {
  const numbers: string[] = Array.from(text.match(/\p{N}+/gu) || []);
  
  // Buscar palabras con mayúscula inicial que NO estén estrictamente al principio de la oración
  const entityMatches = text.match(/(?<=\s)[\p{Lu}][\p{Ll}]{2,}/gu) || [];
  const entities = Array.from(new Set(entityMatches.map(e => e.toLowerCase())));

  return { numbers, entities };
}

/**
 * Transforma un texto completo (o arreglo de párrafos) en un arreglo plano de `SentenceUnit[]`
 */
export function atomizeTextIntoSentences(
  input: string | string[],
  languageHint?: string
): SentenceUnit[] {
  const locale = resolveLocale(languageHint);
  const paragraphs: string[] = Array.isArray(input)
    ? input.map(p => p.trim()).filter(Boolean)
    : input.split(/\r?\n\s*\r?\n+/).map(p => p.trim()).filter(Boolean);

  const units: SentenceUnit[] = [];
  let globalId = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const pText = paragraphs[pIdx];
    const sents = segmentParagraphIntoSentences(pText, locale);
    if (sents.length === 0) continue;

    for (let sIdx = 0; sIdx < sents.length; sIdx++) {
      const sText = sents[sIdx];
      const infChars = countInformativeChars(sText);
      const { numbers, entities } = extractEntitiesAndInvariants(sText);

      units.push({
        id: globalId++,
        text: sText,
        charCount: sText.length,
        informativeCharCount: infChars,
        paragraphIndex: pIdx,
        isParagraphStart: sIdx === 0,
        isParagraphEnd: sIdx === sents.length - 1,
        numbers,
        hasQuestion: /[?¿\uFF1F]/.test(sText),
        hasExclamation: /[!¡\uFF01]/.test(sText),
        entities
      });
    }
  }

  return units;
}

// =========================================================================
// FASE 2: NORMALIZACIÓN ESTADÍSTICA AGNÓSTICA DEL SISTEMA DE ESCRITURA
// =========================================================================

export function computeScaleFactor(unitsA: SentenceUnit[], unitsB: SentenceUnit[]): number {
  const totalA = unitsA.reduce((sum, u) => sum + u.informativeCharCount, 0);
  const totalB = unitsB.reduce((sum, u) => sum + u.informativeCharCount, 0);

  if (totalA === 0 || totalB === 0) return 1.0;
  const ratio = totalB / totalA;
  // Limitar en un rango plausible entre 0.35 y 2.8 para evitar distorsiones por extremos
  return Math.max(0.35, Math.min(2.8, ratio));
}

// =========================================================================
// FASE 3: EXTRACCIÓN Y COMPARACIÓN DE SEÑALES INVARIANTES
// =========================================================================

function computeInvariantCostModifier(groupA: SentenceUnit[], groupB: SentenceUnit[]): number {
  let modifier = 0;

  // 1. Invariantes Numéricos (Dígitos y Fechas)
  const numsA = new Set(groupA.flatMap(u => u.numbers));
  const numsB = new Set(groupB.flatMap(u => u.numbers));

  if (numsA.size > 0 && numsB.size > 0) {
    let matches = 0;
    for (const n of numsA) {
      if (numsB.has(n)) matches++;
    }
    if (matches === numsA.size && matches === numsB.size) {
      // Coincidencia exacta de todos los números
      modifier -= 28;
    } else if (matches > 0) {
      modifier -= 14 * matches;
    } else {
      // Conflicto de números (un lado tiene números distintos al otro)
      modifier += 35;
    }
  } else if ((numsA.size > 0 && numsB.size === 0) || (numsA.size === 0 && numsB.size > 0)) {
    // Uno tiene números y el otro no (posible omisión o desalineación)
    modifier += 18;
  }

  // 2. Modalidad Interrogativa
  const qA = groupA.some(u => u.hasQuestion);
  const qB = groupB.some(u => u.hasQuestion);
  if (qA && qB) {
    modifier -= 6;
  } else if (qA !== qB) {
    modifier += 14;
  }

  // 3. Modalidad Exclamativa
  const eA = groupA.some(u => u.hasExclamation);
  const eB = groupB.some(u => u.hasExclamation);
  if (eA && eB) {
    modifier -= 4;
  } else if (eA !== eB) {
    modifier += 10;
  }

  // 4. Entidades y Nombres Propios Compartidos (Cognados)
  const entA = new Set(groupA.flatMap(u => u.entities));
  const entB = new Set(groupB.flatMap(u => u.entities));
  if (entA.size > 0 && entB.size > 0) {
    for (const ea of entA) {
      if (entB.has(ea)) {
        modifier -= 8;
      } else {
        // Coincidencia de prefijo (ej. Clegg vs Clegg)
        for (const eb of entB) {
          if (ea.length >= 4 && eb.length >= 4 && (ea.startsWith(eb.slice(0, 4)) || eb.startsWith(ea.slice(0, 4)))) {
            modifier -= 5;
            break;
          }
        }
      }
    }
  }

  // 5. Bonificación Topológica Suave (Ambos inician o terminan párrafos)
  if (groupA[0]?.isParagraphStart && groupB[0]?.isParagraphStart) {
    modifier -= 5;
  }
  if (groupA[groupA.length - 1]?.isParagraphEnd && groupB[groupB.length - 1]?.isParagraphEnd) {
    modifier -= 5;
  }

  return modifier;
}

// =========================================================================
// FASE 4: MATRIZ DE PROGRAMACIÓN DINÁMICA (GALE-CHURCH + ANCLAS)
// =========================================================================

interface DPTransitionDef {
  dA: number;
  dB: number;
  type: TransitionType;
  priorPenalty: number;
}

const TRANSITIONS: DPTransitionDef[] = [
  { dA: 1, dB: 1, type: '1:1', priorPenalty: 0 },
  { dA: 1, dB: 2, type: '1:2', priorPenalty: 7 },
  { dA: 2, dB: 1, type: '2:1', priorPenalty: 7 },
  { dA: 1, dB: 3, type: '1:3', priorPenalty: 22 },
  { dA: 3, dB: 1, type: '3:1', priorPenalty: 22 },
  { dA: 2, dB: 2, type: '2:2', priorPenalty: 16 },
  { dA: 1, dB: 0, type: '1:0', priorPenalty: 95 },
  { dA: 0, dB: 1, type: '0:1', priorPenalty: 95 }
];

/**
 * Calcula el coste de emparejamiento entre un grupo de oraciones de A y un grupo de B
 */
function computeGroupCost(
  groupA: SentenceUnit[],
  groupB: SentenceUnit[],
  scaleFactor: number,
  priorPenalty: number
): number {
  const lenA = groupA.reduce((sum, u) => sum + u.informativeCharCount, 0);
  const lenB = groupB.reduce((sum, u) => sum + u.informativeCharCount, 0);

  // Caso omisión / adición (1:0 o 0:1)
  if (groupA.length === 0) {
    return priorPenalty + lenB * 1.5;
  }
  if (groupB.length === 0) {
    return priorPenalty + (lenA * scaleFactor) * 1.5;
  }

  // Modelo estadístico de longitud Gale-Church
  const expectedB = lenA * scaleFactor;
  const meanLength = (expectedB + lenB) / 2;
  const variance = Math.max(1.0, meanLength * 1.25);
  const zScore = Math.abs(lenB - expectedB) / Math.sqrt(variance);

  // Función de coste z cuadrática acotada
  const gcDistance = Math.min(100, Math.pow(zScore, 2) * 12);

  // Modificadores por invariantes y señales
  const invariantModifier = computeInvariantCostModifier(groupA, groupB);

  const totalCost = gcDistance + priorPenalty + invariantModifier;
  return Math.max(0, totalCost);
}

/**
 * Ejecuta alineación óptima por Programación Dinámica Bandada
 */
export function alignSentencesWithBandedDP(
  unitsA: SentenceUnit[],
  unitsB: SentenceUnit[],
  scaleFactor: number
): AlignedSentenceBead[] {
  const M = unitsA.length;
  const N = unitsB.length;

  if (M === 0 && N === 0) return [];
  if (M === 0) {
    return [{
      sentencesA: [],
      sentencesB: unitsB,
      transitionType: '0:1',
      cost: 95,
      confidence: 30
    }];
  }
  if (N === 0) {
    return [{
      sentencesA: unitsA,
      sentencesB: [],
      transitionType: '1:0',
      cost: 95,
      confidence: 30
    }];
  }

  // Ancho de la banda de búsqueda diagonal (garantiza O(M * W) y evita bloqueos)
  const bandRadius = Math.max(18, Math.round(Math.max(M, N) * 0.22));

  // Matriz de costes y matriz de transiciones óptimas
  // dp[i][j] = coste mínimo acumulado para alinear A[0...i-1] con B[0...j-1]
  const dp: number[][] = Array.from({ length: M + 1 }, () => Array(N + 1).fill(Infinity));
  const backtrack: Array<Array<{ dA: number; dB: number; type: TransitionType; stepCost: number } | null>> = 
    Array.from({ length: M + 1 }, () => Array(N + 1).fill(null));

  dp[0][0] = 0;

  for (let i = 0; i <= M; i++) {
    const centerJ = Math.round((i / Math.max(1, M)) * N);
    const minJ = Math.max(0, centerJ - bandRadius);
    const maxJ = Math.min(N, centerJ + bandRadius);

    for (let j = minJ; j <= maxJ; j++) {
      const currentCost = dp[i][j];
      if (currentCost === Infinity) continue;

      for (const t of TRANSITIONS) {
        const nextI = i + t.dA;
        const nextJ = j + t.dB;

        if (nextI > M || nextJ > N) continue;

        // Comprobar si nextJ cae dentro de la banda permitida para nextI
        const nextCenterJ = Math.round((nextI / Math.max(1, M)) * N);
        if (Math.abs(nextJ - nextCenterJ) > bandRadius + 3) continue;

        const gA = unitsA.slice(i, nextI);
        const gB = unitsB.slice(j, nextJ);
        const stepCost = computeGroupCost(gA, gB, scaleFactor, t.priorPenalty);
        const newTotal = currentCost + stepCost;

        if (newTotal < dp[nextI][nextJ]) {
          dp[nextI][nextJ] = newTotal;
          backtrack[nextI][nextJ] = {
            dA: t.dA,
            dB: t.dB,
            type: t.type,
            stepCost
          };
        }
      }
    }
  }

  // Backtracking desde (M, N) hacia (0, 0)
  const beads: AlignedSentenceBead[] = [];
  let currI = M;
  let currJ = N;

  // Si (M, N) no fue alcanzado por la banda (muy improbable), buscar la celda válida más cercana
  if (!backtrack[currI][currJ]) {
    let bestDist = Infinity;
    let fallbackI = M;
    let fallbackJ = N;
    for (let j = N; j >= 0; j--) {
      if (dp[M][j] < Infinity) {
        fallbackJ = j;
        break;
      }
    }
    currI = fallbackI;
    currJ = fallbackJ;
  }

  while (currI > 0 || currJ > 0) {
    const step = backtrack[currI][currJ];
    if (!step) {
      // Fallback de emergencia: enlace 1:1 o 1:0 / 0:1
      const dA = currI > 0 ? 1 : 0;
      const dB = currJ > 0 ? 1 : 0;
      const gA = unitsA.slice(currI - dA, currI);
      const gB = unitsB.slice(currJ - dB, currJ);
      beads.push({
        sentencesA: gA,
        sentencesB: gB,
        transitionType: dA === dB ? '1:1' : (dA > 0 ? '1:0' : '0:1'),
        cost: 50,
        confidence: 50
      });
      currI -= dA;
      currJ -= dB;
      continue;
    }

    const gA = unitsA.slice(currI - step.dA, currI);
    const gB = unitsB.slice(currJ - step.dB, currJ);
    const confidence = Math.max(10, Math.min(100, Math.round(100 - step.stepCost * 1.3)));

    beads.push({
      sentencesA: gA,
      sentencesB: gB,
      transitionType: step.type,
      cost: step.stepCost,
      confidence
    });

    currI -= step.dA;
    currJ -= step.dB;
  }

  beads.reverse();
  return beads;
}

// =========================================================================
// FASE 5: RECONSTRUCCIÓN TOPOLÓGICA DE PÁRRAFOS ESPEJO (PROYECCIÓN SIN HUECOS)
// =========================================================================

/**
 * Reconstruye los bloques visuales espejo garantizando que:
 * - Toda oración de B se agrupa exactamente con el párrafo de A al que fue vinculada.
 * - Cero bloques vacíos tipo "[Párrafo continuo]".
 * - Si un enlace oracional cruza la frontera de dos párrafos de A, se fusionan
 *   automáticamente ambos párrafos en un único bloque simétrico y fluido.
 */
export function reconstructMirrorParagraphBlocks(
  beads: AlignedSentenceBead[],
  orderStart: number = 1
): MirrorParagraphBlock[] {
  if (beads.length === 0) return [];

  const rawBlocks: Array<{
    beads: AlignedSentenceBead[];
    sentsA: SentenceUnit[];
    sentsB: SentenceUnit[];
    paraIndicesA: Set<number>;
  }> = [];

  let currentBlock: {
    beads: AlignedSentenceBead[];
    sentsA: SentenceUnit[];
    sentsB: SentenceUnit[];
    paraIndicesA: Set<number>;
  } | null = null;

  for (const bead of beads) {
    if (!currentBlock) {
      currentBlock = {
        beads: [bead],
        sentsA: [...bead.sentencesA],
        sentsB: [...bead.sentencesB],
        paraIndicesA: new Set(bead.sentencesA.map(s => s.paragraphIndex))
      };
      continue;
    }

    // Comprobar si el bead actual comparte el mismo párrafo de A o si el bloque actual aún no ha cerrado el párrafo
    const beadParaIndices = bead.sentencesA.map(s => s.paragraphIndex);
    const lastA = currentBlock.sentsA[currentBlock.sentsA.length - 1];

    // Condición de corte de párrafo: el párrafo de A terminó y el nuevo bead empieza un párrafo nuevo en A
    const currentParagraphClosed = lastA?.isParagraphEnd;
    const isNewParagraph = bead.sentencesA.length > 0 && bead.sentencesA[0].isParagraphStart;

    if (currentParagraphClosed && isNewParagraph) {
      rawBlocks.push(currentBlock);
      currentBlock = {
        beads: [bead],
        sentsA: [...bead.sentencesA],
        sentsB: [...bead.sentencesB],
        paraIndicesA: new Set(beadParaIndices)
      };
    } else {
      // Unir al bloque actual (evita dividir oraciones vinculadas)
      currentBlock.beads.push(bead);
      currentBlock.sentsA.push(...bead.sentencesA);
      currentBlock.sentsB.push(...bead.sentencesB);
      beadParaIndices.forEach(idx => currentBlock!.paraIndicesA.add(idx));
    }
  }

  if (currentBlock) {
    rawBlocks.push(currentBlock);
  }

  // Convertir los bloques en MirrorParagraphBlock con métricas de confianza reales
  const resultBlocks: MirrorParagraphBlock[] = [];
  let currentOrder = orderStart;

  for (const rb of rawBlocks) {
    const textA = rb.sentsA.map(s => s.text).join(' ').trim();
    const textB = rb.sentsB.map(s => s.text).join(' ').trim();

    const charCountA = textA.length;
    const charCountB = textB.length;
    const wordCountA = textA.split(/\s+/).filter(Boolean).length;
    const wordCountB = textB.split(/\s+/).filter(Boolean).length;

    // Cálculo matemático de confianza promedio
    const avgCost = rb.beads.length > 0
      ? rb.beads.reduce((acc, b) => acc + b.cost, 0) / rb.beads.length
      : 0;
    const confidenceScore = Math.max(10, Math.min(100, Math.round(100 - avgCost * 1.2)));

    // Verificación matemática de fronteras de bloque
    const firstBead = rb.beads[0];
    const lastBead = rb.beads[rb.beads.length - 1];

    const headMatch = firstBead
      ? (firstBead.sentencesA.length > 0 && firstBead.sentencesB.length > 0 && firstBead.confidence >= 60)
      : false;

    const tailMatch = lastBead
      ? (lastBead.sentencesA.length > 0 && lastBead.sentencesB.length > 0 && lastBead.confidence >= 60)
      : false;

    const maxChars = Math.max(charCountA, charCountB, 1);
    const minChars = Math.min(charCountA, charCountB);
    const ratio = minChars > 0 ? maxChars / minChars : 1;

    let status: 'balanced' | 'rhythm_warning' = 'balanced';
    if (confidenceScore < 65 || (ratio > 2.2 && Math.abs(charCountA - charCountB) > 200)) {
      status = 'rhythm_warning';
    }

    const note = `${rb.sentsA.length} orac. A ⟷ ${rb.sentsB.length} orac. B | Confianza: ${confidenceScore}%`;

    resultBlocks.push({
      order: currentOrder++,
      textA,
      textB,
      sentencesCountA: rb.sentsA.length,
      sentencesCountB: rb.sentsB.length,
      charCountA,
      charCountB,
      wordCountA,
      wordCountB,
      confidenceScore,
      beads: rb.beads,
      status,
      headMatch,
      tailMatch,
      note
    });
  }

  return resultBlocks;
}

// =========================================================================
// PIPELINE UNIFICADO POR CAPÍTULO: ATOMIZAR -> ESCALAR -> ALINEAR -> RECONSTRUIR
// =========================================================================

export function alignChapterTextsGaleChurch(
  textOrParasA: string | string[],
  textOrParasB: string | string[],
  langA?: string,
  langB?: string,
  orderStart: number = 1
): {
  blocks: MirrorParagraphBlock[];
  scaleFactor: number;
  totalSentencesA: number;
  totalSentencesB: number;
  averageConfidence: number;
} {
  // 1. Atomización
  const unitsA = atomizeTextIntoSentences(textOrParasA, langA);
  const unitsB = atomizeTextIntoSentences(textOrParasB, langB);

  // 2. Normalización de escala
  const scaleFactor = computeScaleFactor(unitsA, unitsB);

  // 3 & 4. DP Bandada con señales invariantes
  const beads = alignSentencesWithBandedDP(unitsA, unitsB, scaleFactor);

  // 5. Reconstrucción topológica sin huecos
  const blocks = reconstructMirrorParagraphBlocks(beads, orderStart);

  const avgConfidence = blocks.length > 0
    ? Math.round(blocks.reduce((acc, b) => acc + b.confidenceScore, 0) / blocks.length)
    : 100;

  return {
    blocks,
    scaleFactor,
    totalSentencesA: unitsA.length,
    totalSentencesB: unitsB.length,
    averageConfidence: avgConfidence
  };
}
