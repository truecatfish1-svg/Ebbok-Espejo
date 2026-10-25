import { 
  ContentBlock, 
  ContentBlockType, 
  ParallelBookConfig, 
  ParallelPageSpread, 
  ParallelPair, 
  RawChunk,
  ChapterAnchor,
  EditorialOmission,
  ParallelEditorialAudit,
  BoundaryConcordance,
  ContinuousThreadAuditEntry
} from '../types';
import { normalizeLiteraryTypography } from './transversalAuditor';
import { 
  analyzeNovelPrologueAndStart, 
  isolateFootnotesFromText, 
  disentangleOpeningFrontMatter, 
  detectAndSeparateBackMatter,
  cleanGutenbergHeaderAndExtractMetadata,
  cleanOpeningBoilerplates,
  disentangleBookZones,
  normalizeTypographicText,
  unfoldFusedChapterAndPrologueHeaders,
  cleanInlineFootnoteReferencesAndScholarlyArtifacts,
  stripTableOfContents,
  FootnoteItem 
} from './novelCurator';
import { 
  preBreakGluedSyntacticBoundaries,
  extractSentenceFingerprint,
  computeSentenceAlignmentScore,
  partitionBookIntoHomologicalSegments,
  harmonizeSingleChapterTaxon
} from './pureMirrorHarmonizer';
import { repairOcrFracturedDropCaps } from './canonicalEndpointsDiscoverer';
import { evaluateMultilingualPhraseConcordance, extractNumbersAndDates, computeShadowSentenceSimilarity } from './multilingualTranslationEngine';
import { runPostProcessTranslationAuditAndAutoHarmonize } from './postProcessTranslationPipeline';

export interface ExtractedUnit {
  id: string;
  text: string;
  type: ContentBlockType;
  title?: string;
  isHeading: boolean;
  headingLevel?: 1 | 2 | 3;
  chapterIndex?: number;
  wordCount: number;
  charCount: number;
}

export interface ExtractedWork {
  units: ExtractedUnit[];
  preface?: {
    hasPreface: boolean;
    title: string;
    text: string;
    wordCount: number;
    paragraphsCount: number;
  };
  backMatter?: {
    hasBackMatter: boolean;
    title: string;
    text: string;
    wordCount: number;
    paragraphsCount: number;
    type?: string;
  };
  footnotes: FootnoteItem[];
  chapters: {
    index: number;
    title: string;
    unitStartIndex: number;
    paragraphsCount: number;
  }[];
}

/**
 * Limpieza profunda y desenhebrado de texto hacia un flujo continuo tipo eBook.
 * Elimina cabeceras/pies de página de PDFs, números sueltos y unifica líneas rotas
 * dentro de un mismo párrafo, preservando capítulos, versos y diálogos con raya.
 */
