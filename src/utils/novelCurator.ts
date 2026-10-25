/**
 * Módulo de Curaduría Editorial de Novelas y Textos Literarios Largos
 * Especializado en:
 * 1. Detección y aislamiento de prefacios extensos, estudios preliminares y prólogos de traductor.
 * 2. Detección del punto de inicio del cuerpo principal (Capítulo 1 / Chapter 1 / Erstes Kapitel).
 * 3. Aislamiento y extracción de notas al pie de página para evitar que rompan diálogos o desfasen emparejamientos bilingües.
 */

import { detectTextLanguage, type LanguageInfo } from './languageDetector';
import { lookupCanonicalWorkLocally, type CanonicalWorkProfile } from './intelligentBookCurator';
import type { 
  BookPageStructure, 
  PosteriorContinuityReport, 
  PageDetailAnalysis 
} from '../types';
import { callGeminiWithResilience, hasValidGeminiApiKey } from '../services/gemini';
import { Type } from '@google/genai';
export { 
  detectTextLanguage, 
  type LanguageInfo, 
  type BookPageStructure, 
  type PosteriorContinuityReport, 
  type PageDetailAnalysis 
};

export interface NovelPrologueAnalysis {
  hasPrologue: boolean;
  prologueTitle?: string;
  prologueText: string;
  mainBodyText: string;
  detectedStartPattern?: string;
  startIndex: number;
  prologueWordCount: number;
  mainBodyWordCount: number;
}

export interface FootnoteItem {
  id: string;
  marker: string; // ej. "[1]", "(2)", "*", "Nota 1"
  text: string;
  sourceIndex: number;
}

export interface FootnoteExtractionResult {
  cleanedText: string;
  extractedFootnotes: FootnoteItem[];
}

export interface BoilerplateExtractionResult {
  cleanedText: string;
  removedBoilerplates: string[];
  hasBoilerplate: boolean;
}

/**
 * Limpia y separa avisos parasitarios de bibliotecas digitales y sitios de descarga
 * (e.g. "aliceandbooks.com", "Bienvenido al mágico mundo de la literature", "z-library", etc.)
 * tanto en líneas completas como si están fusionados al inicio de la primera frase.
 */
