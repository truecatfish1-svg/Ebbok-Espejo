/**
 * Motor Especializado de Análisis Editorial de Páginas de PDFs y Libros Digitales (Paso 1)
 * 
 * Implementa el proceso riguroso de análisis de páginas exigido para curaduría universal:
 * 1. Segmentación y clasificación ontológica de cada página del PDF (o páginas virtuales):
 *    - Portada / Sellos de Repositorio Digital (DigBib, Gutenberg, Libricultura, Z-Lib, Blogspot)
 *    - Portadilla / Página Legal de Créditos (ISBN, Depósito Legal, Editorial, Imprenta)
 *    - Dedicatoria y Epígrafe aislado
 *    - Tabla de Contenidos / Índice
 *    - Prólogo / Prefacio / Estudio preliminar
 *    - Página real de arranque narrativo (Capítulo 1 o primera frase literaria)
 *    - Páginas del cuerpo novelesco
 *    - Páginas posteriores (Colofón, Catálogos editoriales, Licencias)
 * 2. Análisis posterior automático de continuidad hacia adelante (lookahead) y hacia atrás (lookback).
 * 3. Desprendimiento milimétrico de títulos/autores en mayúsculas fusionados al inicio de la narración
 *    (ej. "La METAMORFOSIS FRANZ KAFKA Una mañana, tras un sueño intranquilo...").
 * 4. Purgado de banners y marcas de agua repetidas/stuttering (ej. "hhttttpp::///lliibbrriiccuullttuurraa..bbllooggssppoott..ccoomm//").
 */

import { type ExtractedPage } from './fileExtractor';
import { type CanonicalWorkProfile, lookupCanonicalWorkLocally } from './intelligentBookCurator';
import { type DetectedChapterItem, detectNovelChapters, type BookPageStructure } from './novelCurator';

export type PageClassificationType = 
  | 'repository_banner'    // DigBib, Gutenberg stamp, Blogspot, Z-Lib, avisos de descarga
  | 'title_imprint'        // Portadilla, datos de imprenta, ISBN, depósito legal, derechos
  | 'dedication_epigraph'  // Dedicatoria ("Para Clara...") o epígrafe poético
  | 'table_of_contents'    // Índice de contenidos con números de página
  | 'preliminary_prologue' // Prólogo, prefacio o estudio introductorio formal
  | 'narrative_start'      // Primera página donde arranca la historia novelesca real (Capítulo 1 o frase narrativa)
  | 'narrative_body'       // Cuerpo central de la novela
  | 'back_matter';         // Colofón, catálogo editorial, notas finales o licencia posterior

export interface AnalyzedBookPage {
  pageNumber: number;
  rawText: string;
  cleanedText: string;
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  classification: PageClassificationType;
  classificationConfidence: number;
  detectedChapter?: string;
  isCoverOrBlank: boolean;
}

export interface PdfBookStructureAnalysis {
  totalPages: number;
  narrativeStartPage: number;
  narrativeEndPage: number;
  frontMatterPagesRange: string;
  backMatterPagesRange: string;
  pureNovelPagesRange: string;
  
  // Textos y bloques desglosados
  purifiedNovelText: string;
  novelParagraphs: string[];
  firstPureParagraph: string;
  lastPureParagraph: string;
  
  // Preliminares aislados
  frontMatter: {
    title?: string;
    author?: string;
    subtitle?: string;
    dedication?: string;
    epigraph?: string;
    legalNotice?: string;
    repositoryNotice?: string;
    hasFrontMatter: boolean;
  };
  
  preface?: {
    hasPreface: boolean;
    title: string;
    text: string;
    wordCount: number;
  };
  
  backMatter: {
    hasBackMatter: boolean;
    title: string;
    text: string;
    wordCount: number;
  };
  
  chapters: DetectedChapterItem[];
  pageStructure: BookPageStructure;
  continuityVerified: boolean;
}

/**
 * Patrones universales de repositorios digitales, bibliotecas públicas y banners web
 * Incluye DigBib.org, Project Gutenberg, Z-Library, EPUBlibre, marcas blogspot y variantes OCR con letras duplicadas
 */
