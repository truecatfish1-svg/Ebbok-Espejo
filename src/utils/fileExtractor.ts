import './polyfills';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist/build/pdf';
import { PageDiagnosis } from '../types';
import { cleanBookMetadataFromFilename, extractTableOfContentsFromTextAndOutline, ExtractedTableOfContents } from './intelligentBookCurator';
import { cleanInlineFootnoteReferencesAndScholarlyArtifacts, unfoldFusedChapterAndPrologueHeaders } from './novelCurator';

// Configurar worker de PDF.js de forma resiliente en el cliente web
// Apunta a la copia estática servida desde /pdfjs/pdf.worker.min.js del mismo origen
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `${window.location.origin}/pdfjs/pdf.worker.min.js`;
  } catch (e) {
    console.warn('PDF.js worker initialization warning:', e);
  }
}

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  imageDataUrl?: string;
  isScanned?: boolean;
  diagnosis?: PageDiagnosis;
}

export interface ExtractionResult {
  title?: string;
  author?: string;
  cleanedTitle?: string;
  detectedLanguage?: string;
  subject?: string;
  fullText: string;
  pages?: ExtractedPage[];
  sourceType: 'pdf' | 'docx' | 'markdown' | 'txt' | 'image_ocr' | 'scanned_page';
  estimatedTokens: number;
  isScannedPdf?: boolean;
  pageImages?: { pageNumber: number; dataUrl: string }[];
  pdfOutline?: any[];
  detectedToc?: ExtractedTableOfContents;
}

export async function extractFromDocx(file: File): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const text = result.value || '';
  const meta = cleanBookMetadataFromFilename(file.name);
  const detectedToc = extractTableOfContentsFromTextAndOutline(text);
  
  return {
    title: meta.title || file.name.replace(/\.[^/.]+$/, ""),
    author: meta.author,
    cleanedTitle: meta.title,
    detectedLanguage: meta.language,
    subject: meta.subject,
    fullText: text,
    sourceType: 'docx',
    estimatedTokens: Math.ceil(text.length / 3.8),
    detectedToc
  };
}

/**
 * Renderiza una página de PDF.js a Data URL en base64 (JPEG) usando un canvas en memoria
 */
export async function renderPdfPageToDataUrl(page: any, scale: number = 1.0): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(viewport.width, 1200);
  canvas.height = Math.min(viewport.height, 1600);
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto 2D para renderizar el PDF');
  }

  // Fondo blanco para que los PDF transparentes o escaneados se vean nítidos
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const renderContext = {
    canvasContext: ctx,
    viewport: viewport
  };

  try {
    const renderPromise = page.render(renderContext).promise;
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout render PDF canvas')), 4000)
    );
    await Promise.race([renderPromise, timeoutPromise]);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
    return dataUrl;
  } finally {
    // Limpieza de canvas para liberar memoria de GPU/heap
    canvas.width = 1;
    canvas.height = 1;
  }
}

interface TextPositionedItem {
  x: number;
  y: number;
  width?: number;
  height?: number;
  str: string;
}

/**
 * Reconstruye líneas y párrafos estructurados a partir de coordenadas espaciales,
 * preservando saltos de párrafo (\n\n), diálogos/entrevistas, listas y descartando
 * encabezados repetitivos de página (cornisas) y números de página aislados.
 */