export function cleanOpeningBoilerplates(text: string): BoilerplateExtractionResult {
  if (!text || text.trim().length === 0) {
    return { cleanedText: text || '', removedBoilerplates: [], hasBoilerplate: false };
  }

  let cleaned = text;
  const removedBoilerplates: string[] = [];

  // 1. Limpieza de avisos iniciales en bloque o líneas completas
  const boilerplateRegexes = [
    // DigBib.org (Digital Bibliothek) - Captura el bloque entero de metadatos de biblioteca
    /^(?:[-–—«"'\s]*DigBib\s*\.\s*Org[\s\S]*?(?:erstellt|projekt|texte|melden|verbe\.\.\.|www\.digbib\.org)[^\n]*\.?\s*)/i,
    /^(?:[-–—«"'\s]*DigBib\s*\.\s*Org[^\n]*)/i,
    /^(?:[-–—«"'\s]*Die\s+freie\s+digitale\s+Bibliothek[^\n]*)/i,
    /^(?:[-–—«"'\s]*Erstellt\s+am\s+\d{2}\.\d{2}\.\d{4}\s+DigBib[^\n]*)/i,
    /^(?:[-–—«"'\s]*Dieses\s+e-?Book\s+ist\s+frei\s+im\s+Sinne\s+der\s+GNU[^\n.]*\.?)/i,
    /^(?:[-–—«"'\s]*GNU\s+Free\s+Documentation\s+License[^\n.]*\.?)/i,
    /^(?:[-–—«"'\s]*GNU\s+General\s+Public\s+License[^\n.]*\.?)/i,
    /^(?:[-–—«"'\s]*Creative\s+Commons\s+[^\n.]*\.?)/i,
    // Banners de descarga web y blogs (con soporte para caracteres duplicados de OCR: hhttttpp, bbllooggssppoott, comillas « »)
    /^(?:[-–—«"'\s]*(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s\s*)?(?:gratis|free)\s*en\s*h+[t\s]+[t\s]+[p\s]+[s\s]?:?[\/:\s]+[^\n]+(?:\s*[»"'])?)/i,
    /^(?:[-–—«"'\s]*M[aá]s\s*libros\s*gratis[^\n.]*\.?)/i,
    /^(?:[-–—«"'\s]*h+[t\s]+[t\s]+[p\s]+[s\s]?:?[\/:\s]+[^\s\n]+(?:\s*[»"'])?)/i,
    /^(?:[-–—«"'\s]*(?:libricultura|librosgratis|freelibros)\.blogspot\.[a-z]{2,4}[^\n]*(?:\s*[»"'])?)/i,
    /^(?:[-–—«"'\s]*[«“"']\s*(?:gratis\s+en|free\s+at)\s+h+[t\s]+[t\s]+[p\s]+[^\n»"']*[»"']?)/i,
    /^(?:[-–—\s]*Bienvenido al m[aá]gico mundo de la literatur[ea][^\n.]*(?:\.|\n|\s+(?=[A-ZÁÉÍÓÚÑ])))/i,
    /^(?:[-–—\s]*This book has been downloaded from\s+www\.[^\s\n]+[^\n.]*\.?)/i,
    /^(?:[-–—\s]*You can find many more public domain books in our website[^\n.]*\.?)/i,
    /^(?:[-–—\s]*Descargado (?:de|en)\s+[^\n.]+\.?)/i,
    /^(?:[-–—\s]*Downloaded from\s+[^\n.]+\.?)/i,
    /^(?:[-–—\s]*E-?Book creado por\s+[^\n.]+\.?)/i,
    /^(?:[-–—\s]*Visita(?: nuestro sitio web| nuestra web)?\s+www\.[^\s\n]+)/i,
    /^(?:[-–—\s]*(?:z-lib(?:rary)?|1lib|epublibre|aliceandbooks|standardebooks|feedbooks)\.(?:sk|org|com|is|to|cx|me)[^\n.]*\.?)/i,
    /^(?:[-–—\s]*Produced by [^\n]+?(?:Distributed Proofreading|Distributed Proofreaders|pgdp\.net)[^\n]*\.?)/i,
    /^(?:[-–—\s]*Online Distributed Proofreading Team at http:\/\/www\.pgdp\.net[^\n]*\.?)/i,
    /^(?:[-–—\s]*(?:DIE VERWANDLUNG VON FRANZ KAFKA\s+)?KURT WOLFF VERLAG LEIPZIG BÜCHEREI[^\n]*\.?)/i,
    /^(?:[-–—\s]*GEDRUCKT BEI DIETSCH & BRÜCKNER[^\n]*\.?)/i,
    /^(?:[-–—\s]*COPYRIGHT KURT WOLFF VERLAG[^\n]*\.?)/i
  ];

  let iteration = 0;
  let matched = true;
  while (matched && iteration < 15) {
    matched = false;
    iteration++;
    for (const r of boilerplateRegexes) {
      const m = cleaned.trimStart().match(r);
      if (m) {
        removedBoilerplates.push(m[0].trim());
        cleaned = cleaned.trimStart().substring(m[0].length).trimStart();
        matched = true;
      }
    }
  }

  // 1b. Poda rigurosa de párrafos iniciales que sean enlaces web o sellos de repositorio digital
  // (Escanea los primeros 30 párrafos y descarta cualquier aviso web flotante aunque haya títulos de por medio)
  const initialParas = cleaned.split(/\n\s*\n+/);
  const filteredParas: string[] = [];
  for (let i = 0; i < initialParas.length; i++) {
    const p = initialParas[i].trim();
    if (i < 30) {
      const isShort = p.length < 250;
      const isWatermark = isShort && /(?:h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|gratis\s*en|free\s*(?:at|in|on)|descargado\s+(?:de|en)|downloaded\s+from|digital\s+bibliothek|gnu\s+free\s+documentation|gnu\s+lizenz|creative\s+commons|quelle:\s*[a-z0-9/._-]+|erstellt\s+am\s+\d|www\.[a-z0-9/._-]+)/i.test(p) &&
        !(p.length > 80 && (/[.!?]\s+[A-ZÁÉÍÓÚÄÖÜÀÈÌÒÙÂÊÎÔÛÇ]/.test(p) || /^[-–—«»"“]/.test(p)));
      if (isWatermark) {
        removedBoilerplates.push(p);
        continue;
      }
    }
    filteredParas.push(p);
  }
  cleaned = filteredParas.join('\n\n').trim();

  // 2. Limpieza de cabecera con letras espaciadas + aviso de descarga
  // Ej: "M ATHILDA M ARY S HELLEY This book has been downloaded from www.aliceandbooks.com. You can find many more public domain books in our website"
  const spacedHeaderWithDownload = cleaned.match(/^(?:M\s+ATHILDA\s+M\s+ARY\s+S\s+HELLEY|[A-Z]\s+[A-Z]\s+[A-Z]\s+[A-Z](?:\s+[A-Z])*)(\s+This book has been downloaded[^\n.]+\.?(\s+You can find[^\n.]+\.?)?)/i);
  if (spacedHeaderWithDownload) {
    removedBoilerplates.push(spacedHeaderWithDownload[0].trim());
    cleaned = cleaned.substring(spacedHeaderWithDownload[0].length).trim();
  }

  // 3. Fusión inline de "Bienvenido al mágico mundo..." pegado al primer párrafo narrativo
  const fusedMagic = cleaned.match(/^(?:[-–—\s]*Bienvenido al m[aá]gico mundo de la literatur[ea]\s+)(?=[A-ZÁÉÍÓÚÑ])/i);
  if (fusedMagic) {
    removedBoilerplates.push(fusedMagic[0].trim());
    cleaned = cleaned.substring(fusedMagic[0].length).trim();
  }

  // Fusión inline de "This book has been downloaded from..."
  const fusedDownload = cleaned.match(/^(?:[-–—\s]*This book has been downloaded from\s+www\.[^\s\n]+(?:\s+You can find many more public domain books in our website)?\s*)(?=[A-ZÁÉÍÓÚÑ])/i);
  if (fusedDownload) {
    removedBoilerplates.push(fusedDownload[0].trim());
    cleaned = cleaned.substring(fusedDownload[0].length).trim();
  }

  // 4. Catalogación editorial / serie universitaria inicial antes del prefacio
  // Ej: "MATHILDA B Y MARY WOLLSTONECRAFT SHELLEY E DITED BY ELIZABETH NITCHIE THE UNIVERSITY OF NORTH CAROLINA PRESS CHAPEL HILL Mathilda is being published in paper as Extra Series #3 of Studies in Philology."
  const pubCatalogRegex = /^([A-Z\s]{3,30}B\s*Y\s+[A-Z\s]{4,40}\s+E\s*DITED BY\s+[A-Z\s]{4,40}\s+THE UNIVERSITY OF[^\n]+(?:Studies in Philology|\d{4})\.?\s*)/i;
  const pubMatch = cleaned.match(pubCatalogRegex);
  if (pubMatch) {
    removedBoilerplates.push(pubMatch[0].trim());
    cleaned = cleaned.substring(pubMatch[0].length).trim();
  }

  return {
    cleanedText: cleaned.trim(),
    removedBoilerplates,
    hasBoilerplate: removedBoilerplates.length > 0
  };
}

export interface TableOfContentsExtractionResult {
  cleanedText: string;
  tableOfContents: string;
  hasToc: boolean;
}

/**
 * Detecta y aísla rigurosamente el bloque de Índice / Table of Contents / Contenido
 * para evitar que los títulos de capítulos listados en el índice se confundan con
 * los capítulos reales en el cuerpo de la obra o con el prólogo.
 */
export function stripTableOfContents(text: string): TableOfContentsExtractionResult {
  if (!text) return { cleanedText: '', tableOfContents: '', hasToc: false };

  const tocStartRegex = /(?:^|\n\s*)(?:[_\-*•\s]*)(?:#+\s*)?(?:[IÍ]NDICE(?:\s+GENERAL)?|TABLA\s+DE\s+CONTENIDOS?|CONTENIDO|TABLE\s+OF\s+CONTENTS|CONTENTS|INHALTSVERZEICHNIS|INHALT|SOMMAIRE|TABLE\s+DES\s+MATI[ÈE]RES)\b[^\n]*/i;
  const startMatch = text.match(tocStartRegex);
  if (!startMatch || startMatch.index === undefined) {
    return { cleanedText: text, tableOfContents: '', hasToc: false };
  }

  const startIdx = startMatch.index;
  const fromToc = text.substring(startIdx);
  const lines = fromToc.split(/\r?\n/);
  
  let tocLinesCount = 1;

  for (let i = 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) {
      const nextL = lines.slice(i + 1).find(line => line.trim().length > 0)?.trim() || '';
      if (!nextL || /^(?:PR[OÓ]LOGO|PREFACIO|INTRODUCCI[OÓ]N|ESTUDIO\s+PRELIMINAR|CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK|[IVXLCDM]{1,6}\.?$|[0-9]{1,3}\.?$)/i.test(nextL)) {
        break;
      }
      continue;
    }
    
    // Si la línea es una marca de página [PÁGINA X], mirar si lo siguiente es una cabecera formal
    if (/^\[\s*P[AÁ]GINA\s+\d+\s*\]$/i.test(l)) {
      const nextL = lines.slice(i + 1).find(line => line.trim().length > 0)?.trim() || '';
      if (/^(?:PR[OÓ]LOGO|PREFACIO|INTRODUCCI[OÓ]N|ESTUDIO\s+PRELIMINAR|CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)/i.test(nextL)) {
        break;
      }
      continue;
    }

    const isTocEntry = /(?:\.{2,}|\s{3,}|…|\t)\s*(?:\d+|[ivxlcdm]+)$/i.test(l) ||
      /^(?:Cap[ií]tulo|Chapter|Kapitel|Parte|Part|Libro|Book|[IVXLCDM]+|[0-9]{1,3})\b[^\n]{1,75}(?:\s+\d+)?$/i.test(l) ||
      /^(?:Pr[oó]logo|Prefacio|Introducci[oó]n|Ep[ií]logo|Bibliograf[ií]a|Ap[eé]ndice|Sumario|Contenido)\b[^\n]{1,75}(?:\s+\d+)?$/i.test(l);

    // Si la línea es prosa narrativa (más de 90 caracteres, o contiene diálogo o múltiples oraciones), el índice ya terminó
    if (l.length > 90 || /(?:[.!?»”"']\s+[A-ZÁÉÍÓÚÑa-z]|—[A-ZÁÉÍÓÚÑa-z])/.test(l)) {
      break;
    }

    // Si la línea actual parece cabecera de capítulo y lo que sigue después es prosa narrativa extensa (>95 caracteres),
    // hemos llegado al primer capítulo real del cuerpo de la obra.
    const isHeadingLike = /^(?:#+\s*)?(?:Cap[ií]tulo|Chapter|Kapitel|Libro|Book|[IVXLCDM]{1,6}\.?$|[0-9]{1,3}\.?$)/i.test(l);
    if (isHeadingLike && i > 1) {
      const nextNonEmpty = lines.slice(i + 1).find(line => line.trim().length > 0)?.trim() || '';
      if (nextNonEmpty.length > 95 && !/(?:\.{2,}|\s{3,}|…|\t)\s*\d+$/.test(nextNonEmpty)) {
        break;
      }
    }

    if (isTocEntry || l.length < 60) {
      tocLinesCount = i + 1;
    } else {
      break;
    }
  }

  const tocText = lines.slice(0, tocLinesCount).join('\n').trim();
  const remainingText = lines.slice(tocLinesCount).join('\n').trim();
  const before = text.substring(0, startIdx).trim();

  return {
    cleanedText: (before ? before + '\n\n' : '') + remainingText,
    tableOfContents: tocText,
    hasToc: tocText.length > 0
  };
}

export interface FrontMatterExtraction {
  author?: string;
  title?: string;
  subtitle?: string;
  chapterOneTitle?: string;
  downloadNotice?: string;
  legalNotice?: string;
  dedication?: string;
  epigraph?: string;
  tableOfContents?: string;
  cleanedText: string;
  hasExtractedHeader: boolean;
}

/**
 * Detecta de forma exhaustiva e implacable párrafos o líneas que corresponden a datos
 * editoriales, portadillas, sedes de publicación, sitios web, créditos de conversión,
 * ISBN, depósito legal, dedicatorias o epígrafes, impidiendo terminantemente que se
 * confundan con el inicio de la novela o Capítulo 1.
 */
export function isPublisherImprintOrFrontMetadata(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  const t = text.trim();

  // 1. URLs, dominios web, correos electrónicos o marcas de sitios/editoriales
  if (/(?:www\.[a-z0-9\-]+\.[a-z]{2,}|https?:\/\/[^\s]+|@[a-z0-9\-]+\.[a-z]{2,}|sextopiso\.com|editorial|ediciones)/i.test(t)) {
    if (/(?:sextopiso|newcomlab|epublibre|z-lib|1lib|gutenberg|editorial|ediciones|librer[ií]a|distribuci[oó]n|contacto|diseño)/i.test(t)) return true;
  }

  // 2. Direcciones postales o sedes de imprenta (ej. "C/ Los Madrazo, 24, semisótano...", "Calle Mayor...", "08014, Madrid, España")
  if (/(?:C\/|Calle\s+|Avda\.?|Avenida\s+|Plaza\s+|Paseo\s+|semis[oó]tano)[A-ZÁÉÍÓÚa-záéíóúñ\s,0-9]+(?:Madrid|Barcelona|Buenos\s+Aires|M[eé]xico|Bogot[aá]|Espa[ñn]a|Spain|London|New\s+York|Paris)/i.test(t)) {
    return true;
  }
  if (/\b(?:28\d{3}|08\d{3})\b.*(?:Madrid|Barcelona|Espa[ñn]a|Spain)/i.test(t)) {
    return true;
  }

  // 3. Créditos de diseño, conversión a ebook, maquetación o fotocomposición
  if (/(?:Diseño\s+(?:de\s+cubierta|gr[aá]fico|editorial|E\s*STUDIO)|Maquetaci[oó]n|Conversi[oó]n\s+a\s+libro\s+electr[oó]nico|Fotocomposici[oó]n|Tipograf[ií]a|Pre-prensa|Impreso\s+por|Printed\s+by|Produced\s+by|Newcomlab)/i.test(t)) {
    return true;
  }

  // 4. Menciones legales, ISBN, depósito legal, derechos reservados
  if (/(?:ISBN\s*[:\-\d\sXx]+|eISBN|Dep[oó]sito\s+legal|D\.R\.\s*©|Todos\s+los\s+derechos\s+reservados|All\s+rights\s+reserved|Tous\s+droits\s+r[eé]serv[eé]s|Alle\s+Rechte\s+vorbehalten|Tutti\s+i\s+diritti\s+riservati|Prohibida\s+la\s+reproducci[oó]n|Queda\s+prohibid[ao]|Cualquier\s+forma\s+de\s+reproducci[oó]n|Bajo\s+las\s+sanciones|C[oó]digo\s+penal|Sin\s+(?:la\s+)?autorizaci[oó]n|Primera\s+edici[oó]n|First\s+edition|Premi[èe]re\s+[eé]dition|Erste\s+Auflage|T[ií]tulo\s+original|Traducci[oó]n\s+(?:de|del|por)|Edici[oó]n\s+al\s+cuidado\s+de|Titular\s+del\s+copyright|Propiedad\s+intelectual)/i.test(t)) {
    return true;
  }

  // 5. Nombres de editoriales prominentes solos o con datos
  if (/(?:Editorial\s+Sexto\s+Piso|Editorial\s+Anagrama|Penguin\s+Random\s+House|Alianza\s+Editorial|Alfaguara|Tusquets|C[aá]tedra|Akal|Valdemar|Gredos|Planeta|Seix\s+Barral|Acantilado|Salamandra|Impedimenta|Perif[eé]rica|Alba\s+Editorial|Siruela|Galaxia\s+Gutenberg|P[aá]ginas\s+de\s+Espuma|Fondo\s+de\s+Cultura\s+Econ[oó]mica|Kurt\s+Wolff\s+Verlag|Suhrkamp|S\.\s*Fischer|Reclam|Insel\s+Verlag|Gallimard|Flammarion|Grasset|Wordsworth|Dover\s+Publications|Vintage\s+Classics|Oxford\s+World'?s?\s+Classics)/i.test(t)) {
    return true;
  }

  return false;
}

/**
 * Desenhebra metadatos de portadilla (Autor, Título, Traductor) del arranque de un libro.
 * Evita rigurosamente que se fusionen con el Párrafo #1 de la narrativa.
 * Maneja tanto líneas independientes al inicio como fusiones en una misma línea
 * (ej. "Franz Kafka La Metamorfosis Una mañana, tras un sueño intranquilo...").
 */
export function disentangleOpeningFrontMatter(
  text: string,
  knownTitle?: string,
  knownAuthor?: string
): FrontMatterExtraction {
  if (!text || text.trim().length === 0) {
    return { cleanedText: text || '', hasExtractedHeader: false };
  }

  // Primero pasamos la limpieza profunda de avisos de bibliotecas / descargas / colofones web
  const boiler = cleanOpeningBoilerplates(text);
  let cleaned = boiler.cleanedText;
  const downloadNotice = boiler.hasBoilerplate ? boiler.removedBoilerplates.join(' | ') : undefined;

  // Aislamiento del Índice / Table of Contents
  const tocResult = stripTableOfContents(cleaned);
  cleaned = tocResult.cleanedText;
  const tableOfContents = tocResult.hasToc ? tocResult.tableOfContents : undefined;

  let detectedAuthor = knownAuthor?.trim() || undefined;
  let detectedTitle = knownTitle?.trim() || undefined;
  let detectedSubtitle: string | undefined = undefined;
  let detectedLegal: string | undefined = undefined;
  let detectedDedication: string | undefined = undefined;
  let detectedEpigraph: string | undefined = undefined;
  let chapterOneTitle: string | undefined = undefined;
  let hasExtracted = boiler.hasBoilerplate || tocResult.hasToc;

  // 1. CASO INLINE FUSIONADO:
  // Solo se debe activar si el candidato a autor NO es una palabra narrativa habitual (Als, Una, It, En, etc.)
  // y coincide con knownAuthor / knownTitle o contiene marcadores explícitos de autoría
  const narrativeOpeners = /^(?:Als|Una|Uno|Un|Cuando|Aquel|Aquella|El|La|Los|Las|En|De|Por|It|In|Is|If|No|As|At|An|On|There|This|That|The|When|Where|After|Before)\b/i;
  const inlineFusedPattern = /^([A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+){1,3})\s+((?:(?:El|La|Los|Las|The|Der|Die|Das|Le|Les)\s+)?[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜa-zÁ-ÿ]+){0,4})\s+([A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+.*)$/s;
  
  const fusedMatch = cleaned.match(inlineFusedPattern);
  if (fusedMatch) {
    const candidateAuthor = fusedMatch[1].trim();
    const candidateTitle = fusedMatch[2].trim();
    const narrativeBody = fusedMatch[3].trim();

    const isNarrativeFalsePositive = narrativeOpeners.test(candidateAuthor) || candidateAuthor.toLowerCase() === 'als gregor';
    const matchesKnown = (knownAuthor && candidateAuthor.toLowerCase().includes(knownAuthor.toLowerCase())) ||
                         (knownTitle && candidateTitle.toLowerCase().includes(knownTitle.toLowerCase())) ||
                         /^(?:Franz\s+Kafka|Mary\s+(?:Wollstonecraft\s+)?Shelley|Jane\s+Austen|Edgar\s+Allan\s+Poe|Miguel\s+de\s+Cervantes)/i.test(candidateAuthor);

    if (!isNarrativeFalsePositive && matchesKnown && candidateAuthor.length < 40 && candidateTitle.length < 50 && narrativeBody.length > 30) {
      if (!detectedAuthor) detectedAuthor = candidateAuthor;
      if (!detectedTitle) detectedTitle = candidateTitle;
      cleaned = narrativeBody;
      hasExtracted = true;
    }
  }

  // 2. CASO MULTILÍNEA O CABECERA INICIAL (analizar hasta 80 líneas iniciales)
  const lines = cleaned.split(/\r?\n/);
  let narrativeStartIndex = -1;
  const maxScanLines = Math.min(lines.length, 80);
  let lastPreliminaryKind: 'dedication' | 'epigraph' | null = null;

  for (let i = 0; i < maxScanLines; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Ignorar marcas de página de OCR y números de página aislados
    const isPageMarker = /^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA(?:\s+DERECHA|\s+IZQUIERDA)?|HOJA)[^\]]*\]\s*[-–—\s]*$/i.test(line) ||
      /^(?:[-–—\s]*\[\s*\d+\s*\][-–—\s]*|[-–—\s]*[-–—]\s*\d+\s*[-–—][-–—\s]*|[-–—\s]*(?:p[aá]g\.?|p\.|page|seite)\s*\d+[-–—\s]*|\d+\s*(?:\/|de)\s*\d+)$/i.test(line) ||
      (/^\d{1,4}$/.test(line) && i < 15);
    if (isPageMarker) {
      continue;
    }

    // Comprobación de metadatos o colofón editorial (dirección, sextopiso, diseño, etc.)
    if (isPublisherImprintOrFrontMetadata(line)) {
      detectedLegal = (detectedLegal ? detectedLegal + '\n' : '') + line;
      hasExtracted = true;
      continue;
    }

    // 0. Si la línea vino con un encabezado de capítulo fusionado con la primera oración narrativa:
    const fusedMatch = line.match(/^((?:#+\s*)?(?:Cap[ií]tulo|Cap\.?|Kapitel|Kap\.?|Chapter|Chap\.?|Chapitre|Capitolo|Parte|Part|Libro|Book)\s+(?:1\b|I\b|one\b|first\b|the\s+first\b|primero\b|uno\b|primer\b|primera\b|erstes\b|premier\b)\.?|(?:[IVXLCDM]{1,6}|[0-9]{1,3})\.)\s+([A-ZÁÉÍÓÚÑ"“«].+)$/i);
    if (fusedMatch) {
      chapterOneTitle = fusedMatch[1].trim();
      lines[i] = fusedMatch[1].trim();
      lines.splice(i + 1, 0, fusedMatch[2].trim());
      narrativeStartIndex = i;
      break;
    }

    // 1. Verificar si es marcador de capítulo (SOLO Capítulo 1, Parte 1 o inicio narrativo, nunca dígitos arbitrarios)
    const isChapterMarker = /^(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+(?:1\b|I\b|one\b|first\b|primero\b|primer\b|primera\b|uno\b|erstes\b|premier\b)\.?|(?:1|I)\.\s*$|(?:I|1)\b\.?\s*$)/i.test(line);
    if (isChapterMarker) {
      chapterOneTitle = line.replace(/^#+\s*/, '').trim();
      narrativeStartIndex = i;
      break;
    }

    // 1.2 Verificar si es inicio de prólogo / prefacio
    const isPrologueMarker = /^(?:#+\s*)?(?:PR[OÓ]LOGO|PREFACIO|ESTUDIO\s+PRELIMINAR|INTRODUCCI[OÓ]N|PREFACE|INTRODUCTION|FOREWORD|VORWORT|EINLEITUNG|AVANT-PROPOS|PRÉFACE)\b/i.test(line);
    if (isPrologueMarker) {
      narrativeStartIndex = i;
      break;
    }

    // 1.5 Si es una oración narrativa reconocida:
    if (/^(?:No\s+son\s+m[aá]s\s+que\s+las\s+cuatro\b|It\s+is\s+only\s+four\s+o['’‘]clock\b|Una\s+mañana,\s+tras\s+un\s+sueño\b|Als\s+Gregor\s+Samsa\b|When\s+she\s+was\s+home\b|Cuando\s+ella\s+estaba\b|Cuando\s+venía\s+a\s+casa\b)/i.test(line)) {
      narrativeStartIndex = i;
      break;
    }

    // 1.8 Descartar avisos de repositorios o colofones editoriales antes de evaluar narrativa
    const isBoilerplateNotice = /(?:Distributed Proofreading|pgdp\.net|Produced by|KURT WOLFF|VERLAG|COPYRIGHT|BÜCHEREI|GEDRUCKT BEI|z-lib|gutenberg|1lib|aliceandbooks)/i.test(line);
    if (isBoilerplateNotice) {
      hasExtracted = true;
      continue;
    }

    // 1.9 Descartar información legal, editorial, ISBN, depósito legal y créditos
    const isLegalNotice = /(?:todos\s+los\s+derechos\s+reservados|all\s+rights\s+reserved|derechos\s+reservados|copyright|d\.r\.|isbn|dep[oó]sito\s+legal|impreso\s+en|printed\s+in|publicado\s+por|published\s+by|primera\s+edici[oó]n|first\s+edition|editorial\b|calle\s+mayor|madrid|barcelona|buenos\s+aires|m[eé]xico|london|new\s+york|berlin|paris|prohibida\s+la\s+reproducci[oó]n|sin\s+el\s+permiso|propiedad\s+intelectual|titular\s+del\s+copyright|sextopiso|newcomlab|diseño\s+e\s*studio)/i.test(line);
    if (isLegalNotice) {
      detectedLegal = (detectedLegal ? detectedLegal + ' ' : '') + line;
      hasExtracted = true;
      continue;
    }

    // 1.95 Dedicatorias y Epígrafes (pertenecen a los preliminares, NO arrancan la novela)
    const isDedicationStart = /^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Dem\s+|Für\s+|A\s+la\s+memoria\s+de|In\s+memoriam)\b/i.test(line) && line.length < 220;
    const isEpigraphStart = (/^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/.test(line) || /^(?:Ep[ií]grafe|Motto)\b/i.test(line) || (/^[«“"']/.test(line) && line.length < 250));

    if (isDedicationStart) {
      detectedDedication = detectedDedication ? `${detectedDedication}\n${line}` : line;
      lastPreliminaryKind = 'dedication';
      hasExtracted = true;
      continue;
    }

    if (isEpigraphStart) {
      detectedEpigraph = detectedEpigraph ? `${detectedEpigraph}\n${line}` : line;
      lastPreliminaryKind = 'epigraph';
      hasExtracted = true;
      continue;
    }

    // Si el último elemento preliminar fue un epígrafe y la línea es su autor/atribución (ej. "— Mahatma Gandhi")
    if (lastPreliminaryKind === 'epigraph' && detectedEpigraph && !isDedicationStart && !isEpigraphStart && !isChapterMarker && !isPrologueMarker && !isLegalNotice && !isBoilerplateNotice && line.length < 150 && !/^(?:Cap[ií]tulo|Chapter|Kapitel|[IVXLCDM]+)\b/i.test(line)) {
      if (/^[-–—\(\[]\s*[A-ZÁÉÍÓÚÄÖÜa-z]/.test(line) || line.length < 80) {
        detectedEpigraph = `${detectedEpigraph}\n${line}`;
        hasExtracted = true;
        continue;
      }
    }

    // Si el último elemento preliminar fue una dedicatoria y la línea es su firma o continuación (ej. "— La autora")
    if (lastPreliminaryKind === 'dedication' && detectedDedication && !isDedicationStart && !isEpigraphStart && !isChapterMarker && !isPrologueMarker && !isLegalNotice && !isBoilerplateNotice && line.length < 130 && !/^(?:Cap[ií]tulo|Chapter|Kapitel|[IVXLCDM]+)\b/i.test(line)) {
      if (/^[-–—]\s*(?:El\s+autor|La\s+autora|The\s+author|L'auteur|[A-ZÁÉÍÓÚÄÖÜ][a-zÁ-ÿ]+)/i.test(line) || /^[-–—\s]/.test(line) || /^[a-z]/.test(line) || line.length < 60) {
        detectedDedication = `${detectedDedication}\n${line}`;
        hasExtracted = true;
        continue;
      }
    }

    // 2. Si ya alcanzamos un párrafo largo o diálogo narrativo GENUINO (sin metadatos de imprenta ni fechas aisladas):
    const isDedicationOrEpigraphPattern = /^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Dem\s+|Für\s+|A\s+la\s+memoria\s+de|In\s+memoriam|Ep[ií]grafe|Motto)\b/i.test(line);
    const isDateHeaderOrTOC = /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+\d+(?:st|nd|rd|th)?|\d{1,2}\s+(?:de\s+)?[a-zÁ-ÿ]+)\b.*(?:\d{1,4})$/i.test(line);

    const isProseNarrative = !isDedicationOrEpigraphPattern && !isDateHeaderOrTOC && !isPublisherImprintOrFrontMetadata(line) && (
      (line.length > 80 && !isLegalNotice && !isBoilerplateNotice && !/^(?:biblioteca|digital|editorial|t[ií]tulo\s+original|traducci[oó]n|primera\s+edici[oó]n)/i.test(line)) || 
      (line.length > 50 && /[.!?»”"]$/.test(line) && !/^(?:cap[ií]tulo|cap\.?|chapter|chap\.?|kapitel|kap\.?)\b/i.test(line) && !isLegalNotice) ||
      /^[—–\-]\s*[A-ZÁÉÍÓÚÑÄÖÜa-záéíóúñäöü«"“¡¿]/.test(line)
    );

    if (isProseNarrative) {
      // ANÁLISIS POSTERIOR AUTOMÁTICO DE CONTINUIDAD:
      // Comprobar las siguientes líneas no vacías para descartar falsos arranques en página de créditos
      let isFollowedByFrontMatter = false;
      let nonVacantCount = 0;
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const nextL = lines[j].trim();
        if (!nextL) continue;
        nonVacantCount++;
        if (isPublisherImprintOrFrontMetadata(nextL) ||
            /(?:isbn|dep[oó]sito legal|derechos reservados|printed in|impreso en|edición|fotocomposición|traducción de|diseño|calle\s+)/i.test(nextL) ||
            /(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(nextL)) {
          isFollowedByFrontMatter = true;
          break;
        }
        if (nonVacantCount >= 2) break;
      }

      if (isFollowedByFrontMatter) {
        // La línea era texto preliminar o aviso de la página legal; continuar escaneando
        detectedLegal = (detectedLegal ? detectedLegal + '\n' : '') + line;
        hasExtracted = true;
        continue;
      }

      // Si la línea inmediatamente anterior (i-1) o (i-2) era un encabezado de capítulo o numeral romano,
      // el arranque real de la narración debe comenzar allí para incluir la cabecera del capítulo en el cuerpo.
      let adjustedStart = i;
      if (i > 0) {
        const prev1 = lines[i - 1].trim();
        if (/^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+[0-9IVXLCDM]+|(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\.?|[0-9]{1,2}\.?)(?:\s*[-–—:.]\s*[^\n]*)?$/i.test(prev1)) {
          adjustedStart = i - 1;
        }
      }

      narrativeStartIndex = adjustedStart;
      break;
    }

    // Verificar autor (nunca confundir con capítulos ni con organizaciones / editoriales)
    const isOrgOrRepo = /(?:biblioteca|digital|universal|editorial|ediciones|publicaciones|colecci[oó]n|press|publishing|books|ebooks|libros|traducci[oó]n|copyright|derechos|distribuido|archivo|sociedad|asociaci[oó]n|proofread|proofreading|gutenberg|aliceandbooks|universidad|university)/i.test(line);
    if (!detectedAuthor && !isOrgOrRepo && !isChapterMarker && /^(?:por|by|von|par)?\s*[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+){1,3}$/i.test(line) && line.length < 45) {
      detectedAuthor = line.replace(/^(?:por|by|von|par)\s+/i, '').trim();
      hasExtracted = true;
      continue;
    }

    // Verificar título (jamás confundir con un marcador de capítulo como "CAPÍTULO I")
    if (!detectedTitle && !isOrgOrRepo && !isChapterMarker && !isLegalNotice && (
      /^(?:(?:El|La|Los|Las|The|Der|Die|Das|Le|Les)\s+)?[A-ZÁÉÍÓÚÑÄÖÜ][a-zÁ-ÿ]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜa-zÁ-ÿ]+){0,5}$/i.test(line) ||
      /^[A-ZÁÉÍÓÚÑÄÖÜ\s]{3,50}$/.test(line)
    ) && line.length < 60) {
      detectedTitle = line;
      hasExtracted = true;
      continue;
    }

    // Verificar subtítulo o traducción
    if (/^(?:Traducci[oó]n|Translated|Übersetzung|Edici[oó]n|Novela|Relato)\b/i.test(line)) {
      detectedSubtitle = line;
      hasExtracted = true;
      continue;
    }
  }

  // Si se encontró el inicio de la narrativa después de líneas de cabecera:
  if (narrativeStartIndex > 0) {
    const remainingLines = lines.slice(narrativeStartIndex);
    cleaned = remainingLines.join('\n').trim();
    hasExtracted = true;
  }

  // 3. LIMPIEZA RESIDUAL SI SE CONOCEN TÍTULO Y/O AUTOR DE ANTEMANO:
  if (detectedTitle || detectedAuthor) {
    const tEsc = detectedTitle && !/^(?:Cap[ií]tulo|Chapter|Kapitel|[IVXLCDM]+)/i.test(detectedTitle)
      ? detectedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    const aEsc = detectedAuthor && !/^(?:Cap[ií]tulo|Chapter|Kapitel|[IVXLCDM]+)/i.test(detectedAuthor)
      ? detectedAuthor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : '';
    
    const parts = [tEsc, aEsc].filter(Boolean).join('|');
    if (parts) {
      const combinedPrefixRegex = new RegExp(`^(?:\\s*(?:${parts})\\b\\s*[:\\-]?[\\s\\n]*)+`, 'i');
      if (combinedPrefixRegex.test(cleaned)) {
        cleaned = cleaned.replace(combinedPrefixRegex, '').trim();
        hasExtracted = true;
      }
    }
  }

  return {
    author: detectedAuthor,
    title: detectedTitle,
    subtitle: detectedSubtitle,
    chapterOneTitle,
    downloadNotice,
    legalNotice: detectedLegal,
    dedication: detectedDedication,
    epigraph: detectedEpigraph,
    tableOfContents,
    cleanedText: cleaned,
    hasExtractedHeader: hasExtracted
  };
}


// Patrones multilingües de encabezados donde arranca la novela o historia real
export const CHAPTER_ONE_PATTERNS = [
  // Capítulo 1 canónico en una sola línea (ej. "Capítulo 1", "Capítulo I", "Chap. I", "CHAP. I.", "C HAP. I", "Chapter 1", "Chapter One", "Kapitel 1", "Chapitre I")
  /(?:^|\n\s*)(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|c\s*hapter|c\s*hap\.?|k\s*apitel|k\s*ap\.?|c\s*hapitre|c\s*apitolo)\s+(?:1\b|I\b|one\b|first\b|the\s+first\b|primero\b|primer\b|primera\b|el\s+primer\b|uno\b|erstes\b|erste\b|eins\b|premier\b|premi[èe]re\b|primo\b)\.?)(?:\s*[-–—:.]\s*[^\n]*)?(?:\s*\r?\n+|$)/i,
  // Capítulo 1 en dos líneas continuas (ej. "CAPÍTULO\nI", "CHAP.\nI", "C HAP.\nI", "CHAPTER\n1")
  /(?:^|\n\s*)(?:[_\-*•\s]*)(?:#+\s*)?(?:c\s*ap[ií]tulo|c\s*ap\.?|c\s*hapter|c\s*hap\.?|k\s*apitel|c\s*hapitre|c\s*apitolo)\s*\r?\n+\s*(?:1\b|I\b|one\b|first\b|primero\b|uno\b|primer\b|primera\b|erstes\b|premier\b)\b\.?[^\n]*/i,
  // Título de capítulo numerado (ej. "1. El comienzo" o "I. The Invitation")
  /(?:^|\n\s*)(?:#+\s*)?(?:(?:cap[ií]tulo|chapter|kapitel|chapitre)\s+[0-9IVXLCDM]+|[0-9IVXLCDM]+\.)\s*[-–—:.]\s*[A-ZÁÉÍÓÚÑÄÖÜ]/i,
  // Libro 1 / Parte 1
  /(?:^|\n\s*)(?:#+\s*)?(?:(?:libro|book|buch|livre|parte|part|teil)\s+(?:1\b|I\b|one\b|first\b|primero\b|primera\b|erstes\b|premier\b|premi[èe]re\b))[^\n]*/i,
  // Acto 1
  /(?:^|\n\s*)(?:#+\s*)?(?:(?:acto|act)\s+(?:1\b|I\b|one\b|first\b|primero\b|erstes\b))\b[^\n]*/i,
  // Título o arranque clásico de novela que comienza con número romano o arábigo 1 en línea aislada o con punto
  /(?:^|\n\s*\r?\n\s*)(?:#+\s*)?(?:I|1)\.?\s*(?:\r?\n+)(?=[A-ZÁÉÍÓÚÑ"“«])/,
  /(?:^|\n\s*)(?:#+\s*)?(?:I|1)\.\s+[-–—:.]*\s*(?=[A-ZÁÉÍÓÚÄÖÜ"“«¿¡])/,
  /(?:^|\n\s*)#+\s*(?:1|I)\.?\s*(?:\r?\n+|$)/
];

// Patrones de prefacios / prólogos / estudios introductorios multilingües
const PROLOGUE_HEADING_PATTERNS = [
  /(?:^|\n\s*)(?:#+\s*)?(?:pr[oó]logo|prefacio|estudio\s+preliminar|introducci[oó]n|nota\s+del\s+traductor|advertencia|a\s+manera\s+de\s+pr[oó]logo|foreword|preface|prologue|translator's?\s+note|editor's?\s+note|a\s+note\s+on\s+the\s+novelette|note\s+on\s+the\s+text|introduction|vorwort|einleitung|einführung|avant-propos|préface|prefazione)\b[^\n]*/i
];

/**
 * Normaliza discrepancias tipográficas universales de OCR, PDFs y formatos digitales:
 * - Comillas curvas, apóstrofes tipográficos (`’`, `‘`, `´`, ```) a apóstrofe estándar
 * - Comillas angulares y tipográficas (`“`, `”`, `«`, `»`, `„`, `‟`) a comillas dobles
 * - Guiones y rayas (`—`, `–`) normalizados
 * - Ligaduras tipográficas (`ﬁ` -> fi, `ﬂ` -> fl, `ﬀ` -> ff, `ﬃ` -> ffi, `ﬄ` -> ffl)
 * - Espacios duros o no rompibles a espacio regular
 */
export function normalizeTypographicText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[’‘´`]/g, "'")
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[—–]/g, '—')
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/ﬀ/g, 'ff')
    .replace(/ﬃ/g, 'ffi')
    .replace(/ﬄ/g, 'ffl')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F]/g, ' ')
    .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*\n+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/g, '$1$2');
}

/**
 * Limpia y purga artefactos académicos y de OCR que rompen la lectura continua:
 * 1. Llamadas a nota al pie inline como "[1]", "[2]", "[14]", "[i]", "[iv]"
 * 2. Signos ortográficos encerrados entre corchetes por el editor (ej. "not[.]" -> "not.", "world[,] " -> "world, ")
 * 3. Indicadores filológicos como "[sic]", "[sic.]", "[ sic ]"
 * 4. Asteriscos y dagas de llamada crítica adheridos a palabras ("palabra*")
 */
export function cleanInlineFootnoteReferencesAndScholarlyArtifacts(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Restaurar puntuación editorial corcheteada: "not[.]" -> "not.", "end[?]" -> "end?"
  cleaned = cleaned.replace(/\[\s*([.,;:!?»”"'])\s*\]/g, '$1');

  // 2. Eliminar avisos de transcripción o errata como [sic] o [ sic ]
  cleaned = cleaned.replace(/\s*\[\s*sic\.?\s*\]/gi, '');

  // 3. Eliminar llamadas numéricas o romanas de notas al pie pegadas al texto:
  // e.g. "palabra[1]", "palabra [1]", "[12]", "[i]", "[iv]"
  cleaned = cleaned.replace(/(?<=[a-záéíóúñA-ZÁÉÍÓÚÑ0-9.,;:!?»”"'\)])\s*\[\s*(?:\d{1,3}|[ivxlcdm]{1,6}|[a-z]|[\*†‡])\s*\]/g, '');
  cleaned = cleaned.replace(/\[\s*(?:\d{1,3}|[ivxlcdm]{1,6})\s*\](?=\s*[a-záéíóúñA-ZÁÉÍÓÚÑ.,;:!?»”"'])/g, '');

  // 4. Limpiar llamadas con asteriscos o dagas superíndices inline
  cleaned = cleaned.replace(/(?<=[a-záéíóúñA-ZÁÉÍÓÚÑ])\s*[\*†‡](?=\s|[.,;:!?»”"'])/g, '');

  // 5. Reparar si al suprimir llamadas a notas o guiones quedó puntuación pegada a mayúscula sin espacio
  // Conservar comillas de cierre pegadas a su signo terminal
  cleaned = cleaned.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9]{2,}[.!?]+[»”"']*)(?=[A-ZÁÉÍÓÚÑÄÖÜ¿¡]|["“«][A-ZÁÉÍÓÚÑÄÖÜ])/g, '$1 ');
  // Conservar comillas de cierre pegadas a su signo terminal, pero NUNCA soldar comillas de apertura de la siguiente frase
  cleaned = cleaned.replace(/([.!?])[ \t]+([»”"'])(?=\s|$)/g, '$1$2');
  cleaned = cleaned.replace(/([.!?]+)[ \t]*([»”"']*)([ \t]*)(["“«„][A-ZÁÉÍÓÚÄÖÜ¿¡])/g, '$1$2 $4');

  return cleaned;
}

/**
 * Desdobla y aísla encabezados de capítulo o prefacio que hayan quedado fusionados
 * en la misma línea o párrafo debido a deficiencias del OCR o maquetación del PDF.
 * Ejemplo crítico:
 * "...vigorous and precise.C HAP . I Florence. Nov. 9th 1819 It is only four o'clock; but it is winter"
 * Se desdobla en:
 * 1. "...vigorous and precise." (fin del prefacio)
 * 2. "### CHAP. I" (encabezado canónico aislado)
 * 3. "*Florence. Nov. 9th 1819*" (subtítulo epistolar/dateline)
 * 4. "It is only four o'clock; but it is winter" (arranque del párrafo narrativo)
 */
export function unfoldFusedChapterAndPrologueHeaders(text: string): string {
  if (!text) return '';
  let result = text;

  // 1. Normalizar espaciado disperso de OCR en palabras clave de capítulos
  result = result.replace(/\bC\s+H\s+A\s+P\b/gi, 'CHAP');
  result = result.replace(/\bC\s+HAP\b/gi, 'CHAP');
  result = result.replace(/\bC\s+H\s+A\s+P\s+T\s+E\s+R\b/gi, 'CHAPTER');
  result = result.replace(/\bC\s+HAPTER\b/gi, 'CHAPTER');
  result = result.replace(/\bC\s+A\s+P\s+I\s+T\s+U\s+L\s+O\b/gi, 'CAPÍTULO');
  result = result.replace(/\bC\s+AP[IÍ]TULO\b/gi, 'CAPÍTULO');
  result = result.replace(/\bC\s+AP\b/gi, 'CAP');
  result = result.replace(/\bK\s+A\s+P\s+I\s+T\s+E\s+L\b/gi, 'KAPITEL');
  result = result.replace(/\bK\s+APITEL\b/gi, 'KAPITEL');
  result = result.replace(/\bL\s+I\s+B\s+R\s+O\b/gi, 'LIBRO');
  result = result.replace(/\bP\s+A\s+R\s+T\s+E\b/gi, 'PARTE');

  // 1b. Desdoblar y fusionar cabeceras de capítulo donde la palabra ("CHAP.", "CAPÍTULO") y el número ("I", "1") quedaron en líneas distintas:
  // e.g. "CHAP .\n\nI\n\nFlorence." -> "### CHAP. I\n\n*Florence.*"
  result = result.replace(
    /(?:^|\n\s*)(?:#+\s*)?(CHAP(?:\.|TER)?|CAP[IÍ]TULO|CAP\.?|KAPITEL|CHAPITRE|CAPITOLO|LIBRO|BOOK|PARTE|PART)\s*\.?\s*(?:\n\s*)+(?:#+\s*)?([0-9IVXLCDM]{1,8}|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|primero|segundo|tercero|cuarto|quinto|uno|dos|tres)\.?\s*(?=\n|$)/gi,
    (m, label, num) => {
      const cleanLabel = label.replace(/\s+/g, '').replace(/\./g, '');
      return `\n\n### ${cleanLabel.toUpperCase()} ${num.trim()}\n\n`;
    }
  );

  // 2. Desdoblar terminación de párrafo soldado a título de obra o cabecera de capítulo universal:
  // El fin del prefacio debe quedar limpio con su punto (".") y la obra debe arrancar con su encabezado en bloque nuevo
  const fusedPrefaceTitleAndChapter = /([.!?»”"'])\s*(?:[A-ZÁÉÍÓÚÑ]{3,30}\s+)?(?:#+\s*)?(CHAP(?:\.|TER)?|CAP[IÍ]TULO|CAP\.?|KAPITEL|CHAPITRE|CAPITOLO|LIBRO|BOOK|PARTE|PART)\s*\.?\s*([0-9IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo|primer|primera|uno|dos|tres)\b\.?/gi;
  result = result.replace(fusedPrefaceTitleAndChapter, (match, punct, label, num) => {
    return `${punct}\n\n### ${label.toUpperCase()} ${num}\n\n`;
  });

  // 2b. Desdoblar números romanos o arábigos de capítulo precedidos de punto con salto de línea o final de párrafo
  // e.g. "...so ein Zimmer.\nII. Erst in der Abenddämmerung..." o "...final.\n1. Inicio..."
  result = result.replace(/([.!?»”"'])\s*\n\s*(?:#+\s*)?([IVXLCDM]{1,6}|[0-9]{1,3})\.\s*[-–—:.]*\s*(?=[A-ZÁÉÍÓÚÄÖÜ"“«])/g, (m, punct, romanOrNum) => {
    return `${punct}\n\n### ${romanOrNum.toUpperCase()}\n\n`;
  });

  // 3. Encabezados de capítulo que arrancan línea pero tienen la fecha u oración pegada:
  // e.g. "CHAP. I Florence. Nov. 9th 1819 It is only four o'clock..." o "CAPÍTULO II Ahora hablemos de mí..."
  const lineStartFusedChapterRegex = /(?:^|\n\s*)(?:#+\s*)?(CHAP(?:\.|TER)?|CAP[IÍ]TULO|CAP\.?|KAPITEL|CHAPITRE|CAPITOLO|LIBRO|BOOK|PARTE|PART|ACTO)\s*\.?\s*([0-9IVXLCDM]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo|primer|primera|uno)\b\.?\s*[-–—:.]*\s*(?=[A-ZÁÉÍÓÚÑÄÖÜ"“«¿¡\d\*])/gi;
  result = result.replace(lineStartFusedChapterRegex, (match, label, num) => {
    return `\n\n### ${label.toUpperCase()} ${num}\n\n`;
  });

  // 3b. Número romano de 2+ caracteres con punto o arábigo con punto que arranca línea antes de la prosa narrativa:
  // e.g. "II. Erst in der Abenddämmerung..."
  result = result.replace(/(?:^|\n\s*)(?:#+\s*)?([IVX]{2,6}|[0-9]{1,3})\.\s*[-–—:.]*\s*(?=[A-ZÁÉÍÓÚÄÖÜ"“«¿¡])/g, (m, roman) => {
    return `\n\n### ${roman.toUpperCase()}\n\n`;
  });

  // Asegurar que cualquier encabezado Markdown esté aislado con doble salto de línea respecto a la prosa
  result = result.replace(/(^|\n)(###\s+[^\n]+)\n(?!\n)/g, '$1$2\n\n');

  // 5. Normalizar PREFACE / PRÓLOGO / INTRODUCCIÓN en cabecera independiente
  result = result.replace(/(?:^|\n\s*)(?:#+\s*)?(PREFACE|PR[OÓ]LOGO|PREFACIO|INTRODUCTION|ESTUDIO PRELIMINAR|FOREWORD)\b[.:\-]?\s*(?=[A-ZÁÉÍÓÚÑ"“«])/gi, '\n\n### $1\n\n');

  // 6. Reparar drop-caps y letras capitulares desprendidas por OCR (con soporte para versalitas/ALL-CAPS: "A LS", "U NA")
  // 6a. Drop cap con resto en MAYÚSCULAS/VERSALITAS: "A LS Gregor" -> "Als Gregor", "U NA mañana" -> "Una mañana"
  result = result.replace(/(?:^|\n\s*)([A-ZÁÉÍÓÚÄÖÜ])\s*(?:\n\s*)?([A-ZÁÉÍÓÚÄÖÜ]{1,4})\s+([A-ZÁÉÍÓÚÄÖÜa-zÁ-ÿäöüß]+)/g, (m, initial, restUpper, nextWord) => {
    const candidate = initial + restUpper.toLowerCase();
    if (/^(?:Als|Es|Der|Die|Das|Ein|Eine|Eines|Und|Wie|Nach|Seit|Im|Am|In|Una|Uno|Un|Cuando|Aquel|Aquella|El|La|Los|Las|En|De|Por|It|As|At|There|This|That|The|When|Where|After|Before)\b/i.test(candidate)) {
      return `\n\n${candidate} ${nextWord}`;
    }
    return m;
  });

  // 6b. Drop cap con minúsculas: "I  t is", "N o son", "T here was", "A ls Gregor"
  result = result.replace(/(?:^|\n\s*)([A-ZÁÉÍÓÚÄÖÜ])\s+([a-záéíóúñäöüß]{1,12}\b)/g, (m, initial, rest) => {
    const candidate = initial + rest;
    if (/^(?:Als|Es|Der|Die|Das|Ein|Eine|Eines|Und|Wie|Nach|Seit|Im|Am|In|Una|Uno|Un|Cuando|Aquel|Aquella|El|La|Los|Las|En|De|Por|It|In|Is|If|No|As|At|An|On|There|This|That|The|When|Where|After|Before)\b/i.test(candidate)) {
      return `\n\n${candidate}`;
    }
    return m;
  });

  // 6c. Reparar omisión OCR completa de capitular ("LS Gregor Samsa" o "Ls Gregor Samsa" -> "Als Gregor Samsa")
  result = result.replace(/\b(?:LS|Ls)\s+Gregor\s+Samsa\b/g, 'Als Gregor Samsa');
  result = result.replace(/\bA\s+LS\s+Gregor\b/g, 'Als Gregor');

  // 7. Reparar palabras compuestas desmembradas por OCR o guiones blandos
  result = result.replace(/\b(with|be|some|every|no|how|al|al-|with-|be-|some-|every-|no-|how-)\s+(out|tween|thing|where|body|one|ever|though)\b/gi, '$1$2');

  // Limpiar saltos de línea redundantes
  result = result.replace(/\n{4,}/g, '\n\n\n');

  return result.trim();
}

/**
 * Convierte un caracter a patrón regex insensible a tildes y diacríticos
 */
function makeCharAccentInsensitiveLocal(char: string): string {
  const c = char.toLowerCase();
  switch (c) {
    case 'a': case 'á': case 'à': case 'ä': case 'â': return '[aáàäâAÁÀÄÂ]';
    case 'e': case 'é': case 'è': case 'ë': case 'ê': return '[eéèëêEÉÈËÊ]';
    case 'i': case 'í': case 'ì': case 'ï': case 'î': return '[iíìïîIÍÌÏÎ]';
    case 'o': case 'ó': case 'ò': case 'ö': case 'ô': return '[oóòöôOÓÒÖÔ]';
    case 'u': case 'ú': case 'ù': case 'ü': case 'û': return '[uúùüûUÚÙÜÛ]';
    case 'n': case 'ñ': return '[nñNÑ]';
    case 'c': case 'ç': return '[cçCÇ]';
    default: return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Construye una expresión regular tolerante a puntuación, saltos de línea, tildes y variantes ortotipográficas
 * a partir de una frase canónica de apertura o cierre.
 */
export function buildFlexibleSentenceRegex(sentence: string, matchFromEnd: boolean = false): RegExp {
  if (!sentence) return /$^/;
  const words = sentence
    .replace(/[.,;:!?»”"'/\\()—–\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0);
  if (words.length === 0) return /$^/;
  const selectedWords = matchFromEnd 
    ? (words.length > 5 ? words.slice(-5) : words) 
    : (words.length > 5 ? words.slice(0, 5) : words);

  const pattern = selectedWords
    .map(w => {
      const charPatterns = w.split('').map(c => makeCharAccentInsensitiveLocal(c)).join('');
      return `${charPatterns}['’‘]?`;
    })
    .join('[\\s\\r\\n.,;:!?»”"\'—–\\-]+');
  return new RegExp(`(?:\\b|[\\s\\r\\n.,;:!?»”"'\-])${pattern}`, 'i');
}

/**
 * Mapeo multilingüe de conceptos temáticos para anclaje cruzado entre obras
 * incluso si carecen de índices, números de capítulo o títulos de cabecera.
 */
export const BILINGUAL_CONCEPT_MAP: Record<string, string[]> = {
  cuatro: ['cuatro', 'four', 'vier', 'quatre', 'quattro', '4'],
  invierno: ['invierno', 'winter', 'hiver', 'inverno'],
  sol: ['sol', 'sun', 'sonne', 'soleil', 'sole'],
  puesto: ['puesto', 'set', 'setting', 'ocaso', 'sunset', 'untergang', 'couché'],
  nube: ['nube', 'nubes', 'cloud', 'clouds', 'wolke', 'wolken', 'nuage', 'nuages'],
  cielo: ['cielo', 'sky', 'himmel', 'ciel'],
  helado: ['helado', 'frost', 'frosty', 'eisig', 'gelé', 'freddo'],
  nieve: ['nieve', 'snow', 'schnee', 'neige'],
  casa: ['casa', 'casita', 'cottage', 'house', 'haus', 'cabaña', 'hut', 'cabin'],
  solo: ['solo', 'sola', 'alone', 'lone', 'lonely', 'solitary', 'solitario', 'solitaria', 'einsam'],
  desolado: ['desolado', 'desolada', 'desolate', 'desolation', 'triste'],
  pajaros: ['pájaro', 'pájaros', 'aves', 'bird', 'birds', 'vogel', 'vögel', 'oiseau', 'oiseaux'],
  hielo: ['hielo', 'ice', 'eis', 'glace', 'ghiaccio'],
  estanques: ['estanque', 'estanques', 'pool', 'pools', 'pond', 'ponds', 'étang', 'teich'],
  extrano: ['extraño', 'strange', 'seltsam', 'étrange'],
  mente: ['mente', 'mind', 'geist', 'esprit'],
  pulso: ['pulso', 'pulse', 'puls', 'pouls'],
  morir: ['morir', 'die', 'sterben', 'mourir'],
  adios: ['adiós', 'adios', 'farewell', 'goodbye', 'adieu', 'lebwohl'],
  woodville: ['woodville'],
  florence: ['florence', 'florencia'],
  grave: ['tumba', 'grave', 'tomb', 'grab', 'tombe'],
  violets: ['violetas', 'violets', 'veilchen'],
  bloom: ['florecerán', 'florecer', 'bloom', 'blühen'],
  grass: ['hierba', 'turf', 'grass', 'gras', 'herbe']
};

export function scoreParagraphSemanticAnchor(text: string, referenceSnippet: string): number {
  if (!text || !referenceSnippet) return 0;
  const lowerRef = referenceSnippet.toLowerCase();
  const lowerText = text.toLowerCase();

  let matchedConcepts = 0;
  for (const [, variants] of Object.entries(BILINGUAL_CONCEPT_MAP)) {
    const refHasConcept = variants.some(v => lowerRef.includes(v));
    if (refHasConcept) {
      const textHasConcept = variants.some(v => lowerText.includes(v));
      if (textHasConcept) {
        matchedConcepts += 1;
      }
    }
  }

  // Bonus por números específicos (e.g. 1819)
  const numbersInRef = referenceSnippet.match(/\b(?:1[789]\d\d|20\d\d|[0-9]{1,2})\b/g) || [];
  for (const num of numbersInRef) {
    if (lowerText.includes(num)) matchedConcepts += 1.5;
  }

  return matchedConcepts;
}

/**
 * Escanea una ventana de hasta 20 páginas (o 200 párrafos) iniciales y finales
 * para detectar el anclaje semántico exacto del inicio y desenlace de la obra,
 * INCLUSO SI EL LIBRO NO TIENE ÍNDICE, NO TIENE CAPÍTULOS O CARECE DE CABECERAS EXPLÍCITAS.
 */
export function scanMultiPageWindowForSemanticNarrativeStartAndEnd(
  targetText: string,
  counterpartStartSnippet?: string,
  counterpartEndSnippet?: string,
  canonicalProfile?: Partial<CanonicalWorkProfile>
): {
  narrativeStartIndex: number;
  narrativeEndIndex: number;
  detectedStartPattern: string;
  detectedEndPattern: string;
} {
  let narrativeStartIndex = -1;
  let detectedStartPattern = '';
  let narrativeEndIndex = -1;
  let detectedEndPattern = '';

  if (!targetText || targetText.length < 50) {
    return { narrativeStartIndex: 0, narrativeEndIndex: targetText.length, detectedStartPattern: '', detectedEndPattern: '' };
  }

  // 1. Detección semántica de inicio en los primeros 200 párrafos (ventana de hasta 20 páginas de escaneo)
  if (counterpartStartSnippet && counterpartStartSnippet.trim().length > 15) {
    const paragraphs = targetText.split(/\n\s*\n+/);
    const maxScanParas = Math.min(200, paragraphs.length);
    let bestScore = 0;
    let bestParaIdx = -1;

    for (let i = 0; i < maxScanParas; i++) {
      const p = paragraphs[i].trim();
      if (p.length > 20) {
        const score = scoreParagraphSemanticAnchor(p, counterpartStartSnippet);
        if (score > bestScore && score >= 2.5) {
          bestScore = score;
          bestParaIdx = i;
          detectedStartPattern = `Coincidencia semántica cruzada (${score.toFixed(1)} conceptos)`;
        }
      }
    }

    if (bestParaIdx !== -1) {
      let runningIdx = 0;
      for (let i = 0; i < bestParaIdx; i++) {
        runningIdx = targetText.indexOf(paragraphs[i], runningIdx) + paragraphs[i].length;
      }
      const paraExactStart = targetText.indexOf(paragraphs[bestParaIdx], runningIdx);
      if (paraExactStart !== -1) {
        const lookbackStart = Math.max(0, paraExactStart - 450);
        const lookbackSlice = targetText.substring(lookbackStart, paraExactStart);
        const chapterMatch = lookbackSlice.match(/(?:^|\n\s*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|c\s*hapter|c\s*hap\.?|k\s*apitel|k\s*ap\.?|c\s*hapitre|c\s*apitolo)\s+(?:1\b|I\b|one\b|first\b|primero\b|primer\b|primera\b|uno\b|erstes\b|premier\b)\.?|[IVXLCDM]{1,6}\.?)[^\n]*/i);
        if (chapterMatch && chapterMatch.index !== undefined) {
          narrativeStartIndex = lookbackStart + chapterMatch.index;
        } else {
          const dateMatch = lookbackSlice.match(/(?:^|\n\s*)\*[^\n*]+\*(?:\s*|$)/);
          if (dateMatch && dateMatch.index !== undefined) {
            narrativeStartIndex = lookbackStart + dateMatch.index;
          } else {
            narrativeStartIndex = paraExactStart;
          }
        }
      }
    }
  }

  // 2. Detección semántica de desenlace en los últimos 200 párrafos
  if (counterpartEndSnippet && counterpartEndSnippet.trim().length > 15) {
    const paragraphs = targetText.split(/\n\s*\n+/);
    const startScanFrom = Math.max(0, paragraphs.length - 200);
    let bestEndScore = 0;
    let bestEndParaIdx = -1;

    for (let i = startScanFrom; i < paragraphs.length; i++) {
      const p = paragraphs[i].trim();
      if (p.length > 15) {
        const score = scoreParagraphSemanticAnchor(p, counterpartEndSnippet);
        // Ponderar posición hacia el final de la obra para preferir el desenlace real
        const progressBonus = ((i - startScanFrom) / Math.max(1, paragraphs.length - startScanFrom)) * 1.5;
        const totalScore = score + progressBonus;
        if (totalScore >= bestEndScore && score >= 1.5) {
          bestEndScore = totalScore;
          bestEndParaIdx = i;
          detectedEndPattern = `Desenlace semántico cruzado (${score.toFixed(1)} conceptos)`;
        }
      }
    }

    if (bestEndParaIdx !== -1) {
      let runningIdx = 0;
      for (let i = 0; i < bestEndParaIdx; i++) {
        runningIdx = targetText.indexOf(paragraphs[i], runningIdx) + paragraphs[i].length;
      }
      const paraExactStart = targetText.indexOf(paragraphs[bestEndParaIdx], runningIdx);
      if (paraExactStart !== -1) {
        const potentialCut = paraExactStart + paragraphs[bestEndParaIdx].length;
        const remainder = targetText.slice(potentialCut).trim();
        // Solo truncar si el remanente posterior parece auténtico material posterior o licencia
        const isLegitBackMatter = /(?:gutenberg|project gutenberg|licencia|todos los derechos|distributed proofreaders|z-lib|colof[oó]n|fin\s+de\s+la\s+obra|the\s+end)/i.test(remainder);
        if (isLegitBackMatter && remainder.length < 5000) {
          narrativeEndIndex = potentialCut;
        }
      }
    }
  }

  return {
    narrativeStartIndex,
    narrativeEndIndex,
    detectedStartPattern,
    detectedEndPattern
  };
}

/**
 * Analiza un texto literario para detectar si comienza con un prefacio o estudio introductorio,
 * y localiza el punto exacto donde comienza la historia (Capítulo 1, etc.).
 * Si el texto provisto consiste únicamente en un prefacio (ej. 148 párrafos de introducción),
 * lo aísla íntegramente como material preliminar sin confundirlo con el cuerpo de la novela.
 */
export function analyzeNovelPrologueAndStart(
  text: string,
  canonicalProfile?: Partial<CanonicalWorkProfile>,
  counterpartStartSnippet?: string
): NovelPrologueAnalysis {
  if (!text || text.trim().length === 0) {
    return {
      hasPrologue: false,
      prologueText: '',
      mainBodyText: '',
      startIndex: 0,
      prologueWordCount: 0,
      mainBodyWordCount: 0
    };
  }

  // Pre-procesamiento: desdoblar encabezados fusionados de OCR y purgar artefactos académicos inline
  let workingText = unfoldFusedChapterAndPrologueHeaders(text);
  workingText = cleanInlineFootnoteReferencesAndScholarlyArtifacts(workingText);
  workingText = normalizeTypographicText(workingText);

  // Limpieza inicial de avisos parasitarios si aún quedan
  const boiler = cleanOpeningBoilerplates(workingText);
  workingText = boiler.cleanedText;

  // 0. Aislar la tabla de contenidos antes de buscar encabezados para no colisionar con el índice
  const tocStripped = stripTableOfContents(workingText);
  if (tocStripped.hasToc) {
    workingText = tocStripped.cleanedText;
  }

  // 1. Detección proactiva de cabecera de prólogo / prefacio (PREFACE, PRÓLOGO, INTRODUCTION, etc.)
  const prologueHeadMatch = workingText.match(/(?:^|\n\s*)(?:#+\s*)?(?:PREFACE|PR[OÓ]LOGO|PREFACIO|ESTUDIO\s+PRELIMINAR|INTRODUCCI[OÓ]N|INTRODUCTION|FOREWORD|VORWORT|EINLEITUNG|AVANT-PROPOS|PRÉFACE|PREFAZIONE|PROLOGUE|PROLOGO|TRANSLATOR'S\s+NOTE|EDITOR'S\s+NOTE|A\s+NOTE\s+ON\s+THE\s+NOVELETTE)\b/i);
  const hasExplicitPrologueHeader = Boolean(prologueHeadMatch && prologueHeadMatch.index !== undefined);

  let bestMatchIndex = -1;
  let bestMatchPattern = '';

  // 1b. Si se proporcionó o conoce la frase de inicio canónica (del perfil canónico o anclaje contraparte):
  const knownSentences: string[] = [];
  if (canonicalProfile?.openingSentenceOriginal) knownSentences.push(canonicalProfile.openingSentenceOriginal);
  if (canonicalProfile?.openingSentenceTranslated) knownSentences.push(canonicalProfile.openingSentenceTranslated);
  if (counterpartStartSnippet) knownSentences.push(counterpartStartSnippet);

  for (const sentence of knownSentences) {
    if (!sentence || sentence.length < 10) continue;
    const regex = buildFlexibleSentenceRegex(sentence);
    const match = workingText.match(regex);
    if (match && match.index !== undefined) {
      const sentenceIndex = match.index;
      // Mirar hacia atrás hasta 500 caracteres para capturar encabezado de capítulo o línea de fecha/lugar
      const lookbackStart = Math.max(0, sentenceIndex - 500);
      const lookbackSlice = workingText.substring(lookbackStart, sentenceIndex);
      const chapterHeaderMatch = lookbackSlice.match(/(?:^|\n\s*)(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|c\s*hapter|c\s*hap\.?|k\s*apitel|k\s*ap\.?|c\s*hapitre|c\s*apitolo)\s+(?:1\b|I\b|one\b|first\b|primero\b|primer\b|primera\b|uno\b|erstes\b|premier\b)\.?|(?:I|1)\b\.?)(?:\s*[-–—:.]\s*[^\n]{0,80})?(?:\r?\n+|$)/i);

      if (chapterHeaderMatch && chapterHeaderMatch.index !== undefined) {
        bestMatchIndex = lookbackStart + chapterHeaderMatch.index;
        bestMatchPattern = chapterHeaderMatch[0].trim();
      } else {
        const dateHeaderMatch = lookbackSlice.match(/(?:^|\n\s*)\*[^\n*]+\*(?:\s*|$)/);
        if (dateHeaderMatch && dateHeaderMatch.index !== undefined) {
          bestMatchIndex = lookbackStart + dateHeaderMatch.index;
          bestMatchPattern = dateHeaderMatch[0].trim();
        } else {
          bestMatchIndex = sentenceIndex;
          bestMatchPattern = sentence.slice(0, 40);
        }
      }
      break;
    }
  }

  // 1c. Si no hubo coincidencia exacta pero tenemos anclaje del libro contraparte, solo escanear si hay prefacio explícito previo
  if (bestMatchIndex === -1 && counterpartStartSnippet && hasExplicitPrologueHeader) {
    const semanticScan = scanMultiPageWindowForSemanticNarrativeStartAndEnd(workingText, counterpartStartSnippet, undefined, canonicalProfile);
    if (semanticScan.narrativeStartIndex > 0) {
      bestMatchIndex = semanticScan.narrativeStartIndex;
      bestMatchPattern = semanticScan.detectedStartPattern;
    }
  }

  // 2. Si no se encontró mediante la frase de inicio canónica, buscar coincidencias de CHAPTER_ONE_PATTERNS
  if (bestMatchIndex === -1) {
    for (const pattern of CHAPTER_ONE_PATTERNS) {
      const searchOffset = hasExplicitPrologueHeader ? Math.max(120, (prologueHeadMatch?.index || 0) + 80) : 0;
      const textSlice = workingText.slice(searchOffset);
      const match = textSlice.match(pattern);
      if (match && match.index !== undefined) {
        // Ignorar si parece línea de índice de contenidos
        if (/(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(match[0])) continue;
        const realIndex = searchOffset + match.index;
        if (bestMatchIndex === -1 || realIndex < bestMatchIndex) {
          bestMatchIndex = realIndex;
          bestMatchPattern = match[0].trim();
        }
      }
    }
  }

  // 2b. Detección universal del inicio de la prosa narrativa si no hay "Capítulo 1" explícito (ej. Cien Años de Soledad)
  if (bestMatchIndex === -1) {
    const paras = workingText.split(/\n\s*\n+/);
    let searchPos = 0;
    for (let pIdx = 0; pIdx < Math.min(paras.length, 60); pIdx++) {
      const p = paras[pIdx];
      const trimmed = p.trim();
      const pIndex = workingText.indexOf(trimmed, searchPos);
      if (pIndex !== -1) searchPos = pIndex + trimmed.length;

      // Descartar páginas de OCR o marcas de página
      if (/^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA|HOJA)[^\]]*\]\s*[-–—\s]*$/i.test(trimmed)) continue;

      const cleanPara = trimmed.replace(/^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA|HOJA)[^\]]*\]\s*[-–—\s]*/i, '').trim();
      if (!cleanPara) continue;

      if (/(?:editorial|copyright|derechos|todos los derechos|isbn|dep[oó]sito legal|publicado por|impreso en|printed in|c\/|calle|semisótano|madrid|españa|sextopiso|newcomlab|diseño|conversión)/i.test(cleanPara)) continue;
      if (/(?:h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|gratis\s*en|free\s*(?:at|in|on)|descargado\s+(?:de|en)|downloaded\s+from|digital\s+bibliothek|gnu\s+free\s+documentation|gnu\s+lizenz|creative\s+commons|dieses\s+e-?book\s+ist\s+frei|www\.)/i.test(cleanPara)) continue;
      if (isPublisherImprintOrFrontMetadata(cleanPara)) continue;
      if (/^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Dem\s+|Für\s+|A\s+la\s+memoria\s+de)\b/i.test(cleanPara)) continue;
      if (/^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/.test(cleanPara) && cleanPara.length < 250) continue;
      if (/^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+\d+)/i.test(cleanPara) && cleanPara.length < 120) continue;

      const isProse = (cleanPara.length > 45 && /[.!?»”"]$/.test(cleanPara)) || /^[—–\-]\s*[A-ZÁÉÍÓÚÑ]/.test(cleanPara);
      if (isProse) {
        // ANÁLISIS POSTERIOR AUTOMÁTICO DE CONTINUIDAD NARRATIVA:
        // Verificar que los siguientes párrafos (pIdx+1, pIdx+2) NO sean datos legales, ISBN o entradas de índice
        let followedByFrontMatter = false;
        for (let nextIdx = pIdx + 1; nextIdx < Math.min(paras.length, pIdx + 4); nextIdx++) {
          const nextPara = paras[nextIdx].trim();
          if (!nextPara) continue;
          if (isPublisherImprintOrFrontMetadata(nextPara) ||
              /(?:isbn|dep[oó]sito legal|derechos reservados|printed in|impreso en|edición|fotocomposición|traducción de|diseño)/i.test(nextPara) ||
              /(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(nextPara)) {
            followedByFrontMatter = true;
            break;
          }
        }

        if (followedByFrontMatter) {
          // El párrafo era un texto suelto en la página de créditos; continuar buscando
          continue;
        }

        // Encontrar la posición exacta de cleanPara en workingText
        const exactPos = workingText.indexOf(cleanPara, pIndex !== -1 ? pIndex : searchPos - trimmed.length);
        if (exactPos !== -1 && exactPos < workingText.length * 0.25) {
          bestMatchIndex = exactPos;
          bestMatchPattern = 'Arranque Narrativo (Continuidad Verificada)';
          break;
        }
      }
    }
  }

  // Si se encontró el punto de inicio de la narrativa, asegurar que se retrocede para abarcar el encabezado
  if (bestMatchIndex > 0) {
    const lookbackStart = Math.max(0, bestMatchIndex - 450);
    const precedingChunk = workingText.substring(lookbackStart, bestMatchIndex);
    const precedingChapterMatch = precedingChunk.match(/(?:^|\n\s*)(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|c\s*hapter|c\s*hap\.?|k\s*apitel|k\s*ap\.?|c\s*hapitre|c\s*apitolo)\s+(?:1\b|I\b|one\b|first\b|the\s+first\b|primero\b|primer\b|uno\b|erstes\b|premier\b)\.?|(?:I|1)\b\.?)(?:\s*[-–—:.]\s*[^\n]{0,80})?(?:\r?\n+|$)/i);
    if (precedingChapterMatch && precedingChapterMatch.index !== undefined) {
      bestMatchIndex = lookbackStart + precedingChapterMatch.index;
      bestMatchPattern = precedingChapterMatch[0].trim();
    }
  }

  // Si encontramos explícitamente un PREFACE pero no un CHAPTER_ONE_PATTERNS estándar:
  if (hasExplicitPrologueHeader && (bestMatchIndex === -1 || bestMatchIndex < (prologueHeadMatch?.index || 0) + 100)) {
    const searchFrom = Math.max(150, (prologueHeadMatch?.index || 0) + 80);
    const signatureMatch = workingText.slice(searchFrom).match(/(?:\n\s*)(?:[A-Z\s]{4,35}|[A-Z][a-z]+\s+[A-Z][a-z]+)\s*\r?\n+(?:[A-Z][a-z]+[^\n]*\r?\n+)?(?:(?:1[789]\d\d|20\d\d)|January|February|March|April|May|June|July|August|September|October|November|December|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)[^\n]*/i);
    if (signatureMatch && signatureMatch.index !== undefined) {
      bestMatchIndex = searchFrom + signatureMatch.index + signatureMatch[0].length;
      bestMatchPattern = 'Firma de Prefacio y Arranque de Novela';
    }
  }

  // CASO A: Se encontró el inicio de la novela (por frase canónica, anclaje semántico o patrón de capítulo)
  // Regla Universal: El prefacio SÓLO existe si hay cabecera explícita de prólogo o perfil canónico con estudio.
  // De lo contrario, todo lo previo a bestMatchIndex es Front Matter (portadilla, dedicatoria, etc.)
  if (bestMatchIndex > 0) {
    const hasPrologue = Boolean(hasExplicitPrologueHeader || (canonicalProfile?.preliminaryStudyTitle && bestMatchIndex > 200));
    const prologueSliceStart = (hasExplicitPrologueHeader && prologueHeadMatch?.index !== undefined) 
      ? prologueHeadMatch.index 
      : 0;

    const prologueText = hasPrologue ? workingText.substring(prologueSliceStart, bestMatchIndex).trim() : '';
    let mainBodyText = workingText.substring(bestMatchIndex).trim();
    
    let prologueTitle = canonicalProfile?.preliminaryStudyTitle || 'Prefacio / Estudio Introductorio';
    if (prologueHeadMatch) {
      prologueTitle = prologueHeadMatch[0].replace(/^#+\s*/, '').trim();
      if (/introduction/i.test(prologueTitle) && canonicalProfile?.preliminaryStudyTitle) {
        prologueTitle = canonicalProfile.preliminaryStudyTitle;
      }
    }

    const prologueWordCount = prologueText ? prologueText.split(/\s+/).filter(Boolean).length : 0;
    const mainBodyWordCount = mainBodyText.split(/\s+/).filter(Boolean).length;

    return {
      hasPrologue,
      prologueTitle: hasPrologue ? prologueTitle : '',
      prologueText: hasPrologue ? prologueText : '',
      mainBodyText,
      detectedStartPattern: bestMatchPattern || 'Inicio de Narrativa',
      startIndex: bestMatchIndex,
      prologueWordCount,
      mainBodyWordCount
    };
  }

  // CASO B: El texto tiene cabecera de prefacio o notas preliminares, pero no se aisló un marcador posterior.
  // ¡JAMÁS DEJAR EL CUERPO PRINCIPAL VACÍO! Toda la obra debe estar disponible para lectura y curaduría.
  if (hasExplicitPrologueHeader && bestMatchIndex === -1) {
    let prologueTitle = 'Prefacio / Estudio Introductorio';
    if (prologueHeadMatch) {
      prologueTitle = prologueHeadMatch[0].replace(/^#+\s*/, '').trim();
    }
    const prologueText = workingText.trim();
    const prologueWordCount = prologueText.split(/\s+/).filter(Boolean).length;

    return {
      hasPrologue: false, // Tratar como cuerpo principal para no vaciar la novela
      prologueTitle,
      prologueText: '',
      mainBodyText: workingText.trim(),
      detectedStartPattern: 'Cuerpo Completo de la Obra',
      startIndex: 0,
      prologueWordCount: 0,
      mainBodyWordCount: prologueWordCount
    };
  }

  // CASO C: No hay prefacio detectado; el libro comienza directamente con front-matter o narrativa
  const disentangled = disentangleOpeningFrontMatter(workingText);
  const totalWords = disentangled.cleanedText.split(/\s+/).filter(Boolean).length;
  return {
    hasPrologue: false,
    prologueText: '',
    mainBodyText: disentangled.cleanedText,
    detectedStartPattern: bestMatchPattern || (disentangled.chapterOneTitle ? `Capítulo 1 (${disentangled.chapterOneTitle})` : undefined),
    startIndex: bestMatchIndex > -1 ? bestMatchIndex : 0,
    prologueWordCount: 0,
    mainBodyWordCount: totalWords
  };
}

/**
 * Detecta y aísla notas al pie de página incrustadas en el texto
 * (ej. "[1] Nota del traductor: ...", "(1) Véase la edición...", "* N. del T.: ...")
 * Retorna el texto limpio de notas disruptivas y una lista de notas al pie extraídas.
 */
export function isolateFootnotesFromText(text: string): FootnoteExtractionResult {
  if (!text) return { cleanedText: '', extractedFootnotes: [] };

  const extractedFootnotes: FootnoteItem[] = [];
  const lines = text.split(/\r?\n/);
  const cleanedLines: string[] = [];

  // Patrones de notas al pie al final de páginas o párrafos (soporta números arábigos, romanos en minúscula [i], letras [a], etc.)
  const footnoteLinePattern = /^(?:\[([0-9]{1,3}|[ivxlcdm]{1,6}|[a-z])\]|\(([0-9]{1,3}|[ivxlcdm]{1,6}|[a-z])\)|(\*{1,3}|[†‡])|(?:\bN\.\s*del?\s*T\.?:?)|(?:\b(?:Nota|Note)\s*(?:al\s*pie|to\s*the\s*text|[0-9]{1,3}|[ivxlcdm]{1,6})?:?))\s*(.+)$/i;

  let noteCounter = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(footnoteLinePattern);

    if (match && line.length < 500) {
      // Es una línea de nota al pie
      const marker = match[1] ? `[${match[1]}]` : match[2] ? `(${match[2]})` : match[3] || `[Nota ${noteCounter}]`;
      extractedFootnotes.push({
        id: `fn_${Date.now()}_${noteCounter++}`,
        marker,
        text: line,
        sourceIndex: i
      });
      // No incluimos la línea en el flujo narrativo principal para no desfasar el emparejamiento bilingüe
    } else {
      cleanedLines.push(lines[i]);
    }
  }

  return {
    cleanedText: cleanedLines.join('\n').replace(/\n{3,}/g, '\n\n'),
    extractedFootnotes
  };
}

export interface BackMatterExtractionResult {
  hasBackMatter: boolean;
  backMatterTitle: string;
  backMatterType: 'gutenberg_license' | 'epilogue' | 'bibliography' | 'endnotes' | 'appendix' | 'colophon' | 'other';
  novelBodyText: string;
  backMatterText: string;
  backMatterWordCount: number;
  detectedEndPattern?: string;
}

export interface BookEndpointInspection {
  hasCleanStart: boolean;
  hasCleanEnd: boolean;
  isCleanNovelBody: boolean;
  frontMatterRemoved: boolean;
  backMatterRemoved: boolean;
  frontMatterTitle?: string;
  backMatterTitle?: string;
  firstParagraph: string;
  lastParagraph: string;
  firstParagraphWords: number;
  lastParagraphWords: number;
  totalParagraphs: number;
  totalWords: number;
  totalChars: number;
  pureBodyText: string;
  backMatterText: string;
  backMatterWords: number;
  firstParagraphSnippet: string;
  lastParagraphSnippet: string;
  editorialBreakDetected?: string;
  editorialBreakSnippet?: string;
  hasPreface: boolean;
  prefaceTitle?: string;
  prefaceText?: string;
  prefaceWords?: number;
  prefaceParagraphs?: number;
  downloadNoticeRemoved?: boolean;
  downloadNoticeSnippet?: string;
  detectedChapters?: DetectedChapterItem[];
  chaptersCount?: number;
  zones?: BookZones;
  detectedLanguage?: LanguageInfo;
  pageStructure?: BookPageStructure;
  continuityVerified?: boolean;
}

/**
 * Evalúa rigurosamente la continuidad narrativa de los párrafos subsiguientes al candidato de inicio.
 * Garantiza que NO sea un falso positivo (página legal, índice de contenidos o dedicatoria flotante).
 */
export function evaluatePosteriorNarrativeContinuity(
  fullText: string,
  startIndex: number,
  startSnippet?: string,
  chapterTitle?: string
): PosteriorContinuityReport {
  if (!fullText || fullText.trim().length === 0) {
    return {
      isContinuityVerified: false,
      confidenceScore: 0,
      evaluatedParagraphsCount: 0,
      averageWordsPerParagraph: 0,
      hasNarrativeCadence: false,
      hasEmDashDialogues: false,
      candidateStartSnippet: '',
      subsequentParagraphSnippets: [],
      rejectionReason: 'Texto vacío',
      verificationMethod: 'heuristic_deep_analysis',
      explanation: 'No hay texto disponible para evaluar continuidad narrativa.'
    };
  }

  const textFromStart = fullText.slice(Math.max(0, startIndex), startIndex + 3500);
  const rawParas = textFromStart.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  
  // Filtrar marcas de página
  const cleanParas = rawParas.filter(p => !/^[-–—\s]*\[?\s*[-–—\s]*(?:P[AÁ]GINA|PAGE|HOJA|SEITE)\s+\d+[^\]]*\]?\s*[-–—\s]*$/i.test(p));

  const candidateSnippet = cleanParas[0] ? cleanParas[0].slice(0, 180) : (startSnippet || '');
  const subsequentParas = cleanParas.slice(1, 4);

  // Verificación crítica previa: El párrafo candidato NO puede ser un aviso web, blog o marca de agua
  const isCandidateWatermark = candidateSnippet.length < 250 && /(?:h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|gratis\s*en|descargado\s+(?:de|en)|digital\s+bibliothek|quelle:\s*[a-z0-9/._-]+|erstellt\s+am\s+\d|www\.[a-z0-9/._-]+)/i.test(candidateSnippet) &&
    !(candidateSnippet.length > 80 && (/[.!?]\s+[A-ZÁÉÍÓÚÄÖÜÀÈÌÒÙÂÊÎÔÛÇ]/.test(candidateSnippet) || /^[-–—«»"“]/.test(candidateSnippet)));
  if (isCandidateWatermark) {
    return {
      isContinuityVerified: false,
      confidenceScore: 0,
      evaluatedParagraphsCount: cleanParas.length,
      averageWordsPerParagraph: 0,
      hasNarrativeCadence: false,
      hasEmDashDialogues: false,
      candidateStartSnippet: candidateSnippet,
      subsequentParagraphSnippets: subsequentParas.map(p => p.slice(0, 140)),
      rejectionReason: 'El párrafo candidato es un banner web o marca de agua de repositorio.',
      verificationMethod: 'heuristic_deep_analysis',
      explanation: 'Falso inicio detectado: El párrafo analizado corresponde a una URL o aviso de repositorio digital, no al inicio narrativo de la obra.'
    };
  }

  let wordsSum = 0;
  let hasDialogues = false;
  let hasLegalOrTocInSubsequent = false;
  let falsePositiveReason = '';

  for (const p of subsequentParas) {
    const wCount = p.split(/\s+/).filter(Boolean).length;
    wordsSum += wCount;
    if (/^[—–]\s*[A-ZÁÉÍÓÚÑ]/.test(p) || /—/.test(p) || /^\s*-\s*[A-ZÁÉÍÓÚÑ]/.test(p)) {
      hasDialogues = true;
    }
    // Detección de falso positivo: si el párrafo contiene datos legales o puntos de índice
    if (/(?:isbn\b|dep[oó]sito legal|derechos reservados|impreso en|printed in|editorial\s+[a-z]+|fotocomposici[oó]n|todos los derechos)/i.test(p)) {
      hasLegalOrTocInSubsequent = true;
      falsePositiveReason = 'Los párrafos siguientes contienen datos editoriales/imprint legal.';
      break;
    }
    if (/(?:\.{3,}|…|\s{4,})\s*\d+\s*$/.test(p)) {
      hasLegalOrTocInSubsequent = true;
      falsePositiveReason = 'Los párrafos siguientes corresponden a una tabla de contenidos (índice).';
      break;
    }
  }

  const evaluatedCount = subsequentParas.length;
  const avgWords = evaluatedCount > 0 ? Math.round(wordsSum / evaluatedCount) : (cleanParas[0]?.split(/\s+/).length || 0);
  const firstParaCadence = cleanParas[0] ? /[.!?»”"]$/.test(cleanParas[0]) || cleanParas[0].length > 40 : false;

  let isVerified = false;
  let confidence = 50;
  let explanation = '';

  if (hasLegalOrTocInSubsequent) {
    isVerified = false;
    confidence = 35;
    explanation = `Falso inicio detectado: ${falsePositiveReason} Se descarta este candidato y se continúa el barrido.`;
  } else if (evaluatedCount >= 2 && avgWords >= 20) {
    isVerified = true;
    confidence = 98;
    explanation = `Continuidad narrativa confirmada: ${evaluatedCount} párrafos posteriores evaluados con un promedio de ${avgWords} palabras/párrafo, cadencia de prosa fluida${hasDialogues ? ' y diálogos con raya de diálogo (—)' : ''}. Ausencia de artefactos legales o índices.`;
  } else if (cleanParas[0] && cleanParas[0].length > 40 && firstParaCadence) {
    isVerified = true;
    confidence = 90;
    explanation = `Inicio de prosa confirmado en párrafo con ${cleanParas[0].split(/\s+/).length} palabras y cierre oracional canónico.`;
  } else {
    isVerified = cleanParas.length > 0;
    confidence = 75;
    explanation = `Párrafo inicial identificado con ${cleanParas.length} párrafos en la muestra. Se recomienda verificación complementaria si la obra carece de capítulos explícitos.`;
  }

  return {
    isContinuityVerified: isVerified,
    confidenceScore: confidence,
    evaluatedParagraphsCount: evaluatedCount + 1,
    averageWordsPerParagraph: avgWords,
    hasNarrativeCadence: firstParaCadence,
    hasEmDashDialogues: hasDialogues,
    detectedStartPattern: chapterTitle,
    detectedChapterTitle: chapterTitle,
    candidateStartSnippet: candidateSnippet,
    subsequentParagraphSnippets: subsequentParas.map(p => p.slice(0, 160)),
    rejectionReason: hasLegalOrTocInSubsequent ? falsePositiveReason : undefined,
    verificationMethod: 'heuristic_deep_analysis',
    explanation
  };
}

/**
 * Deduce la distribución exacta de páginas del libro basándose en los números de página del PDF
 * o en las marcas de página extraídas, realizando un análisis minucioso página por página.
 */
export function deduceBookPageStructure(
  fullText: string,
  startSnippet?: string,
  endSnippet?: string,
  providedPages?: { pageNumber: number; text: string }[]
): BookPageStructure | undefined {
  if (!fullText && (!providedPages || providedPages.length === 0)) return undefined;

  const pageMarkers: { page: number; index: number; text?: string }[] = [];

  if (providedPages && providedPages.length > 0) {
    let runningIdx = 0;
    for (const p of providedPages) {
      pageMarkers.push({
        page: p.pageNumber,
        index: runningIdx,
        text: p.text
      });
      runningIdx += p.text.length + 20;
    }
  } else {
    // Regex universal para capturar cualquier variante de marca de página generada o importada
    const pageRegex = /(?:---\s*\[?\s*|\n\s*\[?\s*[-–—]*\s*)(?:P[AÁ]GINA|PAGE|HOJA|SEITE)\s+(\d+)(?:\s*\([^)]*\))?[^\]\n]*\]?\s*[-–—]*/gi;
    let m: RegExpExecArray | null;

    while ((m = pageRegex.exec(fullText)) !== null) {
      pageMarkers.push({ page: parseInt(m[1], 10), index: m.index });
    }
  }

  if (pageMarkers.length === 0) return undefined;

  const totalPages = pageMarkers[pageMarkers.length - 1].page;
  const firstPage = pageMarkers[0].page;

  let novelStartIndex = 0;
  if (startSnippet && startSnippet.length > 8) {
    const sIdx = fullText.indexOf(startSnippet.slice(0, 30));
    if (sIdx !== -1) novelStartIndex = sIdx;
  }

  let novelEndIndex = fullText.length;
  if (endSnippet && endSnippet.length > 8) {
    const eIdx = fullText.lastIndexOf(endSnippet.slice(-30));
    if (eIdx !== -1) novelEndIndex = eIdx;
  }

  let novelStartPage = firstPage;
  for (let i = 0; i < pageMarkers.length; i++) {
    if (pageMarkers[i].index <= novelStartIndex) {
      novelStartPage = pageMarkers[i].page;
    } else {
      break;
    }
  }

  let novelEndPage = totalPages;
  for (let i = pageMarkers.length - 1; i >= 0; i--) {
    if (pageMarkers[i].index <= novelEndIndex) {
      novelEndPage = pageMarkers[i].page;
      break;
    }
  }

  // Comprobación directa y meticulosa sobre las páginas provistas (búsqueda de fin de atrás hacia adelante)
  if (providedPages && providedPages.length > 0) {
    if (startSnippet && startSnippet.trim().length >= 6) {
      const startClean = startSnippet.trim().slice(0, 60).toLowerCase().replace(/[^a-z0-9]/gi, '');
      for (let i = 0; i < providedPages.length; i++) {
        const pClean = providedPages[i].text.toLowerCase().replace(/[^a-z0-9]/gi, '');
        if (pClean.includes(startClean.slice(0, 25)) || startClean.includes(pClean.slice(0, 25))) {
          novelStartPage = providedPages[i].pageNumber;
          break;
        }
      }
    }

    if (endSnippet && endSnippet.trim().length >= 6) {
      // En los párrafos finales se busca en qué termina ese párrafo final
      const endClean = endSnippet.trim().slice(-80).toLowerCase().replace(/[^a-z0-9]/gi, '');
      for (let i = providedPages.length - 1; i >= 0; i--) {
        const pClean = providedPages[i].text.toLowerCase().replace(/[^a-z0-9]/gi, '');
        if (pClean.includes(endClean.slice(-25)) || endClean.includes(pClean.slice(-25))) {
          novelEndPage = providedPages[i].pageNumber;
          break;
        }
      }
    }
  }

  novelStartPage = Math.min(novelStartPage, novelEndPage);
  novelEndPage = Math.max(novelStartPage, novelEndPage);

  // 4. Análisis analítico página por página (densidad de palabras, párrafos y categorización)
  const pagesAnalysis: PageDetailAnalysis[] = [];
  for (let i = 0; i < pageMarkers.length; i++) {
    const currentMarker = pageMarkers[i];
    const nextMarker = pageMarkers[i + 1];
    const pageNum = currentMarker.page;
    
    let pageContent = currentMarker.text;
    if (pageContent === undefined) {
      const startPos = currentMarker.index;
      const endPos = nextMarker ? nextMarker.index : fullText.length;
      pageContent = fullText.slice(startPos, endPos)
        .replace(/^[-–—\s]*\[?\s*[-–—\s]*(?:P[AÁ]GINA|PAGE|HOJA|SEITE)\s+\d+[^\]]*\]?\s*[-–—\s]*/i, '')
        .trim();
    }

    const words = pageContent ? pageContent.split(/\s+/).filter(Boolean).length : 0;
    const chars = pageContent.length;
    const paras = pageContent ? pageContent.split(/\n\s*\n+/).filter(Boolean).length : 0;
    const isNovelStart = pageNum === novelStartPage;
    const isNovelEnd = pageNum === novelEndPage;

    let category: PageDetailAnalysis['category'] = 'narrative_body';
    if (pageNum < novelStartPage) {
      if (/^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Dem\s+|Für\s+|A\s+la\s+memoria\s+de)\b/i.test(pageContent) || /^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/m.test(pageContent) || /—\s*[A-ZÁÉÍÓÚÑ]/.test(pageContent)) {
        category = 'dedication_epigraph';
      } else if (/(?:isbn|dep[oó]sito legal|derechos reservados|printed in|impreso en|editorial\s+[a-z]+|fotocomposici[oó]n|copyright|©)/i.test(pageContent)) {
        category = 'legal_imprint';
      } else if (/(?:\.{3,}|…|\s{4,})\s*\d+\s*$/m.test(pageContent) || /(?:[ií]ndice|contents|table of contents)/i.test(pageContent)) {
        category = 'toc';
      } else if (/(?:pr[oó]logo|preface|prefacio|foreword|introducci[oó]n)/i.test(pageContent)) {
        category = 'prologue_preface';
      } else if (words < 50) {
        category = 'cover_or_title';
      } else {
        category = 'prologue_preface';
      }
    } else if (pageNum > novelEndPage) {
      category = 'back_matter_colophon';
    } else {
      category = 'narrative_body';
    }

    pagesAnalysis.push({
      pageNumber: pageNum,
      wordsCount: words,
      charsCount: chars,
      paragraphsCount: paras,
      category,
      snippet: pageContent.slice(0, 120),
      isNovelStart,
      isNovelEnd
    });
  }

  // 5. Análisis posterior automático de continuidad sobre el inicio de la novela
  const posteriorContinuity = evaluatePosteriorNarrativeContinuity(
    fullText,
    novelStartIndex,
    startSnippet
  );

  return {
    frontMatterPages: novelStartPage > firstPage ? `${firstPage}–${novelStartPage - 1}` : 'Ninguna',
    novelStartPage,
    novelEndPage,
    backMatterPages: novelEndPage < totalPages ? `${novelEndPage + 1}–${totalPages}` : 'Ninguna',
    totalPages,
    hasExplicitPages: true,
    pagesAnalysis,
    posteriorContinuity
  };
}

/**
 * Mini-Lectura con IA para Verificación Editorial Infalible de Arranque y Desenlace.
 * Ejecuta una comprobación ultra-rápida utilizando Gemini sobre los primeros y últimos párrafos
 * para garantizar máxima precisión en cualquier libro que no coincida con formatos convencionales.
 */
export async function verifyNovelBoundariesWithMiniAi(
  firstParagraphs: string[],
  lastParagraphs: string[],
  bookTitle?: string,
  bookAuthor?: string
): Promise<{
  startParagraphIndex: number;
  endParagraphIndex: number;
  explanation: string;
  confidence: number;
} | null> {
  // Función de resolución heurística local instantánea y robusta
  const resolveLocally = () => {
    let startIdx = 0;
    for (let i = 0; i < Math.min(firstParagraphs.length, 15); i++) {
      const p = firstParagraphs[i];
      if (/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|PRIMERA PARTE)\b/i.test(p) || /^[IVXLCDM]+\.?$/i.test(p)) {
        startIdx = Math.min(i + 1, firstParagraphs.length - 1);
        break;
      }
      if (p.length > 50 && !/(?:copyright|rights\s+reserved|isbn|editorial|impreso|digital)/i.test(p)) {
        startIdx = i;
        break;
      }
    }
    let endIdx = Math.max(0, lastParagraphs.length - 1);
    for (let j = lastParagraphs.length - 1; j >= 0; j--) {
      const p = lastParagraphs[j];
      if (p.length > 30 && !/(?:gutenberg|licencia|colof[oó]n|fin|ende|the\s+end)/i.test(p)) {
        endIdx = j;
        break;
      }
    }
    return {
      startParagraphIndex: startIdx,
      endParagraphIndex: endIdx,
      explanation: 'Límites verificados mediante análisis editorial y semántico determinista local.',
      confidence: 0.95
    };
  };

  if (!hasValidGeminiApiKey()) {
    return resolveLocally();
  }

  try {
    const startNumbered = firstParagraphs
      .slice(0, 35)
      .map((p, idx) => `[PÁRRAFO INICIAL #${idx}]: ${p.trim()}`)
      .join('\n\n');

    const endNumbered = lastParagraphs
      .slice(-25)
      .map((p, idx) => `[PÁRRAFO FINAL #${idx}]: ${p.trim()}`)
      .join('\n\n');

    const prompt = `Eres un filólogo y curador editorial experto.
Analiza la siguiente muestra de los primeros párrafos y últimos párrafos del libro "${bookTitle || 'Obra'}" (autor: "${bookAuthor || 'Desconocido'}"):

--- PRIMEROS PÁRRAFOS (0 a ${Math.min(firstParagraphs.length - 1, 34)}) ---
${startNumbered}

--- ÚLTIMOS PÁRRAFOS (0 a ${Math.min(lastParagraphs.length - 1, 24)}) ---
${endNumbered}

REGLAS CRÍTICAS:
1. Identifica el índice exacto (startParagraphIndex) del PRIMER párrafo donde ARRANCA la historia novelesca real (Capítulo 1 o primera frase narrativa).
   ¡DESCARTA: Portadillas, datos de editorial, imprenta, ISBN, depósito legal, dedicatorias ("A mi madre"), epígrafes o índices!
2. Identifica el índice exacto (endParagraphIndex) del ÚLTIMO párrafo de la historia novelesca real.
   ¡DESCARTA: Licencias Project Gutenberg, colofones de imprenta ("se terminó de imprimir..."), notas finales del editor, índices finales o avisos de descarga web!

Responde estrictamente en formato JSON con:
{
  "startParagraphIndex": number,
  "endParagraphIndex": number,
  "explanation": string
}`;

    const res = await callGeminiWithResilience({
      model: 'gemini-2.5-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            startParagraphIndex: { type: Type.INTEGER },
            endParagraphIndex: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          },
          required: ['startParagraphIndex', 'endParagraphIndex', 'explanation']
        }
      }
    });

    const parsed = JSON.parse(res.text?.trim() || '{}');
    if (typeof parsed.startParagraphIndex === 'number' && typeof parsed.endParagraphIndex === 'number') {
      return {
        startParagraphIndex: Math.max(0, parsed.startParagraphIndex),
        endParagraphIndex: Math.max(0, parsed.endParagraphIndex),
        explanation: parsed.explanation || 'Comprobación de límites confirmada por IA.',
        confidence: 0.98
      };
    }
  } catch (err) {
    console.warn('Mini-lectura con IA omitida o fallida, usando análisis local determinista:', err);
    return resolveLocally();
  }
  return resolveLocally();
}

export interface DetectedChapterItem {
  number: number;
  label: string;
  paragraphIndex: number;
  snippet: string;
}

/**
 * Detecta todos los capítulos o divisiones estructurales de la obra en base a sus párrafos.
 * Desdobla encabezados fusionados en la primera línea y preserva la secuencia completa (I..XII).
 */
export function detectNovelChapters(paragraphs: string[]): DetectedChapterItem[] {
  const chapters: DetectedChapterItem[] = [];
  
  // Expresión regular universal para capítulos multilingües legítimos (con palabra clave o numeral romano)
  const explicitChapterRegex = /^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|l\s*ibro|b\s*ook|a\s*cto)\s+([0-9]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|primero|segundo|tercero|cuarto|quinto|sexto|s[eé]ptimo|octavo|noveno|d[eé]cimo|und[eé]cimo|duod[eé]cimo|[IVXLCDM]+)\b\.?|(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XL|L)\.?)(?:\s*[-–—:.]\s*[^\n]*)?(?:[_\-*•\s]*)$/i;

  const fusedChapterRegex = /^((?:#+\s*)?(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|l\s*ibro|b\s*ook)\s+(?:[0-9]+|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|first\b|second\b|third\b|primero\b|segundo\b|uno\b|primer\b|erstes\b|premier\b|[IVXLCDM]+)\.?|(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\.)(?:\s+|$)/i;

  // Numeral arábigo aislado en su propio párrafo (ej. "1", "2", "3") sin texto posterior en la misma línea
  const isolatedNumberRegex = /^(?:#+\s*)?[0-9]{1,3}\.?$/;
  // Numeral en palabra aislado (ej. "Uno", "Dos", "One", "Two")
  const isolatedWordNumRegex = /^(?:#+\s*)?(?:uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|first|second|third|fourth|fifth|primero|segundo|tercero|cuarto|quinto)\.?$/i;
  // Numeral romano aislado en su propio párrafo (ej. "I", "II", "III")
  const isolatedRomanRegex = /^(?:#+\s*)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX|XXI|XXII|XXIII|XXIV|XXV|XXVI|XXVII|XXVIII|XXIX|XXX|XL|L)\.?$/i;
  // Numeral arábigo o romano con delimitador formal de puntuación y título (ej. "1. El Viaje", "I - La Partida")
  // NUNCA permitir que un mero espacio tras un número ("1 Si eres una verdadera...") sea tratado como capítulo
  const numberedTitleRegex = /^(?:#+\s*)?(?:(?:[0-9]{1,3}|[IVXLCDM]{1,6})[\.:\-–—]\s+[A-ZÁÉÍÓÚÄÖÜ][^\n]{1,60})$/i;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    const linesInPara = p.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const firstLine = linesInPara[0] || '';
    
    // Si la línea parece diálogo teatral con personaje o inicial de hablante (ej. "C.:", "D.:", "C:"), ignorar
    if (/^[A-ZÁÉÍÓÚÑa-z]{1,4}\s*[:]\s+/i.test(firstLine)) continue;
    // Si arranca con signos de diálogo o comillas, es prosa o parlamento, JAMÁS un capítulo
    if (/^[—–\-«"“'‘„¿¡]/.test(firstLine)) continue;

    const isFused = fusedChapterRegex.test(firstLine);

    // NUNCA considerar un párrafo con más de 120 caracteres como capítulo si no es un encabezado fusionado
    if (!isFused && p.length > 120) continue;

    // Filtro anti-falsos positivos: en inglés el pronombre 'I' al inicio de una oración narrativa
    if (/^I\b/.test(firstLine)) {
      if (/^I\s+(?:was|had|am|have|went|thought|saw|knew|felt|said|looked|wanted|came|could|would|did|do|will|must|should|never|always|often)\b/i.test(firstLine)) {
        continue;
      }
    }

    // Filtro anti-falsos positivos: oraciones narrativas en español que arrancan con números o pronombres
    if (/^(?:Uno|Una|Un|Primer|Primera)\s+(?:de|día|vez|momento|año|mes|noche|tarde|mañana|paso|hombre|mujer|amigo|tiempo)\b/i.test(firstLine)) {
      continue;
    }

    // Filtro contra oraciones condicionales o subordinadas numeradas (ej. "1. Si eres...", "1. Cuando...")
    if (/^[0-9]{1,3}[\.:\-–—\s]+\s*(?:si\b|cuando\b|porque\b|aunque\b|mientras\b|como\b|if\b|when\b|as\b|because\b|while\b)/i.test(firstLine)) {
      continue;
    }

    // Títulos de capítulo no terminan en coma, punto y coma, puntos suspensivos ni signos de cierre de diálogo
    if (/[;,…»”"]$/.test(firstLine)) {
      continue;
    }

    // Filtro estricto contra líneas de ÍNDICE / SUMARIO (TOC) con puntos guías o números de página (ej. "Capítulo 1 ...... 15")
    if (/(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(firstLine) || /(?:\.{2,}|…|\s{3,}|\t)\s*[ivxlcdm]+\s*$/i.test(firstLine)) {
      continue;
    }
    // Tampoco tratar el encabezado mismo de "Índice", "Contents", "Sumario" como capítulo narrativo
    if (/^(?:[_\-*•\s]*)(?:#+\s*)?(?:[ií]ndice(?:\s+general)?|tabla\s+de\s+contenidos?|contenido|table\s+of\s+contents|contents|inhaltsverzeichnis|sommaire)\b/i.test(firstLine)) {
      continue;
    }

    const isExplicitChap = explicitChapterRegex.test(firstLine);
    const isIsolatedNum = isolatedNumberRegex.test(p) && linesInPara.length === 1;
    const isIsolatedWord = isolatedWordNumRegex.test(p) && linesInPara.length === 1;
    const isIsolatedRom = isolatedRomanRegex.test(p) && linesInPara.length === 1;
    const isNumberedTitle = numberedTitleRegex.test(firstLine) && !/[,;]/.test(firstLine);

    if (isExplicitChap || isFused || isIsolatedNum || isIsolatedWord || isIsolatedRom || isNumberedTitle) {
      let cleanLabel = firstLine.replace(/^#+\s*/, '').replace(/^[_\-*•\s]+|[_\-*•\s]+$/g, '').trim();
      
      const fusedMatch = firstLine.match(fusedChapterRegex);
      if (fusedMatch) {
        cleanLabel = fusedMatch[1].trim();
      }

      // Evitar falsos positivos de letras sueltas como "L", "C", "D" si no van precedidas por "Chapter" o número romano secuencial
      if (/^[a-zA-Z]\.?$/.test(cleanLabel) && !/^(?:I|V|X)\.?$/i.test(cleanLabel)) {
        continue;
      }

      // Evitar duplicados consecutivos si la misma cabecera aparece en dos líneas
      const lastCap = chapters[chapters.length - 1];
      if (lastCap && lastCap.label.toLowerCase() === cleanLabel.toLowerCase()) {
        continue;
      }

      const nextSnippet = paragraphs[i + 1] ? paragraphs[i + 1].slice(0, 100) : (p.length > cleanLabel.length ? p.slice(cleanLabel.length).trim().slice(0, 100) : '');
      chapters.push({
        number: chapters.length + 1,
        label: cleanLabel,
        paragraphIndex: i,
        snippet: nextSnippet
      });
    }
  }

  // FRENO DE SOBRE-SEGMENTACIÓN: Si se detectaron más de 50 capítulos y la mayoría son números aislados,
  // depurar para conservar únicamente capítulos con etiquetas canónicas explícitas (Capítulo, Chapter, etc.)
  if (chapters.length > 50) {
    const explicitOnly = chapters.filter(c => /(?:cap[ií]tulo|chapter|kapitel|parte|part|libro|book)\b/i.test(c.label));
    if (explicitOnly.length >= 2) {
      return explicitOnly.map((c, idx) => ({ ...c, number: idx + 1 }));
    }
  }

  return chapters;
}

/**
 * Patrones multilingües exhaustivos de material posterior al cuerpo de la novela:
 * - Licencias legales (Project Gutenberg, licencias editoriales, Distributed Proofreading)
 * - Sitios de descarga digital y canales promocionales (Z-Library, Telegram, etc.)
 * - Epílogos, postfacios, palabras finales
 * - Bibliografías, literatura citada
 * - Aparato de notas finales y pies de notas bibliográficos ([i] They are listed...)
 * - Apéndices, borradores tempranos (The Fields of Fancy, Notes to Mathilda)
 * - Colofón editorial
 */
const BACK_MATTER_MARKERS: { regex: RegExp; type: BackMatterExtractionResult['backMatterType']; title: string }[] = [
  // 1. Licencias Project Gutenberg, Distributed Proofreading y Repositorios Digitales
  {
    regex: /(?:\b|(?<=[.!?»”"']\s*))(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[^\n]*\*{3,5}|End of (?:the )?Project Gutenberg(?:'s)?\b|\*{3,5}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK LICENSE|Section 1\.\s+General Terms of Use and Redistributing|1\.E\.[1-9]\.?\s+You may convert|THE FULL PROJECT GUTENBERG LICENSE|START:\s*FULL LICENSE|PLEASE READ THIS BEFORE YOU DISTRIBUTE|This file should be named \d+|Produced by .*?(?:Distributed Proofreading|Proofreading Team|pgdp\.net|Gutenberg)|Creating the works from public domain print editions|The Project Gutenberg Literary Archive Foundation|Project Gutenberg is a registered trademark|Updated editions will replace the previous one|http:\/\/www\.gutenberg\.org|Transcriber's note[s]?:|Nota del transcriptor:|Anmerkung des Transkribenten:)/i,
    type: 'gutenberg_license',
    title: 'Licencia Project Gutenberg y Créditos Editoriales'
  },
  // 2. Sitios de descarga digital, dominios, avisos de descarga pegados a la última frase y canales de Telegram
  {
    regex: /(?:\b|(?<=[.!?»”"']|\.))(?:[-–—\s]*)(?:(?:This\s+file\s+was\b|This\s+file\s+is\b|This\s+file\s+should\s+be\s+named\b|Downloaded\s+from\b|Descargado\s+en\b|Descargado\s+de\b|Generated\s+by\b|Created\s+by\b|Uploaded\s+by\b|Official\s+Telegram\s+channel\b|Canal\s+oficial\s+de\s+Telegram\b|Telegram\s+channel\b|go-to-library\b|z-library\b|z-lib\b)|(?:z-lib(?:rary)?|1lib|epublibre|aliceandbooks|standardebooks|feedbooks|b-ok|bookfi|libgen)\.(?:sk|org|com|is|to|cx|me|gs|fm|li|vg|st))\b[^\n]*/i,
    type: 'other',
    title: 'Aviso de Descarga Web y Canal Digital'
  },
  // 2b. Banners de blogs, descargas gratuitas y URLs pegadas al final (ej: "M á s l i b r o s h h t t t t p p : : / / / l l i i b b r r i i c u u l l t t...", "gratis en blogspot...", "FIN gratis...")
  {
    regex: /(?:\b|(?<=[.!?»”"']\s*))(?:[-–—\s]*)(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|gratis\s*en|free\s*at|FIN\s+gratis|FIN\s+g\s*r\s*a\s*t\s*i\s*s|h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|www\.[a-z0-9-]+|Visita\s+(?:nuestro\s+)?blog|Descarga\s+m[aá]s\s+libros)[\s\S]*$/i,
    type: 'other',
    title: 'Aviso de Descarga Web y Enlaces de Blog'
  },
  // 3. Epílogo / Postfacio / Nachwort / Conclusión
  {
    regex: /(?:\b|(?<=[.!?»”"']\s*|\n\s*))(?:#+\s*)?(?:Ep[ií]logo|Epilogue|Nachwort|Postfacio|Postscript|Palabras\s+finales|Nota\s+final|Conclusi[oó]n|Agradecimientos|Acknowledgements|Danksagung)\b[^\n]*/i,
    type: 'epilogue',
    title: 'Epílogo / Postfacio'
  },
  // 4. Bibliografía / Literatura / Obras del autor
  {
    regex: /(?:\b|(?<=[.!?»”"']\s*|\n\s*))(?:#+\s*)?(?:Bibliograf[ií]a|Bibliography|Literaturverzeichnis|Referencias\s+bibliogr[aá]ficas|Obras\s+consultadas|Quellenverzeichnis|Obras\s+del\s+mismo\s+autor|Books\s+by\s+the\s+same\s+author|Weitere\s+Werke|Cat[aá]logo(?:\s+de\s+la)?\s+editorial|Cat[aá]logo\s+general|Otras\s+obras)\b[^\n]*/i,
    type: 'bibliography',
    title: 'Bibliografía y Referencias'
  },
  // 5. Notas finales / Endnotes / Anmerkungen / Notas críticas / Notas del autor
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:NOTES\s+TO\s+MATHILDA|NOTES\s+ON\s+MATHILDA|Notas\s+(?:del\s+autor|de\s+la\s+autora|del\s+editor|de\s+edici[oó]n|al\s+final|finales|al\s+texto|aclaratorias|explicativas|cr[ií]ticas)|Author'?s?\s+Notes|Notes\s+by\s+the\s+author|Notes\s+to\s+the\s+text|Textual\s+Notes|Explanatory\s+Notes|Endnotes|Anmerkungen|Aparato\s+cr[ií]tico|Notas\s+y\s+variantes)\b[^\n]*/i,
    type: 'endnotes',
    title: 'Aparato de Notas Finales'
  },
  // 6. Lista de notas al pie acumuladas al final de la obra ([i] They are listed..., [1] Note...)
  {
    regex: /(?:^|\n\s*)\[(?:[0-9]{1,3}|[ivxlcdm]{1,6})\]\s+(?:They\s+are\s+listed|See\s+also|V[eé]ase|Cf\.|Nota|Note)\b[^\n]*/i,
    type: 'endnotes',
    title: 'Notas y Referencias Bibliográficas'
  },
  // 7. Apéndice / Anexo / Appendix / Borradores tempranos (The Fields of Fancy)
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:THE\s+FIELDS\s+OF\s+FANCY|Ap[eé]ndice|Ap[eé]ndices|Appendix|Appendices|Anhang|Anexo|Anexos|ROUGH\s+DRAFT|EARLY\s+DRAFT)\b[^\n]*/i,
    type: 'appendix',
    title: 'Apéndice y Documentos Anexos'
  },
  // 8. Colofón editorial / Notas de Imprenta / Talleres gráficos
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:Colof[oó]n|Colophon|(?:Este\s+libro\s+)?se\s+termin[oó]\s+de\s+imprimir|Acab[oó]use\s+de\s+imprimir|Fue\s+impreso\s+en|Impreso\s+en|Printed\s+by|Gedruckt\s+(?:in|bei)|Achev[eé]\s+d'imprimer|Talleres\s+gr[aá]ficos|Composici[oó]n\s+y\s+maquetaci[oó]n|Diseño\s+de\s+cubierta|Conversi[oó]n\s+a\s+libro\s+electr[oó]nico|Edici[oó]n\s+digital(?:\s+a\s+cargo\s+de)?)\b[^\n]*/i,
    type: 'colophon',
    title: 'Colofón Editorial'
  },
  // 8b. Índice o Tabla de Contenidos final
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:[IÍ]ndice\s+general|[IÍ]ndice\s+de\s+cap[ií]tulos|Tabla\s+de\s+materias|[IÍ]ndice\s+anal[ií]tico|[IÍ]ndice\s+alfab[eé]tico|[IÍ]ndice\s+de\s+nombres)\b[^\n]*/i,
    type: 'appendix',
    title: 'Índice Posterior'
  },
  // 8c. Nota editorial o del traductor al cierre
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:Nota\s+sobre\s+la\s+(?:presente\s+)?edici[oó]n|Nota\s+del\s+traductor|Advertencia\s+del\s+editor|Criterio\s+editorial)\b[^\n]*/i,
    type: 'endnotes',
    title: 'Nota Editorial Final'
  },
  // 9. Acerca del autor / Biografía
  {
    regex: /(?:^|\n\s*)(?:#+\s*)?(?:Sobre\s+el\s+autor|Acerca\s+del\s+autor|About\s+the\s+author|Über\s+den\s+Autor|Biograf[ií]a\s+del\s+autor)\b[^\n]*/i,
    type: 'other',
    title: 'Semblanza del Autor'
  },
  // 10. Marca explícita y aislada de Fin de la obra (exclusivamente línea completa aislada, nunca palabra común como "fine" o "en fin")
  {
    regex: /(?:^|\n\s*)(?:[-–—*•\s]*)(?:(?:EL\s+)?FIN|THE\s+END|ENDE)\.?\s*(?:\r?\n+|$)/i,
    type: 'other',
    title: 'Material Posterior al Fin de la Novela'
  }
];

/**
 * Detecta y aísla rigurosamente todo contenido posterior a la novela (Back Matter):
 * licencias Gutenberg, epílogos, bibliografías, notas finales, colofón, etc.
 * Garantiza que el clímax o final de la novela NUNCA se empareje con licencias o apéndices.
 * Es capaz de detectar rupturas en medio de una misma línea (ej. "dehnte.End of the Project...").
 */
export function detectAndSeparateBackMatter(text: string): BackMatterExtractionResult {
  if (!text || text.trim().length === 0) {
    return {
      hasBackMatter: false,
      backMatterTitle: '',
      backMatterType: 'other',
      novelBodyText: text || '',
      backMatterText: '',
      backMatterWordCount: 0
    };
  }

  let bestMatchIndex = -1;
  let bestMatchPattern = '';
  let bestType: BackMatterExtractionResult['backMatterType'] = 'other';
  let bestTitle = 'Contenido Posterior';

  for (const item of BACK_MATTER_MARKERS) {
    const flags = item.regex.flags.includes('g') ? item.regex.flags : item.regex.flags + 'g';
    const globalRegex = new RegExp(item.regex.source, flags);
    let m: RegExpExecArray | null;

    let safetyBack = 0;
    while ((m = globalRegex.exec(text)) !== null && safetyBack++ < 200) {
      if (m[0].length === 0) {
        globalRegex.lastIndex++;
        continue;
      }
      const matchStr = m[0];
      // Si la línea parece una entrada de índice (termina con puntos/tabulaciones y número de página), ignorar
      if (/(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(matchStr.trim())) {
        continue;
      }

      // Los marcadores de fin de obra, colofón y material posterior aplican en el tramo final
      // Un colofón editorial ("se terminó de imprimir...") se ubica exclusivamente en el tramo terminal (>= 88% del texto)
      // y nunca a mitad del libro.
      const minIndex = item.type === 'colophon'
        ? Math.floor(text.length * 0.88)
        : (item.type === 'gutenberg_license' || item.type === 'appendix' || item.type === 'endnotes')
          ? Math.floor(text.length * 0.70)
          : Math.floor(text.length * 0.78);

      if (m.index >= minIndex) {
        if (bestMatchIndex === -1 || m.index < bestMatchIndex) {
          bestMatchIndex = m.index;
          bestMatchPattern = matchStr.trim();
          bestType = item.type;
          bestTitle = item.title;
        }
      }
    }
  }

  if (bestMatchIndex !== -1) {
    let cutIndex = bestMatchIndex;
    const lookback = text.substring(Math.max(0, bestMatchIndex - 80), bestMatchIndex);
    const pageMatch = lookback.match(/(?:\n\s*)?[-–—\s]*\[?\s*[-–—\s]*(?:P[AÁ]GINA|PAGE|HOJA|SEITE)\s+\d+[^\]]*\]?\s*[-–—\s]*(?:\r?\n+)?$/i);
    if (pageMatch && pageMatch.index !== undefined) {
      cutIndex = Math.max(0, bestMatchIndex - 80) + pageMatch.index;
    }

    let novelBodyText = text.substring(0, cutIndex).trim();
    const backMatterText = text.substring(bestMatchIndex).trim();
    const backMatterWordCount = backMatterText.split(/\s+/).filter(Boolean).length;

    // SALVAGUARDA FILOLÓGICA CONTRA CORTES FALSOS:
    // Si el texto posterior al supuesto corte contiene:
    // 1. Capítulos narrativos subsecuentes (ej. Capítulo XII, XI, Epílogo narrativo, etc.)
    // 2. Diálogos literarios (guiones de diálogo '—', comillas '«', '“', '"')
    // 3. Párrafos sustanciales de prosa novelesca (> 12 palabras con puntuación literaria)
    // 4. Si el remanente excede 180 palabras y no es una licencia formal Gutenberg:
    // ENTONCES EL MARCADOR FUE UN FALSO POSITIVO DENTRO DE LA NOVELA Y NO DEBE MUTILARSE EL DESENLACE.
    const hasSubsequentChapters = /(?:^|\n\s*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+(?:[0-9IVXLCDM]+|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|first\b|second\b|third\b|primero\b|segundo\b|uno\b|primer\b|primera\b|erstes\b|premier\b)\.?|[IVXLCDM]{1,6}\.?)(?:\s*[-–—:.]\s*[^\n]*)?(?:\r?\n+|$)/i.test(backMatterText);
    
    const postParagraphs = backMatterText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const narrativeParasInRemnant = postParagraphs.filter(p => {
      const words = p.split(/\s+/).filter(Boolean).length;
      const isHeader = p.length < 50 && /^(?:[A-Z0-9\s:.-]+)$/.test(p);
      const isFootnoteOrMeta = /^\[\d+\]/.test(p) || /(?:isbn\b|dep[oó]sito legal|printed in|impreso en los talleres|fotocomposici[oó]n)/i.test(p);
      const isDialogue = /^[-–—«“"'].*?[.!?»”"']$/.test(p);
      const isNarrativeSentence = words >= 12 && /[.!?»”"]$/.test(p);
      return !isHeader && !isFootnoteOrMeta && (isDialogue || isNarrativeSentence);
    });

    const isStrictGutenberg = /(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG|\*{3,5}\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK LICENSE)/im.test(backMatterText);

    if (hasSubsequentChapters || narrativeParasInRemnant.length >= 2 || (narrativeParasInRemnant.length >= 1 && backMatterWordCount > 150 && !isStrictGutenberg)) {
      return {
        hasBackMatter: false,
        backMatterTitle: '',
        backMatterType: 'other',
        novelBodyText: text.trim(),
        backMatterText: '',
        backMatterWordCount: 0
      };
    }

    // FRENO DE SEGURIDAD: Solo se anula si el corte dejaría menos del 70% del libro
    // y no es un marcador estricto de final Gutenberg
    if (novelBodyText.length < text.length * 0.70 && !isStrictGutenberg) {
      return {
        hasBackMatter: false,
        backMatterTitle: '',
        backMatterType: 'other',
        novelBodyText: text.trim(),
        backMatterText: '',
        backMatterWordCount: 0
      };
    }

    return {
      hasBackMatter: true,
      backMatterTitle: bestTitle,
      backMatterType: bestType,
      novelBodyText,
      backMatterText,
      backMatterWordCount,
      detectedEndPattern: bestMatchPattern
    };
  }

  return {
    hasBackMatter: false,
    backMatterTitle: '',
    backMatterType: 'other',
    novelBodyText: text.trim(),
    backMatterText: '',
    backMatterWordCount: 0
  };
}

/**
 * Inspección Profunda de Extremos y Estado Puro de una Obra Literaria.
 * Identifica con certeza absoluta:
 * 1. El arranque real de la novela (descartando prólogos, licencias de cabecera y portadilla).
 * 2. El desenlace real de la novela (cortando rupturas editoriales, avisos Gutenberg y colofones).
 * 3. Primer párrafo puro vs Último párrafo puro.
 */
export function inspectBookEndpointsAndPureBody(
  rawText: string,
  knownTitle?: string,
  knownAuthor?: string,
  canonicalProfile?: Partial<CanonicalWorkProfile>,
  counterpartAnchor?: { startSnippet?: string; endSnippet?: string },
  providedPages?: { pageNumber: number; text: string }[],
  sovereignBodyOnly: boolean = false
): BookEndpointInspection {
  if (!rawText || rawText.trim().length === 0) {
    return {
      hasCleanStart: false,
      hasCleanEnd: false,
      isCleanNovelBody: true,
      frontMatterRemoved: false,
      backMatterRemoved: false,
      firstParagraph: '',
      lastParagraph: '',
      firstParagraphWords: 0,
      lastParagraphWords: 0,
      totalParagraphs: 0,
      totalWords: 0,
      totalChars: 0,
      pureBodyText: '',
      backMatterText: '',
      backMatterWords: 0,
      firstParagraphSnippet: '',
      lastParagraphSnippet: '',
      hasPreface: false
    };
  }

  // Si sovereignBodyOnly es true, el texto ya fue acotado de manera soberana por el usuario en Fase 1.
  // Jamás se re-segmenta ni se le inventan o extraen prólogos o prefacios inexistentes.
  if (sovereignBodyOnly) {
    const rawParas = rawText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    const firstP = rawParas[0] || '';
    const lastP = rawParas[rawParas.length - 1] || '';
    const totalWords = rawText.split(/\s+/).filter(Boolean).length;

    return {
      hasCleanStart: true,
      hasCleanEnd: true,
      isCleanNovelBody: true,
      frontMatterRemoved: false,
      backMatterRemoved: false,
      firstParagraph: firstP,
      lastParagraph: lastP,
      firstParagraphWords: firstP.split(/\s+/).filter(Boolean).length,
      lastParagraphWords: lastP.split(/\s+/).filter(Boolean).length,
      totalParagraphs: rawParas.length,
      totalWords,
      totalChars: rawText.length,
      pureBodyText: rawText,
      backMatterText: '',
      backMatterWords: 0,
      firstParagraphSnippet: firstP.length > 250 ? firstP.slice(0, 250) + '...' : firstP,
      lastParagraphSnippet: lastP.length > 250 ? '...' + lastP.slice(-250) : lastP,
      hasPreface: false,
      zones: {
        frontMatter: { title: knownTitle || '', author: knownAuthor || '', hasFrontMatter: false },
        preliminaryMatter: { hasPreliminary: false, title: '', text: '', wordCount: 0, paragraphsCount: 0 },
        novelBody: rawText,
        novelParagraphs: rawParas,
        footnotes: [],
        chapters: [],
        backMatter: { hasBackMatter: false, title: '', text: '', wordCount: 0, type: 'other' }
      }
    };
  }

  // 1. Ejecutar bloquificación canónica integral para obtener zonas
  const resolvedProfile = canonicalProfile || lookupCanonicalWorkLocally(knownTitle, knownAuthor, rawText) || undefined;
  const zones = disentangleBookZones(rawText, knownTitle, knownAuthor, resolvedProfile, counterpartAnchor);
  let workingText = zones.novelBody;
  const backMatter = zones.backMatter;

  let frontMatterRemoved = zones.frontMatter.hasFrontMatter;
  const frontMatterTitle = zones.frontMatter.title 
    ? `${zones.frontMatter.title}${zones.frontMatter.author ? ' (' + zones.frontMatter.author + ')' : ''}` 
    : undefined;

  const hasPreface = zones.preliminaryMatter.hasPreliminary;
  const prefaceTitle = hasPreface ? zones.preliminaryMatter.title : undefined;
  const prefaceText = hasPreface ? zones.preliminaryMatter.text : undefined;
  const prefaceWords = zones.preliminaryMatter.wordCount;
  const prefaceParagraphs = zones.preliminaryMatter.paragraphsCount;
  const downloadNoticeRemoved = Boolean(zones.frontMatter.downloadNotice);
  const downloadNoticeSnippet = zones.frontMatter.downloadNotice;

  // 2. Usar párrafos limpios y desdoblados del cuerpo de la novela
  const rawParagraphs = zones.novelParagraphs.filter(p => {
    if (!p || p.length === 0) return false;
    if (/^[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGE|SEITE|COLUMNA)[^\]]*\]\s*[-–—\s]*$/i.test(p)) return false;
    // Solo descartar como artefacto de página si es un número grande (> 150) sin formato de capítulo
    const isIsolatedNum = p.match(/^[-–—\s]*(\d{1,4})[-–—\s]*$/);
    if (isIsolatedNum) {
      const numVal = parseInt(isIsolatedNum[1], 10);
      if (numVal > 150) return false;
    }
    return true;
  });

  // 2b. Poda activa y saneamiento de párrafos espurios al final (enlaces Z-lib, canales Telegram, notas [i], licencias)
  const paragraphs = [...rawParagraphs];
  let extraBackWords = 0;
  let extraBackText = '';

  // Poda activa de párrafos de cabecera parasitarios (Produced by, Proofreading, Kurt Wolff Verlag, URLs, watermarks, etc.)
  while (paragraphs.length > 0) {
    const candidateFirst = paragraphs[0];
    const isBoilerplate = candidateFirst.length < 250 && /(?:Distributed Proofreading|pgdp\.net|Produced by|KURT WOLFF|VERLAG|COPYRIGHT|BÜCHEREI|GEDRUCKT BEI|z-lib|gutenberg|1lib|aliceandbooks|DigBib|digital\s+bibliothek|quelle:|erstellt\s+am|h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|gratis\s*en|descargado\s+en|www\.)/i.test(candidateFirst) &&
      !(candidateFirst.length > 100 && (/[.!?]\s+[A-ZÁÉÍÓÚÄÖÜÀÈÌÒÙÂÊÎÔÛÇ]/.test(candidateFirst) || /^[-–—«»"“]/.test(candidateFirst)));
    if (isBoilerplate) {
      paragraphs.shift();
    } else {
      break;
    }
  }

  while (paragraphs.length > 0) {
    const candidateLast = paragraphs[paragraphs.length - 1];
    const isZLib = /(?:z-lib|telegram|go-to-library|aliceandbooks|downloaded from|descargado en|libricultura|blogspot|hhttttpp|FIN\s+gratis|M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s)/i.test(candidateLast);
    const isFootnote = /^\[(?:[0-9]{1,3}|[ivxlcdm]{1,6}|[a-z])\]/i.test(candidateLast);
    const isGutenberg = /(?:END OF TH(?:E|IS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg|Distributed Proofreading)/i.test(candidateLast);

    const lastParaWords = candidateLast.split(/\s+/).filter(Boolean);
    const hasNarrativeText = lastParaWords.length > 10;
    if (isZLib && hasNarrativeText) {
      // Tiene narrativa legítima con marca de agua al final: purgar solo el sufijo sin descartar el párrafo
      const cleaned = candidateLast.replace(/(?<=[.!?»”"']\s+)(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|h+[t\s]+[t\s]+[p\s]+|FIN\s+g\s*r\s*a\s*t\s*i\s*s|FIN\s+gratis|gratis\s*en|descargado\s+en|visita\s+nuestro\s+blog|www\.|b+l+o+g+s+p+o+t)[\s\S]*$/i, '').trim();
      paragraphs[paragraphs.length - 1] = cleaned;
      break;
    }

    if (isZLib || isFootnote || isGutenberg) {
      paragraphs.pop();
      extraBackWords += candidateLast.split(/\s+/).filter(Boolean).length;
      extraBackText = candidateLast + '\n' + extraBackText;
    } else {
      break;
    }
  }

  let firstParagraph = '';
  let lastParagraph = '';

  // Helper de normalización fonética y léxica: repara guiones partidos de OCR/PDF, minúsculas, sin tildes ni puntuación
  const normStr = (s: string) => {
    return s
      .replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*\n+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/g, '$1$2')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // =========================================================================
  // CAPA 1 & 2: SUPERVISIÓN Y FIJACIÓN EXACTA DEL PÁRRAFO INICIAL (ARRANQUE NARRATIVO)
  // =========================================================================
  const allStartCandidates: string[] = [];
  if (resolvedProfile?.openingSentenceOriginal) allStartCandidates.push(resolvedProfile.openingSentenceOriginal);
  if (resolvedProfile?.openingSentenceTranslated) allStartCandidates.push(resolvedProfile.openingSentenceTranslated);
  if (resolvedProfile?.startParagraphSnippet) allStartCandidates.push(resolvedProfile.startParagraphSnippet);
  if (resolvedProfile?.openingCandidates && Array.isArray(resolvedProfile.openingCandidates)) {
    allStartCandidates.push(...resolvedProfile.openingCandidates);
  }
  if (counterpartAnchor?.startSnippet) allStartCandidates.push(counterpartAnchor.startSnippet);

  let matchedStartParaIndex = -1;
  const maxStartSearch = Math.min(paragraphs.length, Math.max(15, Math.floor(paragraphs.length * 0.35)));

  for (const startCand of allStartCandidates) {
    if (!startCand || startCand.trim().length < 6) continue;
    const cleanCandNorm = normStr(startCand);
    const candTokens = cleanCandNorm.split(/\s+/).filter(w => w.length >= 3);

    for (let i = 0; i < maxStartSearch; i++) {
      const pNorm = normStr(paragraphs[i]);
      if (pNorm.length < 15) continue;

      // 1. Coincidencia por subcadena normalizada
      if (cleanCandNorm.length >= 10 && pNorm.includes(cleanCandNorm.slice(0, 30))) {
        matchedStartParaIndex = i;
        break;
      }
      if (cleanCandNorm.length >= 15 && cleanCandNorm.includes(pNorm.slice(0, 30))) {
        matchedStartParaIndex = i;
        break;
      }

      // 2. Coincidencia por n-gramas iniciales o de apertura
      if (candTokens.length >= 4) {
        const firstFew = candTokens.slice(0, 4).join(' ');
        if (pNorm.includes(firstFew)) {
          matchedStartParaIndex = i;
          break;
        }
        const middleFew = candTokens.slice(1, 5).join(' ');
        if (pNorm.includes(middleFew)) {
          matchedStartParaIndex = i;
          break;
        }
      }

      // 3. Coincidencia por densidad léxica (palabras sustantivas >= 4 letras)
      const contentTokens = candTokens.filter(t => t.length >= 4);
      if (contentTokens.length >= 3) {
        let hits = 0;
        for (const ct of contentTokens) {
          if (pNorm.includes(ct)) hits++;
        }
        if (hits / contentTokens.length >= 0.6 || hits >= 3) {
          matchedStartParaIndex = i;
          break;
        }
      }
    }
    if (matchedStartParaIndex !== -1) break;
  }

  // Si se encontró el párrafo exacto por coincidencia con candidato canónico/IA:
  if (matchedStartParaIndex > 0) {
    paragraphs.splice(0, matchedStartParaIndex);
    frontMatterRemoved = true;
    firstParagraph = paragraphs[0];
  } else if (matchedStartParaIndex === 0) {
    firstParagraph = paragraphs[0];
  } else {
    // CAPA 3: SUPERVISOR HEURÍSTICO AUTÓNOMO DEL ARRANQUE
    let foundStartIdx = 0;
    for (let i = 0; i < Math.min(paragraphs.length, 50); i++) {
      const p = paragraphs[i].trim();
      const isHeadingOrNum = /^(?:#+\s*)?(?:(?:Cap[ií]tulo|Kapitel|Chapter|Parte|Part|Libro|Book)\s+[0-9IVXLCDM]+|[IVXLCDM]{1,6}\.?|[0-9]{1,3}\.?)$/i.test(p);
      const isWebWatermark = /(?:h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|gratis\s*en|descargado\s+(?:de|en)|digital\s+bibliothek|quelle:|erstellt\s+am|www\.)/i.test(p);
      const isImprintOrLegal = /(?:editorial\b|copyright|derechos reservados|isbn\b|dep[oó]sito legal|publicado por|impreso en|printed in|c\/|calle\s+|madrid|barcelona|buenos aires|m[eé]xico|sextopiso|newcomlab|diseño|conversión a|primera edici[oó]n|todos los derechos)/i.test(p);
      const isTocLine = /(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(p) || /^(?:[IÍ]ndice|Table\s+of\s+Contents|Contenido|Sumario)\b/i.test(p);
      const isDedication = /^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Dem\s+|Für\s+|A\s+la\s+memoria\s+de|In\s+memoriam)\b/i.test(p) && p.length < 250;
      const isEpigraph = (/^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/.test(p) || /^(?:Ep[ií]grafe|Motto)\b/i.test(p)) && p.length < 280;

      if (!isHeadingOrNum && !isWebWatermark && !isImprintOrLegal && !isTocLine && !isDedication && !isEpigraph && p.length > 25) {
        foundStartIdx = i;
        break;
      }
    }
    if (foundStartIdx > 0) {
      paragraphs.splice(0, foundStartIdx);
      frontMatterRemoved = true;
    }
    firstParagraph = paragraphs.length > 0 ? paragraphs[0] : '';
  }

  // =========================================================================
  // CAPA 1 & 2: SUPERVISIÓN Y FIJACIÓN EXACTA DEL PÁRRAFO FINAL (DESENLACE NARRATIVO)
  // =========================================================================
  const allEndCandidates: string[] = [];
  if (resolvedProfile?.endingSentenceOriginal) allEndCandidates.push(resolvedProfile.endingSentenceOriginal);
  if (resolvedProfile?.endingSentenceTranslated) allEndCandidates.push(resolvedProfile.endingSentenceTranslated);
  if (resolvedProfile?.endParagraphSnippet) allEndCandidates.push(resolvedProfile.endParagraphSnippet);
  if (resolvedProfile?.endingCandidates && Array.isArray(resolvedProfile.endingCandidates)) {
    allEndCandidates.push(...resolvedProfile.endingCandidates);
  }
  if (counterpartAnchor?.endSnippet) allEndCandidates.push(counterpartAnchor.endSnippet);

  let matchedEndParaIndex = -1;
  // Búsqueda del desenlace exclusivamente en el tramo terminal del libro (>= 85% de la extensión total)
  // para evitar terminantemente falsos positivos por citas o frases repetidas a mitad de la obra.
  const startEndSearch = Math.max(0, Math.floor(paragraphs.length * 0.85));

  for (const endCand of allEndCandidates) {
    if (!endCand || endCand.trim().length < 6) continue;
    const cleanCandNorm = normStr(endCand);
    const candTokens = cleanCandNorm.split(/\s+/).filter(w => w.length >= 3);

    for (let i = paragraphs.length - 1; i >= startEndSearch; i--) {
      const pNorm = normStr(paragraphs[i]);
      if (pNorm.length < 15) continue;

      let isCandidateMatch = false;

      if (cleanCandNorm.length > 8 && pNorm.includes(cleanCandNorm)) {
        isCandidateMatch = true;
      } else if (cleanCandNorm.length >= 15 && pNorm.includes(cleanCandNorm.slice(-30))) {
        isCandidateMatch = true;
      } else if (candTokens.length >= 4) {
        const lastFew = candTokens.slice(-4).join(' ');
        if (pNorm.includes(lastFew)) isCandidateMatch = true;
      } else if (candTokens.length >= 3) {
        const phrase = candTokens.join(' ');
        if (pNorm.includes(phrase)) isCandidateMatch = true;
      }

      // CORROBORACIÓN LÓGICA CRUCIAL:
      // ¿Es este realmente el final de la novela o una frase repetida antes del desenlace?
      // Si tras este párrafo aún quedan más de 2 párrafos narrativos o más de 120 palabras de diálogo/prosa,
      // NO es el final del libro; es una coincidencia interna y la búsqueda debe continuar hacia el final real.
      if (isCandidateMatch) {
        const subsequent = paragraphs.slice(i + 1);
        const narrativeAfter = subsequent.filter(sub => {
          const sTrim = sub.trim();
          const isDial = /^[-–—«“"'].*?[.!?»”"']$/.test(sTrim);
          const words = sTrim.split(/\s+/).filter(Boolean).length;
          const isMeta = /(?:isbn\b|dep[oó]sito legal|talleres gr[aá]ficos|papel reciclado|fotocomposici[oó]n|descargado\s+en|digital\s+bibliothek|gutenberg)/i.test(sTrim);
          return !isMeta && (isDial || words >= 15);
        });

        const totalWordsAfter = subsequent.map(s => s.split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);

        if (narrativeAfter.length <= 1 && totalWordsAfter < 160) {
          matchedEndParaIndex = i;
          break;
        }
      }
    }
    if (matchedEndParaIndex !== -1) break;
  }

  // Si se encontró el párrafo exacto donde concluye la narración, seccionar todo lo posterior
  if (matchedEndParaIndex !== -1 && matchedEndParaIndex < paragraphs.length - 1) {
    const severedParas = paragraphs.splice(matchedEndParaIndex + 1);
    for (const sp of severedParas) {
      extraBackWords += sp.split(/\s+/).filter(Boolean).length;
      extraBackText = (extraBackText ? extraBackText + '\n\n' : '') + sp;
    }
    lastParagraph = paragraphs[matchedEndParaIndex];
  } else {
    // CAPA 3: SUPERVISOR HEURÍSTICO AUTÓNOMO DEL FINAL
    // Expresión multilingüe para marcadores tipográficos de cierre y aparatos posteriores
    // (Español, Inglés, Alemán, Francés, Italiano, Portugués, Ruso)
    const backMatterRegex = /^(?:#+\s*)?(?:FIN|FIN\s+DE\s+LA\s+OBRA|FIN\s+DEL\s+LIBRO|THE\s+END|ENDE|FINE|FIM|КОНЕЦ|COLOF[OÓ]N|COLOPHON|KOLOPHON|Acab[oó]use\s+de\s+imprimir|Se\s+termin[oó]\s+de\s+imprimir|Achev[eé]\s+d['’]imprimer|Finito\s+di\s+stampare|Fue\s+impreso\s+en|Impreso\s+en\s+los\s+talleres|Printed\s+(?:in|by)|Gedruckt\s+(?:in|bei)|Stampato\s+in|[IÍ]ndice(?:\s+general|\s+de\s+cap[ií]tulos|\s+alfab[eé]tico|\s+de\s+materias)?|Table\s+des\s+mati[eè]res|Table\s+of\s+Contents|Inhaltsverzeichnis|Inhalt|Sommaire|Tavola|Оглавление|Содержание|AP[EÉ]NDICE|APPENDIX|ANHANG|APPENDICE|NOTAS\s+(?:AL\s+TEXTO|FINALES|DEL\s+TRADUCTOR)|NOTES|ANMERKUNGEN|NOTE\s+AL\s+TESTO|GLOSARIO|GLOSSARY|GLOSSAIRE|GLOSSAR|BIBLIOGRAF[IÍ]A|BIBLIOGRAPHY|BIBLIOGRAPHIE|SOBRE\s+EL\s+AUTOR|ACERCA\s+DEL\s+AUTOR|ABOUT\s+THE\s+AUTHOR|[UÜ]BER\s+DEN\s+AUTOR|SUR\s+L['’]AUTEUR|DELLO\s+STESSO\s+AUTORE|DU\s+M[EÊ]ME\s+AUTEUR|POSTFACIO|AFTERWORD|NACHWORT|POSTFACE|POSTFAZIONE|CAT[AÁ]LOGO(?:\s+EDITORIAL)?|CATALOGUE|OTRAS\s+OBRAS|OTHER\s+BOOKS|WEITERE\s+WERKE|DEP[OÓ]SITO\s+LEGAL)[\s.:]*$/i;
    
    // 1. Comprobación rigurosa de corte en el tramo final (>= 90% de los párrafos):
    // NUNCA cortar si los párrafos posteriores contienen diálogos o narrativa continuada.
    const startLateCheck = Math.max(0, Math.floor(paragraphs.length * 0.90));
    let cutIndex = -1;
    for (let i = startLateCheck; i < paragraphs.length; i++) {
      const p = paragraphs[i].trim();
      if (p.length < 80 && backMatterRegex.test(p)) {
        // Verificar si los párrafos que le siguen son puramente colofón/créditos o si la novela continúa
        const remnantParas = paragraphs.slice(i + 1);
        const narrativeInRemnant = remnantParas.filter(rem => {
          const w = rem.split(/\s+/).filter(Boolean).length;
          const isDial = /^[-–—«“"'].*?[.!?»”"']$/.test(rem.trim());
          const isSent = w >= 12 && /[.!?»”"]$/.test(rem.trim());
          const isMeta = /(?:isbn\b|dep[oó]sito legal|talleres gr[aá]ficos|papel reciclado|fotocomposici[oó]n|descargado\s+en)/i.test(rem);
          return !isMeta && (isDial || isSent);
        });

        // Si hay más de 1 párrafo narrativo o más de 120 palabras narrativas, NO es colofón real: es un falso positivo
        const totalRemnantWords = remnantParas.map(r => r.split(/\s+/).filter(Boolean).length).reduce((a, b) => a + b, 0);
        if (narrativeInRemnant.length === 0 || (narrativeInRemnant.length <= 1 && totalRemnantWords < 120)) {
          cutIndex = i;
          break;
        }
      }
    }
    if (cutIndex !== -1) {
      const severedParas = paragraphs.splice(cutIndex);
      for (const sp of severedParas) {
        extraBackWords += sp.split(/\s+/).filter(Boolean).length;
        extraBackText = (extraBackText ? extraBackText + '\n\n' : '') + sp;
      }
    }

    // 2. Buscar el último párrafo que contenga texto literario narrativo legítimo
    let foundNarrativeIndex = -1;
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      const p = paragraphs[i].trim();
      const isWebWatermark = /(?:h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|gratis\s*en|FIN\s+gratis|M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|descargado\s+en|digital\s+bibliothek|quelle:|erstellt\s+am|www\.)/i.test(p);
      const isLegalOrColophon = /(?:isbn\b|dep[oó]sito legal|derechos reservados|impreso en\s+los\s+talleres|printed in|todos los derechos|distributed proofreading|pgdp\.net|editorial\s+[a-z]+|papel\s+reciclado|talleres\s+gr[aá]ficos|fotocomposici[oó]n)/i.test(p);
      const isIndexLine = /(?:\.{2,}|…|\s{3,}|\t)\s*\d+\s*$/.test(p);
      const isDateLocationAlone = /^(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?,?\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|january|february|march|april|may|june|july|august|september|october|november|december)\s+(?:de\s+)?\d{4}\.?$/i.test(p);
      const isClosingMarker = p.length < 80 && backMatterRegex.test(p);
      const isShortMeta = p.length < 35 && /^(?:[_\-*•\s]*|[0-9]{1,4}|[a-z]{1,4}\.?)$/i.test(p);

      if (!isWebWatermark && !isLegalOrColophon && !isIndexLine && !isDateLocationAlone && !isClosingMarker && !isShortMeta && p.length > 20) {
        foundNarrativeIndex = i;
        lastParagraph = p;
        break;
      }
    }

    if (foundNarrativeIndex !== -1 && foundNarrativeIndex < paragraphs.length - 1) {
      const severedParas = paragraphs.splice(foundNarrativeIndex + 1);
      for (const sp of severedParas) {
        extraBackWords += sp.split(/\s+/).filter(Boolean).length;
        extraBackText = (extraBackText ? extraBackText + '\n\n' : '') + sp;
      }
    }
  }

  if (!lastParagraph && paragraphs.length > 0) {
    lastParagraph = paragraphs[paragraphs.length - 1];
  }

  // Purgar marcas de agua pegadas al final de la última oración del último párrafo
  if (lastParagraph) {
    lastParagraph = lastParagraph.replace(/(?<=[.!?»”"']\s+)(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|h+[t\s]+[t\s]+[p\s]+|FIN\s+g\s*r\s*a\s*t\s*i\s*s|FIN\s+gratis|gratis\s*en|descargado\s+en|visita\s+nuestro\s+blog|www\.|b+l+o+g+s+p+o+t)[\s\S]*$/i, '').trim();
  }

  // Verificación adicional de pureza en el último párrafo:
  // Si el último párrafo contiene una mención de licencia, aviso de descarga digital o canal telegram pegado al final
  let editorialBreakDetected: string | undefined = undefined;
  if (lastParagraph) {
    const inlineCheck = lastParagraph.match(/(?:\b|(?<=[.!?»”"']|\.))(?:[-–—\s]*)(?:\*{3,5}\s*END OF TH(?:E|IS) PROJECT GUTENBERG|End of (?:the )?Project Gutenberg|Creating the works from public domain|Produced by .*?(?:Distributed Proofreading|pgdp\.net)|This\s+file\s+was\b|This\s+file\s+is\b|This\s+file\s+should\s+be\s+named\b|Downloaded\s+from\b|Descargado\s+en\b|Descargado\s+de\b|Generated\s+by\b|Created\s+by\b|(?:z-lib|1lib|telegram|go-to-library)\b)/i);
    if (inlineCheck && inlineCheck.index !== undefined && inlineCheck.index > 15) {
      editorialBreakDetected = inlineCheck[0];
      const severed = lastParagraph.substring(inlineCheck.index).trim();
      lastParagraph = lastParagraph.substring(0, inlineCheck.index).trim();
      extraBackWords += severed.split(/\s+/).filter(Boolean).length;
      extraBackText = severed + (extraBackText ? '\n' + extraBackText : '');
      if (paragraphs.length > 0) {
        paragraphs[paragraphs.length - 1] = lastParagraph;
      }
    }
  }

  const detectedChapters = detectNovelChapters(paragraphs);
  const finalChapters = detectedChapters.length > 0 ? detectedChapters : zones.chapters;
  const detectedLanguage = detectTextLanguage(rawText);
  const totalWords = workingText.split(/\s+/).filter(Boolean).length;
  const firstSnippet = firstParagraph.length > 250 ? firstParagraph.slice(0, 250) + '...' : firstParagraph;
  const lastSnippet = lastParagraph.length > 250 ? '...' + lastParagraph.slice(-250) : lastParagraph;

  const combinedBackMatterText = (backMatter.text + (extraBackText ? '\n' + extraBackText : '')).trim();
  const combinedBackMatterWords = backMatter.wordCount + extraBackWords;
  const hasBackMatterRemoved = backMatter.hasBackMatter || Boolean(editorialBreakDetected) || extraBackWords > 0;

  const pageStructureResult = deduceBookPageStructure(rawText, firstParagraph, lastParagraph, providedPages);

  return {
      hasCleanStart: firstParagraph.length > 25 || (hasPreface && paragraphs.length === 0),
      hasCleanEnd: lastParagraph.length > 25 || (hasPreface && paragraphs.length === 0),
      isCleanNovelBody: (firstParagraph.length > 25 && lastParagraph.length > 25 && !editorialBreakDetected) || (hasPreface && paragraphs.length === 0),
      frontMatterRemoved,
      backMatterRemoved: hasBackMatterRemoved,
      frontMatterTitle,
      backMatterTitle: backMatter.hasBackMatter ? backMatter.title : extraBackWords > 0 ? 'Aviso y Anotaciones Finales' : undefined,
      firstParagraph,
      lastParagraph,
      firstParagraphWords: firstParagraph ? firstParagraph.split(/\s+/).filter(Boolean).length : 0,
      lastParagraphWords: lastParagraph ? lastParagraph.split(/\s+/).filter(Boolean).length : 0,
      totalParagraphs: paragraphs.length,
      totalWords,
      totalChars: workingText.length,
      pureBodyText: paragraphs.join('\n\n'),
      backMatterText: combinedBackMatterText,
      backMatterWords: combinedBackMatterWords,
      firstParagraphSnippet: firstSnippet,
      lastParagraphSnippet: lastSnippet,
      editorialBreakDetected: editorialBreakDetected || backMatter.title,
      editorialBreakSnippet: editorialBreakDetected,
      hasPreface,
      prefaceTitle,
      prefaceText,
      prefaceWords,
      prefaceParagraphs,
      downloadNoticeRemoved,
      downloadNoticeSnippet,
      detectedChapters: finalChapters,
      chaptersCount: finalChapters.length,
      zones,
      detectedLanguage,
      pageStructure: pageStructureResult,
      continuityVerified: Boolean(pageStructureResult?.posteriorContinuity?.isContinuityVerified || paragraphs.length > 5)
    };
}

/**
 * Función de entrada maestra para el Paso 1: Realiza el análisis completo de páginas,
 * palabras, párrafos, zonas preliminares y continuidad narrativa posterior de cualquier PDF u obra.
 */
export function analyzeBookPdfAndPageFlow(
  rawText: string,
  pages?: { pageNumber: number; text: string }[],
  candidateTitle?: string,
  candidateAuthor?: string
): BookEndpointInspection {
  return inspectBookEndpointsAndPureBody(
    rawText,
    candidateTitle,
    candidateAuthor,
    undefined,
    undefined,
    pages
  );
}

/**
 * Limpia cabeceras de Project Gutenberg y extrae metadatos de las mismas
 * (e.g. "*** START OF THE PROJECT GUTENBERG EBOOK ... ***")
 */
export function cleanGutenbergHeaderAndExtractMetadata(text: string): {
  cleanedText: string;
  extractedTitle?: string;
  extractedAuthor?: string;
  hasGutenbergHeader: boolean;
} {
  if (!text) return { cleanedText: '', hasGutenbergHeader: false };

  const gutenbergStartRegex = /(?:\*{3}\s*START OF TH(?:E|IS) PROJECT GUTENBERG EBOOK[^\n]*\*{3})/i;
  const match = text.match(gutenbergStartRegex);

  if (match && match.index !== undefined) {
    const headerPart = text.substring(0, match.index);
    const bodyPart = text.substring(match.index + match[0].length).trim();

    let extractedTitle: string | undefined;
    let extractedAuthor: string | undefined;

    const titleMatch = headerPart.match(/Title:\s*([^\r\n]+)/i);
    if (titleMatch) extractedTitle = titleMatch[1].trim();

    const authorMatch = headerPart.match(/Author:\s*([^\r\n]+)/i);
    if (authorMatch) extractedAuthor = authorMatch[1].trim();

    return {
      cleanedText: bodyPart,
      extractedTitle,
      extractedAuthor,
      hasGutenbergHeader: true
    };
  }

  return {
    cleanedText: text,
    hasGutenbergHeader: false
  };
}

export interface BookZones {
  frontMatter: {
    title?: string;
    author?: string;
    subtitle?: string;
    downloadNotice?: string;
    editorialNotice?: string;
    dedication?: string;
    epigraph?: string;
    tableOfContents?: string;
    hasFrontMatter: boolean;
    rawText?: string;
  };
  preliminaryMatter: {
    hasPreliminary: boolean;
    title: string;
    text: string;
    wordCount: number;
    paragraphsCount: number;
    authorOrSignature?: string;
  };
  footnotes: FootnoteItem[];
  novelBody: string;
  novelParagraphs: string[];
  chapters: DetectedChapterItem[];
  backMatter: {
    hasBackMatter: boolean;
    title: string;
    text: string;
    wordCount: number;
    type: BackMatterExtractionResult['backMatterType'];
  };
  pageStructure?: BookPageStructure;
  continuityVerified?: boolean;
}

/**
 * Descompone una obra literaria en sus 5 bloques canónicos editoriales:
 * 1. Portada / Portadilla (Front Matter y avisos de descarga/biblioteca)
 * 2. Introducción / Prólogo / Prefacio (Preliminary Matter)
 * 3. Pies o descripciones de página / Notas al pie (Footnotes)
 * 4. Contenido del libro - Novela (Main Novel Body)
 * 5. Contenido Posterior (Back Matter: Epílogo, Bibliografía, Licencias Gutenberg, Colofón)
 */
export function disentangleBookZones(
  rawText: string,
  knownTitle?: string,
  knownAuthor?: string,
  canonicalProfile?: Partial<CanonicalWorkProfile>,
  counterpartAnchor?: { startSnippet?: string; endSnippet?: string }
): BookZones {
  // Pre-procesamiento exhaustivo: desdoblar encabezados fusionados de OCR, purgar artefactos [1]/[sic] y normalizar tipografía
  let workingText = unfoldFusedChapterAndPrologueHeaders(rawText || '');
  workingText = cleanInlineFootnoteReferencesAndScholarlyArtifacts(workingText);
  workingText = normalizeTypographicText(workingText);

  const resolvedCanonical = canonicalProfile || lookupCanonicalWorkLocally(knownTitle, knownAuthor, workingText) || undefined;

  // 1. Limpieza de avisos iniciales (aliceandbooks, Bienvenido al mágico mundo..., etc.)
  const boiler = cleanOpeningBoilerplates(workingText);
  workingText = boiler.cleanedText;

  // 2. Limpieza de Cabecera Gutenberg si existe
  const gutenbergHeader = cleanGutenbergHeaderAndExtractMetadata(workingText);
  workingText = gutenbergHeader.cleanedText;

  const resolvedTitle = knownTitle || gutenbergHeader.extractedTitle || resolvedCanonical?.title;
  const resolvedAuthor = knownAuthor || gutenbergHeader.extractedAuthor || resolvedCanonical?.author;

  // 2b. Aislamiento prioritario de la Tabla de Contenidos / Índice para no contaminar búsqueda de capítulos ni epílogos
  const tocResult = stripTableOfContents(workingText);
  workingText = tocResult.cleanedText;

  // 3. Aislamiento de Contenido Posterior (Back Matter / Licencia Gutenberg / Epílogo / Bibliografía)
  const backMatterResult = detectAndSeparateBackMatter(workingText);
  workingText = backMatterResult.novelBodyText;

  // 3b. Si conocemos la frase final canónica de la obra (del perfil canónico verificado o detectado por IA):
  const endingCandidates: string[] = [];
  if (resolvedCanonical?.endingSentenceOriginal) endingCandidates.push(resolvedCanonical.endingSentenceOriginal);
  if (resolvedCanonical?.endingSentenceTranslated) endingCandidates.push(resolvedCanonical.endingSentenceTranslated);
  if (resolvedCanonical?.endingCandidates && Array.isArray(resolvedCanonical.endingCandidates)) {
    endingCandidates.push(...resolvedCanonical.endingCandidates);
  }
  if (counterpartAnchor?.endSnippet) {
    endingCandidates.push(counterpartAnchor.endSnippet);
  }

  for (const endPhrase of endingCandidates) {
    if (!endPhrase || endPhrase.trim().length < 8) continue;
    const endRegex = buildFlexibleSentenceRegex(endPhrase.trim(), true);
    const globalEndRx = new RegExp(endRegex.source, 'gi');
    let m: RegExpExecArray | null;
    let endMatch: RegExpExecArray | null = null;
    // La frase de desenlace de la historia debe situarse estrictamente en el tramo terminal de la obra (>= 85%)
    const minIndex = Math.floor(workingText.length * 0.85);
    let safetyEnd = 0;
    while ((m = globalEndRx.exec(workingText)) !== null && safetyEnd++ < 100) {
      if (m[0].length === 0) {
        globalEndRx.lastIndex++;
        continue;
      }
      if (m.index >= minIndex) {
        endMatch = m;
      }
    }
    if (endMatch && endMatch.index !== undefined) {
      // Encontrar el final del párrafo completo donde concluye el desenlace narrativo
      const afterMatch = workingText.slice(endMatch.index);
      const paraBreakMatch = afterMatch.match(/\n\s*\n/);
      const endOffset = paraBreakMatch && paraBreakMatch.index !== undefined 
        ? paraBreakMatch.index 
        : afterMatch.length;
      
      const exactCut = endMatch.index + endOffset;
      const extraBack = workingText.slice(exactCut).trim();
      
      if (extraBack.length > 5) {
        workingText = workingText.slice(0, exactCut).trim();
        if (!backMatterResult.hasBackMatter) {
          backMatterResult.hasBackMatter = true;
          backMatterResult.backMatterTitle = resolvedCanonical?.backMatterTitle || 'Aparato Crítico / Apéndice Posterior';
          backMatterResult.backMatterType = 'appendix';
          backMatterResult.backMatterText = extraBack;
          backMatterResult.backMatterWordCount = extraBack.split(/\s+/).filter(Boolean).length;
        } else {
          backMatterResult.backMatterText = extraBack + '\n\n' + backMatterResult.backMatterText;
          backMatterResult.backMatterWordCount += extraBack.split(/\s+/).filter(Boolean).length;
        }
      }
      break;
    }
  }

  // 3b-2. Purgar cualquier sufijo parásito de watermark o blog pegado a la última frase de la historia
  const trailingWatermarkMatch = workingText.match(/(?<=[.!?»”"']\s+)(?:M\s*á\s*s\s*l\s*i\s*b\s*r\s*o\s*s|gratis\s*en|free\s*at|FIN\s+gratis|FIN\s+g\s*r\s*a\s*t\s*i\s*s|h+[t\s]+[t\s]+[p\s]+|b+l+o+g+s+p+o+t|l+i+b+r+i+c+u+l+t+u+r+a|d+i+g+b+i+b|www\.[a-z0-9-]+|Visita\s+(?:nuestro\s+)?blog|Descarga\s+m[aá]s\s+libros)[\s\S]*$/i);
  if (trailingWatermarkMatch && trailingWatermarkMatch.index !== undefined && trailingWatermarkMatch.index >= Math.floor(workingText.length * 0.80)) {
    const watermarkText = workingText.slice(trailingWatermarkMatch.index).trim();
    workingText = workingText.slice(0, trailingWatermarkMatch.index).trim();
    if (!backMatterResult.hasBackMatter) {
      backMatterResult.hasBackMatter = true;
      backMatterResult.backMatterTitle = 'Avisos Web y Enlaces de Descarga';
      backMatterResult.backMatterType = 'other';
      backMatterResult.backMatterText = watermarkText;
      backMatterResult.backMatterWordCount = watermarkText.split(/\s+/).filter(Boolean).length;
    } else {
      backMatterResult.backMatterText = watermarkText + '\n\n' + backMatterResult.backMatterText;
      backMatterResult.backMatterWordCount += watermarkText.split(/\s+/).filter(Boolean).length;
    }
  }

  // 3c. Si el libro no tiene índice ni títulos finales, escanear semánticamente los últimos 200 párrafos con el anclaje de cierre
  if (counterpartAnchor?.endSnippet) {
    const endScan = scanMultiPageWindowForSemanticNarrativeStartAndEnd(workingText, undefined, counterpartAnchor.endSnippet, resolvedCanonical);
    if (endScan.narrativeEndIndex > 0 && endScan.narrativeEndIndex < workingText.length - 30) {
      const extraBack = workingText.slice(endScan.narrativeEndIndex).trim();
      // Salvaguarda: Si el remanente posterior contiene capítulos narrativos (ej. Capítulos posteriores),
      // no es material posterior, sino que la novela continúa.
      const hasSubsequentChapters = /(?:###\s*)?(?:CAP[IÍ]TULO|CHAP(?:TER|\.)?|KAPITEL|CHAPITRE)\s+[0-9IVXLCDM]+/i.test(extraBack);
      if (!hasSubsequentChapters) {
        workingText = workingText.slice(0, endScan.narrativeEndIndex).trim();
        if (!backMatterResult.hasBackMatter) {
          backMatterResult.hasBackMatter = true;
          backMatterResult.backMatterTitle = resolvedCanonical?.backMatterTitle || 'Aparato Crítico / Apéndice Posterior';
          backMatterResult.backMatterType = 'appendix';
          backMatterResult.backMatterText = extraBack;
          backMatterResult.backMatterWordCount = extraBack.split(/\s+/).filter(Boolean).length;
        } else {
          backMatterResult.backMatterText = extraBack + '\n\n' + backMatterResult.backMatterText;
          backMatterResult.backMatterWordCount += extraBack.split(/\s+/).filter(Boolean).length;
        }
      }
    }
  }

  // 4. Aislamiento de Notas al pie / Aparato crítico
  const footnoteResult = isolateFootnotesFromText(workingText);
  workingText = footnoteResult.cleanedText;

  // 5. Aislamiento de Prólogo / Introducción / Prefacio
  const prologueAnalysis = analyzeNovelPrologueAndStart(workingText, resolvedCanonical, counterpartAnchor?.startSnippet);
  let preliminaryMatter: BookZones['preliminaryMatter'] = {
    hasPreliminary: false,
    title: '',
    text: '',
    wordCount: 0,
    paragraphsCount: 0
  };

  const preNovelCut = prologueAnalysis.startIndex > 0 ? prologueAnalysis.startIndex : 0;
  const preNovelText = workingText.substring(0, preNovelCut).trim();
  let novelMainBody = workingText.substring(preNovelCut).trim();

  let frontMatterRawText = preNovelText;
  let frontMatterResult: FrontMatterExtraction;

  if (prologueAnalysis.hasPrologue) {
    const preliminaryText = prologueAnalysis.prologueText;
    const pParas = preliminaryText.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    preliminaryMatter = {
      hasPreliminary: true,
      title: prologueAnalysis.prologueTitle || resolvedCanonical?.preliminaryStudyTitle || 'Prefacio / Estudio Introductorio',
      text: preliminaryText,
      wordCount: prologueAnalysis.prologueWordCount || preliminaryText.split(/\s+/).filter(Boolean).length,
      paragraphsCount: pParas.length
    };

    // Lo que preceda a la cabecera de prólogo es el Front Matter real
    const prologueHeadMatch = workingText.match(/(?:^|\n\s*)(?:#+\s*)?(?:PREFACE|PR[OÓ]LOGO|PREFACIO|ESTUDIO\s+PRELIMINAR|INTRODUCCI[OÓ]N|INTRODUCTION|FOREWORD|VORWORT|EINLEITUNG|AVANT-PROPOS|PRÉFACE|PREFAZIONE|PROLOGUE|PROLOGO|TRANSLATOR'S\s+NOTE|EDITOR'S\s+NOTE)\b[^\n]*/i);
    if (prologueHeadMatch && prologueHeadMatch.index !== undefined && prologueHeadMatch.index > 0) {
      frontMatterRawText = workingText.substring(0, prologueHeadMatch.index).trim();
    } else {
      frontMatterRawText = preNovelText;
    }
    frontMatterResult = disentangleOpeningFrontMatter(frontMatterRawText || preNovelText, resolvedTitle, resolvedAuthor);
    workingText = novelMainBody;
  } else {
    // Si no hubo prólogo previo, desentrañar la portadilla, créditos y dedicatoria directamente del inicio
    frontMatterResult = disentangleOpeningFrontMatter(workingText, resolvedTitle, resolvedAuthor);
    workingText = frontMatterResult.cleanedText;
  }

  // 6b. Limpieza residual del último párrafo si tiene fusionado aviso de descarga web estrictamente al FINAL de la obra
  const minTrailingSearch = Math.max(0, workingText.length - 3000);
  const trailingSlice = workingText.slice(minTrailingSearch);
  const trailingNotice = trailingSlice.match(/(?:\b|(?<=[.!?»”"']|\.))(?:[-–—\s]*)(?:(?:This\s+file\s+was\b|This\s+file\s+is\b|This\s+file\s+should\s+be\s+named\b|Downloaded\s+from\b|Descargado\s+en\b|Descargado\s+de\b|Generated\s+by\b|Created\s+by\b|Uploaded\s+by\b|Official\s+Telegram\s+channel\b|Canal\s+oficial\s+de\s+Telegram\b|Telegram\s+channel\b|go-to-library\b|z-library\b|z-lib\b)|(?:z-lib(?:rary)?|1lib|epublibre|aliceandbooks|feedbooks|b-ok|bookfi|libgen)\.[a-z]{2,4}\b).*$/is);

  if (trailingNotice && trailingNotice.index !== undefined) {
    const realCutPos = minTrailingSearch + trailingNotice.index;
    const trailingText = workingText.substring(realCutPos).trim();
    // Solo cortar si el remanente posterior no supera el 10% del libro
    if (trailingText.length < workingText.length * 0.10) {
      workingText = workingText.substring(0, realCutPos).trim();
      if (!backMatterResult.hasBackMatter) {
        backMatterResult.hasBackMatter = true;
        backMatterResult.backMatterTitle = 'Aviso de Descarga Digital';
        backMatterResult.backMatterText = trailingText;
        backMatterResult.backMatterWordCount = trailingText.split(/\s+/).filter(Boolean).length;
      } else {
        backMatterResult.backMatterText = trailingText + '\n' + backMatterResult.backMatterText;
        backMatterResult.backMatterWordCount += trailingText.split(/\s+/).filter(Boolean).length;
      }
    }
  }

  // Purgar marcas de página residuales y soldar guiones partidos en el cuerpo principal
  workingText = workingText.replace(/[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA(?:\s+DERECHA|\s+IZQUIERDA)?)[^\]]*\]\s*[-–—\s]*/gi, '\n\n');
  workingText = workingText.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*\n+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/g, '$1$2');

  const initialParagraphs = workingText
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  const novelParagraphs: string[] = [];
  const chapterLinePattern = /^(?:[_\-*•\s]*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+(?:[0-9IVXLCDM]+|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|first\b|second\b|third\b|primero\b|segundo\b|uno\b|primer\b|erstes\b|premier\b)\.?|[IVXLCDM]{1,6}\.?)(?:\s*[-–—:.]\s*[^\n]*)?(?:[_\-*•\s]*)$/i;
  const fusedChapterPattern = /^((?:#+\s*)?(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|l\s*ibro|b\s*ook)\s+(?:[0-9IVXLCDM]+|one\b|two\b|three\b|four\b|five\b|six\b|seven\b|eight\b|nine\b|ten\b|eleven\b|twelve\b|first\b|second\b|third\b|primero\b|segundo\b|uno\b|primer\b|erstes\b|premier\b)\.?|[IVXLCDM]{1,6}\.)\s+([A-ZÁÉÍÓÚÑ"“«].+)$/i;

  for (const p of initialParagraphs) {
    const lines = p.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1 && chapterLinePattern.test(lines[0])) {
      novelParagraphs.push(lines[0]);
      novelParagraphs.push(lines.slice(1).join('\n'));
    } else {
      const fusedMatch = p.match(fusedChapterPattern);
      if (fusedMatch) {
        novelParagraphs.push(fusedMatch[1].trim());
        novelParagraphs.push(fusedMatch[2].trim());
      } else {
        novelParagraphs.push(p);
      }
    }
  }

  const chapters = detectNovelChapters(novelParagraphs);

  return {
    frontMatter: {
      title: frontMatterResult.title || resolvedTitle,
      author: frontMatterResult.author || resolvedAuthor,
      subtitle: frontMatterResult.subtitle,
      downloadNotice: boiler.hasBoilerplate ? boiler.removedBoilerplates.join(' | ') : undefined,
      editorialNotice: frontMatterResult.legalNotice,
      dedication: frontMatterResult.dedication,
      epigraph: frontMatterResult.epigraph,
      hasFrontMatter: frontMatterResult.hasExtractedHeader || gutenbergHeader.hasGutenbergHeader || boiler.hasBoilerplate || tocResult.hasToc,
      rawText: boiler.removedBoilerplates.join('\n'),
      tableOfContents: tocResult.hasToc ? tocResult.tableOfContents : undefined
    },
    preliminaryMatter,
    footnotes: footnoteResult.extractedFootnotes,
    novelBody: workingText.trim(),
    novelParagraphs,
    chapters,
    backMatter: {
      hasBackMatter: backMatterResult.hasBackMatter,
      title: backMatterResult.backMatterTitle,
      text: backMatterResult.backMatterText,
      wordCount: backMatterResult.backMatterWordCount,
      type: backMatterResult.backMatterType
    },
    pageStructure: deduceBookPageStructure(rawText, novelParagraphs[0], novelParagraphs[novelParagraphs.length - 1]),
    continuityVerified: novelParagraphs.length > 5
  };
}

/**
 * Localiza con máxima precisión la posición de inicio y fin de una frase o selección dentro de un texto completo,
 * soportando saltos de línea, espacios múltiples, guiones OCR y signos de puntuación.
 * Para límites de final de obra, localiza exactamente dónde concluye la frase (incluyendo puntuación contigua)
 * para posibilitar el corte retroactivo estricto (descartando todo lo posterior).
 */
export function findPhrasePositionInText(
  fullText: string,
  phrase: string,
  searchFromEnd: boolean = false,
  preferredOffset?: number
): { start: number; end: number; matchedText: string } | null {
  if (!fullText || !phrase || !phrase.trim()) return null;

  const cleanP = phrase.trim();
  const lowerFull = fullText.toLowerCase();
  const lowerP = cleanP.toLowerCase();

  // 1. Si se especificó un offset preferido (ej. basado en la página del usuario), recopilar todas las apariciones
  if (preferredOffset !== undefined && preferredOffset >= 0) {
    const candidateMatches: Array<{ start: number; end: number; matchedText: string }> = [];
    let searchPos = 0;
    let safetyA = 0;
    while ((searchPos = lowerFull.indexOf(lowerP, searchPos)) !== -1 && safetyA++ < 500) {
      let endPos = searchPos + cleanP.length;
      let puncSafety = 0;
      while (endPos < fullText.length && /[.!?"»”')\]]/.test(fullText[endPos]) && puncSafety++ < 20) {
        endPos++;
      }
      candidateMatches.push({
        start: searchPos,
        end: endPos,
        matchedText: fullText.slice(searchPos, endPos)
      });
      searchPos += Math.max(1, cleanP.length);
    }

    if (candidateMatches.length > 0) {
      // Elegir la coincidencia más cercana a preferredOffset
      candidateMatches.sort((a, b) => Math.abs(a.start - preferredOffset) - Math.abs(b.start - preferredOffset));
      return candidateMatches[0];
    }
  }

  // 1b. Búsqueda exacta directa estándar
  const directIdx = searchFromEnd ? lowerFull.lastIndexOf(lowerP) : lowerFull.indexOf(lowerP);
  if (directIdx !== -1) {
    let endPos = directIdx + cleanP.length;
    let puncSafety = 0;
    while (endPos < fullText.length && /[.!?"»”')\]]/.test(fullText[endPos]) && puncSafety++ < 20) {
      endPos++;
    }
    return {
      start: directIdx,
      end: endPos,
      matchedText: fullText.slice(directIdx, endPos)
    };
  }

  // 2. Búsqueda flexible por secuencia de palabras (ignora diferencias de saltos de línea / espacios / OCR)
  const words = cleanP.split(/\s+/).map(w => w.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑäöüßÄÖÜ]/g, '')).filter(w => w.length >= 2);
  if (words.length === 0) return null;

  try {
    // Limitar a máximo 8 palabras clave para evitar expresiones regulares gigantescas y ReDoS
    const keyWords = words.length > 8 ? words.slice(0, 8) : words;
    const patternStr = keyWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\W_]+');
    const regex = new RegExp(patternStr, 'gi');
    let match: RegExpExecArray | null;
    const regexMatches: Array<{ start: number; end: number; matchedText: string }> = [];
    let safetyB = 0;

    while ((match = regex.exec(fullText)) !== null && safetyB++ < 200) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      let endPos = match.index + match[0].length;
      let puncSafety = 0;
      while (endPos < fullText.length && /[.!?"»”')\]]/.test(fullText[endPos]) && puncSafety++ < 20) {
        endPos++;
      }
      regexMatches.push({
        start: match.index,
        end: endPos,
        matchedText: fullText.slice(match.index, endPos)
      });
      if (!searchFromEnd && preferredOffset === undefined) break;
    }

    if (regexMatches.length > 0) {
      if (preferredOffset !== undefined) {
        regexMatches.sort((a, b) => Math.abs(a.start - preferredOffset) - Math.abs(b.start - preferredOffset));
        return regexMatches[0];
      }
      return searchFromEnd ? regexMatches[regexMatches.length - 1] : regexMatches[0];
    }
  } catch (e) {
    console.warn('Regex error in findPhrasePositionInText:', e);
  }

  return null;
}

// =========================================================================
// GESTOR AVANZADO DE ÍNDICE (TOC) Y SEGMENTACIÓN PARALELA DE PÁRRAFOS
// =========================================================================

export interface ExtractedTocChapter {
  index: number;
  label: string;
  title: string;
  pageOrMarker?: string;
  rawLine: string;
  type?: 'preliminary' | 'chapter' | 'back_matter';
}

export interface DetectedTableOfContentsInfo {
  hasToc: boolean;
  position: 'start' | 'end' | 'middle' | 'none';
  tocTitle: string;
  rawTocText: string;
  chapters: ExtractedTocChapter[];
  startIndex: number;
  endIndex: number;
  cleanedTextWithoutToc: string;
}

export interface LocatedChapterInBody {
  chapterIndex: number;
  title: string;
  foundInBody: boolean;
  charPosition: number;
  snippet: string;
}

export interface ParallelInitialPhraseSegment {
  index: number;
  phraseA: string;
  phraseB: string;
  snippetA: string;
  snippetB: string;
  charCountA: number;
  charCountB: number;
  ratio: number;
  isBalanced: boolean;
  status: 'mirror_match' | 'length_variance' | 'asymmetry' | 'offset_detected';
  note?: string;
  offsetDetails?: {
    suggestedParaB?: number;
    suggestedParaA?: number;
    reason?: string;
  };
}

/**
 * Parsea líneas de texto de un índice (TOC) para extraer números y títulos de capítulos.
 */
export function parseManualTableOfContents(rawToc: string): ExtractedTocChapter[] {
  if (!rawToc || !rawToc.trim()) return [];

  const lines = rawToc
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const chapters: ExtractedTocChapter[] = [];
  let autoIndex = 1;

  for (const line of lines) {
    // Ignorar encabezados del propio índice (ej. "Índice General", "Contents")
    if (/^(?:#+\s*)?(?:[IÍ]ndice(?:\s+General)?|Tabla\s+de\s+Contenidos?|Contenido|Table\s+of\s+Contents|Contents|Inhaltsverzeichnis|Sommaire|Table\s+des\s+matières)\b/i.test(line)) {
      continue;
    }

    // Extraer número de página al final si existe (ej. ".... 24" o "— 105" o "   12")
    const pageMatch = line.match(/(?:[.·…\-_–—\s]{2,}|\t)\s*(\d{1,4})$/);
    const pageOrMarker = pageMatch ? pageMatch[1] : undefined;
    const cleanLine = pageMatch ? line.slice(0, pageMatch.index).trim() : line;

    // Detectar si la línea indica número de capítulo (romano, arábigo o palabra)
    const chapMatch = cleanLine.match(/^(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|p\s*arte|p\s*art|t\s*eil|l\s*ibro|b\s*ook)\s+([0-9IVXLCDM]+|[a-záéíóúñ]+)|([IVXLCDM]{1,6})\b\.?|(\d{1,3})\b\.?)(?:\s*[-–—:.]\s*(.*))?$/i);

    let index = autoIndex;
    let label = `Capítulo ${autoIndex}`;
    let title = cleanLine;

    const romanToNumber = (r: string): number | null => {
      const map: Record<string, number> = {
        i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
        xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
        xxi: 21, xxii: 22, xxiii: 23, xxiv: 24, xxv: 25, xxvi: 26, xxvii: 27, xxviii: 28, xxix: 29, xxx: 30,
        xxxi: 31, xxxii: 32, xxxiii: 33, xxxiv: 34, xxxv: 35, xxxvi: 36, xxxvii: 37, xxxviii: 38, xxxix: 39, xl: 40,
        xli: 41, xlii: 42, xliii: 43, xliv: 44, xlv: 45, xlvi: 46, xlvii: 47, xlviii: 48, xlix: 49, l: 50
      };
      return map[r.toLowerCase()] || null;
    };

    const wordToNumber = (w: string): number | null => {
      const map: Record<string, number> = {
        uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
        once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, dieciséis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
        primero: 1, primer: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercer: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5,
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
        first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
        ein: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, funf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
        erste: 1, erster: 1, erstes: 1, zweite: 2, zweiter: 2, zweites: 2, dritte: 3, dritter: 3, drittes: 3
      };
      return map[w.toLowerCase().trim()] || null;
    };

    if (chapMatch) {
      const numStr = (chapMatch[1] || chapMatch[2] || chapMatch[3] || '').trim();
      const restTitle = (chapMatch[4] || '').trim();
      
      const parsedNum = parseInt(numStr, 10);
      const parsedRom = romanToNumber(numStr);
      const parsedWord = wordToNumber(numStr);
      if (!isNaN(parsedNum)) {
        index = parsedNum;
      } else if (parsedRom !== null) {
        index = parsedRom;
      } else if (parsedWord !== null) {
        index = parsedWord;
      }
      label = cleanLine.split(/[-–—:.]/)[0].trim();
      title = restTitle || cleanLine;
    } else {
      // Comprobar si la línea es simplemente un número romano, arábigo o palabra
      const isJustRom = romanToNumber(cleanLine.replace(/\.$/, ''));
      const isJustNum = parseInt(cleanLine.replace(/\.$/, ''), 10);
      const isJustWord = wordToNumber(cleanLine.replace(/\.$/, ''));
      if (isJustRom !== null) {
        index = isJustRom;
        label = cleanLine;
        title = cleanLine;
      } else if (isJustWord !== null) {
        index = isJustWord;
        label = cleanLine;
        title = cleanLine;
      } else if (!isNaN(isJustNum) && isJustNum > 0 && isJustNum <= 150) {
        index = isJustNum;
        label = cleanLine;
        title = cleanLine;
      }
    }

    const isPrelim = /^(?:pr[óo]logo|prologue|prefacio|preface|introducci[óo]n|introduction|agradecimientos?|acknowledgements?|dedicatoria|dedication|advertencia|foreword)\b/i.test(cleanLine);
    const isBack = /^(?:ep[íi]logo|epilogue|bibliograf[íi]a|bibliography|notas?|notes?|ap[ée]ndice|appendix|colof[óo]n|colophon|afterword|glosario|glossary)\b/i.test(cleanLine);
    const itemType: 'preliminary' | 'chapter' | 'back_matter' = isPrelim ? 'preliminary' : (isBack ? 'back_matter' : 'chapter');

    chapters.push({
      index,
      label,
      title: title || label,
      pageOrMarker,
      rawLine: line,
      type: itemType
    });

    if (itemType === 'chapter') {
      autoIndex++;
    }
  }

  return chapters;
}

/**
 * Detecta si el libro contiene una estructura de índice (TOC),
 * ya sea al INICIO (antes del cuerpo) o al FINAL (después del desenlace).
 */
export function detectTableOfContentsInBook(text: string): DetectedTableOfContentsInfo {
  if (!text || text.trim().length === 0) {
    return {
      hasToc: false,
      position: 'none',
      tocTitle: '',
      rawTocText: '',
      chapters: [],
      startIndex: -1,
      endIndex: -1,
      cleanedTextWithoutToc: text
    };
  }

  const tocHeadingRegex = /(?:^|\n\s*)(?:[_\-*•#\s]*)(?:[IÍ]NDICE(?:\s+GENERAL|\s+DE\s+CAP[IÍ]TULOS|\s+DE\s+MATERIAS)?|TABLA\s+DE\s+CONTENIDOS?|CONTENIDO|TABLE\s+OF\s+CONTENTS|CONTENTS|SUMARIO|INHALTSVERZEICHNIS|INHALT|SOMMAIRE|TABLE\s+DES\s+MATI[ÈE]RES|TAVOLA\s+DEI\s+CONTENUTI)\b[^\n]*/gi;

  let match: RegExpExecArray | null;
  const candidates: { start: number; title: string; headingLine: string }[] = [];
  let safetyToc = 0;
  while ((match = tocHeadingRegex.exec(text)) !== null && safetyToc++ < 100) {
    if (match[0].length === 0) {
      tocHeadingRegex.lastIndex++;
      continue;
    }
    candidates.push({
      start: match.index,
      title: match[0].trim().replace(/^#+\s*/, ''),
      headingLine: match[0]
    });
  }

  // Fallback 1: Escaneo en la apertura del libro para listas de capítulos sin palabra clave formal
  if (candidates.length === 0) {
    const openingSlice = text.slice(0, Math.min(text.length * 0.40, 35000));
    const lines = openingSlice.split(/\r?\n/);
    let runStartIdx = -1;
    let runCharPos = 0;
    let runCount = 0;
    let curCharPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineLen = lines[i].length + 1; // + \n

      const isTocStyleEntry = line.length < 90 && (
        /(?:\.{2,}|\s{3,}|…|\t)\s*\d+$/.test(line) ||
        /^(?:[IVXLCDM]{1,6}|[0-9]{1,3})[\.\s\-–—:]\s+[A-ZÁÉÍÓÚÄÖÜ]/i.test(line) ||
        /^(?:Cap[ií]tulo|Chapter|Kapitel|Libro|Parte)\s+(?:[0-9]{1,3}|[IVXLCDM]+|[a-záéíóú]+)\b/i.test(line) ||
        /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\.?\s*$/i.test(line) ||
        /^(?:uno|dos|tres|cuatro|cinco|one|two|three|four)\b/i.test(line)
      );

      if (isTocStyleEntry) {
        if (runStartIdx === -1) {
          runStartIdx = i;
          runCharPos = curCharPos;
        }
        runCount++;
      } else if (line.length > 0) {
        if (runCount >= 2) {
          break;
        }
        runStartIdx = -1;
        runCount = 0;
      }

      curCharPos += lineLen;
    }

    if (runCount >= 2 && runStartIdx !== -1) {
      candidates.push({
        start: runCharPos,
        title: 'Índice de Capítulos (Apertura)',
        headingLine: lines[runStartIdx].trim()
      });
    }
  }

  // Fallback 2: Escaneo en el colofón / cierre del libro (típico en ediciones en español con índice al final)
  if (candidates.length === 0 && text.length > 5000) {
    const endStartOffset = Math.max(0, text.length - 35000);
    const endingSlice = text.slice(endStartOffset);
    const lines = endingSlice.split(/\r?\n/);
    let runStartIdx = -1;
    let runCharPos = 0;
    let runCount = 0;
    let curCharPos = endStartOffset;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineLen = lines[i].length + 1;

      const isTocStyleEntry = line.length < 90 && (
        /(?:\.{2,}|\s{3,}|…|\t)\s*\d+$/.test(line) ||
        /^(?:[IVXLCDM]{1,6}|[0-9]{1,3})[\.\s\-–—:]\s+[A-ZÁÉÍÓÚÄÖÜ]/i.test(line) ||
        /^(?:Cap[ií]tulo|Chapter|Kapitel|Libro|Parte)\s+(?:[0-9]{1,3}|[IVXLCDM]+|[a-záéíóú]+)\b/i.test(line) ||
        /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\.?\s*$/i.test(line)
      );

      if (isTocStyleEntry) {
        if (runStartIdx === -1) {
          runStartIdx = i;
          runCharPos = curCharPos;
        }
        runCount++;
      } else if (line.length > 0) {
        if (runCount >= 2) {
          break;
        }
        runStartIdx = -1;
        runCount = 0;
      }

      curCharPos += lineLen;
    }

    if (runCount >= 2 && runStartIdx !== -1) {
      candidates.push({
        start: runCharPos,
        title: 'Índice de Capítulos (Final)',
        headingLine: lines[runStartIdx].trim()
      });
    }
  }

  if (candidates.length === 0) {
    return {
      hasToc: false,
      position: 'none',
      tocTitle: '',
      rawTocText: '',
      chapters: [],
      startIndex: -1,
      endIndex: -1,
      cleanedTextWithoutToc: text
    };
  }

  // Evaluar cada candidato para determinar si es un índice real con entradas de capítulos
  for (const cand of candidates) {
    const textLen = text.length;
    const isStart = cand.start < textLen * 0.35;
    const isEnd = cand.start > textLen * 0.65;
    const position = isStart ? 'start' : (isEnd ? 'end' : 'middle');

    const fromMatch = text.slice(cand.start);
    const lines = fromMatch.split(/\r?\n/);
    let tocLinesCount = 1;
    let entriesFound = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        const nextLine = lines.slice(i + 1).find(l => l.trim().length > 0)?.trim() || '';
        if (!nextLine || /^(?:PR[OÓ]LOGO|PREFACIO|CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|[IVXLCDM]{1,6}\.?$)/i.test(nextLine)) {
          break;
        }
        continue;
      }

      const isTocLine = /(?:\.{2,}|\s{3,}|…|\t)\s*\d+$/.test(line) ||
        /^(?:Cap[ií]tulo|Chapter|Kapitel|Parte|Part|Libro|Book|[IVXLCDM]+|[0-9]{1,3})\b/i.test(line) ||
        /^(?:Pr[oó]logo|Prefacio|Introducci[oó]n|Ep[ií]logo|Bibliograf[ií]a|Ap[eé]ndice|Colof[oó]n)\b/i.test(line);

      if (isTocLine) {
        entriesFound++;
        tocLinesCount = i + 1;
      } else if (line.length < 60 && entriesFound > 0) {
        tocLinesCount = i + 1;
      } else {
        break;
      }
    }

    if (entriesFound >= 2 || (lines.length > 3 && tocLinesCount >= 3)) {
      const rawTocText = lines.slice(0, tocLinesCount).join('\n').trim();
      const endIndex = cand.start + rawTocText.length;
      const parsedChapters = parseManualTableOfContents(rawTocText);

      const before = text.slice(0, cand.start).trim();
      const after = text.slice(endIndex).trim();
      const cleaned = (before ? before + '\n\n' : '') + after;

      return {
        hasToc: true,
        position,
        tocTitle: cand.title,
        rawTocText,
        chapters: parsedChapters,
        startIndex: cand.start,
        endIndex,
        cleanedTextWithoutToc: cleaned
      };
    }
  }

  return {
    hasToc: false,
    position: 'none',
    tocTitle: '',
    rawTocText: '',
    chapters: [],
    startIndex: -1,
    endIndex: -1,
    cleanedTextWithoutToc: text
  };
}

/**
 * Localiza las posiciones de los capítulos del índice dentro del cuerpo narrativo del libro.
 */
export function locateChaptersFromBodyUsingToc(bodyText: string, tocChapters: ExtractedTocChapter[]): LocatedChapterInBody[] {
  if (!bodyText || tocChapters.length === 0) return [];

  const results: LocatedChapterInBody[] = [];
  const lowerBody = bodyText.toLowerCase();

  for (const ch of tocChapters) {
    let found = false;
    let pos = -1;
    let snippet = '';

    const queries = [
      ch.title.toLowerCase().trim(),
      ch.label.toLowerCase().trim()
    ].filter(q => q.length >= 3);

    for (const q of queries) {
      pos = lowerBody.indexOf(q);
      if (pos !== -1) {
        found = true;
        snippet = bodyText.slice(pos, pos + 120).replace(/\s+/g, ' ');
        break;
      }
    }

    if (!found) {
      const regex = new RegExp(`(?:^|\\n\\s*)(?:#+\\s*)?(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)\\s+${ch.index}\\b`, 'i');
      const m = regex.exec(bodyText);
      if (m) {
        found = true;
        pos = m.index;
        snippet = bodyText.slice(pos, pos + 120).replace(/\s+/g, ' ');
      }
    }

    // Búsqueda por numeral arábigo con separador (ej. "1. " o "1 - ")
    if (!found && ch.index) {
      const numDotRegex = new RegExp(`(?:^|\\n\\s*)(?:#+\\s*)?${ch.index}[\\.\\-–—:]\\s+`, 'i');
      const mNum = numDotRegex.exec(bodyText);
      if (mNum) {
        found = true;
        pos = mNum.index;
        snippet = bodyText.slice(pos, pos + 120).replace(/\s+/g, ' ');
      }
    }

    // Búsqueda por numeral romano correspondiente (ej. "I", "II", "III"...)
    if (!found && ch.index >= 1 && ch.index <= 30) {
      const romanList = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX'];
      const rom = romanList[ch.index - 1];
      if (rom) {
        const romRegex = new RegExp(`(?:^|\\n\\s*)(?:#+\\s*)?(?:(?:cap[ií]tulo|chapter|kapitel|chapitre|capitolo)\\s+)?\\b${rom}\\b(?:[\\.\\-–—:]|\\s*$)`, 'i');
        const mRom = romRegex.exec(bodyText);
        if (mRom) {
          found = true;
          pos = mRom.index;
          snippet = bodyText.slice(pos, pos + 120).replace(/\s+/g, ' ');
        }
      }
    }

    results.push({
      chapterIndex: ch.index,
      title: ch.title,
      foundInBody: found,
      charPosition: pos,
      snippet
    });
  }

  return results;
}

export interface UnifiedEditorialIndex {
  hasIndex: boolean;
  sourceType: 'formal_toc' | 'detected_chapters' | 'manual' | 'continuous';
  chapters: ExtractedTocChapter[];
  preliminaries: ExtractedTocChapter[];
  backMatter: ExtractedTocChapter[];
  totalChapters: number;
  tocNotice: string;
}

/**
 * Resuelve de forma unificada y certera el Índice Editorial de una obra:
 * 1. Si el usuario definió un índice manual -> Respeta la curaduría manual.
 * 2. Si el archivo contiene una Tabla de Contenidos formal (TOC) -> La extrae con títulos y páginas,
 *    segregando prefacios/prólogos del cuerpo novelesco y del epílogo/bibliografía.
 * 3. Si no hay página de TOC pero hay capítulos distribuidos en el texto -> Los estructura como índice editorial.
 * 4. Si la obra es continua (sin capítulos) -> Informa con precisión que es un relato continuo sin forzar capítulos ficticios.
 */
export function resolveUnifiedEditorialIndex(
  text: string,
  detectedChapters?: DetectedChapterItem[],
  manualChapters?: ExtractedTocChapter[]
): UnifiedEditorialIndex {
  if (manualChapters && manualChapters.length > 0) {
    const chapters = manualChapters.filter(c => c.type === 'chapter' || !c.type);
    const preliminaries = manualChapters.filter(c => c.type === 'preliminary');
    const backMatter = manualChapters.filter(c => c.type === 'back_matter');

    return {
      hasIndex: true,
      sourceType: 'manual',
      chapters,
      preliminaries,
      backMatter,
      totalChapters: chapters.length,
      tocNotice: `Índice configurado manualmente (${chapters.length} capítulos${preliminaries.length > 0 ? `, ${preliminaries.length} preliminares` : ''}).`
    };
  }

  const tocInfo = detectTableOfContentsInBook(text);
  if (tocInfo.hasToc && tocInfo.chapters.length > 0) {
    const chapters = tocInfo.chapters.filter(c => c.type === 'chapter' || !c.type);
    const preliminaries = tocInfo.chapters.filter(c => c.type === 'preliminary');
    const backMatter = tocInfo.chapters.filter(c => c.type === 'back_matter');

    return {
      hasIndex: true,
      sourceType: 'formal_toc',
      chapters,
      preliminaries,
      backMatter,
      totalChapters: chapters.length,
      tocNotice: `Índice editorial formal detectado ${tocInfo.position === 'start' ? 'al inicio' : 'al final'} (${chapters.length} capítulos${preliminaries.length > 0 ? `, ${preliminaries.length} preliminares` : ''}).`
    };
  }

  if (detectedChapters && detectedChapters.length > 0) {
    const mapped: ExtractedTocChapter[] = detectedChapters.map((ch, idx) => ({
      index: ch.number || idx + 1,
      label: ch.label || `Capítulo ${idx + 1}`,
      title: ch.label || `Capítulo ${idx + 1}`,
      rawLine: ch.label,
      targetParagraphIndex: ch.paragraphIndex,
      type: 'chapter'
    }));
    return {
      hasIndex: true,
      sourceType: 'detected_chapters',
      chapters: mapped,
      preliminaries: [],
      backMatter: [],
      totalChapters: mapped.length,
      tocNotice: `Estructura capitular identificada en el cuerpo narrativo (${mapped.length} capítulos).`
    };
  }

  return {
    hasIndex: false,
    sourceType: 'continuous',
    chapters: [],
    preliminaries: [],
    backMatter: [],
    totalChapters: 0,
    tocNotice: 'Obra de flujo narrativo continuo (sin divisiones formales de capítulos del autor).'
  };
}

/**
 * Sana y normaliza los párrafos de un libro garantizando que cada párrafo
 * sea una unidad oracional completa que termina en punto (o signo terminal . ? ! » ” ")
 * y soldando quiebres falsos producidos por saltos de página u OCR.
 */
export function healAndCleanBookParagraphs(
  rawText: string,
  options?: { preserveBoundaries?: boolean }
): {
  cleanedText: string;
  paragraphs: string[];
  healedCount: number;
  strippedArtifactsCount: number;
} {
  if (!rawText || !rawText.trim()) {
    return { cleanedText: '', paragraphs: [], healedCount: 0, strippedArtifactsCount: 0 };
  }

  // 1. Limpieza inicial de saltos de página y números sueltos
  let text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  text = text.replace(/[-–—\s]*\[\s*[-–—\s]*(?:P[AÁ]GINA|PAGINA|PAGE|SEITE|COLUMNA|HOJA)[^\]]*\]\s*[-–—\s]*/gi, '');
  text = text.replace(/^[ \t]*[-–—\s]*(?:p[aá]g(?:ina)?|page|seite)\.?\s*\d+(?:\s*de\s*\d+)?[-–—\s]*$/gim, '');
  text = text.replace(/^[ \t]*[-–—\s]*\d{1,4}[-–—\s]*$/gim, '');

  // 2. Fragmentación por bloques separados por saltos dobles
  const rawBlocks = text
    .split(/\n\s*\n+/)
    .map(b => b.trim())
    .filter(b => b.length > 0);

  const cleanBlocks: string[] = [];
  let strippedArtifactsCount = 0;

  for (let i = 0; i < rawBlocks.length; i++) {
    const block = rawBlocks[i];

    // Ignorar avisos aislados o números huérfanos
    if (/^[-–—\s]*\d{1,4}[-–—\s]*$/.test(block)) {
      strippedArtifactsCount++;
      continue;
    }

    // Depurar artefactos como "CAPÍTULO X" en grande si es una línea solitaria corta que acompaña al siguiente párrafo
    if (/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)\s+[0-9IVXLCDM]+\.?$/i.test(block)) {
      cleanBlocks.push(`### ${block.toUpperCase()}`);
      continue;
    }

    cleanBlocks.push(block);
  }

  // 3. Sanación de Párrafos Incompletos:
  // Un párrafo termina en punto (o signo de cierre . ? ! … » ” ").
  // Si un párrafo NO termina en signo terminal y el siguiente continúa la frase con minúscula o sin ser encabezado, se fusionan.
  const healedParagraphs: string[] = [];
  let healedCount = 0;

  for (let i = 0; i < cleanBlocks.length; i++) {
    const current = cleanBlocks[i];

    if (healedParagraphs.length === 0) {
      healedParagraphs.push(current);
      continue;
    }

    const prev = healedParagraphs[healedParagraphs.length - 1];
    const prevTrimmed = prev.trim();
    const currTrimmed = current.trim();

    const isPrevHeading = /^#+\s+/.test(prevTrimmed) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)\b/i.test(prevTrimmed);
    const isCurrHeading = /^#+\s+/.test(currTrimmed) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)\b/i.test(currTrimmed);
    const isCurrDialogue = /^[-–—«»"“„]/.test(currTrimmed);

    // ¿Terminó el párrafo anterior en un punto o signo de cierre terminal?
    const endsWithTerminalPunct = /[.!?…»”"][)\]'"`”»]*$/.test(prevTrimmed);

    // Si el anterior NO terminó en punto y el actual no es encabezado ni diálogo nuevo:
    // O si terminó con guion partido (ej: "trans-")
    const isHyphenSplit = /[\p{L}]-[ \t]*$/u.test(prevTrimmed);
    const isLowercaseContinuation = /^[\p{Ll}]/u.test(currTrimmed);

    if (!isPrevHeading && !isCurrHeading && (!endsWithTerminalPunct || isHyphenSplit || isLowercaseContinuation) && !isCurrDialogue) {
      // Soldar la oración partida
      if (isHyphenSplit) {
        healedParagraphs[healedParagraphs.length - 1] = prevTrimmed.replace(/-[ \t]*$/, '') + currTrimmed;
      } else {
        healedParagraphs[healedParagraphs.length - 1] = prevTrimmed + ' ' + currTrimmed;
      }
      healedCount++;
    } else {
      healedParagraphs.push(current);
    }
  }

  const cleanedText = healedParagraphs.join('\n\n');

  return {
    cleanedText,
    paragraphs: healedParagraphs,
    healedCount,
    strippedArtifactsCount
  };
}

/**
 * Nivelación armónica de párrafos entre el Libro A y el Libro B:
 * Toma como patrón el libro que tenga MÁS párrafos y segmenta los párrafos compuestos
 * del libro con menor densidad dividiendo en puntos seguidos (. ! ?) para igualar
 * la granularidad de párrafos sin omitir ni una sola palabra.
 */
export function harmonizeParagraphCountToLargerBook(
  textA: string,
  textB: string
): {
  harmonizedA: string;
  harmonizedB: string;
  parasA: string[];
  parasB: string[];
  splitsA: number;
  splitsB: number;
} {
  const cleanA = healAndCleanBookParagraphs(textA);
  const cleanB = healAndCleanBookParagraphs(textB);

  let parasA = [...cleanA.paragraphs];
  let parasB = [...cleanB.paragraphs];
  let splitsA = 0;
  let splitsB = 0;

  if (parasA.length === parasB.length) {
    return {
      harmonizedA: cleanA.cleanedText,
      harmonizedB: cleanB.cleanedText,
      parasA,
      parasB,
      splitsA: 0,
      splitsB: 0
    };
  }

  // Si Libro A tiene más párrafos que Libro B: segmentar los párrafos compuestos de B
  if (parasA.length > parasB.length) {
    const targetDiff = parasA.length - parasB.length;
    let addedSplits = 0;

    const newParasB: string[] = [];
    for (let j = 0; j < parasB.length; j++) {
      const pB = parasB[j];
      const isHead = /^#+\s+/.test(pB) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)\b/i.test(pB);

      // Si aún necesitamos cortes y el párrafo en B es extenso y tiene múltiples oraciones terminadas en punto
      if (!isHead && addedSplits < targetDiff && pB.length > 200) {
        // Dividir por oraciones terminadas en punto seguido de espacio y mayúscula
        const sents = pB.split(/(?<=[.!?»”"])\s+(?=[A-ZÁÉÍÓÚÑÄÖÜ«“"¿¡—–])/);
        if (sents.length >= 2) {
          // Si podemos dividir en 2 partes
          const midPoint = Math.ceil(sents.length / 2);
          const part1 = sents.slice(0, midPoint).join(' ').trim();
          const part2 = sents.slice(midPoint).join(' ').trim();
          if (part1 && part2) {
            newParasB.push(part1);
            newParasB.push(part2);
            addedSplits++;
            splitsB++;
            continue;
          }
        }
      }
      newParasB.push(pB);
    }
    parasB = newParasB;
  } else {
    // Libro B tiene más párrafos que Libro A: segmentar los párrafos compuestos de A
    const targetDiff = parasB.length - parasA.length;
    let addedSplits = 0;

    const newParasA: string[] = [];
    for (let i = 0; i < parasA.length; i++) {
      const pA = parasA[i];
      const isHead = /^#+\s+/.test(pA) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK)\b/i.test(pA);

      if (!isHead && addedSplits < targetDiff && pA.length > 200) {
        const sents = pA.split(/(?<=[.!?»”"])\s+(?=[A-ZÁÉÍÓÚÑÄÖÜ«“"¿¡—–])/);
        if (sents.length >= 2) {
          const midPoint = Math.ceil(sents.length / 2);
          const part1 = sents.slice(0, midPoint).join(' ').trim();
          const part2 = sents.slice(midPoint).join(' ').trim();
          if (part1 && part2) {
            newParasA.push(part1);
            newParasA.push(part2);
            addedSplits++;
            splitsA++;
            continue;
          }
        }
      }
      newParasA.push(pA);
    }
    parasA = newParasA;
  }

  return {
    harmonizedA: parasA.join('\n\n'),
    harmonizedB: parasB.join('\n\n'),
    parasA,
    parasB,
    splitsA,
    splitsB
  };
}

/**
 * Calcula afinidad semántica y lingüística real entre dos párrafos o frases,
 * detectando entidades compartidas, números, raíces cognadas y marcas discursivas.
 */
function computeSemanticAffinityScore(textA: string, textB: string): {
  score: number;
  sharedTokens: string[];
  hasDialogueMatch: boolean;
  hasQuestionMatch: boolean;
} {
  if (!textA || !textB) {
    return { score: 0, sharedTokens: [], hasDialogueMatch: false, hasQuestionMatch: false };
  }

  let score = 0;
  const sharedTokens: string[] = [];

  // 1. Números y años idénticos (anclas cronológicas o de conteo)
  const numsA: string[] = textA.match(/\b\d{1,5}\b/g) || [];
  const numsB: string[] = textB.match(/\b\d{1,5}\b/g) || [];
  for (const n of numsA) {
    if (numsB.includes(n)) {
      score += 4;
      sharedTokens.push(n);
    }
  }

  // 2. Nombres propios y entidades en mayúsculas (capitalized words >= 4 chars)
  const capsA: string[] = textA.match(/[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]{3,}/g) || [];
  const capsB: string[] = textB.match(/[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]{3,}/g) || [];
  for (const c of capsA) {
    if (capsB.includes(c)) {
      score += 3;
      sharedTokens.push(c);
    }
  }

  // 3. Raíces cognadas compartidas (stems de 4 letras idénticas al inicio)
  const wordsA = textA.toLowerCase().replace(/[^a-z0-9áéíóúñäöüß]/gi, ' ').split(/\s+/).filter(w => w.length >= 4);
  const wordsB = textB.toLowerCase().replace(/[^a-z0-9áéíóúñäöüß]/gi, ' ').split(/\s+/).filter(w => w.length >= 4);

  let stemMatches = 0;
  for (const wA of wordsA) {
    const stem = wA.slice(0, 4);
    if (wordsB.some(wB => wB.startsWith(stem))) {
      stemMatches++;
      if (stemMatches <= 4) {
        score += 1.5;
        sharedTokens.push(stem);
      }
    }
  }

  // 4. Paridad de formato de diálogo
  const dialA = /^[-–—«»"“„]/.test(textA.trim());
  const dialB = /^[-–—«»"“„]/.test(textB.trim());
  const hasDialogueMatch = dialA === dialB;
  if (dialA && dialB) score += 2;

  // 5. Paridad de interrogación
  const qA = /[?¿]/.test(textA);
  const qB = /[?¿]/.test(textB);
  const hasQuestionMatch = qA === qB;
  if (qA && qB) score += 2;

  return {
    score,
    sharedTokens: Array.from(new Set(sharedTokens)),
    hasDialogueMatch,
    hasQuestionMatch
  };
}

/**
 * Analiza y correlaciona los segmentos paralelos entre dos obras (Libro A y Libro B)
 * comparando el contenido real de las frases iniciales de cada segmento y detectando
 * si hay desfasajes (+1 o -1) para garantizar que la coincidencia sea auténtica y legible.
 */
export function detectParallelInitialPhrasesAndSegments(
  textA: string,
  textB: string
): {
  segments: ParallelInitialPhraseSegment[];
  overallScore: number;
  totalParagraphsA: number;
  totalParagraphsB: number;
} {
  const cleanA = healAndCleanBookParagraphs(textA);
  const cleanB = healAndCleanBookParagraphs(textB);

  const parasA = cleanA.paragraphs;
  const parasB = cleanB.paragraphs;

  if (parasA.length === 0 && parasB.length === 0) {
    return { segments: [], overallScore: 100, totalParagraphsA: 0, totalParagraphsB: 0 };
  }

  // Filtrar párrafos sustantivos (> 50 caracteres) para evitar muestrear monosílabos o rayas aisladas
  const substantiveIndicesA: number[] = [];
  for (let i = 0; i < parasA.length; i++) {
    const p = parasA[i].trim();
    if (p.length >= 50 && !/^[-–—]\s*$/.test(p)) {
      substantiveIndicesA.push(i);
    }
  }

  // Determinar número óptimo de hitos de control progresivos (entre 12 y 28 hitos a lo largo de toda la obra)
  const totalCharsA = textA.length;
  const targetCheckpoints = Math.min(28, Math.max(10, Math.ceil(totalCharsA / 6000)));
  const step = Math.max(1, Math.floor(substantiveIndicesA.length / targetCheckpoints));

  const sampleIndicesA: number[] = [];
  for (let i = 0; i < substantiveIndicesA.length; i += step) {
    sampleIndicesA.push(substantiveIndicesA[i]);
  }
  // Asegurar siempre el primer y el último párrafo sustantivo
  if (substantiveIndicesA.length > 0) {
    if (!sampleIndicesA.includes(substantiveIndicesA[0])) sampleIndicesA.unshift(substantiveIndicesA[0]);
    const lastSubA = substantiveIndicesA[substantiveIndicesA.length - 1];
    if (!sampleIndicesA.includes(lastSubA)) sampleIndicesA.push(lastSubA);
  }

  const segments: ParallelInitialPhraseSegment[] = [];
  let matchedCount = 0;

  const extractInitialPhrase = (p: string) => {
    if (!p) return '—';
    const clean = p.replace(/^#+\s*/, '').trim();
    const punctMatch = clean.match(/^([^.!?»”"]+[.!?»”"]?)/);
    if (punctMatch && punctMatch[1].length <= 110) {
      return punctMatch[1].trim();
    }
    const words = clean.split(/\s+/).slice(0, 10).join(' ');
    return words ? words + '...' : '—';
  };

  sampleIndicesA.forEach((idxA, checkpointIdx) => {
    const pA = parasA[idxA] || '';
    const progressPercent = Math.round((idxA / Math.max(1, parasA.length - 1)) * 100);

    // Calcular posición proporcional esperada en Libro B
    const expectedRatio = idxA / Math.max(1, parasA.length);
    const expectedIdxB = Math.round(expectedRatio * Math.max(1, parasB.length));

    // Si Libro B es más corto y ya no alcanza esta altura del libro:
    if (expectedIdxB >= parasB.length && parasB.length > 0) {
      segments.push({
        index: checkpointIdx + 1,
        phraseA: extractInitialPhrase(pA),
        phraseB: '— (Contraparte Ausente / Final Prematuro de Libro B) —',
        snippetA: pA.slice(0, 140) + (pA.length > 140 ? '...' : ''),
        snippetB: 'El Libro B no contiene párrafos a esta altura de la obra.',
        charCountA: pA.length,
        charCountB: 0,
        ratio: 0,
        isBalanced: false,
        status: 'asymmetry',
        note: `⚠ Asimetría de extensión en ${progressPercent}%: Libro B finaliza antes que Libro A.`
      });
      return;
    }

    // Buscar en una ventana local (+- 10 párrafos en B) el párrafo con mayor afinidad
    const windowStart = Math.max(0, expectedIdxB - 10);
    const windowEnd = Math.min(parasB.length - 1, expectedIdxB + 10);

    let bestIdxB = expectedIdxB;
    let bestScore = -1;
    let bestAffinity: any = null;

    for (let j = windowStart; j <= windowEnd; j++) {
      const candB = parasB[j] || '';
      if (candB.length < 30) continue;
      const aff = computeSemanticAffinityScore(pA, candB);
      if (aff.score > bestScore) {
        bestScore = aff.score;
        bestIdxB = j;
        bestAffinity = aff;
      }
    }

    const pB = parasB[bestIdxB] || '';
    const phraseA = extractInitialPhrase(pA);
    const phraseB = extractInitialPhrase(pB);

    const charCountA = pA.length;
    const charCountB = pB.length;
    const ratio = (charCountA > 0 && charCountB > 0)
      ? Math.round((Math.min(charCountA, charCountB) / Math.max(charCountA, charCountB)) * 100)
      : 0;

    let status: ParallelInitialPhraseSegment['status'] = 'mirror_match';
    let note: string | undefined = undefined;

    if (!pB) {
      status = 'asymmetry';
      note = `Segmento ausente en Obra B al ${progressPercent}% de la obra.`;
    } else if (bestScore >= 2.0 || (ratio >= 40 && bestAffinity?.hasDialogueMatch)) {
      status = 'mirror_match';
      note = `✓ Hito verificado en ${progressPercent}% (párr. A#${idxA + 1} ↔ B#${bestIdxB + 1})${bestAffinity?.sharedTokens?.length ? `: [${bestAffinity.sharedTokens.slice(0, 2).join(', ')}]` : ''}`;
      matchedCount++;
    } else if (Math.abs(bestIdxB - expectedIdxB) >= 4) {
      status = 'offset_detected';
      note = `⚠ Ligero desfase proporcional en ${progressPercent}%: correspondiente a B#${bestIdxB + 1} (esperado B#${expectedIdxB + 1}).`;
    } else {
      status = 'mirror_match';
      note = `Hito continuo en ${progressPercent}% de la obra (párr. A#${idxA + 1} ↔ B#${bestIdxB + 1}).`;
      matchedCount++;
    }

    segments.push({
      index: checkpointIdx + 1,
      phraseA,
      phraseB,
      snippetA: pA.slice(0, 140) + (pA.length > 140 ? '...' : ''),
      snippetB: pB.slice(0, 140) + (pB.length > 140 ? '...' : ''),
      charCountA,
      charCountB,
      ratio,
      isBalanced: status === 'mirror_match',
      status,
      note
    });
  });

  const overallScore = segments.length > 0 ? Math.round((matchedCount / segments.length) * 100) : 100;

  return {
    segments,
    overallScore,
    totalParagraphsA: parasA.length,
    totalParagraphsB: parasB.length
  };
}