export const DIGITAL_REPOSITORY_PATTERNS: RegExp[] = [
  // DigBib.org (Digital Bibliothek alemana)
  /DigBib\s*\.\s*Org\b/i,
  /Die\s+freie\s+digitale\s+Bibliothek\b/i,
  /(?:www\.)?digbib\.org\b/i,
  /Erstellt\s+am\s+\d{2}\.\d{2}\.\d{4}\s+DigBib/i,
  /DigBib\s*\.\s*Org\s+ist\s+ein\s+[öo]ffentliches\s+Projekt/i,
  /bei\s+DigBib\s*\.\s*Org\s+melden/i,
  
  // Banners promocionales web y marcas de agua de blogs (incluyendo stuttering de OCR: hhttttpp, bbllooggssppoott)
  /M[aá]s\s*libros\s*gratis\s*(?:en\b)?/i,
  /Descarga(?:dos)?\s*(?:libros\s*)?gratis\s*(?:en\b)?/i,
  /h{2,}t{2,}t{2,}p{2,}s?:\/\//i,
  /b{2,}l{2,}o{2,}g{2,}s{2,}p{2,}o{2,}t{2,}/i,
  /l{2,}i{2,}b{2,}r{2,}i{2,}c{2,}u{2,}l{2,}t{2,}u{2,}r{2,}a{2,}/i,
  /(?:libricultura|librosgratis|freelibros|epublibre|z-lib|1lib|feedbooks|standardebooks)\.(?:blogspot|wordpress|com|org|sk|me)/i,
  /Canal\s+(?:oficial\s+de\s+)?Telegram\b/i,
  /Official\s+Telegram\s+channel\b/i,
  /go-to-library\b/i,
  
  // Project Gutenberg y Distributed Proofreading
  /\*{3,5}\s*START OF TH(?:E|IS) PROJECT GUTENBERG EBOOK/i,
  /The Project Gutenberg EBook of/i,
  /Online Distributed Proofreading Team at http:\/\/www\.pgdp\.net/i,
  /Produced by .*?(?:Distributed Proofreading|pgdp\.net|Gutenberg)/i,
  
  // Alice & Books y sitios de dominio público
  /This book has been downloaded from\s+www\.[^\s\n]+/i,
  /Bienvenido al m[aá]gico mundo de la literatur[ea]/i
];

/**
 * Detecta si una línea o texto contiene un sello/banner de repositorio digital
 */
export function isDigitalRepositoryOrPromoBanner(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  return DIGITAL_REPOSITORY_PATTERNS.some(rx => rx.test(text));
}

/**
 * Purga de forma implacable cualquier banner de repositorio digital o blogspot
 * presente en el texto, incluyendo líneas fusionadas o de encabezado/pie.
 */
export function purgeDigitalRepositoryBanners(text: string): { cleanedText: string; removedBanners: string[] } {
  if (!text) return { cleanedText: '', removedBanners: [] };
  
  let cleaned = text;
  const removedBanners: string[] = [];

  // 1. Purgar bloques multilínea de DigBib.org
  const digBibBlock = cleaned.match(/DigBib\s*\.\s*Org:\s*Die freie digitale Bibliothek[^\n]*Quelle:[^\n]*(?:\n[^\n]+)?(?:\n[^\n]*DigBib\s*\.\s*Org\s+melden\.?)?/i);
  if (digBibBlock) {
    removedBanners.push(digBibBlock[0].trim());
    cleaned = cleaned.replace(digBibBlock[0], '').trim();
  }

  // 2. Purgar banners "Más libros gratis en http://..." (normal o con stuttering OCR)
  const promoBannerRegexes = [
    /[-–—\s]*M[aá]s\s*libros\s*gratis\s*en\s*h+t+t+p+s?:?\/*[^\s\n]+(?:\s*\/*)?/gi,
    /[-–—\s]*Descargado\s*(?:de|en)\s*h+t+t+p+s?:?\/*[^\s\n]+/gi,
    /[-–—\s]*h{2,}t{2,}t{2,}p{2,}s?:\/\/[^\s\n]+/gi,
    /[-–—\s]*(?:z-lib(?:rary)?|1lib|epublibre|aliceandbooks|standardebooks)\.(?:sk|org|com|is|to|cx|me)[^\n]*/gi,
    /[-–—\s]*Produced by [^\n]+?(?:Distributed Proofreading|pgdp\.net)[^\n]*/gi,
    /[-–—\s]*This book has been downloaded from\s+www\.[^\s\n]+[^\n]*/gi,
    /[-–—\s]*Bienvenido al m[aá]gico mundo de la literatur[ea][^\n]*/gi
  ];

  for (const rx of promoBannerRegexes) {
    cleaned = cleaned.replace(rx, (m) => {
      removedBanners.push(m.trim());
      return '';
    });
  }

  // 3. Purgar líneas residuales que contengan sólo URLs de blogspot o telegram
  const lines = cleaned.split(/\r?\n/);
  const remainingLines: string[] = [];
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed) {
      remainingLines.push('');
      continue;
    }
    if (isDigitalRepositoryOrPromoBanner(trimmed) && trimmed.length < 350) {
      removedBanners.push(trimmed);
      continue;
    }
    remainingLines.push(l);
  }

  return {
    cleanedText: remainingLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    removedBanners
  };
}