function reconstructLinesAndParagraphs(items: TextPositionedItem[]): string {
  if (items.length === 0) return '';

  // 1. Agrupar items en líneas con tolerancia vertical (delta Y <= 3.5)
  // En PDF.js, Y mayor está más arriba en la página
  const sorted = [...items].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3.5) {
      return b.y - a.y; // Orden descendente en Y (de arriba a abajo)
    }
    return a.x - b.x; // De izquierda a derecha
  });

  const lines: { y: number; text: string; height: number; minX: number }[] = [];
  let currentLine: { y: number; items: TextPositionedItem[] } | null = null;

  for (const item of sorted) {
    if (!currentLine) {
      currentLine = { y: item.y, items: [item] };
    } else if (Math.abs(currentLine.y - item.y) <= 3.5) {
      currentLine.items.push(item);
    } else {
      const sortedLineItems = currentLine.items.sort((a, b) => a.x - b.x);
      const lineStr = sortedLineItems
        .map(i => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (lineStr.length > 0) {
        lines.push({
          y: currentLine.y,
          text: lineStr,
          height: sortedLineItems[0]?.height || 10,
          minX: sortedLineItems[0]?.x || 0
        });
      }
      currentLine = { y: item.y, items: [item] };
    }
  }

  if (currentLine) {
    const sortedLineItems = currentLine.items.sort((a, b) => a.x - b.x);
    const lineStr = sortedLineItems
      .map(i => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (lineStr.length > 0) {
      lines.push({
        y: currentLine.y,
        text: lineStr,
        height: sortedLineItems[0]?.height || 10,
        minX: sortedLineItems[0]?.x || 0
      });
    }
  }

  if (lines.length === 0) return '';

  // 2. Detección y filtrado de cornisas / running headers (arriba) y folios (abajo)
  let startIndex = 0;
  let endIndex = lines.length;

  if (lines.length > 2) {
    const topText = lines[0].text.trim();
    const isIsolatedNum = /^(?:p[áa]g\.?\s*)?\d{1,4}(?:\s*[-/]\s*\d{1,4})?$/i.test(topText);
    // Jamás descartar encabezados de capítulo legítimos (Capítulo, Chapter, Chap., etc.)
    const isLegitChapter = /^(?:cap[ií]tulo|cap\.?|chapter|chap\.?|kapitel|kap\.?|chapitre|parte|libro|[ivxlcdm]{1,6}\.?)\b/i.test(topText);
    const isHeaderArtifact = !isLegitChapter && /^(?:entrevista\s+personal|unidad|m[oó]dulo|secci[oó]n|editorial|universidad|instituto|facultad|manual|gu[ií]a)/i.test(topText) && topText.length < 60;

    // Si la primera línea es un folio o una cornisa y tiene un salto vertical con la siguiente línea
    if (isIsolatedNum || (isHeaderArtifact && lines.length > 1 && (lines[0].y - lines[1].y > 12))) {
      startIndex = 1;
    }
  }

  if (lines.length > startIndex + 2) {
    const bottomText = lines[lines.length - 1].text.trim();
    const isIsolatedBottomNum = /^(?:p[áa]g\.?\s*)?\d{1,4}(?:\s*[-/]\s*\d{1,4})?$/i.test(bottomText);
    if (isIsolatedBottomNum) {
      endIndex = lines.length - 1;
    }
  }

  // 3. Reconstrucción estructurada respetando párrafos, diálogos/entrevistas y listas
  const structuredParagraphs: string[] = [];
  let currentParagraph = '';
  let prevLine: { y: number; text: string; height: number; minX: number } | null = null;

  // Helper para verificar encabezados de capítulo o partes
  const checkIsChapterHeading = (t: string) => 
    /^(?:#+\s*)?(?:Cap[ií]tulo|Cap\.?|Kapitel|Kap\.?|Chapter|Chap\.?|Chapitre|Capitolo|Parte|Part|Teil|Book|Libro|Acto)\s+([0-9IVXLCDM]+|one\b|two\b|first\b|primero\b|segundo\b|uno\b|primer\b|erstes\b|premier\b)\.?$/i.test(t.trim()) ||
    /^(?:#+\s*)?(?:Cap[ií]tulo|Cap\.?|Kapitel|Kap\.?|Chapter|Chap\.?|Chapitre|Capitolo|Parte|Part|Teil|Book|Libro|Acto)\s*$/i.test(t.trim()) ||
    /^[IVXLCDM]{1,6}\.?\s*$/.test(t.trim());

  // Desdoblar líneas si un encabezado de capítulo vino pegado a la primera oración en la misma línea
  const normalizedLines: { y: number; text: string; height: number; minX: number }[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const l = lines[i];
    const fusedMatch = l.text.match(/^((?:#+\s*)?(?:Cap[ií]tulo|Cap\.?|Kapitel|Kap\.?|Chapter|Chap\.?|Chapitre|Capitolo|Parte|Part|Libro|Book)\s+(?:[0-9IVXLCDM]+|one\b|two\b|first\b|primero\b|segundo\b|uno\b|primer\b|erstes\b|premier\b)\.?|[IVXLCDM]{1,6}\.)\s+([A-ZÁÉÍÓÚÑ"“«].+)$/i);
    if (fusedMatch) {
      normalizedLines.push({
        y: l.y,
        text: fusedMatch[1].trim(),
        height: l.height,
        minX: l.minX
      });
      normalizedLines.push({
        y: l.y - l.height - 2,
        text: fusedMatch[2].trim(),
        height: l.height,
        minX: l.minX
      });
    } else {
      normalizedLines.push(l);
    }
  }

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i];
    const text = line.text;

    if (!prevLine) {
      currentParagraph = text;
      prevLine = line;
      continue;
    }

    const deltaY = prevLine.y - line.y;
    const avgHeight = Math.max(line.height, 10);
    const prevEndedWithTerminal = /[.:?!»”"]$/.test(prevLine.text.trim());
    
    // Si la línea previa era sólo "CAPÍTULO" y esta es el número "I" o "1", unirlos como encabezado canónico
    if (/^(?:#+\s*)?(?:Cap[ií]tulo|Cap\.?|Kapitel|Kap\.?|Chapter|Chap\.?|Chapitre|Capitolo)\s*$/i.test(currentParagraph.trim()) && /^[0-9IVXLCDM]{1,6}\.?$/i.test(text.trim())) {
      currentParagraph = `${currentParagraph.trim()} ${text.trim()}`;
      prevLine = line;
      continue;
    }

    // Detectores de inicio de nueva estructura (diálogo literario real, encabezado, lista)
    const isDialogueOrQA = /^[-—–]\s+[A-ZÁÉÍÓÚÑÄÖÜa-záéíóúñäöü«"“¡¿]|^[«»"“„]|\b(?:entrevistador|candidato|postulante|pregunta|respuesta|p:|r:|e:|c:)\b/i.test(text);
    const isUppercaseHeading = /^[A-ZÁÉÍÓÚÑ0-9\s.,:;¿?¡!]{4,60}$/.test(text) && !/[a-zäöü]/.test(text);
    const isChapterHeading = checkIsChapterHeading(text);
    const prevWasChapterHeading = checkIsChapterHeading(prevLine.text);

    // Si la línea previa fue un encabezado de capítulo, la siguiente línea JAMÁS se fusiona con él
    const shouldStartNewParagraph = 
      isChapterHeading ||
      prevWasChapterHeading ||
      isDialogueOrQA ||
      (isUppercaseHeading && prevEndedWithTerminal) ||
      (prevEndedWithTerminal && deltaY > 1.6 * avgHeight) ||
      (prevEndedWithTerminal && prevLine.text.trim().length < 35);

    if (shouldStartNewParagraph) {
      if (currentParagraph.trim().length > 0) {
        structuredParagraphs.push(currentParagraph.trim());
      }
      currentParagraph = text;
    } else {
      // Unir líneas de la misma oración de forma continua
      if (currentParagraph.endsWith('-') || currentParagraph.endsWith('–') || currentParagraph.endsWith('—')) {
        // Palabra cortada con guion de fin de línea: unir directamente
        currentParagraph = currentParagraph.replace(/[-–—]+$/, '') + text;
      } else {
        currentParagraph += ' ' + text;
      }
    }

    prevLine = line;
  }

  if (currentParagraph.trim().length > 0) {
    structuredParagraphs.push(currentParagraph.trim());
  }

  const rawPageResult = structuredParagraphs.join('\n\n');
  return cleanInlineFootnoteReferencesAndScholarlyArtifacts(unfoldFusedChapterAndPrologueHeaders(rawPageResult));
}

/**
 * Analiza los items de texto de una página PDF considerando sus coordenadas X, Y.
 * Detecta doble columna y ordena el flujo de lectura (Columna Izquierda -> Columna Derecha)
 * preservando la estructura en párrafos y bloques sin insertar artefactos de columna.
 */
function processTextItemsWithLayoutAwareness(items: any[], pageWidth: number): {
  reconstructedText: string;
  hasDoubleColumn: boolean;
} {
  if (!items || items.length === 0) {
    return { reconstructedText: '', hasDoubleColumn: false };
  }

  const validItems: TextPositionedItem[] = items
    .filter((item: any) => item && typeof item.str === 'string' && item.str.trim().length > 0)
    .map((item: any) => ({
      x: item.transform ? item.transform[4] : 0,
      y: item.transform ? item.transform[5] : 0,
      width: item.width || 0,
      height: item.height || Math.abs(item.transform ? item.transform[0] : 10),
      str: item.str || ''
    }));

  if (validItems.length < 5) {
    return {
      reconstructedText: validItems.map(i => i.str).join(' ').trim(),
      hasDoubleColumn: false
    };
  }

  const midpoint = pageWidth / 2;
  const marginThreshold = pageWidth * 0.08;

  let leftColCount = 0;
  let rightColCount = 0;

  for (const item of validItems) {
    if (item.x < midpoint - marginThreshold) {
      leftColCount++;
    } else if (item.x > midpoint + marginThreshold) {
      rightColCount++;
    }
  }

  const total = validItems.length;
  const isDoubleColumn = (leftColCount / total > 0.22) && (rightColCount / total > 0.22);

  if (isDoubleColumn) {
    const leftItems = validItems.filter(i => i.x < midpoint);
    const rightItems = validItems.filter(i => i.x >= midpoint);

    const leftText = reconstructLinesAndParagraphs(leftItems).trim();
    const rightText = reconstructLinesAndParagraphs(rightItems).trim();

    // Soldar columnas limpiamente sin insertar marcas tipo "[--- COLUMNA DERECHA ---]"
    const endsWithTerminal = /[.:?!»”"]$/.test(leftText);
    let combined = '';
    if (!endsWithTerminal && (leftText.endsWith('-') || leftText.endsWith('–') || leftText.endsWith('—'))) {
      combined = leftText.replace(/[-–—]+$/, '') + rightText;
    } else if (!endsWithTerminal && leftText.length > 0 && rightText.length > 0) {
      combined = `${leftText} ${rightText}`;
    } else {
      combined = `${leftText}\n\n${rightText}`;
    }

    return {
      reconstructedText: combined.trim(),
      hasDoubleColumn: true
    };
  }

  return {
    reconstructedText: reconstructLinesAndParagraphs(validItems),
    hasDoubleColumn: false
  };
}

/**
 * Extrae texto y detecta si el PDF es escaneado, híbrido o tiene OCR imperfecto con doble columna.
 */
export async function extractFromPdf(
  file: File, 
  onProgress?: (percent: number, message?: string) => void
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();
  let pdf: any;
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'
    });
    pdf = await loadingTask.promise;
  } catch (err) {
    console.warn('Fallo al cargar PDF con worker configurado, intentando fallback sin worker:', err);
    // Asegurar que si el worker remoto falla o fue bloqueado, use el fallback con el worker de cdn o local
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
      const retryTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/',
        cMapPacked: true
      });
      pdf = await retryTask.promise;
    } catch (secondErr) {
      console.warn('Fallback secundario con disableFontFace:', secondErr);
      const fallbackTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        disableFontFace: true
      });
      pdf = await fallbackTask.promise;
    }
  }
  const numPages = pdf.numPages;
  
  const pages: ExtractedPage[] = [];
  const pageImages: { pageNumber: number; dataUrl: string }[] = [];
  let combinedText = '';
  let pagesWithLittleTextCount = 0;

  for (let i = 1; i <= numPages; i++) {
    if (onProgress) {
      onProgress(Math.round(((i - 0.5) / numPages) * 100), `Analizando página ${i} de ${numPages}...`);
    }

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.0 });
    let pageText = '';
    let hasDoubleColumn = false;
    
    try {
      const content = await page.getTextContent();
      const layoutResult = processTextItemsWithLayoutAwareness(content.items, viewport.width);
      pageText = layoutResult.reconstructedText;
      hasDoubleColumn = layoutResult.hasDoubleColumn;
    } catch (textErr) {
      console.warn(`No se pudo extraer texto nativo de la página ${i}:`, textErr);
      pageText = '';
    }

    // Diagnóstico de calidad de la página
    // Si tiene al menos 20 caracteres reales (ej. títulos cortos, dedicatorias o párrafos), es texto nativo
    const charCount = pageText.trim().length;
    const isScanned = charCount < 20;
    if (isScanned) {
      pagesWithLittleTextCount++;
    }

    let diagnosisKind: PageDiagnosis['kind'] = 'clean_native';
    let diagnosisDesc = 'Texto digital nativo extraído con fidelidad de saltos y párrafos (0 tokens).';

    if (isScanned) {
      diagnosisKind = 'pure_scan';
      diagnosisDesc = 'Página escaneada o gráfica sin texto digital. Requiere transcripción visual.';
    } else if (hasDoubleColumn) {
      diagnosisKind = 'double_column';
      diagnosisDesc = 'Doble columna detectada y secuenciada para lectura continua natural.';
    } else if (charCount < 100 && /[^\w\s.,;:()$%\-+=/\\áéíóúÁÉÍÓÚñÑ]{6,}/.test(pageText)) {
      diagnosisKind = 'imperfect_ocr';
      diagnosisDesc = 'Capa de OCR de baja calidad en origen. Se puede depurar de forma local.';
    }

    let pageImageDataUrl: string | undefined;
    // Solo renderizar canvas/imagen para OCR si la página es verdaderamente un escaneo sin texto (máximo 10 páginas para evitar fugas de memoria)
    if (isScanned && pageImages.length < 10) {
      try {
        pageImageDataUrl = await renderPdfPageToDataUrl(page, 1.0);
        pageImages.push({ pageNumber: i, dataUrl: pageImageDataUrl });
      } catch (renderErr) {
        console.warn(`Error al renderizar canvas de página ${i}:`, renderErr);
      }
    }

    const diagnosis: PageDiagnosis = {
      kind: diagnosisKind,
      charCount,
      hasDoubleColumn,
      confidence: isScanned ? 95 : hasDoubleColumn ? 90 : 85,
      description: diagnosisDesc
    };

    pages.push({
      pageNumber: i,
      text: pageText,
      imageDataUrl: pageImageDataUrl,
      isScanned,
      diagnosis
    });

    if (pageText && !isScanned) {
      combinedText += `\n--- [PÁGINA ${i}] ---\n` + pageText + '\n';
    } else {
      combinedText += `\n--- [PÁGINA ${i} (Escaneada - Imagen)] ---\n[Página escaneada pendiente de OCR por Visión]\n`;
    }

    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100), `Página ${i}/${numPages} lista.`);
    }
  }

  // 1. Extraer outline / marcadores hipervinculados de capítulos del PDF si existen
  let pdfOutline: any[] = [];
  try {
    pdfOutline = await pdf.getOutline();
  } catch (outlineErr) {
    console.warn('No se pudo extraer outline hipervinculado del PDF:', outlineErr);
  }

  // 2. Extraer TOC estructural (hipervínculos + bloque CONTENTS textual)
  const detectedToc = extractTableOfContentsFromTextAndOutline(combinedText, pdfOutline);

  // 3. Limpiar metadatos a partir del nombre del archivo y texto inicial
  const meta = cleanBookMetadataFromFilename(file.name);

  // Si más del 60% de las páginas carecen de capa de texto, es un PDF mayoritariamente escaneado
  const isScannedPdf = pagesWithLittleTextCount >= Math.ceil(numPages * 0.6);

  return {
    title: meta.title || file.name.replace(/\.[^/.]+$/, ""),
    author: meta.author,
    cleanedTitle: meta.title,
    detectedLanguage: meta.language,
    subject: meta.subject,
    fullText: combinedText,
    pages,
    pageImages,
    isScannedPdf,
    sourceType: isScannedPdf ? 'scanned_page' : 'pdf',
    estimatedTokens: Math.ceil(combinedText.length / 3.8),
    pdfOutline,
    detectedToc
  };
}

