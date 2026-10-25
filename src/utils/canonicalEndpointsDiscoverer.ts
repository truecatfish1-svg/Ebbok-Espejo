/**
 * Motor de Detección Canónica y Doble Limpieza de Extremos con IA y Diccionario Editorial
 * 
 * Resuelve de raíz:
 * 1. La identificación exacta de la frase con la que REALMENTE inicia la historia
 *    y la frase con la que REALMENTE concluye en ambos idiomas (A y B).
 * 2. La purga sin concesiones de portadillas web, notices de Distributed Proofreading (pgdp.net),
 *    editoriales históricas (Kurt Wolff Verlag, etc.), avisos de Z-Library/Gutenberg y material flotante.
 * 3. La reparación de drop-caps rotos de OCR (ej. "A LS Gregor Samsa" -> "Als Gregor Samsa").
 * 4. La segmentación agnóstica por partes/taxones cuando los libros carecen de la palabra "Capítulo".
 */

import { Type } from '@google/genai';
import { callGeminiWithResilience, hasValidGeminiApiKey } from '../services/gemini';
import { splitParagraphIntoSentences } from './pureMirrorHarmonizer';

export interface CanonicalWorkProfile {
  id: string;
  titles: string[];
  authors: string[];
  openings: Record<string, string>; // languageCode -> startSentence
  endings: Record<string, string>;   // languageCode -> endSentence
  structureType: 'chapters' | 'parts_roman' | 'continuous';
  expectedPartsCount?: number;
}

/**
 * Diccionario de obras universales de alta frecuencia
 */
export const CANONICAL_CLASSICS_DATABASE: CanonicalWorkProfile[] = [
  {
    id: 'die_verwandlung',
    titles: ['la metamorfosis', 'die verwandlung', 'the metamorphosis', 'la métamorphose', 'la metamorfosi'],
    authors: ['franz kafka', 'kafka'],
    openings: {
      es: 'Una mañana, tras un sueño intranquilo, Gregorio Samsa se despertó',
      de: 'Als Gregor Samsa eines Morgens aus unruhigen Träumen erwachte',
      en: 'One morning, when Gregor Samsa woke from troubled dreams',
      fr: "Un matin, au sortir d'un rêve agité, Grégoire Samsa",
      it: 'Una mattina, al risveglio da sogni inquieti, Gregor Samsa'
    },
    endings: {
      es: 'la hija se levantó la primera e irguió sus formas juveniles',
      de: 'die Tochter als erste sich erhob und ihren jungen Körper dehnte',
      en: 'their daughter was the first to get up and stretch her young body',
      fr: 'leur fille fut la première à se lever et à étirer son jeune corps',
      it: 'la figlia si alzò per prima e stirò il suo giovane corpo'
    },
    structureType: 'parts_roman',
    expectedPartsCount: 3
  },
  {
    id: 'mathilda',
    titles: ['mathilda', 'matilda'],
    authors: ['mary wollstonecraft shelley', 'mary shelley', 'shelley'],
    openings: {
      es: 'No son más que las cuatro; pero es invierno',
      en: "It is only four o'clock; but it is winter",
      de: 'Es ist erst vier Uhr; aber es ist Winter',
      fr: "Il n'est que quatre heures ; mais c'est l'hiver"
    },
    endings: {
      es: 'como será mi sueño cuando esté tendida en ella',
      en: 'as my sleep shall be, when I am laid in it',
      de: 'wie mein Schlaf sein wird, wenn ich darin gebettet bin',
      fr: 'que sera mon sommeil quand je serai couchée en elle'
    },
    structureType: 'continuous',
    expectedPartsCount: 1
  },
  {
    id: 'frankenstein',
    titles: ['frankenstein', 'el moderno prometeo', 'the modern prometheus'],
    authors: ['mary shelley', 'shelley'],
    openings: {
      es: 'Te alegrará saber que ningún percance ha acompañado el inicio',
      en: 'You will rejoice to hear that no disaster has accompanied the commencement',
      de: 'Du wirst dich freuen zu hören, dass kein Unglück den Beginn',
      fr: "Vous vous réjouirez d'apprendre qu'aucun désastre n'a accompagné le début"
    },
    endings: {
      es: 'se perdió en la oscuridad y la distancia',
      en: 'lost in darkness and distance',
      de: 'in Dunkelheit und Ferne verloren',
      fr: "perdu dans l'obscurité et le lointain"
    },
    structureType: 'chapters',
    expectedPartsCount: 24
  },
  {
    id: 'don_quijote',
    titles: ['don quijote', 'el ingenioso hidalgo don quijote de la mancha', 'don quixote'],
    authors: ['miguel de cervantes', 'cervantes'],
    openings: {
      es: 'En un lugar de la Mancha, de cuyo nombre no quiero acordarme',
      en: 'In a village of La Mancha, the name of which I have no desire to call to mind',
      de: 'An einem Orte der Mancha, an dessen Namen ich mich nicht erinnern will',
      fr: "Dans un bourg de la Manche, dont je ne veux pas me rappeler le nom"
    },
    endings: {
      es: 'con que yo quedaré satisfecho y ufano de haber sido el primero',
      en: 'wherewith I shall rest satisfied and proud to have been the first',
      de: 'womit ich zufrieden sein werde und stolz, der erste gewesen zu sein'
    },
    structureType: 'chapters'
  }
];