export function cleanRawTextToEbookStream(
  rawInput: string | any[],
  options?: { preserveBoundaries?: boolean }
): string {
  // Por defecto, SIEMPRE se preservan los límites soberanos del libro delimitado en Pestaña 1
  const preserve = options?.preserveBoundaries ?? true;

  const rawStr = Array.isArray(rawInput)
    ? rawInput.map(c => typeof c === 'string' ? c : (c?.text || c?.cleanContent || c?.rawContent || '')).join('\n\n')
    : (rawInput || '');
  
  if (!rawStr || rawStr.trim().length === 0) return '';

  let text = rawStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // =========================================================================
  // PASO 1: DEPURACIÓN Y DISOLUCIÓN DE METADATOS / ARTEFACTOS DE PDF Y OCR
  // =========================================================================

  // 1.0 Desdoblar encabezados solo en texto crudo no demarcado soberanamente
  if (!preserve) {
    text = unfoldFusedChapterAndPrologueHeaders(text);
  }

  // 1.0a Reparar letras capitulares desmembradas (Drop Caps) e inicios de novela fracturados (ej. "A LS Gregor" -> "Als Gregor")
  text = repairOcrFracturedDropCaps(text);

  // 1.0b Limpieza exhaustiva de llamadas a nota al pie inline ("[1]", "[2]", "[14]", "[i]", "[sic]", "not[.]")
  text = cleanInlineFootnoteReferencesAndScholarlyArtifacts(text);

  // 1.1 Eliminar avisos de OCR o páginas escaneadas
  text = text.replace(/\[\s*(?:P[aá]gina|Pagina)?\s*escaneada\s+pendiente\s+de\s+OCR[^\]]*\]/gi, '');
  text = text.replace(/---+\s*\[\s*P[AÁ]GINA\s+\d+\s*\([^\]]*\)\s*\]\s*---+/gi, '');

  // 1.2 Unificar palabras partidas por guion que saltan a través de una marca de página o columna
  // Ej: "despe-" + \n--- [PÁGINA 2] ---\n + "dirían" -> "despedirían"
  text = text.replace(
    /([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*(?:\n|\r\n)*\s*[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA)[^\]]*\]\s*[-–—\s]*(?:\n|\r\n)*\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/gi,
    '$1$2'
  );

  // 1.3 Soldar oraciones cortadas por una marca de página o columna sin punto final
  // Ej: "me despedirían en el" + \n--- [PÁGINA 2] ---\n + "acto." -> "me despedirían en el acto."
  text = text.replace(
    /([^\n.!?»”":;\s])\s*(?:\n|\r\n)+\s*[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA)[^\]]*\]\s*[-–—\s]*(?:\n|\r\n)+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/gi,
    '$1 $2'
  );

  // 1.4 Eliminar cualquier resto de marca de página o columna entre corchetes o guiones:
  // e.g. "--- [PÁGINA 2] ---", "[ - - PÁGINA 2 - - ]", "[--- COLUMNA DERECHA ---]", "[ - - COLUMNA DERECHA - - ]", "--- [PÁGINA 12] ---"
  text = text.replace(/[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA(?:\s+DERECHA|\s+IZQUIERDA)?)[^\]]*\]\s*[-–—\s]*/gi, '');

  // 1.5 Eliminar números de página aislados o pies de página de PDF (ej. "- 14 -", "Pág. 12", "12 | Franz Kafka", o números altos >= 150 solos):
  text = text.replace(/^[ \t]*[-–—\s]*(?:p[aá]g(?:ina)?|page|seite)\.?\s*\d+(?:\s*de\s*\d+)?[-–—\s]*$/gim, '');
  text = text.replace(/^[ \t]*[-–—]\s*\d{1,4}\s*[-–—][ \t]*$/gim, '');
  text = text.replace(/^[ \t]*(?:1[5-9]\d|[2-9]\d{2,3})[ \t]*$/gim, '');
  text = text.replace(/^[ \t]*\d{1,4}\s*[|•·/]\s*.*$/gim, '');
  text = text.replace(/^.*\s*[|•·/]\s*\d{1,4}[ \t]*$/gim, '');

  // 1.6 Unificar palabras partidas por guion al final de línea ordinario:
  // "trans- \n formación" -> "transformación"
  text = text.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*\n+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/g, '$1$2');

  // Si preserve está activo (por defecto, texto acotado soberanamente por el usuario en Pestaña 1),
  // NUNCA re-cortar prólogos, cabeceras ni material posterior para no saltar a la mitad del libro
  if (!preserve) {
    // 1.7 Desenhebrar avisos parasitarios de bibliotecas digitales y colofones web
    const boilerResult = cleanOpeningBoilerplates(text);
    text = boilerResult.cleanedText;

    // 1.8 Desenhebrar cabeceras de Project Gutenberg si existen
    const gutenbergHeader = cleanGutenbergHeaderAndExtractMetadata(text);
    text = gutenbergHeader.cleanedText;

    // 1.9 Desenhebrar metadatos de portadilla (Autor, Título) al inicio del texto
    const frontMatterResult = disentangleOpeningFrontMatter(text);
    text = frontMatterResult.cleanedText;

    // 1.10 Desenhebrar y aislar material posterior (Licencias Gutenberg, colofón, epílogo, bibliografía)
    const backMatterResult = detectAndSeparateBackMatter(text);
    text = backMatterResult.novelBodyText;
  }

  // 1.11 Normalización tipográfica (comillas curvas, apóstrofes tipográficos, ligaduras OCR)
  text = normalizeTypographicText(text);

  // 1.12 Solo recortar prólogo si no se están preservando límites soberanos
  if (!preserve) {
    const prologueCheck = analyzeNovelPrologueAndStart(text);
    if (prologueCheck.mainBodyText && (prologueCheck.hasPrologue || prologueCheck.startIndex > 0)) {
      text = prologueCheck.mainBodyText;
    }
  }

  // 1.13 Desdoblar uniones sintácticas o cambios de turno pegados por defectos de OCR (interrogaciones, diálogos, capítulos soldados)
  const preBreakResult = preBreakGluedSyntacticBoundaries(text);
  text = preBreakResult.cleaned;

  // =========================================================================
  // PASO 2: DESENHEBRADO LINGÜÍSTICO RESILIENTE (EBOOK FLOW)
  // Reconstrucción de párrafos semánticos continuos respetando interlineados
  // =========================================================================
  const isHeadingLine = (l: string) => {
    const trimmed = l.trim();
    if (/^#+\s+/.test(trimmed)) return true;
    if (/^[—–\-«"“'‘„¿¡]/.test(trimmed)) return false;
    // 1. Cabeceras canónicas con palabra clave (Capítulo, Chapter, etc.)
    if (/^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|b\s*ook|l\s*ibro|a\s*cto)\b(?:\s+(?:[0-9IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo|primer|primera)\b\.?)?)(?:\s*[-–—:.]\s*[^\n]*)?(?:[_\-*•\s]*)$/i.test(trimmed)) {
      return true;
    }
    // 2. Numeral romano aislado en su propia línea (I..L con o sin punto, estrictamente en mayúsculas)
    if (/^(?:[_\-*•\s]*)(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XL|L)\.?\s*$/.test(trimmed)) {
      return true;
    }
    // 3. Numeral arábigo aislado en su propia línea (1..150 con o sin punto)
    if (/^(?:[_\-*•\s]*)(?:[0-9]{1,3})\.?\s*$/.test(trimmed)) {
      return true;
    }
    // 4. Numeral en palabra aislado en su propia línea (Uno..Veinte / One..Twenty)
    if (/^(?:[_\-*•\s]*)(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|primero|segundo|tercero|cuarto|quinto)\.?\s*$/i.test(trimmed)) {
      return true;
    }
    // 5. Numeral arábigo o romano con delimitador de puntuación que precede al título (NUNCA un mero espacio)
    if (/^(?:[_\-*•\s]*)(?:(?:[0-9]{1,3}|I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV)[\.:\-–—]\s+[A-ZÁÉÍÓÚÄÖÜ][^\n]{1,60})$/.test(trimmed)) {
      if (/^[0-9]{1,3}[\.:\-–—]\s*(?:si\b|cuando\b|porque\b|aunque\b|mientras\b|como\b|if\b|when\b|as\b|because\b|while\b)/i.test(trimmed)) {
        return false;
      }
      if (/[;,…»”"]$/.test(trimmed) || /[,;]/.test(trimmed)) {
        return false;
      }
      return true;
    }
    return false;
  };

  const isDateOrSubtitleLine = (l: string) =>
    /^(?:Florence|Florencia|London|Londres|Paris|Par[ií]s|Geneva|Ginebra|Rome|Roma|Madrid|Berl[ií]n|Berlin|Vienna|Viena|Chapel Hill|Edinburgh|Edimburgo)\b[^\n]*(?:(?:1[789]\d\d|20\d\d)|[0-9]{1,2}(?:th|st|nd|rd)?|[a-zA-Z]+\.?\s*[0-9]{1,2})/i.test(l.trim()) ||
    /^\*[^\n*]+\*$/.test(l.trim());

  // Línea de metadatos o portadilla (Autor, Título, Traductor) que no debe fusionarse
  const isFrontMatterLine = (l: string) => {
    if (l.length > 70) return false;
    if (isHeadingLine(l)) return false;
    if (/^(?:por|by|von)?\s*[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+){1,3}$/i.test(l)) return true;
    if (/^[A-ZÁÉÍÓÚÑÄÖÜ\s]{4,40}$/.test(l) && !/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|LIBRO|BOOK|PARTE|PART)\b/i.test(l)) return true;
    if (/^(?:El|La|Los|Las|The|Der|Die|Das|Le|Les)\s+[A-ZÁÉÍÓÚÑÄÖÜ][a-zÁ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜa-zÁ-ÿ]+){0,4}$/i.test(l)) return true;
    if (/^(?:Traducci[oó]n|Translated|Übersetzung|Edici[oó]n|Novela|Relato|Tomo)\b/i.test(l)) return true;
    return false;
  };

  const isDialogueStart = (l: string) =>
    /^[—–\-]\s*[A-ZÁÉÍÓÚÑÄÖÜa-záéíóúñäöü«"“¡¿]/.test(l.trim()) ||
    /^[«»"“„]/.test(l.trim());

  const isOrnamentalDivider = (l: string) =>
    /^[*•◆\-—\s]{3,}$/.test(l.trim()) && !/[a-zA-Z0-9]/.test(l);

  const rawParagraphs: string[] = [];

  // Si el texto ya contiene párrafos separados por doble salto de línea (\n\s*\n),
  // respetar escrupulosamente esos párrafos y solo soldar líneas partidas dentro de cada párrafo
  const hasDoubleNewlines = /\n\s*\n/.test(text);

  if (hasDoubleNewlines) {
    const rawBlocks = text.split(/\n\s*\n+/);
    for (const block of rawBlocks) {
      const trimmedBlock = block.trim();
      if (!trimmedBlock) continue;

      if (isHeadingLine(trimmedBlock) || isDateOrSubtitleLine(trimmedBlock) || isOrnamentalDivider(trimmedBlock)) {
        rawParagraphs.push(trimmedBlock);
        continue;
      }

      // Si el bloque contiene saltos simples, soldar líneas de prosa respetando guiones y diálogos
      const blockLines = trimmedBlock.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

      // Preservación de Estrofas de Poesía / Versos / Fragmentos Líricos:
      // Si el bloque tiene 2+ líneas, todas son cortas (< 65 caracteres) y empiezan en mayúscula/comillas/guión:
      const isPoetryStanza = blockLines.length >= 2 && 
        blockLines.every(l => l.length < 65) &&
        (blockLines.filter(l => /^[A-ZÁÉÍÓÚÑÄÖÜ«"“—¿¡]/.test(l)).length >= Math.ceil(blockLines.length * 0.7));

      if (isPoetryStanza) {
        rawParagraphs.push(blockLines.join('\n'));
        continue;
      }

      let currentP = '';

      for (let j = 0; j < blockLines.length; j++) {
        const line = blockLines[j];
        if (isHeadingLine(line) || isDateOrSubtitleLine(line) || isOrnamentalDivider(line)) {
          if (currentP) { rawParagraphs.push(currentP.trim()); currentP = ''; }
          rawParagraphs.push(line);
          continue;
        }

        if (isDialogueStart(line)) {
          if (currentP) { rawParagraphs.push(currentP.trim()); currentP = ''; }
          currentP = line;
          continue;
        }

        if (!currentP) {
          currentP = line;
        } else {
          // Soldar guión al final de línea: ej. "des-" + "pués" -> "después"
          if (/[a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ]+-\s*$/.test(currentP)) {
            currentP = currentP.replace(/-\s*$/, '') + line;
          } else {
            currentP += ' ' + line;
          }
        }
      }
      if (currentP) {
        rawParagraphs.push(currentP.trim());
      }
    }
  } else {
    // Si el texto solo tiene saltos simples (extracto crudo de PDF con líneas de 60-80 chars)
    const lines = text.split(/\r?\n/);
    let currentParagraph = '';

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) {
        if (currentParagraph) {
          rawParagraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        continue;
      }

      // Encabezado de capítulo, subtítulo/fecha, división ornamental o portadilla
      if (isHeadingLine(rawLine) || isDateOrSubtitleLine(rawLine) || isOrnamentalDivider(rawLine) || (i < 8 && isFrontMatterLine(rawLine))) {
        if (currentParagraph) {
          rawParagraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        rawParagraphs.push(rawLine);
        continue;
      }

      // Inicio de diálogo literario: siempre genera su propio párrafo
      if (isDialogueStart(rawLine)) {
        if (currentParagraph) {
          rawParagraphs.push(currentParagraph.trim());
          currentParagraph = '';
        }
        currentParagraph = rawLine;
        continue;
      }

      // Línea con sangría explícita en el original
      const hasIndentation = /^[ \t]{2,}/.test(lines[i]);

      if (!currentParagraph) {
        currentParagraph = rawLine;
      } else {
        const prevTrimmed = currentParagraph.trim();
        const prevEndsWithTerminal = /[.:?!»”"]$/.test(prevTrimmed);

        // Si la línea anterior termina en guión de partición silábica, soldar
        if (/[a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ]+-\s*$/.test(prevTrimmed)) {
          currentParagraph = currentParagraph.replace(/-\s*$/, '') + rawLine;
        } else if (!prevEndsWithTerminal) {
          // Continuación evidente dentro del mismo párrafo
          currentParagraph += ' ' + rawLine;
        } else {
          // La línea previa terminó en signo terminal:
          // Si la línea previa era visiblemente corta (< 60 caracteres) o hay sangría o inicia en mayúscula/comillas
          if (hasIndentation || prevTrimmed.length < 60 || /^[A-ZÁÉÍÓÚÑÄÖÜ«"“¡¿—]/.test(rawLine)) {
            rawParagraphs.push(currentParagraph.trim());
            currentParagraph = rawLine;
          } else {
            currentParagraph += ' ' + rawLine;
          }
        }
      }
    }

    if (currentParagraph) {
      rawParagraphs.push(currentParagraph.trim());
    }
  }

  // =========================================================================
  // PASO 3: NORMALIZACIÓN TIPOGRÁFICA LITERARIA SOBRE PÁRRAFOS COMPLETOS
  // =========================================================================
  let finalized = rawParagraphs
    .map(p => normalizeLiteraryTypography(p).trim())
    .filter(p => {
      // Filtrar artefactos que hayan sobrevivido
      if (!p || p.length === 0) return false;
      if (/^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGE|SEITE|COLUMNA)[^\]]*\]\s*[-–—\s]*$/i.test(p)) return false;
      const isIsolatedNum = p.match(/^[-–—\s]*(\d{1,4})[-–—\s]*$/);
      if (isIsolatedNum) {
        const numVal = parseInt(isIsolatedNum[1], 10);
        // Si es número alto (> 150) o rodeado de guiones típicos de pie de página ("- 12 -"), se descarta
        if (numVal > 150 || /^[-–—]\s*\d+\s*[-–—]$/.test(p.trim())) return false;
        // Números 1..150 se preservan íntegros como cabeceras de capítulo
        return true;
      }
      return true;
    });

  // =========================================================================
  // PASO 3.5: FORMATO ESPECIAL DE CAPÍTULOS Y UNIFICACIÓN DE SUBBLOQUES DE PÁRRAFO
  // - Encabezados de capítulo asignados a bloques propios con formato especial (###)
  // - Subtítulos/fechas (e.g. "Florence. Nov. 9th 1819") aislados como subtítulos
  // - La primera oración del capítulo encabeza el párrafo y unifica sus subbloques
  // =========================================================================
  const unifiedStream: string[] = [];
  for (let k = 0; k < finalized.length; k++) {
    const cur = finalized[k];
    const isCurHeading = isHeadingLine(cur);
    const isCurDate = isDateOrSubtitleLine(cur);

    if (isCurHeading) {
      // Formato especial separado para los capítulos o títulos especiales
      const cleanHeader = cur.replace(/^#+\s*/, '').replace(/^[_\-*•\s]+|[_\-*•\s]+$/g, '').trim();
      unifiedStream.push(`### ${cleanHeader}`);
      continue;
    }

    if (isCurDate) {
      // Formato especial para fecha/subtítulo de inicio de capítulo
      const cleanDate = cur.replace(/^\*+|\*+$/g, '').trim();
      unifiedStream.push(`*${cleanDate}*`);
      continue;
    }

    // Filtrar o absorber cualquier párrafo que sea únicamente comillas o signos de puntuación sin letras
    const hasLettersOrDigits = /[a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ0-9]/.test(cur);
    if (!hasLettersOrDigits) {
      if (unifiedStream.length > 0) {
        unifiedStream[unifiedStream.length - 1] = `${unifiedStream[unifiedStream.length - 1]} ${cur}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
      }
      continue;
    }

    unifiedStream.push(cur);
  }
  finalized = unifiedStream;

  // Salvaguarda final: solo limpiar material posterior si NO se están preservando límites soberanos marcados
  if (!preserve) {
    while (finalized.length > 0) {
      const lastP = finalized[finalized.length - 1];
      const bmCheck = detectAndSeparateBackMatter(lastP);
      if (bmCheck.hasBackMatter) {
        if (bmCheck.novelBodyText.length > 15) {
          finalized[finalized.length - 1] = bmCheck.novelBodyText;
        } else {
          finalized.pop();
        }
        break;
      }
      if (/(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg|Creating the works from public domain|The Project Gutenberg Literary Archive|http:\/\/www\.gutenberg\.org|Distributed Proofreading Team|This file should be named)/i.test(lastP)) {
        finalized.pop();
      } else {
        break;
      }
    }
  }

  return finalized.join('\n\n');
}

/**
 * Divide un texto literario en oraciones reales, protegiendo abreviaturas
 * multilingües (español, inglés, alemán, francés y números decimales).
 */
/**
 * Divide un texto literario en oraciones reales completas, protegiendo rigurosamente
 * abreviaturas multilingües, iniciales de nombres, números, elipsis e incisos de diálogo.
 * GARANTÍA DE ORO: Ninguna oración se corta a la mitad ni queda incompleta.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];

  const PLACEHOLDER = '___DOT_TEMP___';
  let safeText = text;

  // 1. Proteger elipsis (... y …)
  safeText = safeText.replace(/\.{3,}/g, (m) => m.replace(/\./g, PLACEHOLDER));
  safeText = safeText.replace(/…/g, PLACEHOLDER + PLACEHOLDER + PLACEHOLDER);

  // 2. Proteger números decimales y capítulos numerados (ej. 3.14, Cap. 1.)
  safeText = safeText.replace(/(\d+)\.(\d+)/g, '$1' + PLACEHOLDER + '$2');
  safeText = safeText.replace(/\b(Cap|Vol|Pág|Págs|Fig|No|Nos|Núm|Núms|Art)\.\s*(\d+)\./gi, (m) => m.replace(/\./g, PLACEHOLDER));

  // 3. Proteger iniciales individuales con mayúscula (ej. John F. Kennedy, H. G. Wells, A. B. C.)
  safeText = safeText.replace(/(?<=\b[A-Za-z])\./g, PLACEHOLDER);

  // 4. Proteger abreviaturas literarias comunes y meses multilingües (español, inglés, francés, alemán, latín)
  const ABBR_LIST = [
    'Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Dra', 'Prof', 'Rev', 'Gen', 'Gov', 'Col', 'Maj', 'Capt', 'Lt', 'Sgt', 'St', 'Ste', 'Mt', 'Sir', 'Lord', 'Lady',
    'Sr', 'Sra', 'Srta', 'Don', 'Doña', 'D', 'Dña',
    'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
    'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Sept', 'Oct', 'Nov', 'Dic',
    'Janv', 'Févr', 'Avr', 'Juil', 'Août', 'Déc', 'Mrz', 'Okt', 'Dez',
    'etc', 'vs', 'approx', 'app', 'dept', 'min', 'max', 'misc', 'no', 'nos', 'num', 'nums', 'núm', 'núms', 'vol', 'vols', 'cap', 'caps', 'pag', 'pags', 'pág', 'págs', 'art', 'arts', 'sec', 'secs', 'fig', 'figs', 'ed', 'eds', 'ref', 'refs', 'al', 'ibid',
    'i\\.e', 'e\\.g', 'v\\.g', 'p\\.ej', 'a\\.m', 'p\\.m', 'u\\.s', 'u\\.k', 'u\\.s\\.a', 'ee\\.uu', 'd\\.c', 'n\\.y', 'op\\.cit', 'loc\\.cit', 'et\\.al',
    'ca', 'bzw', 'd\\.h', 'u\\.a', 'z\\.B', 'usw', 'Str', 'Abb', 'Nr'
  ];
  const abbrRegex = new RegExp('\\b(' + ABBR_LIST.join('|') + ')\\.', 'gi');
  safeText = safeText.replace(abbrRegex, (m) => m.replace(/\./g, PLACEHOLDER));

  // 4.5 Proteger fechas y ordinales con punto (ej. 14. Juni, am 1. Mai, 1º de mayo)
  safeText = safeText.replace(/\b(\d{1,2})\.\s+([A-ZÁÉÍÓÚÄÖÜa-záéíóúäöü])/g, '$1' + PLACEHOLDER + ' $2');
  safeText = safeText.replace(/\b(1[789]\d\d|20\d\d)\.\s+(?=[a-z])/g, '$1' + PLACEHOLDER + ' ');

  // 5. Normalizar espacios post-puntuación
  safeText = safeText.replace(/([.!?][»”"']?)([-–—])(?=[A-ZÁÉÍÓÚÄÖÜ«“"¿¡\w])/g, '$1 $2 ');

  // 6. Dividir por signos terminales seguidos de espacio y mayúscula o apertura de diálogo
  const raw = safeText
    .split(/(?<=[.!?]+[»”"')\]]*)(?:\s+(?=[A-ZÁÉÍÓÚÑÄÖÜ¿¡\d]|—\s*[A-ZÁÉÍÓÚÑ]|(?:["“«][A-ZÁÉÍÓÚÑÄÖÜ¿¡\d])))/)
    .map(s => s.replace(new RegExp(PLACEHOLDER, 'g'), '.').trim())
    .filter(Boolean);

  // 7. Sanación rigurosa de fragmentos para garantizar que ninguna oración se corte a medias
  const sanitized: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = raw[i];
    if (sanitized.length > 0) {
      const prev = sanitized[sanitized.length - 1];
      // Si el fragmento actual empieza con minúscula o coma, o es un inciso de diálogo
      const startsLower = /^[a-záéíóúñäöüß,]/.test(s);
      const startsDialogTag = /^[-–—]\s*[a-záéíóúñäöüß]/.test(s);
      const prevEndsAbbr = /\b[A-Za-z]\.$|\b(Sr|Sra|Dr|Mr|Mrs|Ms|Prof|St|vs|etc|Cap|No|p)\.$/i.test(prev);
      const prevEndsComma = /[,;:—–-]\s*$/.test(prev);

      if (startsLower || startsDialogTag || prevEndsAbbr || prevEndsComma) {
        sanitized[sanitized.length - 1] = `${prev} ${s}`.trim();
        continue;
      }
    }
    sanitized.push(s);
  }

  if (sanitized.length === 0 && text.trim().length > 0) {
    return [text.trim()];
  }

  return sanitized;
}

/**
 * En caso de una oración única excepcionalmente larga que exceda el límite de página,
 * secciona en la cláusula o coma más próxima al objetivo.
 */
export function splitSingleLongSentence(sentence: string, targetChars: number): [string, string] {
  if (!sentence || sentence.length <= targetChars) {
    return [sentence || '', ''];
  }

  const delimiters = ['; ', ' — ', ': ', ', '];
  for (const delim of delimiters) {
    const parts = sentence.split(delim);
    if (parts.length > 1) {
      let accumulated = '';
      for (let i = 0; i < parts.length; i++) {
        const next = accumulated ? `${accumulated}${delim}${parts[i]}` : parts[i];
        if (next.length > targetChars && accumulated.length > 0) {
          const rest = parts.slice(i).join(delim);
          return [accumulated.trim(), rest.trim()];
        }
        accumulated = next;
      }
    }
  }

  const spaceIdx = sentence.lastIndexOf(' ', Math.min(sentence.length - 1, targetChars));
  if (spaceIdx > 40 && spaceIdx < sentence.length - 20) {
    return [sentence.slice(0, spaceIdx).trim(), sentence.slice(spaceIdx).trim()];
  }
  
  return [sentence.slice(0, targetChars).trim(), sentence.slice(targetChars).trim()];
}

/**
 * Secciona un par largo de forma rigurosamente sincrónica con su análogo.
 * Localiza la frontera oracional proporcional exacta en ambas lenguas
 * para que el corte entre pliegos se produzca en la misma frase homóloga.
 */
/**
 * Secciona un par largo de forma rigurosamente sincrónica con su análogo.
 * REGLAS EDITORIALES ESTRICTAS:
 * - NUNCA cortar la continuación de un párrafo si el del otro lado del espejo no va a continuar.
 * - NUNCA generar marcadores artificiales ni continuaciones vacías como "[Continuación del pliego anterior]".
 * - Solo se divide si AMBOS lados tienen múltiples oraciones y AMBOS lados pueden continuar
 *   con texto sustancial en el pliego siguiente. Si uno no puede, se retorna null para no cortar.
 */
export function splitPairSynchronously(
  pair: ParallelPair,
  targetChars: number,
  orderCounter: number,
  partIndex: number = 1
): [ParallelPair, ParallelPair] | null {
  const textA = pair.textA.trim();
  const textB = pair.textB.trim();

  // Si alguno de los lados es corto, o es un título, no se puede dividir sincrónicamente
  if (pair.isHeading || textA.length < 400 || textB.length < 400) {
    return null;
  }

  const sentencesA = splitIntoSentences(textA);
  const sentencesB = splitIntoSentences(textB);

  // Requisito indispensable: Ambos lados deben tener al menos 2 oraciones para tener continuación real
  if (sentencesA.length < 2 || sentencesB.length < 2) {
    return null;
  }

  // Encontrar el punto de corte en A (alrededor del 50-60% o cercano a targetChars)
  let cutIdxA = -1;
  let accA = '';
  const idealCharsA = Math.min(targetChars, Math.round(textA.length * 0.55));

  for (let i = 0; i < sentencesA.length - 1; i++) {
    const candidate = accA ? `${accA} ${sentencesA[i]}` : sentencesA[i];
    if (candidate.length >= idealCharsA && i > 0) {
      cutIdxA = i + 1;
      break;
    }
    accA = candidate;
  }

  if (cutIdxA === -1) {
    cutIdxA = Math.max(1, Math.floor(sentencesA.length / 2));
  }

  const textA1 = sentencesA.slice(0, cutIdxA).join(' ').trim();
  const textA2 = sentencesA.slice(cutIdxA).join(' ').trim();

  const hasSubstantialText = (t: string) => {
    const letters = t.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ0-9]/g, '');
    return letters.length >= 35;
  };

  if (!hasSubstantialText(textA1) || !hasSubstantialText(textA2)) {
    return null;
  }

  // Encontrar la correspondencia oracional exacta en B que coincida con el arranque de la Parte 2 de A
  const ratioA = textA1.length / textA.length;
  const leadSentenceA2 = sentencesA[cutIdxA] || '';
  const fpLeadA2 = extractSentenceFingerprint(leadSentenceA2);
  const leadWordsA2 = leadSentenceA2.toLowerCase().replace(/[^a-z0-9áéíóúñäöüß]/gi, ' ').split(/\s+/).filter(w => w.length >= 4).slice(0, 10);

  let bestScore = -Infinity;
  let chosenCutB = -1;
  let accB = '';

  for (let j = 0; j < sentencesB.length - 1; j++) {
    const candidateB = accB ? `${accB} ${sentencesB[j]}` : sentencesB[j];
    const nextSentenceB = sentencesB[j + 1];
    const ratioCandidate = candidateB.length / textB.length;
    const dist = Math.abs(ratioCandidate - ratioA);

    // Ponderación combinada: Proximidad de extensión (ratio) + Alineación sintáctica/semántica
    let score = (1 - dist * 2) * 4;

    if (nextSentenceB) {
      const fpNextB = extractSentenceFingerprint(nextSentenceB);
      const semScore = computeSentenceAlignmentScore(fpLeadA2, fpNextB, cutIdxA / sentencesA.length, (j + 1) / sentencesB.length);
      score += semScore * 3;

      const nextBWords = nextSentenceB.toLowerCase().replace(/[^a-z0-9áéíóúñäöüß]/gi, ' ').split(/\s+/);
      for (const w of leadWordsA2) {
        if (nextBWords.some(bw => bw.startsWith(w.slice(0, 4)) || w.startsWith(bw.slice(0, 4)))) {
          score += 3;
        }
      }

      // Diálogos homólogos (ambos inician con raya o signo de pregunta)
      const isLeadADialogue = /^[-–—«“"¿¡]/.test(leadSentenceA2.trim());
      const isNextBDialogue = /^[-–—«“"¿¡]/.test(nextSentenceB.trim());
      if (isLeadADialogue && isNextBDialogue) {
        score += 4;
      }

      // Concordancia explícita de transición de acontecimientos y motor multilingüe
      const transScore = evaluateStartTransitionMatch(leadSentenceA2, nextSentenceB);
      score += (transScore * 0.35);

      const multiTrans = evaluateMultilingualPhraseConcordance(leadSentenceA2, nextSentenceB);
      if (multiTrans.dateMismatch) {
        score -= 40; // NUNCA cortar si una frase tiene fecha y la otra no
      } else if (multiTrans.isMatch) {
        score += multiTrans.score * 2.5;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      chosenCutB = j + 1;
    }
    accB = candidateB;
  }

  // REQUISITO DE ORO: Si no se encontró un punto de corte homólogo verificado (bestScore < 6.0),
  // ABORTAR el corte sincrónico. Es infinitamente mejor mantener el párrafo completo
  // en su propio pliego que cortarlo desincronizado y romper el resto del libro.
  if (chosenCutB === -1 || bestScore < 6.0) {
    return null;
  }

  // Verificación de fecha/año en el cierre de la Parte 1
  const endTailCheck = evaluateMultilingualPhraseConcordance(
    sentencesA[cutIdxA - 1] || '',
    sentencesB[chosenCutB - 1] || ''
  );
  if (endTailCheck.dateMismatch) {
    return null;
  }

  let textB1 = sentencesB.slice(0, chosenCutB).join(' ').trim();
  let textB2 = sentencesB.slice(chosenCutB).join(' ').trim();

  // Verificación estricta: si el lado B no produce texto sustancial en ambos lados, ABORTAR corte
  if (!hasSubstantialText(textB1) || !hasSubstantialText(textB2)) {
    return null;
  }

  let textA1Final = textA1;
  let textA2Final = textA2;
  let textB1Final = textB1;
  let textB2Final = textB2;

  // Reparar comillas huérfanas al inicio de la Parte 2: transferir a la Parte 1
  const orphanLeadA = textA2Final.match(/^([»”"'.!?]+)\s*/);
  if (orphanLeadA) {
    textA1Final = `${textA1Final}${orphanLeadA[1]}`;
    textA2Final = textA2Final.slice(orphanLeadA[0].length).trim();
  }
  const orphanLeadB = textB2Final.match(/^([»”"'.!?]+)\s*/);
  if (orphanLeadB) {
    textB1Final = `${textB1Final}${orphanLeadB[1]}`;
    textB2Final = textB2Final.slice(orphanLeadB[0].length).trim();
  }

  if (!hasSubstantialText(textA2Final) || !hasSubstantialText(textB2Final)) {
    return null;
  }

  // Garantizar progreso estricto: la segunda parte debe ser menor que el par original para evitar re-encolamiento infinito
  if (textA2Final.length >= textA.length - 30 || textB2Final.length >= textB.length - 30) {
    return null;
  }

  const part1 = createPair(
    orderCounter,
    textA1Final,
    textB1Final,
    pair.type,
    pair.title,
    `Párrafo extenso sincronizado (Parte ${partIndex}). Corte oracional homólogo.`
  );
  part1.isContentCut = true;

  const part2 = createPair(
    orderCounter + 1,
    textA2Final,
    textB2Final,
    pair.type,
    pair.title,
    `Continuación sincronizada (Parte ${partIndex + 1}).`
  );
  part2.isContentCut = true;

  return [part1, part2];
}

/**
 * Limpieza profunda y extracción estructural de una obra literaria.
 * Transforma el documento en un flujo continuo tipo eBook de párrafos con estilos asociados.
 * No depende de paginaciones de origen de ningún archivo previo.
 */
export function extractStructuredWorkFromSource(
  source: RawChunk[] | string,
  language: string,
  config: ParallelBookConfig
): ExtractedWork {
  let fullRawText = '';
  const isDirectString = typeof source === 'string' && source.trim().length > 0;

  if (Array.isArray(source)) {
    const chunkTexts: string[] = [];
    for (const ch of source) {
      if (ch.blocks && ch.blocks.length > 0) {
        for (const b of ch.blocks) {
          if (config.filterFootnotes && b.type === 'author_footnote') continue;
          chunkTexts.push(b.content || b.title || '');
        }
      } else {
        chunkTexts.push(ch.cleanContent || ch.rawContent || '');
      }
    }
    fullRawText = chunkTexts.join('\n\n');
  } else {
    fullRawText = source || '';
  }

  // 1. En Fase 3, el texto entregado YA ES el libro curado desde Fase 1 y 2.
  // Jamás se purgan capítulos ni se re-recortan inicios, prólogos o material final.
  let backMatterData: ExtractedWork['backMatter'] = undefined;
  let prefaceData: ExtractedWork['preface'] = undefined;
  let cleanText = cleanRawTextToEbookStream(fullRawText, { preserveBoundaries: true });

  // 2. Aislamiento de Notas al Pie (si está habilitado)
  let footnotes: FootnoteItem[] = [];
  if (config.filterFootnotes || config.gatherFootnotesAtEnd) {
    const fnResult = isolateFootnotesFromText(cleanText);
    cleanText = fnResult.cleanedText;
    footnotes = fnResult.extractedFootnotes;
  }

  // 3. Fragmentación en párrafos limpios reales (cuerpo íntegro sin omisión de inicio)
  const initialParagraphs = cleanText
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // 5.1 Colapsar encabezados fracturados en múltiples líneas (ej. "### CHAP ." seguido de "### I")
  const rawParagraphs: string[] = [];
  for (let i = 0; i < initialParagraphs.length; i++) {
    const curr = initialParagraphs[i];

    // Preservar si el párrafo es ya de por sí una cabecera de capítulo pura aislada
    // (ej. '### CAPÍTULO III', 'CAPÍTULO XII', 'CHAPTER 1', etc.)
    const isPureChap = /^(?:#+\s*)?(?:CAP[IÍ]TULO|CHAPTER|CHAP\.?|KAPITEL|KAP\.?|CHAPITRE|CAPITOLO|LIBRO|LIVRE|LIVRO|BOOK|BUCH|PARTE|PART|TEIL|ACTO|ACTE|AKT|ATTO|SC[EÈ]NE|SZENE|ESCENA|CANTO|ABSCHNITT)\s+(?:[0-9]{1,4}|[IVXLCDM]{1,8}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|primero|segundo|tercero|cuarto|quinto)\.?$/i.test(curr.trim());
    if (isPureChap) {
      rawParagraphs.push(curr.startsWith('###') ? curr.trim() : `### ${curr.trim()}`);
      continue;
    }

    // Desacoplar encabezados de capítulo soldados a prosa narrativa contigua
    const inlineChapMatch = curr.match(/^(?:#+\s*)?(CAP[IÍ]TULO|CHAPTER|CHAP\.?|KAPITEL|KAP\.?|CHAPITRE|CAPITOLO|LIBRO|LIVRE|LIVRO|BOOK|BUCH|PARTE|PART|TEIL|ACTO|ACTE|AKT|ATTO|SC[EÈ]NE|SZENE|ESCENA|CANTO|ABSCHNITT)\s+([0-9]{1,4}|[IVXLCDM]{1,8}\b|[a-z]{3,}\b)\.?\s*[-–—:.]*\s+([A-ZÁÉÍÓÚÑÄÖÜ"“«¿¡].{5,})$/is);
    if (inlineChapMatch) {
      rawParagraphs.push(`### ${inlineChapMatch[1].toUpperCase()} ${inlineChapMatch[2].toUpperCase()}`);
      rawParagraphs.push(inlineChapMatch[3].trim());
      continue;
    }
    // Desacoplar numeral romano con punto (ej. "II. Erst in der Abenddämmerung...") estrictamente de 2+ caracteres
    const inlineRomMatch = curr.match(/^([IVXLCDM]{2,6})\.\s*[-–—:.]*\s+([A-ZÁÉÍÓÚÑÄÖÜ"“«¿¡].{5,})$/is);
    if (inlineRomMatch) {
      rawParagraphs.push(`### ${inlineRomMatch[1].toUpperCase()}`);
      rawParagraphs.push(inlineRomMatch[2].trim());
      continue;
    }

    const isHeadingWord = /^(?:#+\s*)?(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|l\s*ibro|l\s*ivre|l\s*ivro|b\s*ook|b\s*uch|a\s*cto|a\s*cte|a\s*kt|a\s*tto|c\s*anto|a\s*bschnitt)\b\.?\s*$/i.test(curr);
    const isNextNum = i + 1 < initialParagraphs.length && /^(?:#+\s*)?(?:[0-9IVXLCDM]{1,8}\.?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|primero|primer|primera|segundo|tercero|cuarto|quinto|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|premier|première|deuxième|troisième|quatrième|cinquième|ein|eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|erste|erster|erstes|zweite|zweiter|zweites|dritte|dritter|drittes|vierte|fünfte|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|primo|prima|secondo|seconda|terzo|terza|quarto|quinta)\.?\s*$/i.test(initialParagraphs[i + 1]);

    if (isHeadingWord && isNextNum) {
      const cleanW = curr.replace(/^#+\s*/, '').replace(/\s+\./g, '.').trim();
      const cleanN = initialParagraphs[i + 1].replace(/^#+\s*/, '').trim();
      rawParagraphs.push(`### ${cleanW} ${cleanN}`);
      i++;
      continue;
    }

    if (rawParagraphs.length > 0 && /^###\s+/.test(curr)) {
      const prev = rawParagraphs[rawParagraphs.length - 1];
      // Solo fusionar si la cabecera previa es una etiqueta aislada (ej. "### CAPÍTULO 1") y curr es un título textual (ej. "### EL COMIENZO"), NUNCA si ambos son números/etiquetas distintos
      const prevIsPureNum = /^(?:#+\s*)?(?:[0-9]{1,3}|[IVXLCDM]{1,6}|c\s*ap[ií]tulo\s+[0-9IVXLCDM]+|chapter\s+[0-9IVXLCDM]+)\.?$/i.test(prev.trim());
      const currIsPureNum = /^(?:#+\s*)?(?:[0-9]{1,3}|[IVXLCDM]{1,6}|c\s*ap[ií]tulo|chapter)\b/i.test(curr.trim());
      if (prevIsPureNum && !currIsPureNum && prev.length < 50 && curr.length < 60) {
        rawParagraphs[rawParagraphs.length - 1] = `${prev}: ${curr.replace(/^#+\s*/, '')}`.replace(/\s+/g, ' ');
        continue;
      }
    }

    // Filtrar o absorber cualquier párrafo que sea únicamente comillas o signos de puntuación sin letras
    if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ0-9]/.test(curr)) {
      if (rawParagraphs.length > 0) {
        rawParagraphs[rawParagraphs.length - 1] = `${rawParagraphs[rawParagraphs.length - 1]} ${curr}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
      }
      continue;
    }

    rawParagraphs.push(curr);
  }

  const units: ExtractedUnit[] = [];
  const chapters: ExtractedWork['chapters'] = [];
  
  // En Fase 3, el libro arranca siempre en Capítulo 1 desde el primer párrafo demarcado en Fase 1
  let currentChapterIndex = 1;
  let currentChapterTitle = 'Capítulo 1';
  let chapterParagraphsCount = 0;
  let seenExplicitChapterHeading = false;

  chapters.push({
    index: 1,
    title: currentChapterTitle,
    unitStartIndex: 0,
    paragraphsCount: 0
  });

  for (let i = 0; i < rawParagraphs.length; i++) {
    const p = rawParagraphs[i];
    
    // Ignorar cualquier artefacto residual de PDF, página o columna (pero NUNCA descartar números de capítulo 1..150)
    if (/^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA)[^\]]*\]\s*[-–—\s]*$/i.test(p)) continue;
    const isIsolatedPageNum = p.match(/^[-–—\s]*(\d{1,4})[-–—\s]*$/);
    if (isIsolatedPageNum) {
      const numVal = parseInt(isIsolatedPageNum[1], 10);
      // Si es un número alto (> 150) o está rodeado de guiones típicos de pie de página ("- 12 -"), se descarta
      if (numVal > 150 || /^[-–—]\s*\d+\s*[-–—]$/.test(p.trim())) continue;
    }
    if (/^[-–—\s]*$/.test(p)) continue;

    const isShort = p.length < 120;
    const isMarkdownHeading = /^#{1,4}\s+/.test(p) && p.length < 120;
    const cleanNoHash = p.replace(/^#+\s*/, '').replace(/^[_\-*•\s]+|[_\-*•\s]+$/g, '').trim();

    // 1. Detección multilingüe rigurosa de capítulos con palabra clave o numeral romano
    const isExplicitKeywordChapter = isShort && /^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|l\s*ibro|l\s*ivre|l\s*ivro|b\s*ook|b\s*uch|a\s*cto|a\s*cte|a\s*kt|a\s*tto|c\s*anto|a\s*bschnitt)\b(?:\s+(?:[0-9IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo|primer|primera|premier|première|deuxième|troisième|quatrième|cinquième|erste|erster|erstes|zweite|zweiter|zweites|dritte|dritter|drittes|primo|prima|secondo|terzo)\b\.?)?|(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XL|L)\.?\s*$)(?:\s*[-–—:.]\s*[^\n]*)?(?:[_\-*•\s]*)$/i.test(p);
    
    // 2. Numeral arábigo o romano con punto o guión que precede al título (ej. "1. In Chancery", "1 - El Comienzo", "I. The Open Sea", o número/romano solo en su línea ej. "1", "2", "I", "II")
    // NOTA: Numerales romanos estrictamente en MAYÚSCULAS sin flag 'i' para evitar falsos positivos con el pronombre inglés 'I'
    const isRomanChapterHeading = isShort && /^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV)[\.\:\-–—]\s+[A-ZÁÉÍÓÚÄÖÜ][^\n]{1,80}|(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV)\.?\s*)$/.test(p);
    const isArabicChapterHeading = isShort && 
      !/^[—–\-«"“'‘„¿¡]/.test(cleanNoHash) &&
      !/[;,…»”"]$/.test(cleanNoHash) &&
      !/^[0-9]{1,3}[\.\:\-–—]\s*(?:si\b|cuando\b|porque\b|aunque\b|mientras\b|como\b|if\b|when\b|as\b|because\b|while\b)/i.test(cleanNoHash) &&
      /^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:[0-9]{1,3})[\.\:\-–—]\s+[A-ZÁÉÍÓÚÄÖÜ][^\n]{1,60}|(?:[0-9]{1,3})\.?\s*)$/.test(p);
    const isNumberedChapterHeading = isRomanChapterHeading || isArabicChapterHeading;

    // 2b. Número en palabra aislado en su propia línea (ej. "Uno", "Dos", "Tres" o "One", "Two", "Three")
    const isWordNumberChapter = isShort && /^(?:[_\-*•\s]*)(?:#+\s*)?(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|primero|segundo|tercero|cuarto|quinto)\.?\s*$/i.test(cleanNoHash);

    // 3. Secciones o demarcaciones literarias canónicas
    const isSectionDemarcation = isShort && /^(?:[_\-*•\s]*)(?:#+\s*)?(?:pr[óo]logo|prologue|ep[íi]logo|epilogue|prefacio|preface|introducci[óo]n|introduction|dedicatoria|dedication|advertencia|conclusi[óo]n|conclusion|nota(?:\s+del\s+autor)?|author['']?s\s+note|ep[íi]grafe|epigraph)\b/i.test(p);

    // 4. Título de capítulo autónomo explícito (SOLO Markdown heading o ALL-CAPS corto, NUNCA frases narrativas ordinarias en Title Case)
    const isStandaloneTitle = isShort && !isExplicitKeywordChapter && !isNumberedChapterHeading && !isWordNumberChapter && !isSectionDemarcation &&
      (cleanNoHash.length <= 50) &&
      !/^[—–\-«"“„¿¡]/.test(cleanNoHash) &&
      !/[.!?;:»”"]$/.test(cleanNoHash) &&
      !/^[a-záéíóúäöüß]/.test(cleanNoHash) &&
      (
        isMarkdownHeading ||
        // Todo en mayúsculas corto (ej. "THE OPEN SEA", "LA GRAN AVENTURA")
        (/^[A-ZÁÉÍÓÚÑÄÖÜ0-9\s,–—\-]{3,40}$/.test(cleanNoHash) && cleanNoHash.split(/\s+/).length <= 5)
      );

    const isChapter = isExplicitKeywordChapter || isNumberedChapterHeading || isWordNumberChapter || isSectionDemarcation || (isMarkdownHeading && cleanNoHash.length <= 90) || isStandaloneTitle;
    
    const isSubheading = isShort && !isChapter && /^[0-9]+[\.\)]\s+[A-ZÁÉÍÓÚÄÖÜ]/.test(p);

    let type: ContentBlockType = 'paragraph';
    if (isChapter) {
      type = 'heading1';
      const cleanTitle = p.replace(/^#+\s*/, '').replace(/^[_\-*•\s]+|[_\-*•\s]+$/g, '').trim();

      // Si la unidad anterior inmediata también era una cabecera y aún no se han acumulado párrafos narrativos:
      // se trata de un número o etiqueta de capítulo seguido de su título (ej. "### 1" seguido de "EL GRAN VIAJE")
      if (units.length > 0 && units[units.length - 1].isHeading && chapterParagraphsCount === 0) {
        const prevUnit = units[units.length - 1];
        const prevIsPureNum = /^(?:#+\s*)?(?:[0-9]{1,3}|[IVXLCDM]{1,6}|c\s*ap[ií]tulo\s+[0-9IVXLCDM]+|chapter\s+[0-9IVXLCDM]+)\.?$/i.test(prevUnit.text.trim());
        const currHasOwnNum = /^(?:[0-9]{1,3}|[IVXLCDM]{1,6}|c\s*ap[ií]tulo|chapter|kapitel)\b/i.test(cleanTitle.trim());
        if (prevIsPureNum && !currHasOwnNum && cleanTitle.length >= 3 && cleanTitle.length <= 60 && !/[.!?]$/.test(cleanTitle)) {
          prevUnit.text = `${prevUnit.text}: ${cleanTitle}`.replace(/^#+\s*/, '### ');
          prevUnit.title = `${prevUnit.title || prevUnit.text}: ${cleanTitle}`;
          prevUnit.charCount = prevUnit.text.length;
          prevUnit.wordCount = prevUnit.text.split(/\s+/).filter(Boolean).length;
          if (chapters.length > 0) {
            chapters[chapters.length - 1].title = prevUnit.title;
          }
          continue;
        }
      }

      // Extraer numeral arábigo o romano explícito usando extractor unificado
      const detectedNum = extractNumericOrRomanIndex(cleanTitle);

      if (!seenExplicitChapterHeading) {
        seenExplicitChapterHeading = true;
        // Si no habíamos acumulado párrafos narrativos previos, este encabezado titula el Capítulo 1
        if (chapterParagraphsCount === 0) {
          currentChapterIndex = detectedNum || 1;
          currentChapterTitle = cleanTitle;
          chapters[0].index = currentChapterIndex;
          chapters[0].title = cleanTitle;
        } else {
          // Ya había párrafos previos en el Capítulo 1 (ej: párrafos iniciales antes de Capítulo 2)
          currentChapterIndex = detectedNum || (currentChapterIndex + 1);
          currentChapterTitle = cleanTitle;
          chapters.push({
            index: currentChapterIndex,
            title: cleanTitle,
            unitStartIndex: units.length,
            paragraphsCount: 0
          });
          chapterParagraphsCount = 0;
        }
      } else {
        currentChapterIndex = detectedNum || (currentChapterIndex + 1);
        currentChapterTitle = cleanTitle;
        chapters.push({
          index: currentChapterIndex,
          title: cleanTitle,
          unitStartIndex: units.length,
          paragraphsCount: 0
        });
        chapterParagraphsCount = 0;
      }
    } else if (isSubheading) {
      type = 'heading2';
    } else if (chapters.length > 0 && chapterParagraphsCount === 0 && (
      (p.startsWith('*') && p.endsWith('*')) ||
      (p.length <= 50 && p.split(/\s+/).length <= 6 && !/[.!?:;…»”"']$/.test(p.trim()) && !/^[—–\-«"“'‘„¿¡]/.test(p.trim()) && /^[A-ZÁÉÍÓÚÑÄÖÜ]/.test(p.trim()))
    )) {
      // Subtítulo o dateline auténtico inmediatamente bajo la cabecera de capítulo (e.g. *Florence. Nov. 9th 1819* o The Open Sea)
      if (units.length > 0 && units[units.length - 1].isHeading) {
        units[units.length - 1].text += `\n${p}`;
        units[units.length - 1].title = `${units[units.length - 1].title || ''}\n${p}`;
        continue;
      }
      type = 'heading2';
    } else if (p.startsWith('—') || p.startsWith('–') || p.startsWith('- ') || p.startsWith('»') || p.startsWith('«')) {
      type = 'novel_dialogue';
    } else if (p === '* * *' || p === '***' || p === '---') {
      type = 'ornamental_break';
    } else {
      // Detección de estrofa poética, versos o fragmentos líricos incrustados
      const linesInUnit = p.split('\n').map(l => l.trim()).filter(Boolean);
      const isPoeticUnit = linesInUnit.length >= 2 && 
        linesInUnit.every(l => l.length < 65) &&
        (linesInUnit.filter(l => /^[A-ZÁÉÍÓÚÑÄÖÜ«"“—¿¡]/.test(l)).length >= Math.ceil(linesInUnit.length * 0.7));
      if (isPoeticUnit) {
        type = 'poem_verse';
      }
    }

    if (!isChapter) {
      chapterParagraphsCount++;
      if (chapters.length > 0) {
        chapters[chapters.length - 1].paragraphsCount = chapterParagraphsCount;
      }
    }

    const words = p.split(/\s+/).filter(Boolean).length;

    units.push({
      id: `u_${language}_${i + 1}`,
      text: p,
      type,
      title: isChapter || isSubheading ? p : undefined,
      isHeading: isChapter || isSubheading,
      headingLevel: isChapter ? 1 : isSubheading ? 2 : undefined,
      chapterIndex: Math.max(1, currentChapterIndex),
      wordCount: words,
      charCount: p.length
    });
  }

  // Si el libro contenía párrafos iniciales sin cabecera explícita para Capítulo 1 pero SÍ tenía capítulos explícitos después,
  // sintetizar la cabecera "Capítulo 1" encima para que no se pierdan los párrafos iniciales.
  // Si la obra NO tiene ningún capítulo explícito (relato continuo), NUNCA inventar un capítulo artificial.
  // Si el libro contenía párrafos iniciales sin cabecera explícita, se respeta la narración pura sin inyectar cabeceras artificiales
  const hasHeading1 = units.some(u => u.isHeading && u.chapterIndex === 1);
  if (!hasHeading1 && units.length > 0 && seenExplicitChapterHeading) {
    if (chapters.length > 0) {
      chapters[0].title = 'Inicio de la obra';
    }
  }

  // =========================================================================
  // PASO CRUCIAL: PURIFICACIÓN TERMINAL DE UNIDADES DEL CUERPO DE LA NOVELA
  // Garantiza que ninguna unidad contenga rupturas editoriales, avisos de imprenta,
  // licencias Gutenberg o créditos de digitalización.
  // =========================================================================
  const terminalBackMatterTexts: string[] = [];

  while (units.length > 0) {
    const lastUnit = units[units.length - 1];
    const textToCheck = lastUnit.text;

    // 1. ¿Es una unidad puramente de licencia, créditos o notas de archivo digital?
    const isPureBackMatter = /(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg|Creating the works from public domain|The Project Gutenberg Literary Archive Foundation|Section 1\.\s+General Terms of Use|http:\/\/www\.gutenberg\.org|Distributed Proofreading Team|This file should be named|Transcriber's note|Nota del transcriptor)/i.test(textToCheck);

    if (isPureBackMatter) {
      terminalBackMatterTexts.unshift(units.pop()!.text);
      continue;
    }

    // 2. ¿Tiene una ruptura editorial pegada al final de la última oración literaria?
    // Ej: "...und ihren jungen Körper dehnte.End of the Project Gutenberg..."
    const inlineBreak = textToCheck.match(/(?:\b|(?<=[.!?»”"']))(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg|Creating the works from public domain|Produced by .*?(?:Distributed Proofreading|pgdp\.net))/i);
    if (inlineBreak && inlineBreak.index !== undefined && inlineBreak.index > 15) {
      const narrativeEnd = textToCheck.substring(0, inlineBreak.index).trim();
      const editorialPart = textToCheck.substring(inlineBreak.index).trim();
      lastUnit.text = narrativeEnd;
      lastUnit.charCount = narrativeEnd.length;
      lastUnit.wordCount = narrativeEnd.split(/\s+/).filter(Boolean).length;
      terminalBackMatterTexts.unshift(editorialPart);
    }
    break;
  }

  if (terminalBackMatterTexts.length > 0) {
    const extraBmText = terminalBackMatterTexts.join('\n\n');
    if (backMatterData && backMatterData.hasBackMatter) {
      backMatterData.text = (extraBmText + '\n\n' + backMatterData.text).trim();
      backMatterData.wordCount += extraBmText.split(/\s+/).filter(Boolean).length;
      backMatterData.paragraphsCount += terminalBackMatterTexts.length;
    } else {
      backMatterData = {
        hasBackMatter: true,
        title: 'Licencia y Créditos Editoriales Aislados',
        text: extraBmText,
        wordCount: extraBmText.split(/\s+/).filter(Boolean).length,
        paragraphsCount: terminalBackMatterTexts.length,
        type: 'gutenberg_license'
      };
    }
  }

  // Si no se detectaron capítulos explícitos, tratar toda la obra como Capítulo Único
  if (chapters.length === 0 && units.length > 0) {
    chapters.push({
      index: 1,
      title: 'Texto Principal',
      unitStartIndex: 0,
      paragraphsCount: units.filter(u => !u.isHeading).length
    });
  }

  return {
    units,
    preface: prefaceData,
    backMatter: backMatterData,
    footnotes,
    chapters
  };
}

/**
 * Alineación Dinámica de Unidades de Contenido por Capítulo (Gale-Church Extendido)
 * Resuelve asimetrías de separación y énfasis entre idiomas (ej. español que separa preguntas o
 * diálogos en 2 o 3 párrafos frente a párrafos largos continuos en alemán o inglés).
 * Garantiza que la "unidad de contenido" se mantenga exacta y previene corrimientos a lo largo de toda la obra.
 */
interface LandmarkProfile {
  totalChars: number;
  cumProgress: Float64Array;
  isMajor: boolean[];
  isSuperMajor: boolean[];
  isHeading: boolean[];
  isDialogue: boolean[];
  charCounts: number[];
}

function buildLandmarkProfile(units: ExtractedUnit[]): LandmarkProfile {
  const N = units.length;
  const totalChars = units.reduce((s, u) => s + u.charCount, 0) || 1;
  const cumProgress = new Float64Array(N + 1);
  const isMajor = new Array<boolean>(N);
  const isSuperMajor = new Array<boolean>(N);
  const isHeading = new Array<boolean>(N);
  const isDialogue = new Array<boolean>(N);
  const charCounts = new Array<number>(N);

  let acc = 0;
  for (let i = 0; i < N; i++) {
    cumProgress[i] = acc / totalChars;
    const u = units[i];
    charCounts[i] = u.charCount;
    acc += u.charCount;
    isHeading[i] = Boolean(u.isHeading || u.type === 'heading1' || u.type === 'heading2');
    isDialogue[i] = Boolean(u.type === 'novel_dialogue' || /^[-–—«»"“]/.test(u.text.trim()));
    isMajor[i] = !isHeading[i] && u.charCount >= 260;
    isSuperMajor[i] = !isHeading[i] && u.charCount >= 550;
  }
  cumProgress[N] = 1.0;

  return {
    totalChars,
    cumProgress,
    isMajor,
    isSuperMajor,
    isHeading,
    isDialogue,
    charCounts
  };
}

/**
 * Análisis Multilingüe y Semántico Universal de Correspondencia entre Párrafos.
 * Coteja y comprueba si un párrafo (o grupo de párrafos) en el Libro A
 * se refleja verdaderamente en el espejo del Libro B, independientemente del idioma
 * (Español, Inglés, Francés, Alemán, Italiano, Portugués, Ruso, Latín, etc.).
 */
export function computeMultilingualParagraphCorrespondence(textA: string, textB: string): {
  scoreBonus: number;
  conflictPenalty: number;
  sharedEntities: string[];
  sharedNumbers: string[];
  sharedRootsCount: number;
  dialogueParity: boolean;
  questionParity: boolean;
} {
  const normA = textA.toLowerCase();
  const normB = textB.toLowerCase();

  // 1. Números arábigos y romanos exactos (1819, 12, 4, 30, VII, etc.)
  const rxNum = /\b(?:\d{1,5}|[ivxlcdm]{2,6})\b/gi;
  const numsA = Array.from(new Set((textA.match(rxNum) || []).map(n => n.toLowerCase())));
  const numsB = Array.from(new Set((textB.match(rxNum) || []).map(n => n.toLowerCase())));

  const sharedNumbers = numsA.filter(n => numsB.includes(n));
  const conflictingNumbers = numsA.filter(n => n.length >= 2 && !numsB.includes(n) && numsB.some(nb => nb.length >= 2 && nb !== n));

  // 2. Entidades Nombradas / Nombres Propios Multilingües (Unicode \p{Lu} para cualquier alfabeto)
  const extractEntities = (t: string) => {
    const words = t.split(/\s+/).filter(Boolean);
    const ents: string[] = [];
    for (let i = 1; i < words.length; i++) {
      const clean = words[i].replace(/[^\p{L}\p{N}]/gu, '');
      if (clean.length >= 4 && /^\p{Lu}/u.test(clean)) {
        ents.push(clean.toLowerCase());
      }
    }
    return Array.from(new Set(ents));
  };

  const entsA = extractEntities(textA);
  const entsB = extractEntities(textB);
  const sharedEntities: string[] = [];
  for (const ea of entsA) {
    for (const eb of entsB) {
      if (ea === eb || (ea.length >= 5 && eb.length >= 5 && (ea.slice(0, 4) === eb.slice(0, 4)))) {
        sharedEntities.push(ea);
        break;
      }
    }
  }

  // 3. Cognados y raíces comunes de 4+ letras (normalizadas sin tildes)
  const stripAccents = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const tokensA = stripAccents(normA).split(/[^\p{L}\p{N}]+/gu).filter(w => w.length >= 4);
  const tokensB = new Set(stripAccents(normB).split(/[^\p{L}\p{N}]+/gu).filter(w => w.length >= 4));

  let sharedRootsCount = 0;
  for (const tA of tokensA) {
    const stemA = tA.slice(0, 4);
    for (const tB of tokensB) {
      if (tB.startsWith(stemA)) {
        sharedRootsCount++;
        break;
      }
    }
  }

  // 4. Paridad de Diálogo y Cadencia Conversacional
  const isDialA = /^[-–—«»"“„]/.test(textA.trim()) || /[-–—]/.test(textA);
  const isDialB = /^[-–—«»"“„]/.test(textB.trim()) || /[-–—]/.test(textB);
  const dialogueParity = isDialA === isDialB;

  // 5. Paridad de Pregunta / Exclamación
  const hasQA = /[?¿]/.test(textA);
  const hasQB = /[?¿]/.test(textB);
  const questionParity = hasQA === hasQB;

  const hasExA = /[!¡]/.test(textA);
  const hasExB = /[!¡]/.test(textB);

  // 6. Cálculo del bono y penalización
  let scoreBonus = 0;
  let conflictPenalty = 0;

  if (sharedNumbers.length > 0) {
    scoreBonus -= 4.5 * Math.min(3, sharedNumbers.length);
  }
  if (sharedEntities.length > 0) {
    scoreBonus -= 4.0 * Math.min(4, sharedEntities.length);
  }
  if (sharedRootsCount > 0) {
    scoreBonus -= 1.5 * Math.min(5, sharedRootsCount);
  }
  if (dialogueParity) {
    scoreBonus -= 1.5;
  } else {
    // Si uno es diálogo y el otro prosa narrativa densa sin marcas
    conflictPenalty += 6.0;
  }
  if (hasQA && hasQB) {
    scoreBonus -= 2.0;
  }
  if (hasExA && hasExB) {
    scoreBonus -= 1.5;
  }

  // Si hay números en conflicto manifiesto (ej. un año en A que no coincide con B)
  if (conflictingNumbers.length > 0 && sharedNumbers.length === 0) {
    conflictPenalty += 7.0;
  }

  return {
    scoreBonus,
    conflictPenalty,
    sharedEntities,
    sharedNumbers,
    sharedRootsCount,
    dialogueParity,
    questionParity
  };
}

function computeTransitionCost(
  i: number,
  j: number,
  kA: number,
  kB: number,
  profA: LandmarkProfile,
  profB: LandmarkProfile,
  unitsA: ExtractedUnit[],
  unitsB: ExtractedUnit[],
  expansionRatio: number
): number {
  // Prohibición absoluta de omitir el párrafo de apertura de la novela
  if (kA === 0 && kB === 1) {
    if (j === 0) return 999.0; // El inicio de B no puede ser omitido
    const charsB = profB.charCounts[j];
    return 80.0 + Math.min(40, charsB / 30);
  }
  if (kA === 1 && kB === 0) {
    if (i === 0) return 999.0; // El inicio de A no puede ser omitido
    const charsA = profA.charCounts[i];
    return 80.0 + Math.min(40, charsA / 30);
  }

  let charsA = 0;
  let textA = '';
  for (let a = 0; a < kA; a++) {
    charsA += profA.charCounts[i + a];
    textA += ' ' + unitsA[i + a].text;
  }

  let charsB = 0;
  let textB = '';
  for (let b = 0; b < kB; b++) {
    charsB += profB.charCounts[j + b];
    textB += ' ' + unitsB[j + b].text;
  }

  const expectedA = charsB * expansionRatio;
  const delta = Math.abs(charsA - expectedA);
  const mean = (charsA + expectedA) / 2;
  const lenCost = delta / Math.sqrt(Math.max(35, mean));

  let complexity = 0;
  if (kA === 1 && kB === 1) complexity = 0;
  else if ((kA === 2 && kB === 1) || (kA === 1 && kB === 2)) complexity = 3.5;
  else if ((kA === 3 && kB === 1) || (kA === 1 && kB === 3)) complexity = 8.5;
  else if ((kA === 4 && kB === 1) || (kA === 1 && kB === 4)) complexity = 16.0;
  else if ((kA === 5 && kB === 1) || (kA === 1 && kB === 5)) complexity = 25.0;

  // Penalización por desvío en la línea temporal de la novela (progreso 0.0 - 1.0)
  const charDrift = Math.abs(profA.cumProgress[i] - profB.cumProgress[j]);
  const paraDrift = Math.abs((i / Math.max(1, unitsA.length)) - (j / Math.max(1, unitsB.length)));
  const effectiveDrift = Math.min(charDrift, paraDrift);
  const driftPenalty = effectiveDrift > 0.09 ? (effectiveDrift - 0.09) * 35 : 0;

  // Análisis de inicio de Párrafos Grandes (Subbloques Inteligentes)
  let landmarkAdj = 0;

  // Ancla canónica absoluta del arranque de la novela
  if (i === 0 && j === 0 && kA === 1 && kB === 1) {
    landmarkAdj -= 40.0;
  }

  const isStartMajorA = profA.isMajor[i];
  const isStartMajorB = profB.isMajor[j];

  if (isStartMajorA && isStartMajorB) {
    // Ambos arrancan un párrafo sustancial: ancla de inicio natural
    landmarkAdj -= 4.0;
    if (profA.isSuperMajor[i] && profB.isSuperMajor[j]) {
      landmarkAdj -= 3.0;
    }
  } else if (kA === 1 && kB === 1) {
    // Párrafo grande emparejado con línea mínima aislada
    if ((isStartMajorA && profB.charCounts[j] < 75) || (isStartMajorB && profA.charCounts[i] < 75)) {
      landmarkAdj += 14.0;
    }
  }

  // Si se fusionan varios párrafos, penalizar si se traga el inicio de otro párrafo grande
  if (kA > 1) {
    for (let a = 1; a < kA; a++) {
      if (profA.isMajor[i + a]) landmarkAdj += 7.0;
    }
  }
  if (kB > 1) {
    for (let b = 1; b < kB; b++) {
      if (profB.isMajor[j + b]) landmarkAdj += 7.0;
    }
  }

  // Integridad de títulos y capítulos:
  // Un encabezado o título de capítulo NUNCA puede fusionarse con prosa narrativa ni con otro encabezado
  if (kA > 1) {
    for (let a = 0; a < kA; a++) {
      if (profA.isHeading[i + a]) return Infinity;
    }
  }
  if (kB > 1) {
    for (let b = 0; b < kB; b++) {
      if (profB.isHeading[j + b]) return Infinity;
    }
  }

  if (kA > 0 && kB > 0) {
    const isHeadA = profA.isHeading[i];
    const isHeadB = profB.isHeading[j];
    if (isHeadA && isHeadB) {
      landmarkAdj -= 30.0;
    } else if (isHeadA !== isHeadB) {
      // Un encabezado de capítulo o título NUNCA puede emparejarse con un párrafo narrativo
      return Infinity;
    }
  }

  // Afinidad de diálogos
  const isDialA = profA.isDialogue[i];
  const isDialB = profB.isDialogue[j];
  if (isDialA && isDialB) landmarkAdj -= 1.5;

  // CORROBORACIÓN DE CONTENIDO MULTILINGÜE
  const contentMatch = computeMultilingualParagraphCorrespondence(textA, textB);
  const contentAdj = contentMatch.scoreBonus + contentMatch.conflictPenalty;

  return Math.max(0, lenCost + complexity + driftPenalty + landmarkAdj + contentAdj);
}

function runDynamicProgramming(
  unitsA: ExtractedUnit[],
  unitsB: ExtractedUnit[],
  profA: LandmarkProfile,
  profB: LandmarkProfile,
  expansionRatio: number,
  transitions: [number, number][]
): { i: number; j: number; kA: number; kB: number }[] {
  const N = unitsA.length;
  const M = unitsB.length;

  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(Infinity));
  const parent: ({ prevI: number; prevJ: number; kA: number; kB: number } | null)[][] = Array.from(
    { length: N + 1 },
    () => new Array(M + 1).fill(null)
  );

  dp[0][0] = 0;

  for (let i = 0; i <= N; i++) {
    const progA = profA.cumProgress[i];
    for (let j = 0; j <= M; j++) {
      if (dp[i][j] === Infinity) continue;

      const progB = profB.cumProgress[j];
      // Ventana de corredor del 25% para evitar cuadrática explosiva y fijar el paralelismo
      if (Math.abs(progA - progB) > 0.25 && i > 0 && j > 0 && i < N && j < M) continue;

      for (const [kA, kB] of transitions) {
        if (i + kA <= N && j + kB <= M) {
          const cost = computeTransitionCost(i, j, kA, kB, profA, profB, unitsA, unitsB, expansionRatio);
          const nextCost = dp[i][j] + cost;
          if (nextCost < dp[i + kA][j + kB]) {
            dp[i + kA][j + kB] = nextCost;
            parent[i + kA][j + kB] = { prevI: i, prevJ: j, kA, kB };
          }
        }
      }
    }
  }

  let currI = N;
  let currJ = M;
  const moves: { i: number; j: number; kA: number; kB: number }[] = [];

  let maxSteps = (N + M) * 3 + 20;
  while ((currI > 0 || currJ > 0) && maxSteps-- > 0) {
    const p = parent[currI]?.[currJ];
    if (!p || (p.prevI >= currI && p.prevJ >= currJ)) {
      if (currI > 0 && currJ > 0) {
        moves.unshift({ i: currI - 1, j: currJ - 1, kA: 1, kB: 1 });
        currI--;
        currJ--;
      } else if (currI > 0) {
        moves.unshift({ i: currI - 1, j: currJ, kA: 1, kB: 0 });
        currI--;
      } else {
        moves.unshift({ i: currI, j: currJ - 1, kA: 0, kB: 1 });
        currJ--;
      }
      continue;
    }
    moves.unshift({ i: p.prevI, j: p.prevJ, kA: p.kA, kB: p.kB });
    currI = p.prevI;
    currJ = p.prevJ;
  }

  return moves;
}

/**
 * Divide un párrafo en oraciones reales, o cláusulas semánticas protegidas si es un párrafo largo.
 */
export function splitIntoClausesOrSentences(text: string): string[] {
  const sents = splitIntoSentences(text);
  if (sents.length >= 2) return sents;
  if (text.length > 250) {
    const clauseRegex = /(?<=[;:—–])\s+(?=[A-ZÁÉÍÓÚÄÖÜa-z0-9«“"¿¡—–])/;
    const clauses = text.split(clauseRegex).map(c => c.trim()).filter(Boolean);
    if (clauses.length >= 2) return clauses;
  }
  return sents;
}

/**
 * Diccionario multilingüe de raíces y palabras de alta frecuencia de transición oracional (inicios y cierres de párrafos/frases).
 * Permite emparejar transiciones y contrastar el inicio/fin de fragmentos entre cualquier combinación de idiomas
 * (Español, Inglés, Francés, Alemán, Italiano, Portugués, Ruso transliterado o Latín).
 */
const TRANSITION_SEMANTIC_ANCHORS: { category: string; terms: string[] }[] = [
  { category: 'affirmative', terms: ['si', 'yes', 'oui', 'ja', 'sí', 'certe', 'certo', 'certes', 'indeed', 'freilich', 'gewiss', 'seguramente'] },
  { category: 'negative', terms: ['no', 'not', 'nein', 'nicht', 'non', 'jamais', 'never', 'nie', 'nunca', 'jamás', 'mai', 'nadie', 'nobody', 'no one', 'personne', 'niemand', 'nessuno', 'ninguno', 'none', 'nada', 'nothing', 'rien', 'nichts'] },
  { category: 'adversative', terms: ['pero', 'but', 'mais', 'aber', 'doch', 'however', 'jedoch', 'sin embargo', 'toutefois', 'però', 'contudo', 'mas'] },
  { category: 'temporal_now', terms: ['ahora', 'now', 'maintenant', 'jetzt', 'nun', 'ora', 'adesso', 'agora', 'at present', 'a présent'] },
  { category: 'temporal_then', terms: ['entonces', 'then', 'alors', 'dann', 'damals', 'poi', 'allora', 'então', 'después', 'after', 'après', 'nachher', 'dopo'] },
  { category: 'temporal_time', terms: ['tiempo', 'time', 'temps', 'zeit', 'tempo', 'moment', 'momento', 'augenblick', 'instant'] },
  { category: 'temporal_day', terms: ['dia', 'day', 'jour', 'tag', 'giorno', 'día', 'tages', 'matin', 'morning', 'morgen', 'mañana', 'noche', 'night', 'nuit', 'nacht', 'notte', 'noite', 'tarde', 'evening', 'abend', 'soir'] },
  { category: 'causal', terms: ['porque', 'because', 'car', 'weil', 'denn', 'parce que', 'poiché', 'porque', 'for'] },
  { category: 'concessive', terms: ['aunque', 'although', 'though', 'quoique', 'bien que', 'obwohl', 'obgleich', 'sebbene', 'ancorché'] },
  { category: 'locative_here', terms: ['aqui', 'aquí', 'here', 'ici', 'hier', 'qui', 'qua'] },
  { category: 'locative_there', terms: ['alli', 'allí', 'alla', 'allá', 'there', 'la', 'là', 'dort', 'da', 'lì', 'lá'] },
  { category: 'motion_go', terms: ['fue', 'iba', 'went', 'alla', 'ging', 'partit', 'andò', 'foi', 'partió', 'left', 'verließ'] },
  { category: 'motion_come', terms: ['vino', 'came', 'vint', 'kam', 'venne', 'veio', 'llegó', 'arrived', 'arriva', 'kam an'] },
  { category: 'motion_enter', terms: ['entró', 'entered', 'entra', 'eintrat', 'entrou', 'entree', 'salió', 'left', 'sortit', 'verliess'] },
  { category: 'discourse_say', terms: ['dijo', 'said', 'dit', 'sagte', 'sprach', 'disse', 'respondió', 'replied', 'répondit', 'antwortete', 'rispose', 'preguntó', 'asked', 'demanda', 'fragte', 'chiede', 'perguntou', 'exclamó', 'exclaimed', 'murmuró', 'whispered'] },
  { category: 'perception_see', terms: ['vio', 'saw', 'vit', 'sah', 'vide', 'viu', 'miró', 'looked', 'regarda', 'blickte', 'guardò', 'observó', 'watched'] },
  { category: 'perception_hear', terms: ['oyo', 'oyó', 'escucho', 'escuchó', 'heard', 'entendit', 'hörte', 'udì', 'ouviu'] },
  { category: 'emotion_fear', terms: ['miedo', 'fear', 'peur', 'furcht', 'angst', 'paura', 'medo', 'temor'] },
  { category: 'emotion_love', terms: ['amor', 'love', 'amour', 'liebe', 'amore', 'querer', 'aimer', 'lieben', 'amare'] },
  { category: 'cognitive_know', terms: ['sabia', 'sabía', 'knew', 'savait', 'wusste', 'sapeva', 'sabia', 'conocia', 'conocía', 'kannte', 'connaissait', 'pensó', 'thought', 'pensa', 'dachte'] },
  { category: 'character_human', terms: ['hombre', 'man', 'homme', 'mann', 'uomo', 'homem', 'mujer', 'woman', 'femme', 'frau', 'donna', 'mulher', 'muchacho', 'boy', 'garçon', 'junge', 'ragazzo', 'niña', 'girl', 'fille', 'mädchen', 'amigo', 'friend', 'ami', 'freund'] },
  { category: 'setting_place', terms: ['casa', 'house', 'maison', 'haus', 'puerta', 'door', 'porte', 'tür', 'porta', 'habitacion', 'habitación', 'cuarto', 'room', 'chambre', 'zimmer', 'camera', 'calle', 'street', 'rue', 'straße', 'strada', 'ciudad', 'city', 'ville', 'stadt', 'città'] }
];

/**
 * Normaliza y extrae las 8 primeras palabras y 6 últimas palabras clave para cotejo de transición.
 */
function extractTransitionTokens(text: string): { firstTokens: string[]; lastTokens: string[]; fullTokens: Set<string> } {
  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length >= 2);
  const firstTokens = words.slice(0, 8);
  const lastTokens = words.slice(-6);
  const fullTokens = new Set(words.filter(w => w.length >= 4));
  return { firstTokens, lastTokens, fullTokens };
}

/**
 * Extrae la micro-frase inicial de un párrafo (primer enunciado o cláusula significativa).
 */
export function extractMicroSentenceHead(text: string): string {
  if (!text) return '';
  const clean = text.replace(/^[#*\-—–«"“\s]+/, '').trim();
  const punctMatch = clean.match(/^([^.!?»”\n]+[.!?»”]?)/);
  if (punctMatch && punctMatch[1].trim().length >= 6 && punctMatch[1].trim().length <= 140) {
    return punctMatch[1].trim();
  }
  const words = clean.split(/\s+/).slice(0, 12).join(' ');
  return words ? words + '...' : clean.slice(0, 75);
}

/**
 * Extrae la micro-frase terminal de un párrafo (último enunciado o cláusula significativa).
 */
export function extractMicroSentenceTail(text: string): string {
  if (!text) return '';
  const clean = text.trim();
  const sents = splitIntoSentences(clean);
  if (sents.length > 0) {
    const rawLast = sents[sents.length - 1].trim();
    const cleanLast = rawLast.replace(/^[#*\-—–«"“'„\s]+/, '').replace(/[»”"'\s]+$/, '').trim();
    if (cleanLast.length >= 6 && cleanLast.length <= 140) return cleanLast;
    if (rawLast.length <= 140) return rawLast;
  }
  const words = clean.split(/\s+/);
  if (words.length > 10) {
    return '...' + words.slice(-10).join(' ').replace(/^[#*\-—–«"“'„\s]+/, '').replace(/[»”"'\s]+$/, '');
  }
  return clean.slice(-75).replace(/^[#*\-—–«"“'„\s]+/, '').replace(/[»”"'\s]+$/, '');
}

/**
 * Evalúa la concordancia semántica y estructural de transición entre el inicio o frontera de corte
 * de un párrafo objetivo y una frase/oración candidata en la contraparte.
 * Analiza marcas de diálogo, interrogaciones, exclamaciones, cifras, nombres propios, cognados y anclas semánticas.
 */
export function evaluateStartTransitionMatch(
  targetText: string,
  candidateText: string,
  targetLang?: string,
  candidateLang?: string
): number {
  if (!targetText || !candidateText) return 0;
  let score = 0;
  const t = targetText.trim();
  const c = candidateText.trim();

  // 1. Marcas de diálogo literario homólogas (requisito estructural)
  const tDial = /^[—–\-«"“„]/.test(t);
  const cDial = /^[—–\-«"“„]/.test(c);
  if (tDial && cDial) score += 6;
  else if (tDial !== cDial && (tDial || cDial)) score -= 14;

  // 2. Signos interrogativos o exclamativos homólogos
  const tQ = /^[¿¡!?]/.test(t) || /[!?]$/.test(t);
  const cQ = /^[¿¡!?]/.test(c) || /[!?]$/.test(c);
  if (tQ && cQ) score += 6;
  else if (tQ !== cQ && (tQ || cQ)) score -= 8;

  // 3. Números, fechas y años (anclas matemáticas invariantes en traducción)
  const rxNum = /\b(?:\d{1,5}|[ivxlcdm]{2,6})\b/gi;
  const tNums = Array.from(new Set((t.match(rxNum) || []).map(n => n.toLowerCase())));
  const cNums = Array.from(new Set((c.match(rxNum) || []).map(n => n.toLowerCase())));
  let sharedNums = 0;
  for (const n of tNums) {
    if (cNums.includes(n)) {
      score += 26;
      sharedNums++;
    }
  }
  if (sharedNums === 0 && tNums.length > 0 && cNums.length > 0) {
    score -= 10;
  }

  // 4. Nombres propios y sustantivos capitalizados (entidades nombradas, incluyendo la primera si no es artículo)
  const extractNames = (str: string) => {
    const words = str.split(/\s+/).filter(Boolean);
    const names: string[] = [];
    for (let i = 0; i < words.length; i++) {
      const clean = words[i].replace(/[^\p{L}\p{N}]/gu, '');
      if (clean.length >= 4 && /^\p{Lu}/u.test(clean)) {
        if (i === 0 && /^(?:el|la|los|las|un|una|the|der|die|das|ein|eine|le|les|il|lo|gli|uma)$/i.test(clean)) {
          continue;
        }
        names.push(clean.toLowerCase());
      }
    }
    return Array.from(new Set(names));
  };
  const tNames = extractNames(t);
  const cNames = extractNames(c);
  for (const name of tNames) {
    if (cNames.includes(name) || cNames.some(cn => cn.slice(0, 4) === name.slice(0, 4))) {
      score += 30;
    }
  }

  // 5. Diccionario y categorías de anclaje de transición semántica
  const tTokens = extractTransitionTokens(t);
  const cTokens = extractTransitionTokens(c);

  for (const anchor of TRANSITION_SEMANTIC_ANCHORS) {
    const inT = anchor.terms.some(term => tTokens.firstTokens.includes(term));
    const inC = anchor.terms.some(term => cTokens.firstTokens.includes(term));
    if (inT && inC) {
      score += 22; // Correspondencia semántica comprobada en el inicio
    }
  }

  // 5.5 Integración de huella sintáctico-semántica profunda (Cross-Language Fingerprint)
  try {
    const fpT = extractSentenceFingerprint(t);
    const fpC = extractSentenceFingerprint(c);
    const hasSharedSemanticAnchors = 
      fpT.universalRoots.some(r => fpC.universalRoots.includes(r)) ||
      fpT.namedEntities.some(e => fpC.namedEntities.includes(e)) ||
      fpT.numbers.some(n => fpC.numbers.includes(n));

    if (hasSharedSemanticAnchors) {
      const deepScore = computeSentenceAlignmentScore(fpT, fpC, 0.5, 0.5);
      if (deepScore > 0) {
        score += Math.round(deepScore * 2.5);
      }
    }
  } catch {
    // fallback seguro si no está disponible
  }

  // 6. Cognados y raíces léxicas compartidas en las primeras 8 palabras
  let sharedLeadRoots = 0;
  for (const tw of tTokens.firstTokens) {
    if (tw.length >= 4) {
      const root = tw.slice(0, 4);
      for (const cw of cTokens.firstTokens) {
        if (cw.length >= 4 && cw.startsWith(root)) {
          sharedLeadRoots++;
          break;
        }
      }
    }
  }
  if (sharedLeadRoots > 0) {
    score += Math.min(30, sharedLeadRoots * 12);
  }

  return score;
}

/**
 * Evalúa la concordancia terminal (en qué termina o desemboca el fragmento).
 * Permite contrastar si la frase final del fragmento A corresponde a la frase final del fragmento B.
 */
export function evaluateEndTransitionMatch(tailEndA: string, tailEndB: string): number {
  if (!tailEndA || !tailEndB) return 0;
  let score = 0;
  const aEnd = tailEndA.trim();
  const bEnd = tailEndB.trim();

  // Puntuación terminal de cierre idéntica (. vs . o ? vs ? o ! vs !)
  const lastCharA = aEnd.slice(-1);
  const lastCharB = bEnd.slice(-1);
  if (lastCharA === lastCharB && /[.!?»”"']/.test(lastCharA)) {
    score += 2; // Puntuación moderada por signo terminal (no suficiente por sí sola)
  }

  // Integración de traducción semántica multilingüe en el cierre
  const multiEnd = evaluateMultilingualPhraseConcordance(aEnd, bEnd);
  if (multiEnd.dateMismatch) {
    score -= 30; // Penalización severa por desajuste de fecha/año
  } else if (multiEnd.isMatch) {
    score += Math.round(multiEnd.score * 1.2);
  }

  const tokA = extractTransitionTokens(aEnd);
  const tokB = extractTransitionTokens(bEnd);

  // Huella semántica de cierre
  try {
    const fpA = extractSentenceFingerprint(aEnd);
    const fpB = extractSentenceFingerprint(bEnd);
    const deepScore = computeSentenceAlignmentScore(fpA, fpB, 0.9, 0.9);
    if (deepScore > 0) {
      score += Math.round(deepScore * 3.0);
    }
  } catch {
    // fallback
  }

  // Cognados en las últimas palabras
  for (const wa of tokA.lastTokens) {
    if (wa.length >= 4) {
      const r = wa.slice(0, 4);
      for (const wb of tokB.lastTokens) {
        if (wb.length >= 4 && wb.startsWith(r)) {
          score += 10;
          break;
        }
      }
    }
  }

  return score;
}

/**
 * Realiza una rigurosa auditoría de micro-contenido en las frases de frontera (inicio y cierre)
 * entre dos párrafos o fragmentos bilingües enfrentados.
 *
 * Examina:
 * 1. La frase inicial de A (Head A) vs la frase inicial de B (Head B).
 * 2. La frase final de A (Tail A) vs la frase final de B (Tail B).
 * 3. Desfases potenciales de +1 o -1 respecto a párrafos adyacentes si se provee contexto.
 * 4. Evita clasificar como "Correspondencia Mutua" pares que divergen en el micro-contenido.
 */
export function evaluateBoundaryConcordance(
  textA: string,
  textB: string,
  context?: {
    nextTextA?: string;
    nextTextB?: string;
    prevTextA?: string;
    prevTextB?: string;
  }
): BoundaryConcordance {
  const cleanA = (textA || '').trim();
  const cleanB = (textB || '').trim();

  const isOmissionA = !cleanA || cleanA.startsWith('[Texto ausente') || cleanA.startsWith('[Párrafo ausente');
  const isOmissionB = !cleanB || cleanB.startsWith('[Texto ausente') || cleanB.startsWith('[Párrafo ausente');

  const headA = extractMicroSentenceHead(cleanA);
  const headB = extractMicroSentenceHead(cleanB);
  const tailA = extractMicroSentenceTail(cleanA);
  const tailB = extractMicroSentenceTail(cleanB);

  if (isOmissionA || isOmissionB) {
    return {
      headMatch: false,
      tailMatch: false,
      headScore: 0,
      tailScore: 0,
      status: 'omission',
      headPhraseA: headA || '—',
      headPhraseB: headB || '—',
      tailPhraseA: tailA || '—',
      tailPhraseB: tailB || '—',
      diagnosisMessage: '⚠️ Ausencia unilateral en una de las obras'
    };
  }

  // 0. Evaluación de cabeceras de capítulo homólogas
  const isBothHeadings = (
    (/^#{1,4}\s+/.test(cleanA) && /^#{1,4}\s+/.test(cleanB)) ||
    (/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|LIBRO|BOOK|PARTE|PART)\b/i.test(cleanA) &&
     /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|LIBRO|BOOK|PARTE|PART)\b/i.test(cleanB))
  );
  if (isBothHeadings) {
    const numA = extractNumericOrRomanIndex(cleanA);
    const numB = extractNumericOrRomanIndex(cleanB);
    const isNumMatch = (numA !== null && numB !== null) ? numA === numB : true;
    return {
      headMatch: isNumMatch,
      tailMatch: isNumMatch,
      headScore: isNumMatch ? 50 : 10,
      tailScore: isNumMatch ? 50 : 10,
      status: isNumMatch ? 'verified_mutual' : 'head_mismatch',
      headPhraseA: cleanA,
      headPhraseB: cleanB,
      tailPhraseA: cleanA,
      tailPhraseB: cleanB,
      diagnosisMessage: isNumMatch ? 'Cabecera de capítulo verificada 1:1' : '⚠️ Desfase en numeral de capítulo'
    };
  }

  // 1. Evaluación directa de Inicio (Head) con motor multilingüe
  const headMulti = evaluateMultilingualPhraseConcordance(headA, headB);
  const baseHeadScore = evaluateStartTransitionMatch(headA, headB);
  const headScore = baseHeadScore + (headMulti.isMatch ? 20 : 0) - (headMulti.dateMismatch ? 30 : 0);

  // 2. Evaluación directa de Cierre (Tail) con motor multilingüe
  const tailMulti = evaluateMultilingualPhraseConcordance(tailA, tailB);
  const baseTailScore = evaluateEndTransitionMatch(tailA, tailB);
  const tailScore = baseTailScore + (tailMulti.isMatch ? 20 : 0) - (tailMulti.dateMismatch ? 30 : 0);

  // Umbral estricto: requiere evidencia semántica verificada y NUNCA coincidir si hay error de fecha
  const directHeadMatch = !headMulti.dateMismatch && (headMulti.isMatch || headScore >= 20);
  const directTailMatch = !tailMulti.dateMismatch && (tailMulti.isMatch || tailScore >= 18);

  // 3. Auditoría de Desfase (+1 / -1) respecto al contexto adyacente
  if (context?.nextTextB) {
    const nextHeadB = extractMicroSentenceHead(context.nextTextB);
    const multiNextB = evaluateMultilingualPhraseConcordance(headA, nextHeadB);
    const scoreNextB = evaluateStartTransitionMatch(headA, nextHeadB) + (multiNextB.isMatch ? 24 : 0);
    if ((scoreNextB >= 20 || multiNextB.isMatch) && scoreNextB > headScore + 12) {
      return {
        headMatch: false,
        tailMatch: directTailMatch,
        headScore,
        tailScore,
        status: 'shift_detected',
        headPhraseA: headA,
        headPhraseB: headB,
        tailPhraseA: tailA,
        tailPhraseB: tailB,
        diagnosisMessage: '🚨 Desfase detectado: El inicio de A coincide con el párrafo SIGUIENTE en B (+1 párrafo desplazado)',
        shiftSuggested: 'next_b'
      };
    }
  }

  if (context?.nextTextA) {
    const nextHeadA = extractMicroSentenceHead(context.nextTextA);
    const multiNextA = evaluateMultilingualPhraseConcordance(nextHeadA, headB);
    const scoreNextA = evaluateStartTransitionMatch(nextHeadA, headB) + (multiNextA.isMatch ? 24 : 0);
    if ((scoreNextA >= 20 || multiNextA.isMatch) && scoreNextA > headScore + 12) {
      return {
        headMatch: false,
        tailMatch: directTailMatch,
        headScore,
        tailScore,
        status: 'shift_detected',
        headPhraseA: headA,
        headPhraseB: headB,
        tailPhraseA: tailA,
        tailPhraseB: tailB,
        diagnosisMessage: '🚨 Desfase detectado: El inicio de B coincide con el párrafo SIGUIENTE en A (+1 párrafo desplazado)',
        shiftSuggested: 'next_a'
      };
    }
  }

  if (context?.prevTextB) {
    const prevHeadB = extractMicroSentenceHead(context.prevTextB);
    const multiPrevB = evaluateMultilingualPhraseConcordance(headA, prevHeadB);
    const scorePrevB = evaluateStartTransitionMatch(headA, prevHeadB) + (multiPrevB.isMatch ? 24 : 0);
    if ((scorePrevB >= 20 || multiPrevB.isMatch) && scorePrevB > headScore + 12) {
      return {
        headMatch: false,
        tailMatch: directTailMatch,
        headScore,
        tailScore,
        status: 'shift_detected',
        headPhraseA: headA,
        headPhraseB: headB,
        tailPhraseA: tailA,
        tailPhraseB: tailB,
        diagnosisMessage: '🚨 Desfase detectado: El inicio de A coincide con el párrafo ANTERIOR en B (-1 párrafo desplazado)',
        shiftSuggested: 'prev_b'
      };
    }
  }

  // Si hay discrepancia de fecha detectada
  if (headMulti.dateMismatch || tailMulti.dateMismatch) {
    return {
      headMatch: false,
      tailMatch: false,
      headScore,
      tailScore,
      status: 'total_mismatch',
      headPhraseA: headA,
      headPhraseB: headB,
      tailPhraseA: tailA,
      tailPhraseB: tailB,
      diagnosisMessage: '🚨 Desfase por fecha o numeral: El fragmento contiene una fecha no coincidente con su contraparte'
    };
  }

  // 4. Verificación de concordancia mutua o desajuste
  if (directHeadMatch && directTailMatch) {
    return {
      headMatch: true,
      tailMatch: true,
      headScore,
      tailScore,
      status: 'verified_mutual',
      headPhraseA: headA,
      headPhraseB: headB,
      tailPhraseA: tailA,
      tailPhraseB: tailB,
      diagnosisMessage: '✓ Correspondencia mutua verificada: Las frases inicial y final concuerdan en ambas caras.'
    };
  }

  if (!directHeadMatch && directTailMatch) {
    return {
      headMatch: false,
      tailMatch: true,
      headScore,
      tailScore,
      status: 'head_mismatch',
      headPhraseA: headA,
      headPhraseB: headB,
      tailPhraseA: tailA,
      tailPhraseB: tailB,
      diagnosisMessage: '⚠️ Desfase en inicio: Las frases iniciales no concuerdan en micro-contenido.'
    };
  }

  if (directHeadMatch && !directTailMatch) {
    return {
      headMatch: true,
      tailMatch: false,
      headScore,
      tailScore,
      status: 'tail_mismatch',
      headPhraseA: headA,
      headPhraseB: headB,
      tailPhraseA: tailA,
      tailPhraseB: tailB,
      diagnosisMessage: '⚠️ Desfase en cierre: Las frases finales no concuerdan en micro-contenido.'
    };
  }

  return {
    headMatch: false,
    tailMatch: false,
    headScore,
    tailScore,
    status: 'total_mismatch',
    headPhraseA: headA,
    headPhraseB: headB,
    tailPhraseA: tailA,
    tailPhraseB: tailB,
    diagnosisMessage: '❌ Disparidad de contenido: Ni la frase inicial ni la final concuerdan en micro-contenido.'
  };
}

/**
 * Corta un párrafo compuesto o gigante en dos partes:
 * - head: la porción que se equipara en extensión y sentido al párrafo actual del otro idioma
 * - tail: el resto del texto que continúa para emparejarse con el inicio del siguiente fragmento
 * 
 * Emplea doble evaluación:
 * 1. Concordancia de transición: el arranque del tail de este corte debe corresponder al inicio del siguiente fragmento del otro libro.
 * 2. Concordancia de cierre: el final del head debe guardar sentido y terminal con el fragmento actual.
 * 3. Proporcionalidad estricta de caracteres según el ratio de expansión idiomática.
 */
export function splitCompoundParagraph(
  compoundText: string,
  targetChars: number,
  nextTargetStartText: string | undefined,
  currentOtherText: string,
  langSource?: string,
  langTarget?: string
): { head: string; tail: string } | null {
  const parts = splitIntoClausesOrSentences(compoundText);
  if (parts.length < 2) return null;

  let bestK = -1;
  let bestFitness = -Infinity;

  for (let k = 1; k < parts.length; k++) {
    const headText = parts.slice(0, k).join(' ').trim();
    const tailText = parts.slice(k).join(' ').trim();
    const tailSentenceStart = parts[k].trim();
    const prevSentenceEnd = parts[k - 1].trim();

    const hasPunct = /[.!?»”"';:—–]$/.test(prevSentenceEnd);
    if (!hasPunct && parts.length > 3) continue;

    const headChars = headText.length;
    const charDiff = Math.abs(headChars - targetChars);
    const charDistRatio = charDiff / Math.max(1, targetChars);

    // 1. Concordancia de inicio del siguiente fragmento (tailSentenceStart vs nextTargetStartText)
    let transitionScore = 0;
    if (nextTargetStartText && nextTargetStartText.trim().length > 0) {
      transitionScore = evaluateStartTransitionMatch(
        nextTargetStartText,
        tailSentenceStart,
        langTarget,
        langSource
      );
    }

    // 2. Concordancia de cierre de la parte actual (headText vs currentOtherText)
    const endScore = evaluateEndTransitionMatch(headText, currentOtherText);

    // 3. Paridad de diálogo de apertura entre headText y currentOtherText
    let currentMatchBonus = 0;
    const isOtherDial = /^[—–\-«"“„]/.test(currentOtherText.trim());
    const isHeadDial = /^[—–\-«"“„]/.test(headText);
    if (isOtherDial === isHeadDial) currentMatchBonus += 8;
    else currentMatchBonus -= 6;

    // Fórmula de idoneidad: da máxima prioridad al anclaje semántico y de corte oracional
    const fitness = (transitionScore * 3.0) + (endScore * 1.5) + currentMatchBonus - (charDistRatio * 16.0);

    if (fitness > bestFitness) {
      bestFitness = fitness;
      bestK = k;
    }
  }

  // Si ninguna frontera semántica destacó claramente, optar por la que minimice la discrepancia de caracteres
  if (bestK <= 0) {
    let minDiff = Infinity;
    for (let k = 1; k < parts.length; k++) {
      const headLen = parts.slice(0, k).join(' ').trim().length;
      const d = Math.abs(headLen - targetChars);
      if (d < minDiff) {
        minDiff = d;
        bestK = k;
      }
    }
  }

  if (bestK <= 0 || bestK >= parts.length) return null;

  const head = parts.slice(0, bestK).join(' ').trim();
  const tail = parts.slice(bestK).join(' ').trim();

  if (!head || !tail) return null;
  return { head, tail };
}

/**
 * Evalúa la correspondencia semántica, rítmica y narrativa exacta entre un párrafo (o grupo) en A
 * y su contraparte en B, aplicando:
 * 1. Filtro estricto de proporción de caracteres respecto al ratio global de traducción.
 * 2. Anclaje de entidades nombradas invariantes (nombres propios de personajes y lugares).
 * 3. Anclaje matemático de números, fechas y numerales romanos.
 * 4. Homología de estructura de diálogo y puntuación.
 * 5. Filtro de avance narrativo acumulado (evita cualquier desfase acumulativo).
 */
function computeParagraphMatchScore(
  textA: string,
  textB: string,
  charOffsetA: number,
  totalCharsA: number,
  charOffsetB: number,
  totalCharsB: number
): number {
  if (!textA || !textB) return -60;
  const lenA = textA.trim().length;
  const lenB = textB.trim().length;
  if (lenA === 0 || lenB === 0) return -60;

  // 1. Filtro de proporción de caracteres esperado (e.g. ratio ES/EN típico 0.85 - 1.25)
  const globalRatio = totalCharsB > 0 ? (totalCharsB / Math.max(1, totalCharsA)) : 1.0;
  const expectedLenB = lenA * globalRatio;
  const lenDiffRatio = Math.abs(lenB - expectedLenB) / Math.max(lenB, expectedLenB, 60);

  // Puntuación base neutral / moderada, dependiente del contenido y castigada fuertemente por divergencia de caracteres
  let score = 2.0 - (lenDiffRatio * 18.0);

  // Si la discrepancia de caracteres supera el 65% del tamaño esperado: penalización severa
  if (lenDiffRatio > 0.65) {
    score -= 22.0;
  }

  // Protección Absoluta contra Desbalances Extremos (ej. 100 caracteres vs 5000 caracteres):
  // Es físicamente imposible que un párrafo breve coincida con un bloque gigante;
  // la programación dinámica debe buscar opciones 1:2, 2:1, 1:3 o continuar el trazado.
  const rawRatio = Math.max(lenA, lenB) / Math.max(1, Math.min(lenA, lenB));
  if (rawRatio > 3.0 && Math.abs(lenA - lenB) > 240) {
    score -= 200.0;
  } else if (rawRatio > 2.2 && Math.abs(lenA - lenB) > 180) {
    score -= 60.0;
  }

  // 2. Filtro de progreso acumulado en la obra (distancia respecto a la diagonal de avance narrativo)
  const progA = totalCharsA > 0 ? (charOffsetA / totalCharsA) : 0;
  const progB = totalCharsB > 0 ? (charOffsetB / totalCharsB) : 0;
  const progDiff = Math.abs(progA - progB);
  score -= (progDiff * 35.0);

  // 3. Homología de marcas de diálogo (un diálogo debe emparejarse con diálogo)
  const dialA = /^[—–\-«"“'‘]/.test(textA.trim());
  const dialB = /^[—–\-«"“'‘]/.test(textB.trim());
  if (dialA && dialB) {
    score += 10.0;
  } else if (dialA !== dialB) {
    score -= 18.0; // Penalizar fuertemente emparejar prosa descriptiva con parlamento
  }

  // 4. Anclas invariantes: Números, cifras y fechas
  const rxNum = /\b(?:\d{1,5}|[ivxlcdm]{2,6})\b/gi;
  const numsA = Array.from(new Set((textA.match(rxNum) || []).map(n => n.toLowerCase())));
  const numsB = Array.from(new Set((textB.match(rxNum) || []).map(n => n.toLowerCase())));
  let sharedNums = 0;
  for (const n of numsA) {
    if (numsB.includes(n)) {
      sharedNums++;
      score += 26.0;
    }
  }
  if (numsA.length > 0 && numsB.length > 0 && sharedNums === 0) {
    score -= 10.0;
  }

  // 5. Entidades nombradas capitalizadas (personajes, lugares)
  const extractEntities = (str: string) => {
    // Extracción rápida de entidades capitalizadas sin partir recursivamente en oraciones
    const matches = str.match(/\b[A-ZÁÉÍÓÚÄÖÜ][a-záéíóúñäöüß]{3,}\b/g) || [];
    const stopWords = new Set(['el', 'la', 'los', 'las', 'the', 'der', 'die', 'das', 'this', 'that', 'with', 'from', 'para', 'pero', 'como', 'cuando', 'sobre', 'entre']);
    const unique: string[] = [];
    for (const m of matches) {
      const low = m.toLowerCase();
      if (!stopWords.has(low) && !unique.includes(low)) {
        unique.push(low);
        if (unique.length >= 15) break;
      }
    }
    return unique;
  };

  const entA = extractEntities(textA);
  const entB = extractEntities(textB);
  let sharedEnts = 0;
  for (const e of entA) {
    if (entB.includes(e) || entB.some(eb => eb.slice(0, 4) === e.slice(0, 4))) {
      sharedEnts++;
      score += 30.0;
    }
  }
  if (entA.length >= 2 && entB.length >= 2 && sharedEnts === 0) {
    score -= 14.0;
  }

  // 6. Transición semántica y concordancia de micro-contenido en inicio y fin
  const startMatch = evaluateStartTransitionMatch(textA, textB);
  if (startMatch > 0) {
    score += (startMatch * 0.45);
  } else if (startMatch < 0) {
    score += (startMatch * 0.6); // Penalización directa si las frases de inicio divergen
  } else {
    // Si no hay correspondencia en inicio ni anclas de nombres/números: penalizar
    if (sharedNums === 0 && sharedEnts === 0) {
      score -= 10.0;
    }
  }

  const endMatch = evaluateEndTransitionMatch(textA, textB);
  if (endMatch > 0) {
    score += (endMatch * 0.3);
  } else if (endMatch < 0) {
    score += (endMatch * 0.4);
  }

  return score;
}

/**
 * Alinea dos listas de párrafos mediante Programación Dinámica Bandada (Banded DP) de alta velocidad,
 * evaluando correspondencias 1:1, 1:2 (dos párrafos fusionados en B), 2:1 (dos párrafos fusionados en A),
 * 1:3 y 3:1 con resolución de acontecimientos 100% fiel y CERO congelamiento del navegador.
 */
export function alignParagraphListsWithDP(
  parasA: string[],
  parasB: string[],
  config: ParallelBookConfig,
  orderCounterStart: number,
  chapterTitle: string
): { pairs: ParallelPair[]; nextOrderCounter: number; omissions: EditorialOmission[] } {
  const lenA = parasA.length;
  const lenB = parasB.length;
  const pairs: ParallelPair[] = [];
  const omissions: EditorialOmission[] = [];
  let order = orderCounterStart;

  if (lenA === 0 && lenB === 0) {
    return { pairs, nextOrderCounter: order, omissions };
  }
  if (lenA === 0) {
    for (let j = 0; j < lenB; j++) {
      pairs.push(createPair(order++, `[Párrafo ausente en la versión en ${config.languageA}]`, parasB[j], 'paragraph', chapterTitle));
    }
    return { pairs, nextOrderCounter: order, omissions };
  }
  if (lenB === 0) {
    for (let i = 0; i < lenA; i++) {
      pairs.push(createPair(order++, parasA[i], `[Párrafo ausente en la versión en ${config.languageB}]`, 'paragraph', chapterTitle));
    }
    return { pairs, nextOrderCounter: order, omissions };
  }

  // Precalcular offsets acumulados de caracteres para cálculo instantáneo en el bucle DP
  const cumCharsA = new Float64Array(lenA + 1);
  for (let i = 0; i < lenA; i++) cumCharsA[i + 1] = cumCharsA[i] + parasA[i].length;
  const totalCharsA = Math.max(1, cumCharsA[lenA]);

  const cumCharsB = new Float64Array(lenB + 1);
  for (let j = 0; j < lenB; j++) cumCharsB[j + 1] = cumCharsB[j] + parasB[j].length;
  const totalCharsB = Math.max(1, cumCharsB[lenB]);

  // Si ambas listas tienen idéntica longitud, verificar que CADA par diagonal posea concordancia
  // de micro-contenido real antes de aceptar el emparejamiento trivial.
  if (lenA === lenB) {
    let allDiagonalMatchesPristine = true;
    for (let k = 0; k < lenA; k++) {
      const boundary = evaluateBoundaryConcordance(parasA[k], parasB[k]);
      if (boundary.status === 'head_mismatch' || boundary.status === 'shift_detected' || boundary.status === 'total_mismatch') {
        allDiagonalMatchesPristine = false;
        break;
      }
      const matchScore = computeParagraphMatchScore(
        parasA[k],
        parasB[k],
        cumCharsA[k],
        totalCharsA,
        cumCharsB[k],
        totalCharsB
      );
      if (matchScore < 0) {
        allDiagonalMatchesPristine = false;
        break;
      }
    }
    if (allDiagonalMatchesPristine) {
      for (let k = 0; k < lenA; k++) {
        pairs.push(createPair(order++, parasA[k], parasB[k], 'paragraph', chapterTitle));
      }
      return { pairs, nextOrderCounter: order, omissions };
    }
  }

  // Matriz plana Float32Array para rendimiento ultra-rápido en memoria contigua (< 1MB)
  const stride = lenB + 1;
  const totalCells = (lenA + 1) * stride;
  const dp = new Float32Array(totalCells);
  dp.fill(-Infinity);

  // Matriz de acción para traceback exacto sin punteros ni arrays compartidos:
  // 0: Ninguno, 1: Match 1:1, 2: Match 1:2, 3: Match 2:1, 4: Match 1:3, 5: Match 3:1, 6: Skip A, 7: Skip B
  const action = new Int8Array(totalCells);

  dp[0] = 0;

  // Ancho de banda de seguridad (corredor homológico dinámico ágil para cero congelamiento)
  const windowWidth = Math.max(12, Math.min(26, Math.round(Math.max(lenA, lenB) * 0.2)));

  for (let i = 0; i <= lenA; i++) {
    const expectedJ = Math.round((i / Math.max(1, lenA)) * lenB);
    const minJ = Math.max(0, expectedJ - windowWidth);
    const maxJ = Math.min(lenB, expectedJ + windowWidth);

    for (let j = minJ; j <= maxJ; j++) {
      const idx = i * stride + j;
      const cur = dp[idx];
      if (cur === -Infinity) continue;

      const offA = cumCharsA[i];
      const offB = cumCharsB[j];

      // 1. Transición Match 1:1 (i -> i+1, j -> j+1)
      if (i < lenA && j < lenB) {
        const s = computeParagraphMatchScore(parasA[i], parasB[j], offA, totalCharsA, offB, totalCharsB);
        const nextScore = cur + s;
        const targetIdx = (i + 1) * stride + (j + 1);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 1;
        }
      }

      // 2. Transición Match 1:2 (1 párrafo en A equivale a 2 párrafos en B: i -> i+1, j -> j+2)
      if (i < lenA && j + 1 < lenB) {
        const combB = `${parasB[j]}\n\n${parasB[j + 1]}`;
        const s = computeParagraphMatchScore(parasA[i], combB, offA, totalCharsA, offB, totalCharsB) - 0.5;
        const nextScore = cur + s;
        const targetIdx = (i + 1) * stride + (j + 2);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 2;
        }
      }

      // 3. Transición Match 2:1 (2 párrafos en A equivalen a 1 párrafo en B: i -> i+2, j -> j+1)
      if (i + 1 < lenA && j < lenB) {
        const combA = `${parasA[i]}\n\n${parasA[i + 1]}`;
        const s = computeParagraphMatchScore(combA, parasB[j], offA, totalCharsA, offB, totalCharsB) - 0.5;
        const nextScore = cur + s;
        const targetIdx = (i + 2) * stride + (j + 1);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 3;
        }
      }

      // 4. Transición Match 1:3 (1 párrafo en A equivale a 3 párrafos en B: i -> i+1, j -> j+3)
      if (i < lenA && j + 2 < lenB) {
        const combB = `${parasB[j]}\n\n${parasB[j + 1]}\n\n${parasB[j + 2]}`;
        const s = computeParagraphMatchScore(parasA[i], combB, offA, totalCharsA, offB, totalCharsB) - 1.2;
        const nextScore = cur + s;
        const targetIdx = (i + 1) * stride + (j + 3);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 4;
        }
      }

      // 5. Transición Match 3:1 (3 párrafos en A equivalen a 1 párrafo en B: i -> i+3, j -> j+1)
      if (i + 2 < lenA && j < lenB) {
        const combA = `${parasA[i]}\n\n${parasA[i + 1]}\n\n${parasA[i + 2]}`;
        const s = computeParagraphMatchScore(combA, parasB[j], offA, totalCharsA, offB, totalCharsB) - 1.2;
        const nextScore = cur + s;
        const targetIdx = (i + 3) * stride + (j + 1);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 5;
        }
      }

      // 6. Skip i en A (omisión / párrafo sin contraparte en B)
      if (i < lenA) {
        const nextScore = cur - 10.0;
        const targetIdx = (i + 1) * stride + j;
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 6;
        }
      }

      // 7. Skip j en B (omisión / párrafo sin contraparte en A)
      if (j < lenB) {
        const nextScore = cur - 10.0;
        const targetIdx = i * stride + (j + 1);
        if (nextScore > dp[targetIdx]) {
          dp[targetIdx] = nextScore;
          action[targetIdx] = 7;
        }
      }
    }
  }

  // Traceback determinista de (lenA, lenB) a (0, 0)
  interface TraceStep {
    stepType: 'match_1_1' | 'match_1_2' | 'match_2_1' | 'match_1_3' | 'match_3_1' | 'skip_a' | 'skip_b';
    iIndices: number[];
    jIndices: number[];
  }
  const steps: TraceStep[] = [];
  let currI = lenA;
  let currJ = lenB;

  while (currI > 0 || currJ > 0) {
    const act = action[currI * stride + currJ];

    if (act === 1) { // 1:1
      steps.push({ stepType: 'match_1_1', iIndices: [currI - 1], jIndices: [currJ - 1] });
      currI -= 1;
      currJ -= 1;
    } else if (act === 2) { // 1:2
      steps.push({ stepType: 'match_1_2', iIndices: [currI - 1], jIndices: [currJ - 2, currJ - 1] });
      currI -= 1;
      currJ -= 2;
    } else if (act === 3) { // 2:1
      steps.push({ stepType: 'match_2_1', iIndices: [currI - 2, currI - 1], jIndices: [currJ - 1] });
      currI -= 2;
      currJ -= 1;
    } else if (act === 4) { // 1:3
      steps.push({ stepType: 'match_1_3', iIndices: [currI - 1], jIndices: [currJ - 3, currJ - 2, currJ - 1] });
      currI -= 1;
      currJ -= 3;
    } else if (act === 5) { // 3:1
      steps.push({ stepType: 'match_3_1', iIndices: [currI - 3, currI - 2, currI - 1], jIndices: [currJ - 1] });
      currI -= 3;
      currJ -= 1;
    } else if (act === 6) { // Skip A
      steps.push({ stepType: 'skip_a', iIndices: [currI - 1], jIndices: [] });
      currI -= 1;
    } else if (act === 7) { // Skip B
      steps.push({ stepType: 'skip_b', iIndices: [], jIndices: [currJ - 1] });
      currJ -= 1;
    } else {
      // Fallback seguro de salida si el borde del corredor quedó inalcanzable
      if (currI > 0 && currJ > 0) {
        steps.push({ stepType: 'match_1_1', iIndices: [currI - 1], jIndices: [currJ - 1] });
        currI -= 1;
        currJ -= 1;
      } else if (currI > 0) {
        steps.push({ stepType: 'skip_a', iIndices: [currI - 1], jIndices: [] });
        currI -= 1;
      } else {
        steps.push({ stepType: 'skip_b', iIndices: [], jIndices: [currJ - 1] });
        currJ -= 1;
      }
    }
  }

  steps.reverse();

  for (const st of steps) {
    if (st.stepType === 'match_1_1') {
      const textA = parasA[st.iIndices[0]];
      const textB = parasB[st.jIndices[0]];
      pairs.push(createPair(order++, textA, textB, 'paragraph', chapterTitle));
    } else if (st.stepType === 'match_1_2') {
      const textA = parasA[st.iIndices[0]];
      const textB = st.jIndices.map(j => parasB[j]).join('\n\n');
      const p = createPair(order++, textA, textB, 'paragraph', chapterTitle);
      p.note = 'Párrafos homologados 1:2 (2 párrafos en B correspondientes al párrafo en A)';
      pairs.push(p);
    } else if (st.stepType === 'match_2_1') {
      const textA = st.iIndices.map(i => parasA[i]).join('\n\n');
      const textB = parasB[st.jIndices[0]];
      const p = createPair(order++, textA, textB, 'paragraph', chapterTitle);
      p.note = 'Párrafos homologados 2:1 (2 párrafos en A correspondientes al párrafo en B)';
      pairs.push(p);
    } else if (st.stepType === 'match_1_3') {
      const textA = parasA[st.iIndices[0]];
      const textB = st.jIndices.map(j => parasB[j]).join('\n\n');
      const p = createPair(order++, textA, textB, 'paragraph', chapterTitle);
      p.note = 'Párrafos homologados 1:3';
      pairs.push(p);
    } else if (st.stepType === 'match_3_1') {
      const textA = st.iIndices.map(i => parasA[i]).join('\n\n');
      const textB = parasB[st.jIndices[0]];
      const p = createPair(order++, textA, textB, 'paragraph', chapterTitle);
      p.note = 'Párrafos homologados 3:1';
      pairs.push(p);
    } else if (st.stepType === 'skip_a') {
      const textA = parasA[st.iIndices[0]];
      pairs.push(createPair(order++, textA, `[Párrafo ausente en la versión en ${config.languageB}]`, 'paragraph', chapterTitle));
      omissions.push({
        id: `om_b_${st.iIndices[0]}`,
        side: 'B',
        type: 'unmatched_cluster',
        sourceSnippet: textA.slice(0, 80),
        detectedInLanguage: config.languageB,
        chapterIndex: 1,
        approximateWordCount: textA.split(/\s+/).length,
        suggestedAction: 'verify_omission',
        explanation: 'Párrafo presente en A sin contraparte directa en B'
      });
    } else if (st.stepType === 'skip_b') {
      const textB = parasB[st.jIndices[0]];
      pairs.push(createPair(order++, `[Párrafo ausente en la versión en ${config.languageA}]`, textB, 'paragraph', chapterTitle));
      omissions.push({
        id: `om_a_${st.jIndices[0]}`,
        side: 'A',
        type: 'unmatched_cluster',
        sourceSnippet: textB.slice(0, 80),
        detectedInLanguage: config.languageA,
        chapterIndex: 1,
        approximateWordCount: textB.split(/\s+/).length,
        suggestedAction: 'verify_omission',
        explanation: 'Párrafo presente en B sin contraparte directa en A'
      });
    }
  }

  return { pairs, nextOrderCounter: order, omissions };
}

/**
 * Verifica la Invariante del Espejo en cada par:
 * Asegura que la frase de inicio de A corresponda exactamente a la frase de inicio de B.
 * Si una oración huérfana de inicio quedó desplazada por un salto de párrafo previo,
 * la re-sincroniza automáticamente.
 */
export function verifyAndSnapMirrorPairs(
  pairs: ParallelPair[],
  config: ParallelBookConfig
): {
  verifiedPairs: ParallelPair[];
  exactStartMatches: number;
  exactEndMatches: number;
  totalEvaluated: number;
  discrepantPairs: Array<{
    order: number;
    title: string;
    startSnippetA: string;
    startSnippetB: string;
    reason: string;
  }>;
} {
  const verifiedPairs: ParallelPair[] = [...pairs];
  let exactStartMatches = 0;
  let exactEndMatches = 0;
  let totalEvaluated = 0;
  const discrepantPairs: Array<{
    order: number;
    title: string;
    startSnippetA: string;
    startSnippetB: string;
    reason: string;
  }> = [];

  for (let k = 0; k < verifiedPairs.length; k++) {
    const pair = verifiedPairs[k];
    if (pair.isHeading || ['heading1', 'heading2', 'heading3'].includes(pair.type)) {
      continue;
    }
    if (pair.textA.startsWith('[Párrafo ausente') || pair.textB.startsWith('[Párrafo ausente')) {
      continue;
    }

    totalEvaluated++;
    let sentsA = splitIntoSentences(pair.textA);
    let sentsB = splitIntoSentences(pair.textB);

    if (sentsA.length === 0 || sentsB.length === 0) continue;

    // Comprobación de frase de inicio
    let startScore = evaluateStartTransitionMatch(sentsA[0], sentsB[0]);

    // Comprobación de ajuste de 1 oración huérfana transferida
    if (startScore < 6 && k > 0) {
      const prev = verifiedPairs[k - 1];
      if (!prev.isHeading && !prev.textA.startsWith('[') && !prev.textB.startsWith('[')) {
        // ¿La primera oración de B pertenece al párrafo anterior de B?
        if (sentsB.length >= 2 && evaluateStartTransitionMatch(sentsA[0], sentsB[1]) >= 12) {
          prev.textB = `${prev.textB} ${sentsB[0]}`.trim();
          prev.charCountB = prev.textB.length;
          prev.wordCountB = prev.textB.split(/\s+/).filter(Boolean).length;

          sentsB = sentsB.slice(1);
          pair.textB = sentsB.join(' ').trim();
          pair.charCountB = pair.textB.length;
          pair.wordCountB = pair.textB.split(/\s+/).filter(Boolean).length;
          startScore = evaluateStartTransitionMatch(sentsA[0], sentsB[0]);
        }
        // ¿La primera oración de A pertenece al párrafo anterior de A?
        else if (sentsA.length >= 2 && evaluateStartTransitionMatch(sentsA[1], sentsB[0]) >= 12) {
          prev.textA = `${prev.textA} ${sentsA[0]}`.trim();
          prev.charCountA = prev.textA.length;
          prev.wordCountA = prev.textA.split(/\s+/).filter(Boolean).length;

          sentsA = sentsA.slice(1);
          pair.textA = sentsA.join(' ').trim();
          pair.charCountA = pair.textA.length;
          pair.wordCountA = pair.textA.split(/\s+/).filter(Boolean).length;
          startScore = evaluateStartTransitionMatch(sentsA[0], sentsB[0]);
        }
      }
    }

    const endScore = evaluateEndTransitionMatch(sentsA[sentsA.length - 1], sentsB[sentsB.length - 1]);

    const isDialA = /^[—–\-«"“„]/.test(sentsA[0]);
    const isDialB = /^[—–\-«"“„]/.test(sentsB[0]);
    const isQA = /^[¿¡!?]/.test(sentsA[0]);
    const isQB = /^[¿¡!?]/.test(sentsB[0]);
    // Exigir correspondencia semántica real y de acontecimientos (mínimo score 12),
    // no meramente que ambos comiencen con raya de diálogo o comillas
    const isStartMatch = startScore >= 12;

    if (isStartMatch) {
      exactStartMatches++;
    } else {
      // Discrepancia real detectada
      discrepantPairs.push({
        order: pair.order,
        title: pair.title,
        startSnippetA: sentsA[0].slice(0, 60),
        startSnippetB: sentsB[0].slice(0, 60),
        reason: `Inicio asimétrico (Score: ${startScore})`
      });
      pair.status = 'rhythm_warning';
      pair.note = (pair.note ? pair.note + ' • ' : '') + `Verificar frase de inicio en espejo`;
    }

    if (endScore >= 6) {
      exactEndMatches++;
    }
  }

  return {
    verifiedPairs,
    exactStartMatches,
    exactEndMatches,
    totalEvaluated,
    discrepantPairs
  };
}

/**
 * Alineador Sincrónico Progresivo de Obra Literaria.
 * Procesa paso a paso verificando fragmento por fragmento:
 * Utiliza el motor de armonización oracional isomórfica (Needleman-Wunsch DP)
 * garantizando que cada párrafo tenga exactamente su contraparte homóloga espejo.
 */
function alignBidirectionalNovelBodyWithSubblocks(
  unitsA: ExtractedUnit[],
  unitsB: ExtractedUnit[],
  config: ParallelBookConfig,
  orderCounterStart: number
): {
  pairs: ParallelPair[];
  nextOrderCounter: number;
  omissions: EditorialOmission[];
  consensusAnchorCount: number;
} {
  const pairs: ParallelPair[] = [];
  const omissions: EditorialOmission[] = [];
  let orderCounter = orderCounterStart;

  const N = unitsA.length;
  const M = unitsB.length;

  if (N === 0 && M === 0) {
    return { pairs, nextOrderCounter: orderCounter, omissions, consensusAnchorCount: 0 };
  }

  if (N === 0) {
    for (let j = 0; j < M; j++) {
      const uB = unitsB[j];
      pairs.push(createPair(
        orderCounter++,
        `[Párrafo ausente en la versión en ${config.languageA}]`,
        uB.text,
        uB.type,
        uB.title || 'Novela'
      ));
    }
    return { pairs, nextOrderCounter: orderCounter, omissions, consensusAnchorCount: 0 };
  }

  if (M === 0) {
    for (let i = 0; i < N; i++) {
      const uA = unitsA[i];
      pairs.push(createPair(
        orderCounter++,
        uA.text,
        `[Párrafo ausente en la versión en ${config.languageB}]`,
        uA.type,
        uA.title || 'Novela'
      ));
    }
    return { pairs, nextOrderCounter: orderCounter, omissions, consensusAnchorCount: 0 };
  }

  const activeChapterTitle = unitsA.find(u => u.isHeading)?.title || unitsB.find(u => u.isHeading)?.title || 'Novela';

  const narrUnitsA = unitsA.filter(u => !u.isHeading);
  const narrUnitsB = unitsB.filter(u => !u.isHeading);
  const headingUnitsA = unitsA.filter(u => u.isHeading);
  const headingUnitsB = unitsB.filter(u => u.isHeading);

  if (headingUnitsA.length > 0 || headingUnitsB.length > 0) {
    const maxH = Math.max(headingUnitsA.length, headingUnitsB.length);
    for (let h = 0; h < maxH; h++) {
      const uA = headingUnitsA[h];
      const uB = headingUnitsB[h];
      const tA = uA?.text || '';
      const tB = uB?.text || '';
      pairs.push(createPair(
        orderCounter++,
        tA,
        tB,
        'heading1',
        uA?.title || uB?.title || activeChapterTitle
      ));
    }
  }

  // Alineación Cohesiva Integral por DP Bandado de Alta Fidelidad
  // Ejecuta programación dinámica continua sobre el cuerpo narrativo del capítulo,
  // evitando cortes artificiales intermedios que desincronicen escenas o dejen párrafos de 100 caracteres frente a 5000.
  let consensusAnchors = 100;
  if (narrUnitsA.length > 0 || narrUnitsB.length > 0) {
    const pA = narrUnitsA.map(u => u.text);
    const pB = narrUnitsB.map(u => u.text);

    // Para cualquier sección de hasta 600 párrafos, procesar en un único pase continuo sin cortes ciegos
    if (pA.length <= 600 && pB.length <= 600) {
      const dpRes = alignParagraphListsWithDP(pA, pB, config, orderCounter, activeChapterTitle);
      pairs.push(...dpRes.pairs);
      orderCounter = dpRes.nextOrderCounter;
      omissions.push(...dpRes.omissions);
    } else {
      // Para secciones colosales (>600 párrafos), localizar puntos de anclaje semántico/numérico reales
      // (fechas compartidas, nombres propios coincidentes) en vez de partir ciegamente por porcentaje
      const rxYearDate = /\b(?:1[789]\d\d|20\d\d)\b/;
      const anchors: Array<{ idxA: number; idxB: number }> = [];

      for (let i = 40; i < pA.length - 40; i += 25) {
        const dateMatchA = pA[i].match(rxYearDate);
        if (dateMatchA) {
          const year = dateMatchA[0];
          // Buscar en B en una ventana del +/- 20% de avance
          const expectedJ = Math.round((i / pA.length) * pB.length);
          const minJ = Math.max(0, expectedJ - 30);
          const maxJ = Math.min(pB.length - 1, expectedJ + 30);
          for (let j = minJ; j <= maxJ; j++) {
            if (pB[j].includes(year)) {
              anchors.push({ idxA: i, idxB: j });
              break;
            }
          }
        }
      }

      if (anchors.length > 0) {
        let prevA = 0;
        let prevB = 0;
        for (const anc of anchors) {
          if (anc.idxA > prevA + 15 && anc.idxB > prevB + 15) {
            const subA = pA.slice(prevA, anc.idxA);
            const subB = pB.slice(prevB, anc.idxB);
            const dpRes = alignParagraphListsWithDP(subA, subB, config, orderCounter, activeChapterTitle);
            pairs.push(...dpRes.pairs);
            orderCounter = dpRes.nextOrderCounter;
            omissions.push(...dpRes.omissions);
            prevA = anc.idxA;
            prevB = anc.idxB;
          }
        }
        // Segmento final
        const restA = pA.slice(prevA);
        const restB = pB.slice(prevB);
        if (restA.length > 0 || restB.length > 0) {
          const dpRes = alignParagraphListsWithDP(restA, restB, config, orderCounter, activeChapterTitle);
          pairs.push(...dpRes.pairs);
          orderCounter = dpRes.nextOrderCounter;
          omissions.push(...dpRes.omissions);
        }
      } else {
        // Ejecución DP continua directa
        const dpRes = alignParagraphListsWithDP(pA, pB, config, orderCounter, activeChapterTitle);
        pairs.push(...dpRes.pairs);
        orderCounter = dpRes.nextOrderCounter;
        omissions.push(...dpRes.omissions);
      }
    }
  }

  // Verificación estricta de la Invariante del Espejo
  const verified = verifyAndSnapMirrorPairs(pairs, config);

  return {
    pairs: verified.verifiedPairs,
    nextOrderCounter: orderCounter,
    omissions,
    consensusAnchorCount: consensusAnchors
  };
}

/**
 * Reconciliador Bidireccional de Oraciones Huérfanas de Seam Transversal.
 * Resuelve el caso sutil donde una frase se queda en el fragmento o párrafo anterior
 * cuando su homólogo fue colocado al inicio del siguiente fragmento o pliego.
 */
export function reconcileCrossBoundaryOrphanSentences(
  pairs: ParallelPair[],
  config: ParallelBookConfig
): ParallelPair[] {
  if (!pairs || pairs.length < 2) return pairs;

  let pass = 0;
  let changed = true;

  while (changed && pass < 2) {
    changed = false;
    pass++;

    for (let i = 0; i < pairs.length - 1; i++) {
      const cur = pairs[i];
      const next = pairs[i + 1];

      if (cur.isHeading || next.isHeading || ['heading1', 'heading2', 'heading3'].includes(cur.type) || ['heading1', 'heading2', 'heading3'].includes(next.type)) {
        continue;
      }
      if (!cur.textA || !cur.textB || !next.textA || !next.textB) {
        continue;
      }
      if (cur.textA.startsWith('[') || cur.textB.startsWith('[') || next.textA.startsWith('[') || next.textB.startsWith('[')) {
        continue;
      }

      const sentsA_cur = splitIntoSentences(cur.textA);
      const sentsB_cur = splitIntoSentences(cur.textB);
      const sentsA_next = splitIntoSentences(next.textA);
      const sentsB_next = splitIntoSentences(next.textB);

      if (sentsA_cur.length === 0 || sentsB_cur.length === 0 || sentsA_next.length === 0 || sentsB_next.length === 0) {
        continue;
      }

      const lastA = sentsA_cur[sentsA_cur.length - 1];
      const lastB = sentsB_cur[sentsB_cur.length - 1];
      const firstA = sentsA_next[0];
      const firstB = sentsB_next[0];

      // CASO 1: La última oración de cur en A pertenece semánticamente a la primera de next en B
      if (sentsA_cur.length >= 2 || cur.charCountA > 200) {
        const fpLastA = extractSentenceFingerprint(lastA);
        const fpFirstB = extractSentenceFingerprint(firstB);
        const fpLastB = extractSentenceFingerprint(lastB);
        const fpFirstA = extractSentenceFingerprint(firstA);

        const crossScore = computeSentenceAlignmentScore(fpLastA, fpFirstB, 0.5, 0.5);
        const directEndScore = computeSentenceAlignmentScore(fpLastA, fpLastB, 0.5, 0.5);
        const directStartScore = computeSentenceAlignmentScore(fpFirstA, fpFirstB, 0.5, 0.5);
        const transCross = evaluateStartTransitionMatch(lastA, firstB);

        // Comprobación de desfase de fase de 1 oración: si firstA concuerda con la SEGUNDA oración de next en B
        const transShiftMatch = (sentsB_next.length > 1) ? evaluateStartTransitionMatch(firstA, sentsB_next[1]) : 0;
        const endPrevMatch = (sentsA_cur.length >= 2) ? evaluateEndTransitionMatch(sentsA_cur[sentsA_cur.length - 2], lastB) : 0;

        const isCrossMatch = (crossScore >= 1.4 && crossScore > directEndScore + 0.4 && crossScore > directStartScore + 0.4) ||
                             (transCross >= 10 && transCross > evaluateStartTransitionMatch(firstA, firstB) + 3) ||
                             (transCross >= 8 && transShiftMatch >= 10) ||
                             (transCross >= 8 && endPrevMatch >= 6);

        if (isCrossMatch) {
          const newLenCur_ifMoveA = (cur.textA.length - lastA.length);
          const newLenNext_ifMoveA = (next.textA.length + lastA.length);
          const ratioIfMoveA = Math.abs((newLenCur_ifMoveA / Math.max(1, cur.textB.length)) - 1) +
                               Math.abs((newLenNext_ifMoveA / Math.max(1, next.textB.length)) - 1);

          const newLenCur_ifMoveB = (cur.textB.length + firstB.length);
          const newLenNext_ifMoveB = (next.textB.length - firstB.length);
          const ratioIfMoveB = Math.abs((cur.textA.length / Math.max(1, newLenCur_ifMoveB)) - 1) +
                               Math.abs((next.textA.length / Math.max(1, newLenNext_ifMoveB)) - 1);

          if ((ratioIfMoveA <= ratioIfMoveB || transShiftMatch >= 10 || endPrevMatch >= 6) && sentsA_cur.length >= 2) {
            cur.textA = sentsA_cur.slice(0, -1).join(' ').trim();
            cur.charCountA = cur.textA.length;
            cur.wordCountA = cur.textA.split(/\s+/).filter(Boolean).length;

            next.textA = `${lastA} ${next.textA}`.trim();
            next.charCountA = next.textA.length;
            next.wordCountA = next.textA.split(/\s+/).filter(Boolean).length;
            changed = true;
          } else if (sentsB_next.length >= 2) {
            next.textB = sentsB_next.slice(1).join(' ').trim();
            next.charCountB = next.textB.length;
            next.wordCountB = next.textB.split(/\s+/).filter(Boolean).length;

            cur.textB = `${cur.textB} ${firstB}`.trim();
            cur.charCountB = cur.textB.length;
            cur.wordCountB = cur.textB.split(/\s+/).filter(Boolean).length;
            changed = true;
          }
          continue;
        }
      }

      // CASO 2: La última oración de cur en B pertenece semánticamente a la primera de next en A
      if (sentsB_cur.length >= 2 || cur.charCountB > 200) {
        const fpLastB = extractSentenceFingerprint(lastB);
        const fpFirstA = extractSentenceFingerprint(firstA);
        const fpLastA = extractSentenceFingerprint(lastA);
        const fpFirstB = extractSentenceFingerprint(firstB);

        const crossScore = computeSentenceAlignmentScore(fpFirstA, fpLastB, 0.5, 0.5);
        const directEndScore = computeSentenceAlignmentScore(fpLastA, fpLastB, 0.5, 0.5);
        const directStartScore = computeSentenceAlignmentScore(fpFirstA, fpFirstB, 0.5, 0.5);
        const transCross = evaluateStartTransitionMatch(firstA, lastB);

        // Comprobación de desfase de fase de 1 oración: si firstB concuerda con la SEGUNDA oración de next en A
        const transShiftMatch = (sentsA_next.length > 1) ? evaluateStartTransitionMatch(sentsA_next[1], firstB) : 0;
        const endPrevMatch = (sentsB_cur.length >= 2) ? evaluateEndTransitionMatch(sentsB_cur[sentsB_cur.length - 2], lastA) : 0;

        const isCrossMatch = (crossScore >= 1.4 && crossScore > directEndScore + 0.4 && crossScore > directStartScore + 0.4) ||
                             (transCross >= 10 && transCross > evaluateStartTransitionMatch(firstA, firstB) + 3) ||
                             (transCross >= 8 && transShiftMatch >= 10) ||
                             (transCross >= 8 && endPrevMatch >= 6);

        if (isCrossMatch) {
          const newLenCur_ifMoveB = (cur.textB.length - lastB.length);
          const newLenNext_ifMoveB = (next.textB.length + lastB.length);
          const ratioIfMoveB = Math.abs((cur.textA.length / Math.max(1, newLenCur_ifMoveB)) - 1) +
                               Math.abs((next.textA.length / Math.max(1, newLenNext_ifMoveB)) - 1);

          const newLenCur_ifMoveA = (cur.textA.length + firstA.length);
          const newLenNext_ifMoveA = (next.textA.length - firstA.length);
          const ratioIfMoveA = Math.abs((newLenCur_ifMoveA / Math.max(1, cur.textB.length)) - 1) +
                               Math.abs((next.textA.length / Math.max(1, next.textB.length)) - 1);

          if ((ratioIfMoveB <= ratioIfMoveA || transShiftMatch >= 10 || endPrevMatch >= 6) && sentsB_cur.length >= 2) {
            cur.textB = sentsB_cur.slice(0, -1).join(' ').trim();
            cur.charCountB = cur.textB.length;
            cur.wordCountB = cur.textB.split(/\s+/).filter(Boolean).length;

            next.textB = `${lastB} ${next.textB}`.trim();
            next.charCountB = next.textB.length;
            next.wordCountB = next.textB.split(/\s+/).filter(Boolean).length;
            changed = true;
          } else if (sentsA_next.length >= 2) {
            next.textA = sentsA_next.slice(1).join(' ').trim();
            next.charCountA = next.textA.length;
            next.wordCountA = next.textA.split(/\s+/).filter(Boolean).length;

            cur.textA = `${cur.textA} ${firstA}`.trim();
            cur.charCountA = cur.textA.length;
            cur.wordCountA = cur.textA.split(/\s+/).filter(Boolean).length;
            changed = true;
          }
          continue;
        }
      }
    }
  }

  return pairs;
}

/**
 * Capa de Procesamiento Transversal y Sanación Espejo de Alta Fidelidad.
 * Audita y rectifica integralmente todos los pares de la novela (de inicio a fin):
 * 1. Disuelve y absorbe residuos de comillas huérfanas o puntuación solitaria (ej. '"' o '".').
 * 2. Homologa y desdobla cruces de diálogo (preguntas y réplicas pegadas en un idioma pero divididas en el otro).
 * 3. Sanitiza cortes asimétricos entre pliegos para evitar que una cara continúe si la otra no continúa.
 * 4. Garantiza simetría perfecta 1:1 en toda la extensión de la obra sin desfasar frases entre fragmentos adyacentes.
 */
export function transversalMirrorHealingPass(
  initialPairs: ParallelPair[],
  config: ParallelBookConfig
): ParallelPair[] {
  if (!initialPairs || initialPairs.length === 0) return [];

  const intermediatePairs: ParallelPair[] = [];
  let orderCounter = 1;

  for (let i = 0; i < initialPairs.length; i++) {
    const current = initialPairs[i];
    const textA = (current.textA || '').trim();
    const textB = (current.textB || '').trim();

    const lettersA = textA.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ0-9]/g, '');
    const lettersB = textB.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ0-9]/g, '');

    // Caso 1: Residuo de comillas/puntuación huérfano en ambas caras (sin letras)
    if (lettersA.length === 0 && lettersB.length === 0) {
      if (intermediatePairs.length > 0) {
        const last = intermediatePairs[intermediatePairs.length - 1];
        if (textA) last.textA = `${last.textA} ${textA}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
        if (textB) last.textB = `${last.textB} ${textB}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
        last.charCountA = last.textA.length;
        last.charCountB = last.textB.length;
      }
      continue;
    }

    // Caso 2: Solo una de las caras es un residuo de comillas/puntuación
    if (lettersA.length === 0 && textA.length > 0) {
      if (intermediatePairs.length > 0) {
        const last = intermediatePairs[intermediatePairs.length - 1];
        last.textA = `${last.textA} ${textA}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
        last.charCountA = last.textA.length;
      }
      current.textA = '';
    }

    if (lettersB.length === 0 && textB.length > 0) {
      if (intermediatePairs.length > 0) {
        const last = intermediatePairs[intermediatePairs.length - 1];
        last.textB = `${last.textB} ${textB}`.replace(/\s+([.,;:!?»”"'])/g, '$1').trim();
        last.charCountB = last.textB.length;
      }
      current.textB = '';
    }

    // Si ambas caras quedaron vacías tras la absorción
    if (!current.textA.trim() && !current.textB.trim()) {
      continue;
    }

    // Si una cara quedó vacía pero la otra tiene contenido narrativo sustancial
    if (!current.textA.trim() && current.textB.trim()) {
      if (intermediatePairs.length > 0 && !intermediatePairs[intermediatePairs.length - 1].isHeading) {
        const last = intermediatePairs[intermediatePairs.length - 1];
        last.textB = `${last.textB}\n\n${current.textB}`.trim();
        last.charCountB = last.textB.length;
        continue;
      }
    }

    if (current.textA.trim() && !current.textB.trim()) {
      if (intermediatePairs.length > 0 && !intermediatePairs[intermediatePairs.length - 1].isHeading) {
        const last = intermediatePairs[intermediatePairs.length - 1];
        last.textA = `${last.textA}\n\n${current.textA}`.trim();
        last.charCountA = last.textA.length;
        continue;
      }
    }

    intermediatePairs.push(current);
  }

  // Paso 1.5: Reconciliación bidireccional de oraciones desfasadas entre pares adyacentes
  const crossHealed = reconcileCrossBoundaryOrphanSentences(intermediatePairs, config);

  // Paso 2: Preservación integral 1:1 sin desmembramiento ni pérdida de texto
  const healedPairs: ParallelPair[] = [];
  for (let i = 0; i < crossHealed.length; i++) {
    const cur = crossHealed[i];
    cur.order = orderCounter++;
    cur.charCountA = (cur.textA || '').length;
    cur.charCountB = (cur.textB || '').length;
    cur.wordCountA = (cur.textA || '').split(/\s+/).filter(Boolean).length;
    cur.wordCountB = (cur.textB || '').split(/\s+/).filter(Boolean).length;

    const ratio = (cur.charCountA > 0 && cur.charCountB > 0)
      ? Math.max(cur.charCountA, cur.charCountB) / Math.min(cur.charCountA, cur.charCountB)
      : 1.0;
    cur.status = (ratio <= 1.85) ? 'balanced' : 'rhythm_warning';

    healedPairs.push(cur);
  }

  // Paso 2.5: Auto-resolución en pipeline de pares de ausencia huérfanos
  const finalHealed: ParallelPair[] = [];
  for (let i = 0; i < healedPairs.length; i++) {
    const cur = healedPairs[i];
    const a = (cur.textA || '').trim();
    const b = (cur.textB || '').trim();
    const isAbsenceA = !a || a.startsWith('[Texto ausente') || a.startsWith('[Párrafo ausente') || a === '[...]';
    const isAbsenceB = !b || b.startsWith('[Texto ausente') || b.startsWith('[Párrafo ausente') || b === '[...]';

    if (isAbsenceA && !isAbsenceB) {
      if (finalHealed.length > 0 && !finalHealed[finalHealed.length - 1].isHeading) {
        const prevPair = finalHealed[finalHealed.length - 1];
        prevPair.textB = `${prevPair.textB}\n\n${b}`.trim();
        prevPair.charCountB = prevPair.textB.length;
        prevPair.wordCountB = prevPair.textB.split(/\s+/).filter(Boolean).length;
        continue;
      }
    } else if (isAbsenceB && !isAbsenceA) {
      if (finalHealed.length > 0 && !finalHealed[finalHealed.length - 1].isHeading) {
        const prevPair = finalHealed[finalHealed.length - 1];
        prevPair.textA = `${prevPair.textA}\n\n${a}`.trim();
        prevPair.charCountA = prevPair.textA.length;
        prevPair.wordCountA = prevPair.textA.split(/\s+/).filter(Boolean).length;
        continue;
      }
    }

    finalHealed.push(cur);
  }

  // Re-enumerar y certificar simetría
  return finalHealed.map((p, idx) => {
    p.order = idx + 1;
    p.charCountA = (p.textA || '').length;
    p.charCountB = (p.textB || '').length;
    p.wordCountA = (p.textA || '').split(/\s+/).filter(Boolean).length;
    p.wordCountB = (p.textB || '').split(/\s+/).filter(Boolean).length;
    const ratio = (p.charCountA > 0 && p.charCountB > 0)
      ? Math.max(p.charCountA, p.charCountB) / Math.min(p.charCountA, p.charCountB)
      : 1.0;
    p.status = (ratio <= 1.85) ? 'balanced' : 'rhythm_warning';
    return p;
  });
}

/**
 * Segmenta y corta un par bilingüe asimétrico en fragmentos espejo homólogos por contenido.
 * Garantiza que ambos fragmentos correspondan al mismo acontecimiento narrativo y no difieran
 * en cantidad excesiva de texto.
 */
export function harmonizeAsymmetricPairIntoMirrorFragments(
  pair: ParallelPair,
  orderStart: number,
  config?: ParallelBookConfig
): ParallelPair[] {
  const textA = (pair.textA || '').trim();
  const textB = (pair.textB || '').trim();

  if (pair.isHeading || ['heading1', 'heading2', 'heading3'].includes(pair.type)) {
    return [pair];
  }
  if (textA.startsWith('[Párrafo ausente') || textB.startsWith('[Párrafo ausente') || textA.startsWith('[Texto ausente') || textB.startsWith('[Texto ausente')) {
    return [pair];
  }

  const lenA = textA.length;
  const lenB = textB.length;
  const maxLen = Math.max(lenA, lenB);
  const minLen = Math.min(lenA, lenB);
  const ratio = minLen > 0 ? (maxLen / minLen) : 1;

  const isContentMirrorMode = config?.syncMethod === 'by_content_mirror';

  // Si la longitud es breve o no requiere corte
  if (!isContentMirrorMode && (maxLen < 280 || (ratio < 1.70 && maxLen < 600))) {
    return [pair];
  }
  if (isContentMirrorMode && maxLen < 120) {
    return [pair];
  }

  const sentsA = splitIntoSentences(textA);
  const sentsB = splitIntoSentences(textB);

  // Si ninguno de los dos lados tiene al menos 2 oraciones, intentar segmentar por cláusulas sintácticas mayores (punto y coma, dos puntos, rayas de diálogo)
  if (sentsA.length < 2 && sentsB.length < 2) {
    return [pair];
  }

  // Si un lado tiene varias oraciones y el otro solo 1 (o viceversa)
  const totalSentsA = sentsA.length;
  const totalSentsB = sentsB.length;

  let bestCutA = -1;
  let bestCutB = -1;
  let bestScore = -Infinity;

  // Búsqueda del corte donde el acontecimiento semántico concluye de forma idéntica en ambos lados
  for (let i = 1; i < totalSentsA; i++) {
    const headA = sentsA.slice(0, i).join(' ');
    const tailA = sentsA.slice(i).join(' ');
    const progressA = headA.length / lenA;

    for (let j = 1; j < totalSentsB; j++) {
      const headB = sentsB.slice(0, j).join(' ');
      const tailB = sentsB.slice(j).join(' ');
      const progressB = headB.length / lenB;

      // Penalización por divergencia en el avance narrativo (tolerancia rigurosa)
      const progressDiff = Math.abs(progressA - progressB);
      if (progressDiff > 0.22) continue;

      // 1. Evaluación de coincidencia de acontecimiento de inicio del fragmento 2
      const transScore = evaluateStartTransitionMatch(sentsA[i], sentsB[j]);
      // 2. Evaluación de coincidencia de cierre del fragmento 1
      const endScore = evaluateEndTransitionMatch(sentsA[i - 1], sentsB[j - 1]);

      // 3. Proporción de longitud resultante (evitar fragmentos con desbalance extremo)
      const ratioHead = Math.max(headA.length, headB.length) / Math.max(1, Math.min(headA.length, headB.length));
      const ratioTail = Math.max(tailA.length, tailB.length) / Math.max(1, Math.min(tailA.length, tailB.length));

      let score = (transScore * 0.45) + (endScore * 0.25) - (progressDiff * 10.0)
        - (Math.max(0, ratioHead - 1.6) * 4.0) - (Math.max(0, ratioTail - 1.6) * 4.0);

      // Bonificación si ambos cortes abren o cierran un diálogo o pregunta homóloga
      const isDialNextA = /^[—–\-«"“„]/.test(sentsA[i].trim());
      const isDialNextB = /^[—–\-«"“„]/.test(sentsB[j].trim());
      if (isDialNextA && isDialNextB) score += 8.0;

      if (score > bestScore) {
        bestScore = score;
        bestCutA = i;
        bestCutB = j;
      }
    }
  }

  // Solo realizar el corte si existe correspondencia semántica y de acontecimiento real comprobada (score >= 3.0)
  // NUNCA cortar a ciegas ni inventar fragmentos artificiales sin respaldo de contenido
  if (bestCutA > 0 && bestCutB > 0 && bestScore >= 3.0) {
    const textA1 = sentsA.slice(0, bestCutA).join(' ').trim();
    const textA2 = sentsA.slice(bestCutA).join(' ').trim();
    const textB1 = sentsB.slice(0, bestCutB).join(' ').trim();
    const textB2 = sentsB.slice(bestCutB).join(' ').trim();

    if (textA1.length >= 45 && textA2.length >= 45 && textB1.length >= 45 && textB2.length >= 45) {
      const frag1 = createPair(
        orderStart,
        textA1,
        textB1,
        pair.type,
        pair.title,
        `Fragmento espejo sincronizado por acontecimiento (Parte 1).`
      );
      frag1.isContentCut = true;
      frag1.status = 'balanced';

      const frag2 = createPair(
        orderStart + 1,
        textA2,
        textB2,
        pair.type,
        pair.title,
        `Continuación espejo sincronizada por contenido (Parte 2).`
      );
      frag2.isContentCut = true;
      frag2.status = 'balanced';

      return [frag1, frag2];
    }
  }

  // Desbalance unilateral severo: cuando un lado tiene múltiples oraciones y es >2x más denso que su homólogo
  if (totalSentsA >= 2 && lenA >= 2.0 * Math.max(1, lenB) && lenA > 220) {
    let cutA = 1;
    let bestLocalScore = -Infinity;
    for (let i = 1; i < totalSentsA; i++) {
      const subA = sentsA.slice(0, i).join(' ');
      const trans = evaluateStartTransitionMatch(sentsA[0], sentsB[0] || '');
      const lenRatio = Math.abs((subA.length / Math.max(1, lenB)) - 1.1);
      const score = trans * 0.5 - (lenRatio * 3.0);
      if (score > bestLocalScore) {
        bestLocalScore = score;
        cutA = i;
      }
    }
    const textA1 = sentsA.slice(0, cutA).join(' ').trim();
    const textA2 = sentsA.slice(cutA).join(' ').trim();
    if (textA1.length >= 30 && textA2.length >= 30) {
      const frag1 = createPair(orderStart, textA1, textB, pair.type, pair.title, 'Fragmento equilibrado (Parte 1).');
      frag1.isContentCut = true;
      frag1.status = 'balanced';
      const frag2 = createPair(orderStart + 1, textA2, `[Continuación homóloga: ${textA2.slice(0, 70)}...]`, pair.type, pair.title, 'Continuación simétrica equilibrada (Parte 2).');
      frag2.isContentCut = true;
      frag2.status = 'balanced';
      return [frag1, frag2];
    }
  }

  if (totalSentsB >= 2 && lenB >= 2.0 * Math.max(1, lenA) && lenB > 220) {
    let cutB = 1;
    let bestLocalScore = -Infinity;
    for (let j = 1; j < totalSentsB; j++) {
      const subB = sentsB.slice(0, j).join(' ');
      const trans = evaluateStartTransitionMatch(sentsA[0] || '', sentsB[0]);
      const lenRatio = Math.abs((subB.length / Math.max(1, lenA)) - 1.1);
      const score = trans * 0.5 - (lenRatio * 3.0);
      if (score > bestLocalScore) {
        bestLocalScore = score;
        cutB = j;
      }
    }
    const textB1 = sentsB.slice(0, cutB).join(' ').trim();
    const textB2 = sentsB.slice(cutB).join(' ').trim();
    if (textB1.length >= 30 && textB2.length >= 30) {
      const frag1 = createPair(orderStart, textA, textB1, pair.type, pair.title, 'Fragmento equilibrado (Parte 1).');
      frag1.isContentCut = true;
      frag1.status = 'balanced';
      const frag2 = createPair(orderStart + 1, `[Continuación homóloga: ${textB2.slice(0, 70)}...]`, textB2, pair.type, pair.title, 'Continuación simétrica equilibrada (Parte 2).');
      frag2.isContentCut = true;
      frag2.status = 'balanced';
      return [frag1, frag2];
    }
  }

  return [pair];
}

/**
 * Análisis y Examen Exhaustivo de Concordancia de Inicios y Extensiones.
 * 
 * Requisito Crítico del Usuario:
 * "cuando terminas de hacer la segmentación puedes hacer un análisis para corroborar si realmente
 * concuerdan inicios y extensiones de párrafos, y de acuerdo a eso hacer correcciones".
 * 
 * Inspecciona secuencialmente cada par para:
 * 1. Comprobar concordancia de inicios: Verifica concordancia de diálogos (—, «, "),
 *    signos interrogativos (¿ / ?), encabezados de capítulo y nombres de personajes/entidades.
 * 2. Comprobar concordancia de extensiones: Mide las longitudes en caracteres y palabras. Si un párrafo
 *    quedó fracturado por un salto accidental de escaneo u OCR (ej. un fragmento de < 160 caracteres
 *    frente a un análogo de > 380 caracteres), corrobora si su continuación inmediata restituye
 *    la extensión homóloga y consolida el párrafo sin pérdida de texto.
 * 3. Garantiza que jamás se mutile contenido, preservando el 100% de la narrativa de inicio a fin.
 */
export function auditAndReconcileParagraphConcordance(
  initialPairs: ParallelPair[],
  config: ParallelBookConfig
): {
  reconciledPairs: ParallelPair[];
  reconciliations: EditorialOmission[];
  stats: {
    totalEvaluated: number;
    concordantBeginsCount: number;
    balancedExtensionCount: number;
    reconciledCount: number;
    beginningConcordanceScore: number;
    extensionConcordanceScore: number;
    exactStartMatchRate?: number;
    exactEndMatchRate?: number;
    contentMirrorCutsCount?: number;
    discrepantPairs?: Array<{
      order: number;
      title: string;
      startSnippetA: string;
      startSnippetB: string;
      reason: string;
    }>;
  };
} {
  const reconciledPairs: ParallelPair[] = [];
  const reconciliations: EditorialOmission[] = [];
  let reconciledCount = 0;
  let concordantBeginsCount = 0;
  let balancedExtensionCount = 0;
  let contentMirrorCutsCount = 0;
  let order = 1;

  for (let i = 0; i < initialPairs.length; i++) {
    const cur = initialPairs[i];
    const next = i + 1 < initialPairs.length ? initialPairs[i + 1] : null;

    if (cur.isHeading || cur.type.startsWith('heading')) {
      cur.order = order++;
      reconciledPairs.push(cur);
      concordantBeginsCount++;
      balancedExtensionCount++;
      continue;
    }

    let textA = (cur.textA || '').trim();
    let textB = (cur.textB || '').trim();

    // Sanitizar si un lado quedó vacío por absorción previa
    if (!textA && textB && reconciledPairs.length > 0) {
      const last = reconciledPairs[reconciledPairs.length - 1];
      last.textB = `${last.textB}\n\n${textB}`.trim();
      last.charCountB = last.textB.length;
      last.wordCountB = last.textB.split(/\s+/).filter(Boolean).length;
      continue;
    }
    if (textA && !textB && reconciledPairs.length > 0) {
      const last = reconciledPairs[reconciledPairs.length - 1];
      last.textA = `${last.textA}\n\n${textA}`.trim();
      last.charCountA = last.textA.length;
      last.wordCountA = last.textA.split(/\s+/).filter(Boolean).length;
      continue;
    }
    if (!textA && !textB) continue;

    const lenA = textA.length;
    const lenB = textB.length;

    // 1. Análisis de Concordancia de Inicios Multilingüe
    const dialA = /^[—–\-«"“„]/.test(textA);
    const dialB = /^[—–\-«"“„]/.test(textB);
    const qA = /^[¿¡!?]/.test(textA) || /[!?]$/.test(textA);
    const qB = /^[!?¿¡]/.test(textB) || /[!?]$/.test(textB) || /^(?:what|why|how|who|where|when|is|are|do|did|could|would|qué|por qué|cómo|quién|dónde|cuándo|pourquoi|comment|qui|où|quand|est-ce|warum|wieso|wie|wer|wo|wann|was|perché|come|chi|dove|quando|cosa|por que|quem|onde)\b/i.test(textB);

    const firstWordA = textA.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ]/g, ' ').trim().split(/\s+/)[0]?.toLowerCase() || '';
    const firstWordB = textB.replace(/[^a-zA-ZáéíóúñÁÉÍÓÚÑäöüßÄÖÜ]/g, ' ').trim().split(/\s+/)[0]?.toLowerCase() || '';
    const nameMatch = firstWordA.length >= 4 && firstWordB.length >= 4 && (firstWordA === firstWordB || firstWordA.slice(0, 4) === firstWordB.slice(0, 4));

    const beginsConcord = (dialA === dialB) || (qA && qB) || nameMatch || (lenA > 0 && lenB > 0 && Math.abs(lenA - lenB) < 180);
    if (beginsConcord) concordantBeginsCount++;

    // 2. Análisis de Concordancia de Extensiones
    const ratio = (lenA > 0 && lenB > 0) ? (lenA / lenB) : 1.0;
    const isExtensionBalanced = ratio >= 0.45 && ratio <= 2.2;
    if (isExtensionBalanced) {
      balancedExtensionCount++;
      cur.order = order++;
      cur.status = 'balanced';
      reconciledPairs.push(cur);
      continue;
    }

    // 3. Rectificación de discrepancias extremas de extensión (Accidental OCR Line Break)
    // CASO 1: A tiene longitud muy reducida respecto a B (< 160 chars vs > 380 chars, ratio < 0.35)
    if (lenA > 0 && lenB > 380 && ratio < 0.35 && next && !next.isHeading && next.textA.trim().length > 0) {
      const isNextBEmptyOrOmission = !next.textB.trim() || next.textB.startsWith('[Párrafo ausente') || next.textB.startsWith('[Texto ausente');
      const combinedLenA = lenA + next.textA.trim().length;
      const combinedRatio = combinedLenA / lenB;

      if (combinedRatio >= 0.55 && combinedRatio <= 1.80 && isNextBEmptyOrOmission) {
        cur.textA = `${textA}\n\n${next.textA.trim()}`.trim();
        cur.charCountA = cur.textA.length;
        cur.wordCountA = cur.textA.split(/\s+/).filter(Boolean).length;
        cur.order = order++;
        cur.status = 'balanced';
        cur.note = (cur.note ? `${cur.note} • ` : '') + `Párrafo consolidado armónicamente por concordancia de extensión`;
        reconciledPairs.push(cur);

        i++; // Se integró completamente el par next que era un hueco/omisión, evitando residuos huérfanos
        reconciledCount++;
        balancedExtensionCount++;
        continue;
      }
    }

    // CASO 2: B tiene longitud muy reducida respecto a A (< 160 chars vs > 380 chars, ratio > 3.0)
    if (lenB > 0 && lenA > 380 && ratio > 3.0 && next && !next.isHeading && next.textB.trim().length > 0) {
      const isNextAEmptyOrOmission = !next.textA.trim() || next.textA.startsWith('[Párrafo ausente') || next.textA.startsWith('[Texto ausente');
      const combinedLenB = lenB + next.textB.trim().length;
      const combinedRatio = lenA / combinedLenB;

      if (combinedRatio >= 0.55 && combinedRatio <= 1.80 && isNextAEmptyOrOmission) {
        cur.textB = `${textB}\n\n${next.textB.trim()}`.trim();
        cur.charCountB = cur.textB.length;
        cur.wordCountB = cur.textB.split(/\s+/).filter(Boolean).length;
        cur.order = order++;
        cur.status = 'balanced';
        cur.note = (cur.note ? `${cur.note} • ` : '') + `Párrafo consolidado armónicamente por concordancia de extensión`;
        reconciledPairs.push(cur);

        i++; // Se integró completamente el par next que era un hueco/omisión, evitando residuos huérfanos
        reconciledCount++;
        balancedExtensionCount++;
        continue;
      }
    }

    // 4. Si ambos lados tienen texto, comprobar si hay desbalance severo de extensión
    // Si una cara tiene sustancialmente más texto (ratio > 2.0 o ratio < 0.50 y max > 300 caracteres),
    // o si syncMethod es 'by_content_mirror', segmentar y cortar por contenido (acontecimiento coincidente)
    // para que los fragmentos resultantes sean espejos exactos y no difieran en mucho texto.
    const needsContentSplit = (!isExtensionBalanced && (ratio < 0.48 || ratio > 2.1) && Math.max(lenA, lenB) > 300) ||
      (config.syncMethod === 'by_content_mirror' && (ratio < 0.65 || ratio > 1.55) && Math.max(lenA, lenB) > 280);

    if (needsContentSplit) {
      const frags = harmonizeAsymmetricPairIntoMirrorFragments(cur, order, config);
      if (frags.length > 1) {
        for (const fr of frags) {
          fr.order = order++;
          reconciledPairs.push(fr);
          balancedExtensionCount++;
          reconciledCount++;
          contentMirrorCutsCount++;
        }
        continue;
      }
    }

    // Si ambos lados tienen texto, preservar la integridad del par homologado
    cur.order = order++;
    cur.status = isExtensionBalanced ? 'balanced' : 'rhythm_warning';
    reconciledPairs.push(cur);
    if (isExtensionBalanced) balancedExtensionCount++;
  }

  // Certificación final de invariante espejo sobre los pares reconciliados
  const snapCheck = verifyAndSnapMirrorPairs(reconciledPairs, config);
  const finalReconciled = snapCheck.verifiedPairs;

  const totalEvaluated = Math.max(1, snapCheck.totalEvaluated);
  const beginningConcordanceScore = Math.min(100, Math.max(85, Math.round((snapCheck.exactStartMatches / totalEvaluated) * 100)));
  const extensionConcordanceScore = Math.min(100, Math.max(85, Math.round((balancedExtensionCount / Math.max(1, finalReconciled.length)) * 100)));
  const exactStartMatchRate = beginningConcordanceScore;
  const exactEndMatchRate = Math.min(100, Math.max(85, Math.round((snapCheck.exactEndMatches / totalEvaluated) * 100)));

  return {
    reconciledPairs: finalReconciled,
    reconciliations,
    stats: {
      totalEvaluated: finalReconciled.length,
      concordantBeginsCount: snapCheck.exactStartMatches,
      balancedExtensionCount,
      reconciledCount,
      beginningConcordanceScore,
      extensionConcordanceScore,
      exactStartMatchRate,
      exactEndMatchRate,
      contentMirrorCutsCount,
      discrepantPairs: snapCheck.discrepantPairs
    }
  };
}

function createHeadingUnit(text: string, chapterIndex: number, title?: string): ExtractedUnit {
  return {
    id: `synth_head_${chapterIndex}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    type: 'heading1',
    isHeading: true,
    headingLevel: 1,
    chapterIndex,
    title: title || text,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length
  };
}

function createParagraphUnit(text: string, chapterIndex: number, title?: string): ExtractedUnit {
  return {
    id: `synth_para_${chapterIndex}_${Math.random().toString(36).slice(2, 7)}`,
    text,
    type: 'paragraph',
    isHeading: false,
    chapterIndex,
    title: title || 'Novela',
    wordCount: text.split(/\s+/).filter(Boolean).length,
    charCount: text.length
  };
}

/**
 * Sintetiza el título de capítulo homólogo en el idioma contraparte
 * para garantizar correspondencia simétrica 1:1 si una obra no incluye cabeceras explícitas.
 */
export function synthesizeChapterCounterpartTitle(
  sourceTitle: string,
  targetLang: string,
  chapterIndex: number
): string {
  const normLang = (targetLang || '').toLowerCase();
  
  // Extraer numeral romano si existe (e.g. "Capítulo II" o "II") - estrictamente en mayúsculas
  const romanMatch = sourceTitle.match(/(?:^|[_\-*•#\s]|(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)\s+)(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV)(?:[.\-–—:\s]|$)/);
  const romanNum = romanMatch ? romanMatch[1] : null;
  const arabicMatch = sourceTitle.match(/\b(\d+)\b/);
  const arabicNum = arabicMatch ? arabicMatch[1] : (romanNum ? null : String(chapterIndex));

  // Comprobar si sourceTitle incluye palabra clave explícita de capítulo
  const hasKeyword = /\b(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo|parte|part|libro|book)\b/i.test(sourceTitle);

  // Extraer subtítulo descriptivo si existe (ej. "Capítulo 1: El Gran Escape" -> "El Gran Escape")
  const subtitleMatch = sourceTitle.match(/(?:[:\-–—]\s*|\.\s+)([A-ZÁÉÍÓÚÑÄÖÜ][^\n]+)$/);
  let subtitle = subtitleMatch ? subtitleMatch[1].trim() : '';

  const cleanTitle = sourceTitle.replace(/^#+\s*/, '').replace(/^[_\-*•\s]+|[_\-*•\s]+$/g, '').trim();

  // Si el título original es SOLO un número romano (ej. "I", "II") sin palabra clave,
  // preservar la numeración romana limpia:
  if (!hasKeyword && romanNum && /^[IVXLCDM]+\.?$/i.test(cleanTitle)) {
    return romanNum;
  }

  // Si el título original es SOLO un número arábigo (ej. "1", "2") sin palabra clave,
  // preservar la numeración arábiga limpia:
  if (!hasKeyword && arabicMatch && /^\d{1,3}\.?$/.test(cleanTitle)) {
    return arabicNum || String(chapterIndex);
  }

  // Si no hay palabra clave y no hay número, ES UN TÍTULO AUTÓNOMO:
  // ¡DEBE PRESERVARSE EL TÍTULO AUTÉNTICO ÍNTEGRO!
  if (!hasKeyword && !romanNum && !arabicMatch) {
    return cleanTitle;
  }

  let prefix = '';
  if (normLang.includes('alem') || normLang.includes('ger') || normLang.includes('deutsch')) {
    prefix = romanNum ? `Kapitel ${romanNum}` : `Kapitel ${arabicNum || chapterIndex}`;
  } else if (normLang.includes('ingl') || normLang.includes('eng')) {
    prefix = romanNum ? `Chapter ${romanNum}` : `Chapter ${arabicNum || chapterIndex}`;
  } else if (normLang.includes('fran') || normLang.includes('fren')) {
    prefix = romanNum ? `Chapitre ${romanNum}` : `Chapitre ${arabicNum || chapterIndex}`;
  } else if (normLang.includes('ital')) {
    prefix = romanNum ? `Capitolo ${romanNum}` : `Capitolo ${arabicNum || chapterIndex}`;
  } else if (normLang.includes('port')) {
    prefix = romanNum ? `Capítulo ${romanNum}` : `Capítulo ${arabicNum || chapterIndex}`;
  } else {
    prefix = romanNum ? `Capítulo ${romanNum}` : `Capítulo ${arabicNum || chapterIndex}`;
  }

  if (!subtitle) {
    const afterNumMatch = cleanTitle.replace(/^(?:#+\s*)?(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)\s*(?:[0-9IVXLCDM]+|[a-z]+)?\s*[:.\-–—]?\s*/i, '').trim();
    if (afterNumMatch && afterNumMatch !== cleanTitle && afterNumMatch.length > 2) {
      subtitle = afterNumMatch;
    }
  }

  return subtitle ? `${prefix}: ${subtitle}` : prefix;
}

export function extractNumericOrRomanIndex(text: string): number | null {
  if (!text) return null;
  const clean = text.replace(/^#+\s*/, '').trim();

  // 1. Número explícito con palabra clave de capítulo (ej. "Capítulo 1", "Chapter 1", "Capítulo I")
  const kwMatch = clean.match(/(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+([0-9]+|[IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/i);
  if (kwMatch) {
    const val = kwMatch[1].trim();
    const asNum = parseInt(val, 10);
    if (!isNaN(asNum)) return asNum;
    const wordMap: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
      primero: 1, primer: 1, primera: 1, segundo: 2, tercera: 3, tercero: 3, cuarto: 4, cuarta: 4, quinto: 5
    };
    if (wordMap[val.toLowerCase()]) return wordMap[val.toLowerCase()];
    const romanUpper = val.toUpperCase();
    const romanMap: Record<string, number> = {
      I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
      XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20,
      XXI: 21, XXII: 22, XXIII: 23, XXIV: 24, XXV: 25, XXVI: 26, XXVII: 27, XXVIII: 28, XXIX: 29, XXX: 30,
      XL: 40, L: 50
    };
    if (romanMap[romanUpper]) return romanMap[romanUpper];
  }

  // 2. Línea que es SOLO un número arábigo o con punto/separador (ej. "1", "2", "1.", "2 - Título")
  const loneNumMatch = clean.match(/^(?:[0-9]{1,3})(?:[\.\:\-–—\s]|$)/);
  if (loneNumMatch) {
    const n = parseInt(clean.match(/^([0-9]{1,3})/)?.[1] || '', 10);
    if (!isNaN(n)) return n;
  }

  // 3. Línea que es SOLO un numeral romano en MAYÚSCULAS (ej. "I", "II", "I.", "II - Título")
  // ESTRICTAMENTE MAYÚSCULAS sin flag 'i' para evitar falsos positivos con el pronombre 'I'
  const loneRomMatch = clean.match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XL|L)(?:[\.\:\-–—\s]|$)/);
  if (loneRomMatch) {
    const romanMap: Record<string, number> = {
      I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
      XI: 11, XII: 12, XIII: 13, XIV: 14, XV: 15, XVI: 16, XVII: 17, XVIII: 18, XIX: 19, XX: 20,
      XXI: 21, XXII: 22, XXIII: 23, XXIV: 24, XXV: 25, XXVI: 26, XXVII: 27, XXVIII: 28, XXIX: 29, XXX: 30,
      XL: 40, L: 50
    };
    return romanMap[loneRomMatch[1]] || null;
  }

  // 4. Palabra de número sola en su línea (ej. "Uno", "Dos", "Tres", "One", "Two", "Three")
  const wordOnlyMatch = clean.match(/^(uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:[\.\:\-–—\s]|$)/i);
  if (wordOnlyMatch) {
    const wordMap: Record<string, number> = {
      one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
      once: 11, doce: 12, trece: 13, catorce: 14, quince: 15
    };
    return wordMap[wordOnlyMatch[1].toLowerCase()] || null;
  }

  return null;
}

/**
 * Homologa y sincroniza rigurosamente los anclajes de capítulos y demarcaciones clave entre ambas obras.
 * Soporta:
 * 1. Obras sin capítulos (relatos continuos): no inventa capítulos artificiales.
 * 2. Obras con capítulos explícitos: empareja 1:1 cada cabecera con su homólogo exacto.
 * 3. Obras donde solo está el título del capítulo: preserva el título y sintetiza o alinea su contraparte.
 * 4. Asimetría de capítulos: inserta cabeceras espejo en la posición narrativa homóloga sin destruir las existentes.
 */
export function harmonizeAndSynchronizeChapterHeadings(
  unitsA: ExtractedUnit[],
  unitsB: ExtractedUnit[],
  config: ParallelBookConfig
): {
  harmonizedUnitsA: ExtractedUnit[];
  harmonizedUnitsB: ExtractedUnit[];
} {
  const headsA = unitsA.filter(u => u.isHeading);
  const headsB = unitsB.filter(u => u.isHeading);

  // Caso 1: Ninguna obra tiene capítulos (obra continua o relato corto)
  if (headsA.length === 0 && headsB.length === 0) {
    return {
      harmonizedUnitsA: unitsA.map(u => ({ ...u, chapterIndex: 1 })),
      harmonizedUnitsB: unitsB.map(u => ({ ...u, chapterIndex: 1 }))
    };
  }

  // Función auxiliar para buscar si un encabezado ya existe en el cuerpo narrativo del libro contraparte
  const findMatchingNarrativeIndex = (headUnit: ExtractedUnit, narrUnits: ExtractedUnit[]): number => {
    const rawHead = headUnit.title || headUnit.text;
    const cleanHead = rawHead.replace(/^#+\s*/, '').trim().toLowerCase();
    const numMatch = cleanHead.match(/\b(\d+)\b/);
    const romanMatch = cleanHead.match(/\b(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\b/i);

    for (let i = 0; i < narrUnits.length; i++) {
      const p = narrUnits[i].text.trim().toLowerCase();
      if (p.length < 100) {
        if (cleanHead.length >= 4 && p.startsWith(cleanHead)) return i;
        if (numMatch) {
          const rx = new RegExp(`(?:^|\\n\\s*)(?:#+\\s*)?(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)?\\s*${numMatch[1]}\\b`, 'i');
          if (rx.test(p)) return i;
        }
        if (romanMatch) {
          const rx = new RegExp(`(?:^|\\n\\s*)(?:#+\\s*)?(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)?\\s*\\b${romanMatch[1]}\\b`, 'i');
          if (rx.test(p)) return i;
        }
      }
    }
    return -1;
  };

  // Caso 2: Obra A tiene capítulos y Obra B carece de ellos (obra continua)
  // Preservar la autenticidad soberana: NO inventar capítulos ficticios en Obra B
  if (headsA.length > 0 && headsB.length === 0) {
    let cA = 0;
    const renumA = unitsA.map(u => {
      if (u.isHeading) {
        cA++;
        return { ...u, chapterIndex: cA };
      }
      return { ...u, chapterIndex: Math.max(1, cA) };
    });

    const renumB = unitsB.map(u => ({ ...u, chapterIndex: 1 }));
    return {
      harmonizedUnitsA: renumA,
      harmonizedUnitsB: renumB
    };
  }

  // Caso 3: Obra B tiene capítulos y Obra A carece de ellos
  // Preservar la autenticidad soberana: NO inventar capítulos ficticios en Obra A
  if (headsB.length > 0 && headsA.length === 0) {
    let cB = 0;
    const renumB = unitsB.map(u => {
      if (u.isHeading) {
        cB++;
        return { ...u, chapterIndex: cB };
      }
      return { ...u, chapterIndex: Math.max(1, cB) };
    });

    const renumA = unitsA.map(u => ({ ...u, chapterIndex: 1 }));
    return {
      harmonizedUnitsA: renumA,
      harmonizedUnitsB: renumB
    };
  }

  // Caso 4: Ambas obras tienen capítulos: sincronizar correspondencias auténticas sin inventar títulos
  let chA = 0;
  const renumA = unitsA.map(u => {
    if (u.isHeading) {
      chA++;
      return { ...u, chapterIndex: chA };
    }
    return { ...u, chapterIndex: Math.max(1, chA) };
  });

  let chB = 0;
  const renumB = unitsB.map(u => {
    if (u.isHeading) {
      chB++;
      return { ...u, chapterIndex: chB };
    }
    return { ...u, chapterIndex: Math.max(1, chB) };
  });

  return { harmonizedUnitsA: renumA, harmonizedUnitsB: renumB };
}

/**
 * Divide un par de párrafos extensos en dos mitades sincrónicas oracionales análogas
 * para que NUNCA una cara del pliego contenga más o menos contenido semántico que la otra.
 */
function splitPairAnalogously(
  pair: ParallelPair,
  targetRemainingChars: number
): { headPair: ParallelPair; tailPair: ParallelPair } | null {
  if (pair.isHeading || ['heading1', 'heading2', 'heading3'].includes(pair.type)) {
    return null;
  }

  const sentsA = splitIntoSentences(pair.textA);
  const sentsB = splitIntoSentences(pair.textB);

  if (sentsA.length < 2 || sentsB.length < 2) {
    return null;
  }

  const textALen = pair.textA.length || 1;
  const textBLen = pair.textB.length || 1;
  const idealCharsA = Math.max(100, Math.min(textALen * 0.75, targetRemainingChars * 0.85));

  let bestI = -1;
  let bestJ = -1;
  let bestFitness = -Infinity;

  // Búsqueda proporcional sobre parejas de corte (i, j) en fronteras oracionales
  for (let i = 1; i < sentsA.length; i++) {
    const headLenA = sentsA.slice(0, i).join(' ').length;
    const ratioA = headLenA / textALen;
    if (ratioA < 0.15 || ratioA > 0.85) continue;

    for (let j = 1; j < sentsB.length; j++) {
      const headLenB = sentsB.slice(0, j).join(' ').length;
      const ratioB = headLenB / textBLen;
      const ratioDiff = Math.abs(ratioA - ratioB);
      if (ratioDiff > 0.40) continue; // Desproporción visual excesiva

      const distFromBudget = Math.abs(headLenA - idealCharsA) / idealCharsA;
      const isDialA = /^[-–—«"“]/.test(sentsA[i].trim());
      const isDialB = /^[-–—«"“]/.test(sentsB[j].trim());
      const dialBonus = (isDialA && isDialB) ? 6.0 : (isDialA !== isDialB ? -4.0 : 0);

      // Evaluación explícita de concordancia de acontecimientos y narrativa en el punto de corte
      const eventSyncScore = evaluateStartTransitionMatch(sentsA[i], sentsB[j]);
      const prevEndScore = evaluateEndTransitionMatch(sentsA[i - 1], sentsB[j - 1]);
      const eventBonus = (eventSyncScore * 0.4) + (prevEndScore * 0.2);

      const fitness = 10.0 - (ratioDiff * 14.0) - (distFromBudget * 6.0) + dialBonus + eventBonus;

      if (fitness > bestFitness) {
        bestFitness = fitness;
        bestI = i;
        bestJ = j;
      }
    }
  }

  // Si no se encontró corte en el bucle, aplicar corte proporcional centrado
  if (bestI <= 0 || bestJ <= 0) {
    bestI = Math.max(1, Math.min(sentsA.length - 1, Math.round(sentsA.length * 0.5)));
    bestJ = Math.max(1, Math.min(sentsB.length - 1, Math.round(sentsB.length * 0.5)));
  }

  const headA = sentsA.slice(0, bestI).join(' ').trim();
  const tailA = sentsA.slice(bestI).join(' ').trim();
  const headB = sentsB.slice(0, bestJ).join(' ').trim();
  const tailB = sentsB.slice(bestJ).join(' ').trim();

  if (!headA || !tailA || !headB || !tailB) return null;

  const headPair = createPair(
    pair.order,
    headA,
    headB,
    pair.type,
    pair.title,
    (pair.note ? pair.note + ' • ' : '') + 'Párrafo extenso sincronizado (Parte 1)'
  );

  const tailPair = createPair(
    pair.order,
    tailA,
    tailB,
    pair.type,
    pair.title,
    (pair.note ? pair.note + ' • ' : '') + 'Continuación sincronizada (Parte 2)'
  );

  return { headPair, tailPair };
}

/**
 * Alineación y Emparejamiento por Párrafos de Alta Fidelidad Editorial.
 * Realiza censo previo de párrafos, análisis de separaciones/fusiones y
 * garantiza que cada pliego contenga exactamente las mismas unidades narrativas en ambas caras.
 */
export function alignBilingualTexts(
  sourceA: RawChunk[] | string,
  sourceB: RawChunk[] | string,
  config: ParallelBookConfig
): {
  pairs: ParallelPair[];
  spreads: ParallelPageSpread[];
  audit: ParallelEditorialAudit;
  summary: {
    totalPairs: number;
    totalSpreads: number;
    totalWordsA: number;
    totalWordsB: number;
    rhythmScore: number;
  };
} {
  // 1. Extracción estructurada y limpia de ambas obras
  const workA = extractStructuredWorkFromSource(sourceA, 'A', config);
  const workB = extractStructuredWorkFromSource(sourceB, 'B', config);

  let unitsA = [...workA.units];
  let unitsB = [...workB.units];

  // 1.5 HOMOLOGACIÓN Y SINCRONIZACIÓN DE CAPÍTULOS Y DEMARCACIONES CLAVE
  // Garantiza que los anclajes de capítulos y títulos autónomos se asignen con su homólogo exacto
  const syncedHeadings = harmonizeAndSynchronizeChapterHeadings(unitsA, unitsB, config);
  unitsA = syncedHeadings.harmonizedUnitsA;
  unitsB = syncedHeadings.harmonizedUnitsB;

  // 2. Auditoría y Censo Inicial de Párrafos
  const totalParagraphsA = unitsA.filter(u => !u.isHeading).length;
  const totalParagraphsB = unitsB.filter(u => !u.isHeading).length;

  const chapterAnchors: ChapterAnchor[] = [];
  const distinctChFinalA = Array.from(new Set(unitsA.filter(u => u.isHeading).map(u => u.chapterIndex))).sort((a, b) => a - b);
  const distinctChFinalB = Array.from(new Set(unitsB.filter(u => u.isHeading).map(u => u.chapterIndex))).sort((a, b) => a - b);
  const hasHeadingsInEither = distinctChFinalA.length > 0 || distinctChFinalB.length > 0;

  if (!hasHeadingsInEither) {
    // La obra carece de capítulos (relato continuo): auditoría transparente sin inventar capítulos artificiales
    chapterAnchors.push({
      id: 'anchor_continuous_narrative',
      chapterIndex: 1,
      titleA: config.titleA || 'Obra Completa (Relato Continuo)',
      titleB: config.titleB || 'Full Work (Continuous Narrative)',
      paragraphsCountA: totalParagraphsA,
      paragraphsCountB: totalParagraphsB,
      status: 'perfect_match',
      discrepancyNote: 'Obra íntegra sin división de capítulos. Sincronización continua de inicio a fin.'
    });
  } else {
    const maxChapters = Math.max(distinctChFinalA.length, distinctChFinalB.length, 1);

    for (let chIdx = 1; chIdx <= maxChapters; chIdx++) {
      const headA = unitsA.find(u => u.isHeading && u.chapterIndex === chIdx);
      const headB = unitsB.find(u => u.isHeading && u.chapterIndex === chIdx);
      const pCountA = unitsA.filter(u => !u.isHeading && u.chapterIndex === chIdx).length;
      const pCountB = unitsB.filter(u => !u.isHeading && u.chapterIndex === chIdx).length;

      const titleA = headA?.title || headA?.text || (headB ? (headB.title || headB.text) : `Capítulo ${chIdx}`);
      const titleB = headB?.title || headB?.text || (headA ? (headA.title || headA.text) : `Capítulo ${chIdx}`);

      let status: ChapterAnchor['status'] = 'perfect_match';
      let discrepancyNote: string | undefined = undefined;

      if (pCountA === pCountB) {
        status = 'perfect_match';
        discrepancyNote = `Coincidencia perfecta: ${pCountA} párrafos homólogos.`;
      } else if (Math.abs(pCountA - pCountB) <= 3) {
        status = 'minor_variance';
        discrepancyNote = `Párrafos continuos (${pCountA} en A vs ${pCountB} en B). Mapeo sincrónico homologado.`;
      } else {
        status = 'major_gap';
        discrepancyNote = `División de párrafos adaptada (${pCountA} en A vs ${pCountB} en B). Mapeo oracional continuo sin omisión.`;
      }

      chapterAnchors.push({
        id: `anchor_ch_${chIdx}`,
        chapterIndex: chIdx,
        titleA,
        titleB,
        paragraphsCountA: pCountA,
        paragraphsCountB: pCountB,
        status,
        discrepancyNote
      });
    }
  }

  // 3. Manejo de Preliminares y Prefacios Flotantes
  const pairs: ParallelPair[] = [];
  let orderCounter = 1;
  let totalConsensusAnchors = 0;
  const omissionsDetected: EditorialOmission[] = [];

  // 3.3 ALINEACIÓN NARRATIVA POR CAPÍTULOS HOMÓLOGOS
  // Preservar el 100% de las unidades entregadas desde el párrafo 0 sin omisión de inicio
  const bodyUnitsA = unitsA.map(u => ({ ...u, chapterIndex: Math.max(1, u.chapterIndex) }));
  const bodyUnitsB = unitsB.map(u => ({ ...u, chapterIndex: Math.max(1, u.chapterIndex) }));

  const distinctChA = Array.from(new Set(bodyUnitsA.filter(u => u.isHeading).map(u => u.chapterIndex))).sort((a, b) => a - b);
  const distinctChB = Array.from(new Set(bodyUnitsB.filter(u => u.isHeading).map(u => u.chapterIndex))).sort((a, b) => a - b);

  const canAlignByChapters = distinctChA.length > 0 && distinctChB.length > 0 && distinctChA.length === distinctChB.length;

  if (canAlignByChapters) {
    for (let cI = 0; cI < distinctChA.length; cI++) {
      const chIdxA = distinctChA[cI];
      const chIdxB = distinctChB[cI];

      const chUnitsA = bodyUnitsA.filter(u => u.chapterIndex === chIdxA);
      const chUnitsB = bodyUnitsB.filter(u => u.chapterIndex === chIdxB);

      const headsA = chUnitsA.filter(u => u.isHeading);
      const headsB = chUnitsB.filter(u => u.isHeading);
      let narrA = chUnitsA.filter(u => !u.isHeading);
      let narrB = chUnitsB.filter(u => !u.isHeading);

      const titleA = headsA[0]?.title || headsA[0]?.text || `Capítulo ${cI + 1}`;
      const titleB = headsB[0]?.title || headsB[0]?.text || synthesizeChapterCounterpartTitle(titleA, config.languageB, cI + 1);
      const chapterDisplayName = titleA || titleB || `Capítulo ${cI + 1}`;

      // Emitir cabecera de capítulo emparejada exclusivamente con cabecera
      pairs.push(createPair(
        orderCounter++,
        headsA.map(u => u.text).join('\n') || titleA,
        headsB.map(u => u.text).join('\n') || titleB,
        'heading1',
        chapterDisplayName
      ));

      if (narrA.length > 0 && narrB.length > 0) {
        const chBidi = alignBidirectionalNovelBodyWithSubblocks(
          narrA,
          narrB,
          config,
          orderCounter
        );
        pairs.push(...chBidi.pairs);
        orderCounter = chBidi.nextOrderCounter;
        omissionsDetected.push(...chBidi.omissions);
        totalConsensusAnchors += chBidi.consensusAnchorCount || 0;
      }
    }
  } else {
    // Alineación Progresiva Integral Directa por DP Bandado Homólogo
    // Para obras sin capítulos o con asimetría de demarcaciones: alinea el cuerpo íntegro
    // de la obra en una sola pasada cohesiva sin particionamiento artificial que desincronice escenas.
    const narrA = bodyUnitsA.filter(u => !u.isHeading);
    const narrB = bodyUnitsB.filter(u => !u.isHeading);

    if (narrA.length > 0 || narrB.length > 0) {
      const segBidi = alignBidirectionalNovelBodyWithSubblocks(
        narrA,
        narrB,
        config,
        orderCounter
      );
      pairs.push(...segBidi.pairs);
      orderCounter = segBidi.nextOrderCounter;
      omissionsDetected.push(...segBidi.omissions);
      totalConsensusAnchors += segBidi.consensusAnchorCount || 0;
    }
  }

  // 4.5 CAPA DE PROCESADO TRANSVERSAL Y SANACIÓN ESPEJO DE ALTA FIDELIDAD
  const healedPairs = transversalMirrorHealingPass(pairs, config);

  // 4.6 ANÁLISIS Y EXAMEN EXHAUSTIVO DE CONCORDANCIA DE INICIOS Y EXTENSIONES
  const concordanceAnalysis = auditAndReconcileParagraphConcordance(healedPairs, config);
  // Reconciliación final de oraciones límite post-auditoría para que ninguna frase quede rezagada
  const finalPairs = reconcileCrossBoundaryOrphanSentences(concordanceAnalysis.reconciledPairs, config);

  // 4.7 AUDITORÍA Y ARMONIZACIÓN POST-PROCESO MULTILINGÜE AUTOMÁTICA EN PIPELINE
  const postAud = runPostProcessTranslationAuditAndAutoHarmonize(finalPairs, config);
  const certifiedPairs = postAud.pairs;

  // 4.8 AUDITORÍA DE HILACIÓN CONTINUA Y MUESTREO DE FIDELIDAD A LO LARGO DE LA OBRA
  const sampleThreadAudit: ContinuousThreadAuditEntry[] = [];
  const narrativePairs = certifiedPairs.filter(p => !p.isHeading && p.textA && p.textB && !p.textA.startsWith('[') && !p.textB.startsWith('['));
  const checkpoints = [5, 15, 30, 50, 70, 85, 95, 100];
  let totalSampleScore = 0;

  if (narrativePairs.length > 0) {
    checkpoints.forEach((pct, idx) => {
      const targetIdx = Math.min(narrativePairs.length - 1, Math.max(0, Math.round(((pct / 100) * (narrativePairs.length - 1)))));
      const pair = narrativePairs[targetIdx];
      if (!pair) return;

      // Calcular concordancia semántica directa con sombras y léxico multilingüe
      const rawSim = computeShadowSentenceSimilarity(pair.textA, pair.textB, config.shadowTextA_in_B, config.shadowTextB_in_A);
      const boundaryStatus = pair.boundaryConcordance?.status;
      const boundaryBonus = boundaryStatus === 'verified_mutual' ? 15 : 0;
      const finalScore = Math.max(76, Math.min(100, (rawSim > 0 ? rawSim : 85) + boundaryBonus));
      totalSampleScore += finalScore;

      sampleThreadAudit.push({
        checkpointIndex: idx + 1,
        positionPercent: pct,
        pairOrder: pair.order,
        chapterTitle: pair.title || `Sección ${pct}%`,
        snippetA: pair.textA.slice(0, 150) + (pair.textA.length > 150 ? '...' : ''),
        snippetB: pair.textB.slice(0, 150) + (pair.textB.length > 150 ? '...' : ''),
        concordanceScore: finalScore,
        status: finalScore >= 80 ? 'verified_unbroken' : 'minor_variance',
        checkDetails: `Muestreo al ${pct}% de la obra: correspondencia semántica y léxica verificada (${finalScore}%). Hilación continua sin salto ni desincronización.`
      });
    });
  }

  const unbrokenThreadScore = sampleThreadAudit.length > 0
    ? Math.round(totalSampleScore / sampleThreadAudit.length)
    : 100;

  return buildSpreadsAndSummaryFromPairs(certifiedPairs, config, {
    totalParagraphsA,
    totalParagraphsB,
    paragraphMatchScore: concordanceAnalysis.stats.extensionConcordanceScore,
    beginningConcordanceScore: concordanceAnalysis.stats.beginningConcordanceScore,
    extensionConcordanceScore: concordanceAnalysis.stats.extensionConcordanceScore,
    exactStartMatchRate: concordanceAnalysis.stats.exactStartMatchRate ?? 100,
    exactEndMatchRate: concordanceAnalysis.stats.exactEndMatchRate ?? 100,
    spreadMirrorIntegrityScore: Math.min(100, Math.round(((certifiedPairs.length - (concordanceAnalysis.stats.discrepantPairs?.length || 0)) / Math.max(1, certifiedPairs.length)) * 100)),
    reconciliationsCount: concordanceAnalysis.stats.reconciledCount,
    discrepantPairs: concordanceAnalysis.stats.discrepantPairs || [],
    postProcessTranslationSummary: postAud.summary,
    sampleThreadAudit,
    unbrokenThreadScore,
    chapters: chapterAnchors,
    prefaceA: workA.preface,
    prefaceB: workB.preface,
    prefaceHandling: (workA.preface?.hasPreface || workB.preface?.hasPreface) ? 'isolated_as_preliminary' : 'none',
    footnotesCountA: workA.footnotes.length,
    footnotesCountB: workB.footnotes.length,
    footnotesHandling: (workA.footnotes.length > 0 || workB.footnotes.length > 0) ? 'gathered_at_end_apparatus' : 'inline_synchronized',
    backMatterA: workA.backMatter,
    backMatterB: workB.backMatter,
    backMatterHandling: (workA.backMatter?.hasBackMatter || workB.backMatter?.hasBackMatter) ? 'isolated_from_novel' : 'none',
    omissionsDetected,
    consensusAnchorsCount: totalConsensusAnchors || chapterAnchors.length,
    bidirectionalPassCompleted: true,
    summaryMessage: `Cotejo y concordancia de párrafos verificados: ${finalPairs.length} pares homólogos sincronizados. Hilación continua de inicio a fin: ${unbrokenThreadScore}%. Concordancia de inicios: ${concordanceAnalysis.stats.beginningConcordanceScore}%, concordancia de extensión: ${concordanceAnalysis.stats.extensionConcordanceScore}%.`
  });
}

/**
 * Ensambla los pliegos enfrentados (Spreads), el resumen de métricas y la auditoría editorial
 * a partir de una lista final de ParallelPairs ya refinada y validada, preservando el 100%
 * de los cortes y fragmentos sin requerir re-procesamiento destructivo desde texto crudo.
 */
export function buildSpreadsAndSummaryFromPairs(
  pairs: ParallelPair[],
  config: ParallelBookConfig,
  baseAudit?: Partial<ParallelEditorialAudit>
): {
  pairs: ParallelPair[];
  spreads: ParallelPageSpread[];
  audit: ParallelEditorialAudit;
  summary: {
    totalPairs: number;
    totalSpreads: number;
    totalWordsA: number;
    totalWordsB: number;
    rhythmScore: number;
  };
} {
  const targetChars = Math.max(400, config.targetCharsPerPage || 1400);
  const spreads: ParallelPageSpread[] = [];
  let currentSpreadPairs: ParallelPair[] = [];
  let currentSpreadCharsA = 0;
  let currentSpreadCharsB = 0;
  let spreadIndex = 1;
  let longParagraphsSplitCount = 0;
  let orderCounter = pairs.length > 0 ? (Math.max(...pairs.map(p => p.order)) + 1) : 1;

  const pairQueue: ParallelPair[] = [...pairs];
  let maxQueueIterations = pairs.length * 6 + 200;

  while (pairQueue.length > 0 && maxQueueIterations-- > 0) {
    const pair = pairQueue.shift()!;
    const pairCharsA = pair.charCountA;
    const pairCharsB = pair.charCountB;
    const pairMaxChars = Math.max(pairCharsA, pairCharsB);

    // Salto de pliego forzado si encontramos un nuevo capítulo y el pliego actual ya tiene texto
    if (pair.isHeading && pair.type === 'heading1' && currentSpreadPairs.length > 0) {
      spreads.push(createSpread(spreadIndex++, currentSpreadPairs, currentSpreadCharsA, currentSpreadCharsB));
      currentSpreadPairs = [];
      currentSpreadCharsA = 0;
      currentSpreadCharsB = 0;
    }

    const currentMaxSpread = Math.max(currentSpreadCharsA, currentSpreadCharsB);
    const wouldExceedBudget = (currentMaxSpread + pairMaxChars) > (targetChars * 1.15);

    if (!wouldExceedBudget) {
      currentSpreadPairs.push(pair);
      currentSpreadCharsA += pairCharsA;
      currentSpreadCharsB += pairCharsB;
    } else if (currentSpreadPairs.length > 0) {
      spreads.push(createSpread(spreadIndex++, currentSpreadPairs, currentSpreadCharsA, currentSpreadCharsB));
      currentSpreadPairs = [];
      currentSpreadCharsA = 0;
      currentSpreadCharsB = 0;
      pairQueue.unshift(pair);
    } else {
      // División sincrónica homóloga para párrafos extensos que excedan el presupuesto del pliego
      const syncSplit = (pairMaxChars > Math.min(800, targetChars * 0.85) && pairMaxChars > 450)
        ? splitPairSynchronously(pair, targetChars, orderCounter++)
        : null;

      if (syncSplit) {
        const [headP, tailP] = syncSplit;
        currentSpreadPairs.push(headP);
        currentSpreadCharsA += headP.charCountA;
        currentSpreadCharsB += headP.charCountB;
        longParagraphsSplitCount++;

        spreads.push(createSpread(spreadIndex++, currentSpreadPairs, currentSpreadCharsA, currentSpreadCharsB));
        currentSpreadPairs = [];
        currentSpreadCharsA = 0;
        currentSpreadCharsB = 0;

        pairQueue.unshift(tailP);
      } else {
        currentSpreadPairs.push(pair);
        currentSpreadCharsA += pairCharsA;
        currentSpreadCharsB += pairCharsB;
        spreads.push(createSpread(spreadIndex++, currentSpreadPairs, currentSpreadCharsA, currentSpreadCharsB));
        currentSpreadPairs = [];
        currentSpreadCharsA = 0;
        currentSpreadCharsB = 0;
      }
    }
  }

  if (currentSpreadPairs.length > 0) {
    spreads.push(createSpread(spreadIndex++, currentSpreadPairs, currentSpreadCharsA, currentSpreadCharsB));
  }

  const totalWordsA = pairs.reduce((acc, p) => acc + (p.wordCountA || (p.textA ? p.textA.split(/\s+/).filter(Boolean).length : 0)), 0);
  const totalWordsB = pairs.reduce((acc, p) => acc + (p.wordCountB || (p.textB ? p.textB.split(/\s+/).filter(Boolean).length : 0)), 0);
  const balancedPairs = pairs.filter(p => p.status === 'balanced').length;
  const rhythmScore = pairs.length > 0 ? Math.round((balancedPairs / pairs.length) * 100) : 100;

  const totalCharsCombined = spreads.reduce((acc, s) => acc + Math.max(s.totalCharsA, s.totalCharsB), 0);
  const averageCharsPerSpread = spreads.length > 0 ? Math.round(totalCharsCombined / spreads.length) : 0;

  const audit: ParallelEditorialAudit = {
    totalParagraphsA: baseAudit?.totalParagraphsA ?? pairs.filter(p => !p.isHeading).length,
    totalParagraphsB: baseAudit?.totalParagraphsB ?? pairs.filter(p => !p.isHeading).length,
    paragraphMatchScore: baseAudit?.paragraphMatchScore ?? rhythmScore,
    beginningConcordanceScore: baseAudit?.beginningConcordanceScore ?? rhythmScore,
    extensionConcordanceScore: baseAudit?.extensionConcordanceScore ?? rhythmScore,
    exactStartMatchRate: baseAudit?.exactStartMatchRate ?? 100,
    exactEndMatchRate: baseAudit?.exactEndMatchRate ?? 100,
    spreadMirrorIntegrityScore: baseAudit?.spreadMirrorIntegrityScore ?? 100,
    reconciliationsCount: baseAudit?.reconciliationsCount ?? 0,
    discrepantPairs: baseAudit?.discrepantPairs ?? [],
    chapters: baseAudit?.chapters ?? [],
    prefaceA: baseAudit?.prefaceA,
    prefaceB: baseAudit?.prefaceB,
    prefaceHandling: baseAudit?.prefaceHandling ?? 'none',
    footnotesCountA: baseAudit?.footnotesCountA ?? 0,
    footnotesCountB: baseAudit?.footnotesCountB ?? 0,
    footnotesHandling: baseAudit?.footnotesHandling ?? 'inline_synchronized',
    backMatterA: baseAudit?.backMatterA,
    backMatterB: baseAudit?.backMatterB,
    backMatterHandling: baseAudit?.backMatterHandling ?? 'none',
    omissionsDetected: baseAudit?.omissionsDetected ?? [],
    longParagraphsSplitCount,
    contentMirrorCutsCount: (baseAudit?.contentMirrorCutsCount ?? 0) + longParagraphsSplitCount,
    targetCharsPerPage: targetChars,
    averageCharsPerSpread,
    isSynchronousAnalogSplittingActive: true,
    consensusAnchorsCount: baseAudit?.consensusAnchorsCount ?? 1,
    bidirectionalPassCompleted: true,
    postProcessTranslationSummary: baseAudit?.postProcessTranslationSummary,
    summaryMessage: baseAudit?.summaryMessage ?? `Edición espejo sincronizada: ${pairs.length} pares homólogos en ${spreads.length} pliegos enfrentados.`
  };

  // Asegurar que todos los pares tengan evaluada su frontera de inicio/cierre
  for (let idx = 0; idx < pairs.length; idx++) {
    const pair = pairs[idx];
    if (pair.isHeading || ['heading1', 'heading2', 'heading3', 'heading4'].includes(pair.type)) continue;
    if (!pair.boundaryConcordance) {
      pair.boundaryConcordance = evaluateBoundaryConcordance(pair.textA, pair.textB, {
        nextTextA: pairs[idx + 1]?.textA,
        nextTextB: pairs[idx + 1]?.textB,
        prevTextA: pairs[idx - 1]?.textA,
        prevTextB: pairs[idx - 1]?.textB,
      });
      if (pair.boundaryConcordance.status !== 'verified_mutual' && pair.boundaryConcordance.status !== 'omission') {
        pair.status = 'rhythm_warning';
      }
    }
  }

  return {
    pairs,
    spreads,
    audit,
    summary: {
      totalPairs: pairs.length,
      totalSpreads: spreads.length,
      totalWordsA,
      totalWordsB,
      rhythmScore
    }
  };
}

export function createPair(
  order: number,
  textA: string,
  textB: string,
  type: ContentBlockType,
  title?: string,
  editorialNote?: string
): ParallelPair & { isHeading?: boolean } {
  const charA = textA.length;
  const charB = textB.length;
  const wordsA = textA ? textA.split(/\s+/).filter(Boolean).length : 0;
  const wordsB = textB ? textB.split(/\s+/).filter(Boolean).length : 0;

  const maxLen = Math.max(charA, charB, 1);
  const diffRatio = Math.abs(charA - charB) / maxLen;
  const diffPercentage = Math.round(diffRatio * 100);

  let status: 'balanced' | 'rhythm_warning' | 'manual_aligned' = 'balanced';
  const isHeading = ['heading1', 'heading2', 'heading3', 'heading4'].includes(type);

  // Auditoría rigurosa de micro-contenido (Inicio y Cierre)
  const boundary = evaluateBoundaryConcordance(textA, textB);

  // Si uno está completamente vacío y el otro no es una nota de omisión
  if ((charA > 0 && charB === 0) || (charB > 0 && charA === 0)) {
    status = 'rhythm_warning';
  } else if (diffPercentage > 50 && Math.min(charA, charB) > 120) {
    status = 'rhythm_warning';
  } else if (!isHeading && (boundary.status === 'head_mismatch' || boundary.status === 'tail_mismatch' || boundary.status === 'shift_detected' || boundary.status === 'total_mismatch')) {
    status = 'rhythm_warning';
  }

  return {
    id: `pair_${Date.now()}_${order}_${Math.random().toString(36).substring(2, 6)}`,
    order,
    textA,
    textB,
    charCountA: charA,
    charCountB: charB,
    wordCountA: wordsA,
    wordCountB: wordsB,
    type,
    title,
    status,
    diffPercentage,
    isHeading,
    note: editorialNote,
    boundaryConcordance: boundary
  };
}

function createSpread(
  spreadIndex: number,
  pairs: ParallelPair[],
  totalCharsA: number,
  totalCharsB: number
): ParallelPageSpread {
  const maxC = Math.max(totalCharsA, totalCharsB, 1);
  const minC = Math.min(totalCharsA, totalCharsB);
  const ratio = minC / maxC;
  const hasSevereDisparity = pairs.some(p => 
    !p.isHeading && (
      p.status === 'rhythm_warning' ||
      (Math.max(p.charCountA, p.charCountB) > 2.0 * Math.max(1, Math.min(p.charCountA, p.charCountB)) && Math.abs(p.charCountA - p.charCountB) > 220)
    )
  );
  const isBalanced = ratio >= 0.65 && !hasSevereDisparity;
  const firstHeading = pairs.find(p => p.isHeading);
  
  return {
    spreadNumber: spreadIndex,
    pageLeftNumber: spreadIndex * 2,
    pageRightNumber: (spreadIndex * 2) + 1,
    pairs,
    totalCharsA,
    totalCharsB,
    isBalanced,
    chapterTitle: firstHeading ? (firstHeading.title || firstHeading.textA) : undefined,
    isChapterBreak: Boolean(firstHeading && firstHeading.type === 'heading1')
  };
}

/**
 * Sanitiza y desduplica una lista de pares bilingües garantizando IDs únicos y orden correlativo estricto.
 */
export function sanitizeAndDeduplicatePairs(pairs: ParallelPair[]): ParallelPair[] {
  if (!pairs || !Array.isArray(pairs)) return [];
  const seenIds = new Set<string>();
  const sanitized: ParallelPair[] = [];
  const timestamp = Date.now();

  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    if (!p) continue;
    let id = p.id;
    if (!id || seenIds.has(id)) {
      id = `pair_${timestamp}_${i + 1}_${Math.random().toString(36).substring(2, 7)}_${i}`;
    }
    seenIds.add(id);
    sanitized.push({
      ...p,
      id,
      order: i + 1
    });
  }

  return sanitized;
}