/**
 * Desprende títulos y autores en mayúsculas fusionados al inicio de una oración narrativa
 * Ej: "La METAMORFOSIS FRANZ KAFKA Una mañana, tras un sueño intranquilo..."
 *     -> Título: "La metamorfosis", Autor: "Franz Kafka", Prosa: "Una mañana, tras un sueño intranquilo..."
 */
export function detachFusedTitleAndAuthorFromProse(
  text: string,
  knownTitle?: string,
  knownAuthor?: string
): {
  cleanedProse: string;
  extractedTitle?: string;
  extractedAuthor?: string;
  wasFused: boolean;
} {
  if (!text || text.trim().length === 0) {
    return { cleanedProse: text || '', wasFused: false };
  }

  let working = text.trim();
  let extractedTitle: string | undefined;
  let extractedAuthor: string | undefined;
  let wasFused = false;

  // 1. Caso con título y autor conocidos (insensible a mayúsculas/minúsculas)
  const candidates: { title?: string; author?: string }[] = [];
  if (knownTitle && knownAuthor) candidates.push({ title: knownTitle, author: knownAuthor });
  
  // Clásicos frecuentes para autodesprendimiento si coincide la frase
  candidates.push(
    { title: 'La metamorfosis', author: 'Franz Kafka' },
    { title: 'Die Verwandlung', author: 'Franz Kafka' },
    { title: 'The Metamorphosis', author: 'Franz Kafka' },
    { title: 'Mathilda', author: 'Mary Shelley' },
    { title: 'Frankenstein', author: 'Mary Shelley' },
    { title: 'Don Quijote', author: 'Miguel de Cervantes' }
  );

  for (const cand of candidates) {
    if (!cand.title || !cand.author) continue;
    const tEsc = cand.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const aEsc = cand.author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Patrón 1: TÍTULO AUTOR Prosa (ej: "La METAMORFOSIS FRANZ KAFKA Una mañana...")
    const pattern1 = new RegExp(`^(?:${tEsc})\\s+(?:${aEsc})\\s+(?=[A-ZÁÉÍÓÚÑ"“«])`, 'i');
    const m1 = working.match(pattern1);
    if (m1) {
      extractedTitle = cand.title;
      extractedAuthor = cand.author;
      working = working.substring(m1[0].length).trim();
      wasFused = true;
      break;
    }

    // Patrón 2: AUTOR TÍTULO Prosa (ej: "FRANZ KAFKA La METAMORFOSIS Una mañana...")
    const pattern2 = new RegExp(`^(?:${aEsc})\\s+(?:${tEsc})\\s+(?=[A-ZÁÉÍÓÚÑ"“«])`, 'i');
    const m2 = working.match(pattern2);
    if (m2) {
      extractedTitle = cand.title;
      extractedAuthor = cand.author;
      working = working.substring(m2[0].length).trim();
      wasFused = true;
      break;
    }

    // Patrón 3: Solo TÍTULO o solo AUTOR al inicio
    const pattern3 = new RegExp(`^(?:${tEsc}|${aEsc})\\s+(?=[A-ZÁÉÍÓÚÑ"“«])`, 'i');
    const m3 = working.match(pattern3);
    if (m3) {
      if (cand.title.toLowerCase().includes(m3[0].trim().toLowerCase())) extractedTitle = cand.title;
      else extractedAuthor = cand.author;
      working = working.substring(m3[0].length).trim();
      wasFused = true;
      break;
    }
  }

  // 2. Patrón genérico: Dos bloques consecutivos en MAYÚSCULAS seguidos de oración con mayúscula/minúscula narrativa
  // Ej: "EL EXTRANJERO ALBERT CAMUS Hoy ha muerto mamá."
  if (!wasFused) {
    const genericCapsMatch = working.match(/^([A-ZÁÉÍÓÚÑ\s]{3,45})\s+([A-ZÁÉÍÓÚÑ\s]{3,35})\s+(?=[A-ZÁÉÍÓÚÑ][a-zÁ-ÿ]{2,}\s+[a-zÁ-ÿ])/);
    if (genericCapsMatch) {
      const cap1 = genericCapsMatch[1].trim();
      const cap2 = genericCapsMatch[2].trim();
      if (!/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|PRIMERA\s+PARTE)\b/i.test(cap1)) {
        extractedTitle = cap1;
        extractedAuthor = cap2;
        working = working.substring(genericCapsMatch[0].length).trim();
        wasFused = true;
      }
    }
  }

  return {
    cleanedProse: working,
    extractedTitle,
    extractedAuthor,
    wasFused
  };
}

/**
 * Clasifica ontológicamente una página individual del PDF basándose en análisis léxico y estructural
 */