export interface DiscoveredEndpoints {
  title?: string;
  author?: string;
  chapterOneHeading?: string;
  startSentence: string;
  endSentence: string;
  frontMatterSnippet?: string;
  backMatterSnippet?: string;
  structureType: 'chapters' | 'parts_roman' | 'continuous';
  expectedPartsCount?: number;
  hasPreliminaryStudy?: boolean;
  preliminaryStudyTitle?: string;
  hasDedication?: boolean;
  dedication?: string;
  hasEpigraph?: boolean;
  epigraph?: string;
  hasBackMatter?: boolean;
  backMatterTitle?: string;
  source: 'database' | 'ai' | 'heuristic';
}

/**
 * Convierte extremos canónicos a un perfil editorial compatible
 */
export function endpointsToCanonicalWorkProfile(
  endpoints: DiscoveredEndpoints,
  title?: string,
  author?: string
): any {
  return {
    title: endpoints.title || title || 'Obra Literaria',
    author: endpoints.author || author || '',
    subject: 'Literatura / Narrativa',
    chapterOneHeading: endpoints.chapterOneHeading || 'Capítulo 1',
    openingSentenceOriginal: endpoints.startSentence,
    openingSentenceTranslated: endpoints.startSentence,
    openingCandidates: [
      endpoints.startSentence,
      endpoints.frontMatterSnippet
    ].filter((s): s is string => Boolean(s && s.trim().length > 0)),
    endingSentenceOriginal: endpoints.endSentence,
    endingSentenceTranslated: endpoints.endSentence,
    endingCandidates: [
      endpoints.endSentence,
      endpoints.backMatterSnippet
    ].filter((s): s is string => Boolean(s && s.trim().length > 0)),
    startParagraphSnippet: endpoints.frontMatterSnippet,
    endParagraphSnippet: endpoints.backMatterSnippet,
    chaptersCount: endpoints.expectedPartsCount || 1,
    hasPreliminaryStudy: Boolean(endpoints.hasPreliminaryStudy),
    preliminaryStudyTitle: endpoints.preliminaryStudyTitle,
    hasBackMatterAppendices: Boolean(endpoints.hasBackMatter),
    backMatterTitle: endpoints.backMatterTitle,
    structureType: endpoints.structureType,
    confidence: endpoints.source === 'database' ? 1.0 : 0.95,
    source: endpoints.source || 'ai'
  };
}

/**
 * Busca perfil canónico en la base de datos local
 */
export function matchCanonicalWorkInDatabase(
  title?: string,
  author?: string,
  sampleText?: string
): CanonicalWorkProfile | null {
  const normTitle = (title || '').toLowerCase().trim();
  const normAuthor = (author || '').toLowerCase().trim();
  const normSample = (sampleText || '').slice(0, 4000).toLowerCase();

  // No permitir coincidencias en títulos vacíos o demasiado cortos (ej. "el", "la", "doc", etc.)
  const hasValidTitle = normTitle.length >= 5;
  const hasValidAuthor = normAuthor.length >= 4;

  for (const work of CANONICAL_CLASSICS_DATABASE) {
    // Coincidencia estricta de título (evitar que "el coleccionista" o "novela" coincida con "die verwandlung")
    const titleMatch = hasValidTitle && work.titles.some(t => {
      if (t === normTitle) return true;
      if (normTitle.length >= 7 && t.length >= 7) {
        return normTitle.includes(t) || t.includes(normTitle);
      }
      return false;
    });

    const authorMatch = hasValidAuthor && work.authors.some(a => {
      if (a === normAuthor) return true;
      if (normAuthor.length >= 5 && a.length >= 5) {
        return normAuthor.includes(a) || a.includes(normAuthor);
      }
      return false;
    });

    // Si coincide el título Y autor, o título de alta especificidad
    if ((titleMatch && authorMatch) || (titleMatch && normTitle.length >= 8)) {
      return work;
    }

    if (authorMatch && hasValidTitle && normSample.includes(work.titles[0])) {
      return work;
    }

    // Coincidencia por texto característico inequívoco del arranque literario (mínimo 25 caracteres)
    for (const [, opening] of Object.entries(work.openings)) {
      const cleanOpeningSample = opening.toLowerCase().slice(0, 35).trim();
      if (cleanOpeningSample.length >= 22 && normSample.includes(cleanOpeningSample)) {
        return work;
      }
    }
  }

  return null;
}

/**
 * Repara drop-caps fracturados por el OCR al inicio de párrafo (e.g. "A LS Gregor" -> "Als Gregor")
 */