/**
 * Procesa archivos de imagen directamente (.png, .jpg, .jpeg, .webp)
 */
export async function extractFromImageFile(file: File, pageNumber: number = 1): Promise<{
  title: string;
  imageDataUrl: string;
  sourceType: 'image_ocr';
  pageNumber: number;
  diagnosis: PageDiagnosis;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        title: file.name.replace(/\.[^/.]+$/, ""),
        imageDataUrl: reader.result as string,
        sourceType: 'image_ocr',
        pageNumber,
        diagnosis: {
          kind: 'pure_scan',
          charCount: 0,
          confidence: 100,
          description: 'Imagen directa cargada. Transcripción mediante modelo de visión multimodal.'
        }
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function extractFromTextFile(file: File): Promise<ExtractionResult> {
  const text = await file.text();
  const isMd = file.name.endsWith('.md');
  const meta = cleanBookMetadataFromFilename(file.name);
  const detectedToc = extractTableOfContentsFromTextAndOutline(text);

  return {
    title: meta.title || file.name.replace(/\.[^/.]+$/, ""),
    author: meta.author,
    cleanedTitle: meta.title,
    detectedLanguage: meta.language,
    subject: meta.subject,
    fullText: text,
    sourceType: isMd ? 'markdown' : 'txt',
    estimatedTokens: Math.ceil(text.length / 3.8),
    detectedToc
  };
}

export function autoSplitTextIntoChunks(
  fullText: string,
  mode: 'heading' | 'page' | 'words',
  maxWordsPerChunk: number = 1000,
  defaultTitlePrefix: string = 'Fragmento'
): { title: string; content: string; pageNumber?: number; diagnosis?: PageDiagnosis }[] {
  const chunks: { title: string; content: string; pageNumber?: number; diagnosis?: PageDiagnosis }[] = [];

  if (mode === 'page') {
    const pageParts = fullText.split(/(?:---\s*\[P[AÁ]GINA\s+(\d+)(?:\s*\([^)]*\))?\]\s*---|---\s*P[aá]gina\s+(\d+)\s*---|\f)/gi);
    
    if (pageParts.length > 1) {
      let currentPage = 1;
      for (let i = 0; i < pageParts.length; i++) {
        const part = pageParts[i];
        if (!part) continue;
        
        if (/^\d+$/.test(part.trim())) {
          currentPage = parseInt(part.trim(), 10);
          continue;
        }
        
        const cleanPart = part.trim();
        if (cleanPart.length > 10) {
          chunks.push({
            title: `Página ${currentPage}`,
            content: cleanPart,
            pageNumber: currentPage,
            diagnosis: {
              kind: 'clean_native',
              charCount: cleanPart.length,
              confidence: 90,
              description: `Página ${currentPage} delimitada.`
            }
          });
          currentPage++;
        }
      }
    }
  } else if (mode === 'heading') {
    const headingRegex = /(?:^|\n)(?=#{1,3}\s+|CAP[IÍ]TULO\s+\d+|UNIDAD\s+\d+|TEMA\s+\d+|SECCI[OÓ]N\s+\d+)/gi;
    const parts = fullText.split(headingRegex);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]?.trim();
      if (!part || part.length < 20) continue;
      
      const firstLine = part.split('\n')[0].replace(/^[#\s*-]+/, '').trim().substring(0, 60);
      const title = firstLine || `${defaultTitlePrefix} ${i + 1}`;
      
      chunks.push({
        title,
        content: part,
        diagnosis: {
          kind: 'clean_native',
          charCount: part.length,
          confidence: 90,
          description: `Sección delimitada por encabezado: ${title}`
        }
      });
    }
  }

  if (chunks.length === 0 || mode === 'words') {
    const paragraphs = fullText.split(/\n\s*\n/);
    let currentChunkContent = '';
    let currentWords = 0;
    let chunkIndex = 1;

    for (const p of paragraphs) {
      const pWords = p.trim().split(/\s+/).filter(Boolean).length;
      if (currentWords + pWords > maxWordsPerChunk && currentWords > 100) {
        chunks.push({
          title: `${defaultTitlePrefix} ${chunkIndex}`,
          content: currentChunkContent.trim(),
          diagnosis: {
            kind: 'clean_native',
            charCount: currentChunkContent.trim().length,
            confidence: 85,
            description: `Fragmento por volumen (${currentWords} palabras)`
          }
        });
        chunkIndex++;
        currentChunkContent = p + '\n\n';
        currentWords = pWords;
      } else {
        currentChunkContent += p + '\n\n';
        currentWords += pWords;
      }
    }

    if (currentChunkContent.trim().length > 0) {
      chunks.push({
        title: `${defaultTitlePrefix} ${chunkIndex}`,
        content: currentChunkContent.trim(),
        diagnosis: {
          kind: 'clean_native',
          charCount: currentChunkContent.trim().length,
          confidence: 85,
          description: `Fragmento por volumen (${currentWords} palabras)`
        }
      });
    }
  }

  return chunks.length > 0 ? chunks : [{ 
    title: `${defaultTitlePrefix} 1`, 
    content: fullText.trim(),
    diagnosis: {
      kind: 'clean_native',
      charCount: fullText.trim().length,
      confidence: 80,
      description: 'Fragmento único importado'
    }
  }];
}