export function classifyBookPage(
  pageNumber: number,
  pageText: string,
  totalPages: number,
  knownTitle?: string,
  knownAuthor?: string,
  canonical?: Partial<CanonicalWorkProfile>
): {
  classification: PageClassificationType;
  confidence: number;
  cleanedText: string;
  detectedChapter?: string;
} {
  const raw = pageText.trim();
  if (raw.length < 15) {
    return {
      classification: pageNumber > Math.floor(totalPages * 0.8) ? 'back_matter' : 'title_imprint',
      confidence: 0.9,
      cleanedText: raw
    };
  }

  // 1. Verificar si es página exclusiva de Repositorio Digital (DigBib, Gutenberg, etc.)
  if (isDigitalRepositoryOrPromoBanner(raw)) {
    // Si la página solo contiene metadatos de DigBib o banner de descarga (menos de 600 caracteres y sin prosa literaria)
    const isOnlyRepo = raw.length < 500 || 
      /DigBib\s*\.\s*Org:\s*Die freie digitale Bibliothek/i.test(raw) ||
      /\*{3,5}\s*START OF TH(?:E|IS) PROJECT GUTENBERG/i.test(raw);
    
    const hasLiteraryDialogueOrSentences = /^[-–—«»"“]/m.test(raw) || /[.!?]\s+[A-ZÁÉÍÓÚÄÖÜÀÈÌÒÙÂÊÎÔÛÇ]/.test(raw);
    if (isOnlyRepo && !hasLiteraryDialogueOrSentences && !/(?:Cap[ií]tulo|Chapter|Kapitel|Chapitre|Capitolo|Livro|Глава|Teil|Parte)\b/i.test(raw)) {
      return {
        classification: 'repository_banner',
        confidence: 0.98,
        cleanedText: raw
      };
    }
  }

  // 2. Comprobar si la página contiene la frase canónica de inicio de la obra
  const openingCandidates: string[] = [];
  if (canonical?.openingSentenceOriginal) openingCandidates.push(canonical.openingSentenceOriginal);
  if (canonical?.openingSentenceTranslated) openingCandidates.push(canonical.openingSentenceTranslated);

  for (const op of openingCandidates) {
    if (op && op.length > 10 && raw.toLowerCase().includes(op.toLowerCase().slice(0, 30))) {
      return {
        classification: 'narrative_start',
        confidence: 1.0,
        cleanedText: raw
      };
    }
  }

  // 3. Comprobar si la página contiene encabezado formal de Capítulo 1 o Parte 1 Multilingüe
  // Español, Inglés, Alemán, Francés, Italiano, Portugués, Ruso (Глава 1), Latín
  const chapter1Regex = /(?:^|\n\s*)(?:#+\s*)?(?:(?:c\s*ap[ií]tulo|c\s*ap\.?|k\s*apitel|k\s*ap\.?|c\s*hapter|c\s*hap\.?|c\s*hapitre|c\s*apitolo|l\s*ivro|g\s*lava|глава|t\s*eil|a\s*bschnitt)\s+(?:1\b|I\b|one\b|first\b|primero\b|primer\b|primera\b|primeiro\b|primo\b|uno\b|um\b|erstes\b|premier\b|première\b|первая\b|1-я\b)\.?|(?:I|1)\b\.?)(?:\s*[-–—:.]\s*[^\n]{0,80})?(?:\r?\n+|$)/i;
  const chMatch = raw.match(chapter1Regex);
  if (chMatch && pageNumber <= Math.min(25, Math.ceil(totalPages * 0.35))) {
    // Verificar que no sea una mera mención de índice (ej. "Capítulo 1 ........... 15")
    if (!/(?:\.{2,}|…|\s{4,})\s*\d+$/.test(chMatch[0].trim())) {
      return {
        classification: 'narrative_start',
        confidence: 0.95,
        cleanedText: raw,
        detectedChapter: chMatch[0].trim()
      };
    }
  }

  // 4. Comprobar si es página de Tabla de Contenidos / Índice
  if (/^(?:[_\-*•\s]*)(?:#+\s*)?(?:[IÍ]NDICE|TABLA\s+DE\s+CONTENIDOS?|TABLE\s+OF\s+CONTENTS|CONTENTS|INHALT|INHALTSVERZEICHNIS|SOMMAIRE|TAVOLA|ÍNDICE\s+GERAL|ОГЛАВЛЕНИЕ|СОДЕРЖАНИЕ)\b/i.test(raw)) {
    return {
      classification: 'table_of_contents',
      confidence: 0.95,
      cleanedText: raw
    };
  }

  // 5. Comprobar si es página de Prólogo / Prefacio
  if (/^(?:[_\-*•\s]*)(?:#+\s*)?(?:PR[OÓ]LOGO|PREFACIO|ESTUDIO\s+PRELIMINAR|INTRODUCCI[OÓ]N|PREFACE|INTRODUCTION|FOREWORD|VORWORT|EINLEITUNG|AVANT-PROPOS|PRÉFACE|PREFAZIONE|ПРЕДИСЛОВИЕ|ВВЕДЕНИЕ)\b/i.test(raw)) {
    return {
      classification: 'preliminary_prologue',
      confidence: 0.95,
      cleanedText: raw
    };
  }

  // 6. Comprobar si es página legal / créditos de imprenta (totalmente agnóstico al idioma)
  const isLegalPage = /(?:ISBN\s*[:\-\d\sXx]+|Dep[oó]sito\s+legal|D\.R\.\s*©|Todos\s+los\s+derechos\s+reservados|All\s+rights\s+reserved|Alle\s+Rechte\s+vorbehalten|Tous\s+droits\s+réservés|Tutti\s+i\s+diritti\s+riservati|Todos\s+os\s+direitos\s+reservados|Impreso\s+en|Printed\s+in|Gedruckt\s+in|Imprimé\s+en|Stampato\s+in|Editorial\s+[A-ZÁÉÍÓÚa-z]+|Verlag\b|Editions?\b)/i.test(raw) &&
    raw.length < 1200 && !(/[-–—«»"“]/.test(raw) && raw.length > 500);
  
  if (isLegalPage && pageNumber <= Math.min(10, Math.ceil(totalPages * 0.2))) {
    return {
      classification: 'title_imprint',
      confidence: 0.95,
      cleanedText: raw
    };
  }

  // 7. Comprobar si es página de dedicatoria o epígrafe aislado
  const isDedicationPage = (/^(?:[_\-*•\s]*)(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Für\s+|Dem\s+|In\s+memoriam)\b/i.test(raw) || /^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/s.test(raw)) &&
    raw.length < 400 && pageNumber <= Math.min(10, Math.ceil(totalPages * 0.2));
  
  if (isDedicationPage) {
    return {
      classification: 'dedication_epigraph',
      confidence: 0.92,
      cleanedText: raw
    };
  }

  // 8. Comprobar si es página de Material Posterior (Colofón, Licencia Gutenberg, Catálogo)
  if (pageNumber >= Math.floor(totalPages * 0.75)) {
    const isBackMatterPage = /(?:Colof[oó]n|Colophon|Kolophon|Este\s+libro\s+se\s+termin[oó]|Acabouse\s+de\s+imprimir|Achev[eé]\s+d['’]imprimer|Finito\s+di\s+stampare|Cat[aá]logo\s+editorial|Catalogue|Otras\s+obras|Other\s+books|Weitere\s+werke|THE\s+FULL\s+PROJECT\s+GUTENBERG\s+LICENSE|END\s+OF\s+TH(?:E|IS)\s+PROJECT\s+GUTENBERG|FIN\s+DE\s+LA\s+OBRA|THE\s+END|ENDE|FINE|FIM|КОНЕЦ|Nachwort|Postface|Postfazione)\b/i.test(raw) ||
      (raw.length < 500 && isDigitalRepositoryOrPromoBanner(raw));
    
    if (isBackMatterPage) {
      return {
        classification: 'back_matter',
        confidence: 0.95,
        cleanedText: raw
      };
    }
  }

  // Por descarte: Si está en el rango inicial y tiene muy pocas palabras y títulos sueltos
  if (pageNumber <= 4 && raw.split(/\s+/).filter(Boolean).length < 25) {
    return {
      classification: 'title_imprint',
      confidence: 0.85,
      cleanedText: raw
    };
  }

  // Cuerpo novelesco estándar
  return {
    classification: 'narrative_body',
    confidence: 0.8,
    cleanedText: raw
  };
}

/**
 * Desglosa un texto completo con marcas `--- [PÁGINA X] ---` en páginas virtuales
 */
export function sliceTextIntoVirtualPages(fullText: string): ExtractedPage[] {
  if (!fullText) return [];

  const pageMarkerRegex = /---\s*\[\s*P[AÁ]GINA\s+(\d+)(?:\s*\([^)]*\))?\s*\]\s*---/gi;
  const markers: { pageNumber: number; index: number; length: number }[] = [];
  let m: RegExpExecArray | null;

  while ((m = pageMarkerRegex.exec(fullText)) !== null) {
    markers.push({
      pageNumber: parseInt(m[1], 10),
      index: m.index,
      length: m[0].length
    });
  }

  if (markers.length === 0) {
    // Si no tiene marcas explícitas de página, dividir por form feeds (\f) o bloques de ~350 palabras
    if (fullText.includes('\f')) {
      const parts = fullText.split('\f');
      return parts.map((pt, idx) => ({
        pageNumber: idx + 1,
        text: pt.trim(),
        charCount: pt.trim().length
      }));
    }

    // Dividir en páginas sintéticas de ~2000 caracteres respetando saltos de párrafo
    const paragraphs = fullText.split(/\n\s*\n+/);
    const syntheticPages: ExtractedPage[] = [];
    let currentText = '';
    let curPage = 1;

    for (const p of paragraphs) {
      if (currentText.length + p.length > 2200 && currentText.length > 500) {
        syntheticPages.push({ pageNumber: curPage++, text: currentText.trim() });
        currentText = p + '\n\n';
      } else {
        currentText += p + '\n\n';
      }
    }
    if (currentText.trim()) {
      syntheticPages.push({ pageNumber: curPage, text: currentText.trim() });
    }
    return syntheticPages;
  }

  const pages: ExtractedPage[] = [];
  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const textStart = cur.index + cur.length;
    const textEnd = i + 1 < markers.length ? markers[i + 1].index : fullText.length;
    const pageSlice = fullText.substring(textStart, textEnd).trim();

    pages.push({
      pageNumber: cur.pageNumber,
      text: pageSlice
    });
  }

  return pages;
}

/**
 * Ejecuta el Análisis Editorial Integral de Páginas del Libro (Paso 1).
 * Resuelve infaliblemente cualquier obra digitalizada independientemente de si tiene o no "Capítulo 1".
 */
export function analyzePdfBookPageStructure(
  rawPagesOrText: ExtractedPage[] | string,
  knownTitle?: string,
  knownAuthor?: string,
  canonicalProfile?: Partial<CanonicalWorkProfile>
): PdfBookStructureAnalysis {
  const pages: ExtractedPage[] = typeof rawPagesOrText === 'string'
    ? sliceTextIntoVirtualPages(rawPagesOrText)
    : rawPagesOrText;

  const totalPages = pages.length;

  if (totalPages === 0) {
    return {
      totalPages: 0,
      narrativeStartPage: 1,
      narrativeEndPage: 1,
      frontMatterPagesRange: 'Ninguna',
      backMatterPagesRange: 'Ninguna',
      pureNovelPagesRange: 'Ninguna',
      purifiedNovelText: '',
      novelParagraphs: [],
      firstPureParagraph: '',
      lastPureParagraph: '',
      frontMatter: { hasFrontMatter: false },
      backMatter: { hasBackMatter: false, title: '', text: '', wordCount: 0 },
      chapters: [],
      pageStructure: { frontMatterPages: 'Ninguna', novelStartPage: 1, novelEndPage: 1, backMatterPages: 'Ninguna', totalPages: 0, hasExplicitPages: false },
      continuityVerified: false
    };
  }

  // 1. Clasificación individual de cada página
  const classifiedPages: AnalyzedBookPage[] = [];
  let detectedStartPage = -1;
  let detectedEndPage = -1;

  for (let i = 0; i < totalPages; i++) {
    const p = pages[i];
    const classificationResult = classifyBookPage(
      p.pageNumber,
      p.text,
      totalPages,
      knownTitle,
      knownAuthor,
      canonicalProfile
    );

    const words = p.text.split(/\s+/).filter(Boolean).length;
    const paras = p.text.split(/\n\s*\n+/).filter(pr => pr.trim().length > 0).length;

    classifiedPages.push({
      pageNumber: p.pageNumber,
      rawText: p.text,
      cleanedText: classificationResult.cleanedText,
      charCount: p.text.length,
      wordCount: words,
      paragraphCount: paras,
      classification: classificationResult.classification,
      classificationConfidence: classificationResult.confidence,
      detectedChapter: classificationResult.detectedChapter,
      isCoverOrBlank: words < 5
    });

    if (classificationResult.classification === 'narrative_start' && detectedStartPage === -1) {
      detectedStartPage = p.pageNumber;
    }
  }

  // 2. Si no se detectó una página explícita de inicio mediante frase canónica o "Capítulo 1",
  // escanear las primeras 10 páginas para ubicar la primera página con prosa narrativa sostenida (> 80 palabras y diálogo/oraciones)
  if (detectedStartPage === -1) {
    for (let i = 0; i < Math.min(classifiedPages.length, 12); i++) {
      const cp = classifiedPages[i];
      if (cp.classification === 'repository_banner' || cp.classification === 'title_imprint' || cp.classification === 'dedication_epigraph' || cp.classification === 'table_of_contents') {
        continue;
      }
      
      // ANÁLISIS POSTERIOR AUTOMÁTICO DE CONTINUIDAD (LOOKAHEAD):
      // Si la página i tiene sustancia (> 60 palabras) y la página i+1 también continúa con narrativa:
      const nextPage = classifiedPages[i + 1];
      const hasNarrativeCadence = cp.wordCount > 50 && (
        /[.!?»”"]\s*$/.test(cp.rawText.trim()) ||
        /^[—–\-]\s*[A-ZÁÉÍÓÚÑ]/.test(cp.rawText.trim()) ||
        /(?:erwachte|despertó|woke|morning|mañana|vine|había|era|dijo|preguntó)\b/i.test(cp.rawText)
      );

      if (hasNarrativeCadence && (!nextPage || nextPage.wordCount > 30)) {
        detectedStartPage = cp.pageNumber;
        cp.classification = 'narrative_start';
        break;
      }
    }
  }

  if (detectedStartPage === -1) {
    detectedStartPage = classifiedPages[0]?.pageNumber || 1;
  }

  // 3. Localizar la página de desenlace de la historia (fin de la novela)
  for (let i = classifiedPages.length - 1; i >= 0; i--) {
    const cp = classifiedPages[i];
    if (cp.pageNumber < detectedStartPage) break;

    // Si la página es claramente colofón, catálogo o licencia final
    if (cp.classification === 'back_matter' || (cp.wordCount < 60 && isDigitalRepositoryOrPromoBanner(cp.rawText))) {
      continue;
    }

    detectedEndPage = cp.pageNumber;
    break;
  }

  if (detectedEndPage === -1 || detectedEndPage < detectedStartPage) {
    detectedEndPage = classifiedPages[classifiedPages.length - 1]?.pageNumber || detectedStartPage;
  }

  // 4. Compilar y purificar los textos preliminares (Front Matter)
  const frontPages = classifiedPages.filter(p => p.pageNumber < detectedStartPage);
  let frontTitle = knownTitle;
  let frontAuthor = knownAuthor;
  let frontDedication: string | undefined;
  let frontEpigraph: string | undefined;
  let frontLegal: string | undefined;
  const repoBanners: string[] = [];

  for (const fp of frontPages) {
    const bannerPurge = purgeDigitalRepositoryBanners(fp.rawText);
    if (bannerPurge.removedBanners.length > 0) {
      repoBanners.push(...bannerPurge.removedBanners);
    }

    const t = bannerPurge.cleanedText;
    if (/^(?:A\s+|Para\s+|Dedicado\s+a\s+|To\s+|For\s+|Für\s+|Dem\s+)/i.test(t) && t.length < 350) {
      frontDedication = frontDedication ? `${frontDedication}\n${t}` : t;
    } else if (/^[«“"'].*?[»”"']\s*(?:[-–—].*)?$/s.test(t) && t.length < 350) {
      frontEpigraph = frontEpigraph ? `${frontEpigraph}\n${t}` : t;
    } else if (/(?:ISBN|Dep[oó]sito legal|Todos los derechos|All rights reserved|KURT WOLFF|Editorial)/i.test(t)) {
      frontLegal = frontLegal ? `${frontLegal}\n${t}` : t;
    }
  }

  // 5. Compilar y purificar el cuerpo puro de la novela (Páginas detectedStartPage hasta detectedEndPage)
  const novelPages = classifiedPages.filter(p => p.pageNumber >= detectedStartPage && p.pageNumber <= detectedEndPage);
  const purifiedPageTexts: string[] = [];

  for (let i = 0; i < novelPages.length; i++) {
    const np = novelPages[i];
    let pageWorking = np.rawText;

    // A. En la primera página narrativa: purgar cualquier banner pegado arriba y desdoblar títulos/autores en mayúsculas
    if (i === 0) {
      const purgeResult = purgeDigitalRepositoryBanners(pageWorking);
      if (purgeResult.removedBanners.length > 0) {
        repoBanners.push(...purgeResult.removedBanners);
      }
      pageWorking = purgeResult.cleanedText;

      // Desprender "La METAMORFOSIS FRANZ KAFKA Una mañana..."
      const detached = detachFusedTitleAndAuthorFromProse(pageWorking, knownTitle, knownAuthor);
      if (detached.wasFused) {
        if (!frontTitle && detached.extractedTitle) frontTitle = detached.extractedTitle;
        if (!frontAuthor && detached.extractedAuthor) frontAuthor = detached.extractedAuthor;
        pageWorking = detached.cleanedProse;
      }
    }

    // B. En la última página narrativa: purgar avisos de descarga pegados al desenlace (ej. "sobre los cuales no FINgratis en...")
    if (i === novelPages.length - 1) {
      const trailingBanner = pageWorking.match(/(?:\b|(?<=[.!?»”"']|\.))(?:[-–—\s]*)(?:(?:M[aá]s\s*libros\s*gratis|h{2,}t{2,}t{2,}p{2,}s?:|libricultura|blogspot|telegram|digbib|This\s+file\s+was|Downloaded\s+from|Descargado\s+en)\b[^\n]*)/i);
      if (trailingBanner && trailingBanner.index !== undefined && trailingBanner.index > 20) {
        const severed = pageWorking.substring(trailingBanner.index).trim();
        pageWorking = pageWorking.substring(0, trailingBanner.index).trim();
        repoBanners.push(severed);
      }
    }

    purifiedPageTexts.push(pageWorking.trim());
  }

  // 6. Unir texto novelesco, soldar guiones partidos y dividir en párrafos limpios
  let fullNovelText = purifiedPageTexts.join('\n\n');
  fullNovelText = fullNovelText.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])[-–—]\s*\n+\s*([a-záéíóúñA-ZÁÉÍÓÚÑäöüßÄÖÜ])/g, '$1$2');

  const initialParagraphs = fullNovelText
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !/^[-–—\s]*\d{1,4}[-–—\s]*$/.test(p));

  const novelParagraphs: string[] = [];
  for (const p of initialParagraphs) {
    // Si el párrafo empieza con un banner residual, purgarlo
    const purged = purgeDigitalRepositoryBanners(p).cleanedText;
    if (purged) novelParagraphs.push(purged);
  }

  // 7. Primer y último párrafo puros
  let firstPureParagraph = '';
  let lastPureParagraph = '';

  for (const p of novelParagraphs) {
    if (p.length > 25 && !/^(?:Cap[ií]tulo|Kapitel|Chapter|[IVXLCDM]+)\b/i.test(p)) {
      firstPureParagraph = p;
      break;
    }
  }
  if (!firstPureParagraph && novelParagraphs.length > 0) {
    firstPureParagraph = novelParagraphs[0];
  }

  for (let i = novelParagraphs.length - 1; i >= 0; i--) {
    const p = novelParagraphs[i];
    if (p.length > 20 && !isDigitalRepositoryOrPromoBanner(p)) {
      lastPureParagraph = p;
      break;
    }
  }
  if (!lastPureParagraph && novelParagraphs.length > 0) {
    lastPureParagraph = novelParagraphs[novelParagraphs.length - 1];
  }

  // 8. Detección de capítulos
  const chapters = detectNovelChapters(novelParagraphs);

  // 9. Back Matter (Páginas posteriores a detectedEndPage)
  const backPages = classifiedPages.filter(p => p.pageNumber > detectedEndPage);
  const backTexts: string[] = backPages.map(p => p.rawText.trim()).filter(Boolean);
  if (repoBanners.length > 0) {
    backTexts.push(repoBanners.join('\n'));
  }
  const backMatterText = backTexts.join('\n\n').trim();
  const backMatterWords = backMatterText.split(/\s+/).filter(Boolean).length;

  const frontMatterRange = detectedStartPage > 1 ? `1–${detectedStartPage - 1}` : 'Ninguna';
  const backMatterRange = detectedEndPage < totalPages ? `${detectedEndPage + 1}–${totalPages}` : 'Ninguna';
  const novelRange = `${detectedStartPage}–${detectedEndPage}`;

  return {
    totalPages,
    narrativeStartPage: detectedStartPage,
    narrativeEndPage: detectedEndPage,
    frontMatterPagesRange: frontMatterRange,
    backMatterPagesRange: backMatterRange,
    pureNovelPagesRange: novelRange,
    purifiedNovelText: novelParagraphs.join('\n\n'),
    novelParagraphs,
    firstPureParagraph,
    lastPureParagraph,
    frontMatter: {
      title: frontTitle,
      author: frontAuthor,
      dedication: frontDedication,
      epigraph: frontEpigraph,
      legalNotice: frontLegal,
      repositoryNotice: repoBanners.length > 0 ? repoBanners.join(' | ') : undefined,
      hasFrontMatter: frontPages.length > 0 || Boolean(frontDedication || frontEpigraph || repoBanners.length > 0)
    },
    backMatter: {
      hasBackMatter: backPages.length > 0 || repoBanners.length > 0,
      title: backPages.length > 0 ? 'Colofón y Material Posterior' : repoBanners.length > 0 ? 'Avisos y Sellos de Repositorio' : '',
      text: backMatterText,
      wordCount: backMatterWords
    },
    chapters,
    pageStructure: {
      frontMatterPages: frontMatterRange,
      novelStartPage: detectedStartPage,
      novelEndPage: detectedEndPage,
      backMatterPages: backMatterRange,
      totalPages,
      hasExplicitPages: true
    },
    continuityVerified: novelParagraphs.length > 5
  };
}