export function repairOcrFracturedDropCaps(text: string): string {
  if (!text) return '';
  let res = text;

  // 1. Letra capitular sola en su línea seguida de la palabra en minúsculas en la línea siguiente:
  // e.g. "L\n\nejos de mí" -> "Lejos de mí", "N\n\no son más" -> "No son más"
  res = res.replace(/(?:^|\n\s*)([A-ZÁÉÍÓÚÄÖÜ])\s*(?:\n\s*)+([a-záéíóúñäöüß]{2,})/g, (m, letter1, restOfWord) => {
    return `\n\n${letter1}${restOfWord}`;
  });

  // 1b. Drop cap fracturado con espacio horizontal para letras que no son palabras aisladas:
  // e.g. "L ejos de mí" -> "Lejos de mí", "N o son más" -> "No son más"
  res = res.replace(/(?:^|\n\s*)([A-ZÁÉÍÓÚÄÖÜ])\s+([a-záéíóúñäöüß]{2,})/g, (m, letter1, restOfWord) => {
    const nonStandaloneLetters = /^[BCDFGHJKLMNPQRSTVWXZ]$/i;
    if (nonStandaloneLetters.test(letter1)) {
      return `\n\n${letter1}${restOfWord}`;
    }
    return m;
  });

  // 1c. Reparar inicios de párrafo con letra inicial separada solo para palabras reales de apertura
  // (e.g. "A LS " -> "Als ", "U NA " -> "Una ", "E N " -> "En "), NUNCA para numerales romanos (I, II, III, IV, V, VI, etc.)
  const romanPattern = /^[IVXLCDM]+$/;
  res = res.replace(/(?:^|\n\s*)([A-ZÁÉÍÓÚÄÖÜ])\s*(?:\n\s*)?([A-ZÁÉÍÓÚÄÖÜ]{1,4})\s+([A-Za-zÁ-ÿäöüß]+)/g, (m, letter1, letter2, wordNext) => {
    // Si la combinación completa es un numeral romano aislado (e.g. "I", "II", "III", "IV"), PRESERVARLO como encabezado intacto
    const combined = `${letter1}${letter2}`;
    if (romanPattern.test(combined) || romanPattern.test(letter1)) {
      return m;
    }
    // Solo fusionar si forma palabras de apertura comunes de lengua (Als, Una, Uno, Der, Die, Das, The, When, En, El)
    const fusedCandidate = `${letter1}${letter2.toLowerCase()}`;
    const validOpeners = new Set(['als', 'una', 'uno', 'der', 'die', 'das', 'the', 'when', 'en', 'el', 'un', 'il', 'la', 'le', 'lo']);
    if (validOpeners.has(fusedCandidate.toLowerCase())) {
      return `\n\n${fusedCandidate} ${wordNext}`;
    }
    return m;
  });

  // 3. Patrón específico: "C HAP . I" -> "CHAP. I"
  res = res.replace(/\bC\s+HAP\s*\.\s*/g, 'CHAP. ');
  res = res.replace(/\bC\s+AP[IÍ]TULO\b/gi, 'CAPÍTULO');
  res = res.replace(/\bK\s+APITEL\b/gi, 'KAPITEL');

  return res;
}

/**
 * Purga implacable de avisos de repositorios, bibliotecas digitales y distribuidores
 */
export function purgeDigitalRepositoryBoilerplates(text: string): { cleaned: string; purgedBlocks: string[] } {
  if (!text) return { cleaned: '', purgedBlocks: [] };

  let res = repairOcrFracturedDropCaps(text);
  const purgedBlocks: string[] = [];

  // Bloques multilínea o de párrafo de equipos de prueba / editoriales de dominio público
  const aggressiveBoilerplatePatterns = [
    // Online Distributed Proofreading Team & pgdp.net
    /Produced by [^\n]+?(?:Distributed Proofreading Team|Distributed Proofreaders|pgdp\.net)[^\n]*(?:\n[^\n]+)?/gi,
    /Online Distributed Proofreading Team at http:\/\/www\.pgdp\.net[^\n]*/gi,
    // Kurt Wolff Verlag y colofones de impresión histórica alemana
    /(?:DIE VERWANDLUNG VON FRANZ KAFKA\s+)?KURT WOLFF VERLAG LEIPZIG BÜCHEREI[^\n]*(?:BAND\s+\d+\/\d+)?[^\n]*(?:GEDRUCKT BEI[^\n]*)?(?:COPYRIGHT KURT WOLFF VERLAG[^\n]*)?/gi,
    /GEDRUCKT BEI DIETSCH & BRÜCKNER\s*[•\-\.]\s*WEIMAR[^\n]*/gi,
    /COPYRIGHT KURT WOLFF VERLAG\s*[•\-\.]\s*LEIPZIG\.?\s*\d{4}[^\n]*/gi,
    // Z-Library, 1lib, EPUBlibre
    /(?:z-lib|1lib|epublibre|aliceandbooks|standardebooks)\.(?:sk|org|com|is|to|cx|me)[^\n]*/gi,
    /This book has been downloaded from\s+[^\n]+/gi,
    /You can find many more public domain books[^\n]+/gi,
    /Descargado (?:de|en)\s+[^\n]+/gi,
    /Downloaded from\s+[^\n]+/gi,
    // Project Gutenberg header boilerplate
    /The Project Gutenberg EBook of[^\n]+/gi,
    /This eBook is for the use of anyone anywhere[^\n]+/gi,
    /\*{3}\s*START OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[^\n]*\*{3}/gi
  ];

  for (const pat of aggressiveBoilerplatePatterns) {
    res = res.replace(pat, (m) => {
      purgedBlocks.push(m.trim());
      return '';
    });
  }

  // Si el párrafo 1 resultante consiste solo en metadatos editoriales de imprenta (sin oraciones verbales):
  const lines = res.split('\n');
  const filteredLines: string[] = [];
  let skippedInitialArtifacts = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!skippedInitialArtifacts && line.length > 0) {
      const isImprint = /(?:KURT WOLFF|VERLAG|LEIPZIG|WEIMAR|BÜCHEREI|GEDRUCKT|COPYRIGHT|pgdp\.net|Distributed Proofreading)/i.test(line) &&
        !/(?:erwachte|despertó|woke|rêve|sogni)/i.test(line);
      if (isImprint) {
        purgedBlocks.push(line);
        continue;
      } else {
        skippedInitialArtifacts = true;
      }
    }
    filteredLines.push(lines[i]);
  }

  return {
    cleaned: filteredLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    purgedBlocks
  };
}

/**
 * Genera un patrón regex insensible a tildes y diacríticos comunes en español, francés, alemán, etc.
 */
function makeCharAccentInsensitive(char: string): string {
  const c = char.toLowerCase();
  switch (c) {
    case 'a': case 'á': case 'à': case 'ä': case 'â': return '[aáàäâAÁÀÄÂ]';
    case 'e': case 'é': case 'è': case 'ë': case 'ê': return '[eéèëêEÉÈËÊ]';
    case 'i': case 'í': case 'ì': case 'ï': case 'î': return '[iíìïîIÍÌÏÎ]';
    case 'o': case 'ó': case 'ò': case 'ö': case 'ô': return '[oóòöôOÓÒÖÔ]';
    case 'u': case 'ú': case 'ù': case 'ü': case 'û': return '[uúùüûUÚÙÜÛ]';
    case 'n': case 'ñ': return '[nñNÑ]';
    case 's': case 'ß': return '(?:s|ss|ß)';
    case "'": case '’': case '‘': return "['’‘]?";
    default:
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

function wordToAccentInsensitivePattern(word: string): string {
  return word.split('').map(makeCharAccentInsensitive).join('');
}

/**
 * Normaliza una cadena quitando tildes y caracteres no alfanuméricos para cotejo difuso
 */
export function normalizeForTokenMatch(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

/**
 * Construye una expresión regular flexible tolerante a saltos, ortotipografía y tildes/OCR
 */
export function buildFlexibleRegex(sentence: string, fromEnd = false, wordCount = 5): RegExp {
  if (!sentence || sentence.trim().length === 0) return /$^/;
  const words = sentence
    .replace(/[.,;:!?»”"'/\\()—–\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);
  if (words.length === 0) return /$^/;
  const count = Math.min(words.length, wordCount);
  const selected = fromEnd ? words.slice(-count) : words.slice(0, count);
  const pattern = selected
    .map(w => wordToAccentInsensitivePattern(w))
    .join('[\\s\\r\\n.,;:!?»”"\'—–\\-]+');
  return new RegExp(pattern, 'i');
}

/**
 * Normaliza códigos y nombres de idiomas a la clave de 2 caracteres
 */
export function normalizeLangKey(lang?: string): string {
  if (!lang) return 'es';
  const l = lang.toLowerCase().trim();
  if (l.includes('ingl') || l.includes('engl') || l === 'en') return 'en';
  if (l.includes('alem') || l.includes('germ') || l.includes('deut') || l === 'de') return 'de';
  if (l.includes('fran') || l === 'fr') return 'fr';
  if (l.includes('ital') || l === 'it') return 'it';
  if (l.includes('espa') || l.includes('span') || l.includes('cast') || l === 'es') return 'es';
  return l.slice(0, 2);
}

/**
 * Busca una frase en el texto con múltiples estrategias:
 * 1. Ventana de 5, 4 y 3 palabras desde el final o desde el inicio (con insensibilidad a tildes OCR)
 * 2. Ventanas deslizantes intermedias si es búsqueda en desenlace
 * 3. Búsqueda por similitud de tokens en los párrafos del último 40% del texto si falla el regex exacto
 */
export function findSentenceMatchInText(
  text: string, 
  sentence: string, 
  fromEnd = false,
  searchNearEnd = false
): RegExpMatchArray | null {
  if (!sentence || sentence.trim().length === 0) return null;
  
  const words = sentence
    .replace(/[.,;:!?»”"'/\\()—–\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);

  if (words.length === 0) return null;

  // 1. Probar n-grams progresivos
  const nGramConfigs: { fromEnd: boolean; count: number }[] = [];
  if (searchNearEnd) {
    // Probar primero el final de la frase, luego el inicio de la frase de desenlace
    nGramConfigs.push({ fromEnd: true, count: 5 });
    nGramConfigs.push({ fromEnd: true, count: 4 });
    nGramConfigs.push({ fromEnd: false, count: 5 });
    nGramConfigs.push({ fromEnd: false, count: 4 });
    nGramConfigs.push({ fromEnd: true, count: 3 });
    nGramConfigs.push({ fromEnd: false, count: 3 });
  } else {
    nGramConfigs.push({ fromEnd: false, count: 5 });
    nGramConfigs.push({ fromEnd: false, count: 4 });
    nGramConfigs.push({ fromEnd: false, count: 3 });
  }

  for (const cfg of nGramConfigs) {
    const rx = buildFlexibleRegex(sentence, cfg.fromEnd, cfg.count);
    if (!searchNearEnd) {
      const m = text.match(rx);
      if (m && m.index !== undefined) {
        return m;
      }
    } else {
      const globalRx = new RegExp(rx.source, 'gi');
      let match: RegExpExecArray | null;
      let lastMatch: RegExpExecArray | null = null;
      const minThreshold = Math.floor(text.length * 0.40);
      let safetyCounter = 0;
      while ((match = globalRx.exec(text)) !== null && safetyCounter++ < 5000) {
        if (match.index >= minThreshold) {
          lastMatch = match;
        } else if (!lastMatch) {
          lastMatch = match;
        }
        if (match[0].length === 0) {
          globalRx.lastIndex++;
        }
      }
      if (lastMatch && lastMatch.index !== undefined) {
        return lastMatch;
      }
    }
  }

  // 2. Si es búsqueda de desenlace y no hubo coincidencia directa por regex,
  // aplicar correspondencia por solapamiento léxico de tokens en los últimos párrafos
  if (searchNearEnd) {
    const minThreshold = Math.floor(text.length * 0.40);
    const searchSlice = text.slice(minThreshold);
    const significantWords = words
      .map(w => normalizeForTokenMatch(w))
      .filter(w => w.length >= 4);

    if (significantWords.length >= 2) {
      // Buscar párrafos en la segunda mitad del texto
      const paras = searchSlice.split(/\n\s*\n+/);
      let bestParaMatch: { index: number; text: string; score: number } | null = null;
      let runningOffset = 0;

      for (let pIdx = paras.length - 1; pIdx >= 0; pIdx--) {
        const p = paras[pIdx];
        const pNorm = normalizeForTokenMatch(p);
        let hits = 0;
        for (const sw of significantWords) {
          if (pNorm.includes(sw)) hits++;
        }
        const score = hits / significantWords.length;
        if (score >= 0.5 || hits >= 3) {
          // Localizar la posición de este párrafo en el texto completo
          const actualIndex = text.lastIndexOf(p);
          if (actualIndex >= minThreshold) {
            const fakeMatch: any = [p];
            fakeMatch.index = actualIndex;
            fakeMatch.input = text;
            return fakeMatch;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extractor heurístico determinista local para extremos canónicos (100% offline y seguro contra cuelgues)
 */
export function extractCanonicalEndpointsLocally(
  sampleStart: string,
  sampleEnd: string,
  language: string,
  title?: string,
  author?: string
): DiscoveredEndpoints {
  const cleanedStart = purgeDigitalRepositoryBoilerplates(sampleStart).cleaned;
  const cleanedEnd = purgeDigitalRepositoryBoilerplates(sampleEnd).cleaned;

  const parasStart = cleanedStart.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);
  const parasEnd = cleanedEnd.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);

  // Buscar cabecera de capítulo o inicio narrativo
  let chapterOneHeading = 'Capítulo 1';
  let startParaIdx = 0;

  for (let i = 0; i < Math.min(parasStart.length, 25); i++) {
    const p = parasStart[i];
    if (/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE)\s+(?:[0-9IVXLCDM]+|[A-ZÁÉÍÓÚÑ]+)\b/i.test(p) ||
        /^(?:PRIMERA\s+PARTE|PARTE\s+(?:PRIMERA|[0-9IVXLCDM]+)|ERSTER\s+TEIL|PART\s+(?:ONE|[0-9IVXLCDM]+))\b/i.test(p) ||
        /^[IVXLCDM]+\.?$/i.test(p)) {
      chapterOneHeading = p;
      if (i + 1 < parasStart.length) {
        startParaIdx = i + 1;
      }
      break;
    }
  }

  // Si el párrafo inicial seleccionado es muy corto o parece título/aviso editorial, avanzar
  while (startParaIdx < parasStart.length && (
    parasStart[startParaIdx].length < 18 ||
    /(?:copyright|rights\s+reserved|isbn|dep[oó]sito\s+legal|impreso\s+en|printed\s+in|traducci[oó]n\s+de|portada|edici[oó]n|editorial)/i.test(parasStart[startParaIdx])
  )) {
    startParaIdx++;
  }

  const startParagraph = parasStart[startParaIdx] || parasStart[0] || 'Inicio de la narración.';
  const startSentences = splitParagraphIntoSentences(startParagraph);
  const startSentence = startSentences[0] || startParagraph.slice(0, 100);

  // Buscar párrafo final de narración descartando avisos de catálogo, licencias o "FIN"
  let endParaIdx = parasEnd.length - 1;
  while (endParaIdx > 0 && (
    parasEnd[endParaIdx].length < 15 ||
    /^(?:FIN|ENDE|THE\s+END|FINE)\.?$/i.test(parasEnd[endParaIdx]) ||
    /(?:project\s+gutenberg|gutenberg\.org|distributed\s+proofreading|pgdp\.net|z-lib|epublibre|standardebooks|descargado\s+de|downloaded\s+from|cat[aá]logo|colof[oó]n|se\s+termin[oó]\s+de\s+imprimir)/i.test(parasEnd[endParaIdx])
  )) {
    endParaIdx--;
  }

  const endParagraph = parasEnd[endParaIdx] || parasEnd[parasEnd.length - 1] || 'Fin de la narración.';
  const endSentences = splitParagraphIntoSentences(endParagraph);
  const endSentence = endSentences[endSentences.length - 1] || endParagraph.slice(-100);

  const isRoman = /^[IVXLCDM]+\.?$/i.test(chapterOneHeading);
  const structureType: 'chapters' | 'parts_roman' | 'continuous' = isRoman ? 'parts_roman' : (chapterOneHeading ? 'chapters' : 'continuous');

  return {
    title: title || 'Obra Literaria',
    author: author || '',
    chapterOneHeading,
    startSentence,
    endSentence,
    frontMatterSnippet: startParagraph.slice(0, 300),
    backMatterSnippet: endParagraph.slice(-300),
    structureType,
    source: 'heuristic'
  };
}

/**
 * Consulta la IA de Gemini para descubrir el inicio y final canónico
 * de cualquier libro y en cualquier idioma proporcionado.
 * Si no hay clave de API o la IA falla, recurre de inmediato al extractor filológico determinista.
 */
export async function discoverBookCanonicalEndpointsWithAI(
  sampleStart: string,
  sampleEnd: string,
  language: string,
  title?: string,
  author?: string,
  forceAi = false
): Promise<DiscoveredEndpoints | null> {
  // 1. Probar primero con base de datos local salvo que se force escaneo por IA explícito
  if (!forceAi) {
    const localMatch = matchCanonicalWorkInDatabase(title, author, sampleStart);
    if (localMatch) {
      const langKey = normalizeLangKey(language);
      const startSentence = localMatch.openings[langKey] || Object.values(localMatch.openings)[0];
      const endSentence = localMatch.endings[langKey] || Object.values(localMatch.endings)[0];

      if (startSentence && endSentence) {
        return {
          title: localMatch.titles[0],
          author: localMatch.authors[0],
          chapterOneHeading: localMatch.structureType === 'parts_roman' ? 'I' : 'Capítulo 1',
          startSentence,
          endSentence,
          structureType: localMatch.structureType,
          expectedPartsCount: localMatch.expectedPartsCount,
          source: 'database'
        };
      }
    }
  }

  // Si no hay clave de API válida, usar directamente el extractor filológico determinista (0 esperas)
  if (!hasValidGeminiApiKey()) {
    return extractCanonicalEndpointsLocally(sampleStart, sampleEnd, language, title, author);
  }

  // 2. Si no está en el diccionario local y hay clave de API, invocar a Gemini
  try {
    const startSlice = sampleStart.slice(0, 48000);
    const endSlice = sampleEnd.slice(-48000);

    const prompt = `Actúa como bibliógrafo crítico, filólogo y curador editorial experto.
Analiza la siguiente muestra del inicio y fin de una obra literaria digitalizada:
- TÍTULO SUGERIDO: "${title || 'Desconocido'}"
- AUTOR SUGERIDO: "${author || 'Desconocido'}"
- IDIOMA ESPECIFICADO: "${language}"

MUESTRA INICIAL DEL LIBRO (hasta 48.000 caracteres, incluyendo portadillas, notas del editor, prefacios y arranque de la historia):
"""
${startSlice}
"""

MUESTRA FINAL DEL LIBRO (hasta 48.000 caracteres, incluyendo desenlace de la historia, notas al pie, colofón y licencias):
"""
${endSlice}
"""

Tu objetivo es desentrañar con exactitud milimétrica la estructura del libro y separar la novela pura de preliminares (portadas, créditos, dedicatorias, índices, prólogos) y material posterior (índices finales, notas, colofones, licencias):
1. "title": Título real canónico de la obra (sin marcas de descarga ni extensiones).
2. "author": Autor real de la obra.
3. "chapterOneHeading": Cómo está rotulado el inicio de la historia o Capítulo 1/Parte 1 en el texto provisto (ej. "PRIMERA PARTE", "1", "I", "CAPÍTULO 1", "CHAP. I", "Erstes Kapitel", o "N/A" si no hay división explícita).
4. "startSentence": LA FRASE LITERAL EXACTA (copia las primeras 15 a 30 palabras) con la que ARRANCA la historia novelesca real TAL COMO APARECE ESCRITA EN LA MUESTRA INICIAL PROVISTA.
   ¡PROHIBIDO TERMINANTEMENTE incluir datos de imprenta o editorial (ej. direcciones postales, C/ Los Madrazo, sextopiso.com, Newcomlab, diseño, maquetación, conversión a libro electrónico, ISBN, depósito legal, derechos reservados), dedicatorias ("A...", "Para..."), epígrafes o citas introductorias, o líneas de índice! Debe ser el inicio de la narración literaria escrita por el autor.
5. "startParagraphSnippet": Copia el primer párrafo completo (o hasta 300 caracteres) donde arranca la narración.
6. "endSentence": LA FRASE LITERAL EXACTA (copia las últimas 15 a 30 palabras) con la que CONCLUYE la historia novelesca real TAL COMO APARECE EN LA MUESTRA FINAL PROVISTA (el punto final donde termina la ficción o el último diálogo del autor, antes de colofones, notas sobre la edición, notas de traducción, 'se terminó de imprimir...', catálogos editoriales, índices generales al final, avisos de imprenta, 'FIN' o licencias). Debe ser una cita textual exacta de las últimas palabras de la obra.
7. "endParagraphSnippet": Copia el último párrafo completo (o hasta 300 caracteres) con el que termina la narración.
8. "structureType": Indica si la obra se divide en 'chapters' (Capítulos tradicionales con números o palabras), 'parts_roman' (Partes numeradas con romanos como I, II, III) o 'continuous' (prosa continua sin capítulos).
9. "expectedPartsCount": Número aproximado o exacto de capítulos o partes que componen la obra.
10. "hasPreliminaryStudy": true si el libro incluye un estudio introductorio, prefacio de traductor o prólogo formal extenso antes de la novela.
11. "preliminaryStudyTitle": Título del prólogo o estudio previo si existe.
12. "hasDedication": true si hay dedicatoria previa.
13. "dedication": Texto de la dedicatoria si existe.
14. "hasEpigraph": true si hay epígrafe o cita de apertura previa.
15. "epigraph": Texto del epígrafe si existe.
16. "hasBackMatter": true si después del final de la historia hay índice final, licencias, avisos de descarga, colofón o notas finales.
17. "backMatterTitle": Título del material posterior detectado (ej. "Índice de Capítulos", "Colofón Editorial", "Notas Finales").
18. "continuityVerification": Explicación breve (1-2 oraciones) que corrobore por qué este es el inicio y desenlace auténticos.

Devuelve estrictamente un JSON válido.`;

    const aiCall = callGeminiWithResilience({
      model: 'auto-cascade',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            author: { type: Type.STRING },
            chapterOneHeading: { type: Type.STRING },
            startSentence: { type: Type.STRING },
            startParagraphSnippet: { type: Type.STRING },
            endSentence: { type: Type.STRING },
            endParagraphSnippet: { type: Type.STRING },
            structureType: { type: Type.STRING, enum: ['chapters', 'parts_roman', 'continuous'] },
            expectedPartsCount: { type: Type.INTEGER },
            hasPreliminaryStudy: { type: Type.BOOLEAN },
            preliminaryStudyTitle: { type: Type.STRING },
            hasDedication: { type: Type.BOOLEAN },
            dedication: { type: Type.STRING },
            hasEpigraph: { type: Type.BOOLEAN },
            epigraph: { type: Type.STRING },
            hasBackMatter: { type: Type.BOOLEAN },
            backMatterTitle: { type: Type.STRING },
            continuityVerification: { type: Type.STRING }
          },
          required: ['startSentence', 'endSentence']
        }
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout de detección por IA (25s)')), 25000)
    );
    const res = await Promise.race([aiCall, timeoutPromise]);

    const rawOutput = res.text?.trim() || '';
    const cleanJson = rawOutput.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed.startSentence && parsed.endSentence) {
      return {
        title: parsed.title || title,
        author: parsed.author || author,
        chapterOneHeading: parsed.chapterOneHeading,
        startSentence: parsed.startSentence,
        endSentence: parsed.endSentence,
        frontMatterSnippet: parsed.startParagraphSnippet,
        backMatterSnippet: parsed.endParagraphSnippet,
        structureType: parsed.structureType || 'chapters',
        expectedPartsCount: parsed.expectedPartsCount || undefined,
        hasPreliminaryStudy: Boolean(parsed.hasPreliminaryStudy),
        preliminaryStudyTitle: parsed.preliminaryStudyTitle,
        hasDedication: Boolean(parsed.hasDedication),
        dedication: parsed.dedication,
        hasEpigraph: Boolean(parsed.hasEpigraph),
        epigraph: parsed.epigraph,
        hasBackMatter: Boolean(parsed.hasBackMatter),
        backMatterTitle: parsed.backMatterTitle,
        source: 'ai'
      };
    }
  } catch (err) {
    console.warn('[Endpoints IA] Fallo o timeout al consultar IA para extremos canónicos, usando resolución filológica local:', err);
  }

  // Fallback garantizado: nunca retornar null ni bloquear el flujo editorial
  return extractCanonicalEndpointsLocally(sampleStart, sampleEnd, language, title, author);
}

/**
 * Poda y corte de doble precisión basado en los extremos canónicos identificados
 */
export function executeCanonicalDoubleTrim(
  rawText: string,
  endpoints: DiscoveredEndpoints
): {
  pureBody: string;
  frontMatter: string;
  backMatter: string;
  startMatched: boolean;
  endMatched: boolean;
} {
  // Primero purgar avisos y dropcaps
  const preCleaned = purgeDigitalRepositoryBoilerplates(rawText);
  let text = preCleaned.cleaned;

  let frontMatter = preCleaned.purgedBlocks.join('\n\n');
  let backMatter = '';
  let startMatched = false;
  let endMatched = false;

  // 1. LOCALIZAR EL ARRANQUE CANÓNICO
  const startSnippet = endpoints.startSentence?.trim();
  let bodyStartIndex = 0;
  if (startSnippet && startSnippet.length > 5) {
    const startMatch = findSentenceMatchInText(text, startSnippet, false);

    if (startMatch && startMatch.index !== undefined) {
      bodyStartIndex = startMatch.index;

      // Preservar si hay un encabezado de capítulo inmediatamente precedente (ej. "### I\n\n", "I.\n\n", "CAPÍTULO 1\n\n")
      const precedingPrefix = text.substring(0, bodyStartIndex);
      const chapterPrefixMatch = precedingPrefix.match(/(?:###\s*[^\n]+|I\.|II\.|III\.|IV\.|V\.|VI\.|VII\.|VIII\.|IX\.|X\.|XI\.|XII\.|CAP[IÍ]TULO\s+[0-9IVXLCDM]+|KAPITEL\s+[0-9IVXLCDM]+|CHAPTER\s+[0-9IVXLCDM]+|CHAP\.?\s+[0-9IVXLCDM]+)\s*$/i);
      if (chapterPrefixMatch && chapterPrefixMatch.index !== undefined && bodyStartIndex - chapterPrefixMatch.index < 120) {
        bodyStartIndex = chapterPrefixMatch.index;
      }

      // Preservar si hay un drop cap suelto o primera palabra inmediatamente precedente
      const dropCapPrefixMatch = text.substring(0, bodyStartIndex).match(/(?:^|\n\s*)(?:A|Als|U|Una|E|En|It|Der|Die|Das)\s*$/i);
      if (dropCapPrefixMatch && dropCapPrefixMatch.index !== undefined && bodyStartIndex - dropCapPrefixMatch.index < 30) {
        bodyStartIndex = dropCapPrefixMatch.index;
      }

      frontMatter = (frontMatter ? frontMatter + '\n\n' : '') + text.substring(0, bodyStartIndex).trim();
      text = text.substring(bodyStartIndex).trim();
      startMatched = true;
    }
  }

  // 2. LOCALIZAR EL DESENLACE CANÓNICO
  const endSnippet = endpoints.endSentence?.trim();
  if (endSnippet && endSnippet.length > 5) {
    const endMatch = findSentenceMatchInText(text, endSnippet, true, true);

    if (endMatch && endMatch.index !== undefined) {
      const endPosition = endMatch.index + endMatch[0].length;
      // Buscar el punto final de esa oración o salto de línea
      const afterMatch = text.slice(endPosition);
      const dotMatch = afterMatch.match(/^[^\n.!?»”"']*[.!?»”"']/);
      const cutIndex = dotMatch ? endPosition + dotMatch[0].length : endPosition;

      backMatter = text.substring(cutIndex).trim();
      text = text.substring(0, cutIndex).trim();
      endMatched = true;
    }
  }

  // 2b. Salvaguarda: Si no hubo coincidencia con la frase de IA o quedó material posterior
  if (!endMatched) {
    const lateThreshold = Math.floor(text.length * 0.70);
    const trailingSlice = text.slice(lateThreshold);
    const closingMarkerMatch = trailingSlice.match(/(?:\n\s*|\n)(?:#+\s*)?(?:FIN|FIN\s+DE\s+LA\s+OBRA|FIN\s+DEL\s+LIBRO|THE\s+END|ENDE|COLOF[OÓ]N|COLOPHON|AP[EÉ]NDICE|NOTAS\s+(?:AL\s+TEXTO|FINALES)|GLOSARIO|BIBLIOGRAF[IÍ]A|SOBRE\s+EL\s+AUTOR|DEP[OÓ]SITO\s+LEGAL|IMPRESO\s+EN|\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG)\b[\s\S]*$/i);
    if (closingMarkerMatch && closingMarkerMatch.index !== undefined) {
      const cutPos = lateThreshold + closingMarkerMatch.index;
      backMatter = (backMatter ? backMatter + '\n\n' : '') + text.substring(cutPos).trim();
      text = text.substring(0, cutPos).trim();
      endMatched = true;
    }
  }

  // Purgar cualquier marca de agua residual adherida al final del texto limpio
  const trailingWatermark = text.match(/(?<=[.!?»”"']\s+)(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|gratis\s*en|FIN\s+gratis|FIN\s+g\s*r\s*a\s*t\s*i\s*s|h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|www\.[a-z0-9-]+)[\s\S]*$/i);
  if (trailingWatermark && trailingWatermark.index !== undefined && trailingWatermark.index >= Math.floor(text.length * 0.85)) {
    const wmText = text.substring(trailingWatermark.index).trim();
    text = text.substring(0, trailingWatermark.index).trim();
    backMatter = wmText + (backMatter ? '\n\n' + backMatter : '');
  }

  return {
    pureBody: text,
    frontMatter,
    backMatter,
    startMatched,
    endMatched
  };
}
