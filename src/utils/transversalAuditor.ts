import { RawChunk, ContentBlock, ContentBlockType, TransversalAuditReport, HierarchyAnomaly } from '../types';

/**
 * Normaliza y cura caracteres tipográficos esenciales para novelas y obras literarias:
 * - Unifica guiones de diálogo a raya de diálogo larga em-dash ('— ')
 * - Preserva comillas latinas / inglesas
 * - Corrige puntos suspensivos (...)
 */
export function normalizeLiteraryTypography(text: string): string {
  if (!text) return '';

  let res = text;

  // 1. Rayas de diálogo al inicio de línea o tras salto de párrafo:
  // Reemplazar - o – o -- por raya larga U+2014 em-dash con espacio fino/normal
  res = res.replace(/(?:^|\n)\s*(?:--|–|-)\s*/g, (match) => {
    return match.startsWith('\n') ? '\n— ' : '— ';
  });

  // Diálogo interior con guion de acotación: "—dijo él—"
  res = res.replace(/\s*(?:--|–)\s*/g, ' — ');

  // 2. Separadores ornamentales comunes en novelas:
  res = res.replace(/(?:^|\n)\s*(?:\*\s*\*\s*\*|·\s*·\s*·|-{3,}|_{3,})\s*(?=\n|$)/g, '\n\n* * *\n\n');

  // 3. Normalizar comillas y elipsis
  res = res.replace(/\.{3,}/g, '…');

  return res.trim();
}

/**
 * Detecta si un fragmento de texto corresponde a un poema o estrofa de versos.
 * Criterios: múltiples líneas cortas (menos de 60 caracteres) con saltos simples,
 * frecuentemente con mayúscula inicial en cada verso o rima.
 */
export function isPoeticVerseBlock(content: string): boolean {
  if (!content) return false;
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return false;

  // Si todas o casi todas las líneas tienen menos de 70 caracteres y no son solo números o viñetas
  const shortLines = lines.filter(l => l.length > 0 && l.length <= 70 && !/^[0-9]+[\.\)]/.test(l));
  const ratio = shortLines.length / lines.length;

  return ratio >= 0.75 && lines.length >= 3;
}

/**
 * Detecta si un texto es un epígrafe o dedicatoria novelística.
 */
export function isEpigraphBlock(content: string): boolean {
  if (!content) return false;
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 6) return false;

  const text = content.trim();
  const hasAuthorAttribution = /(?:—|--|\bde\b|\bby\b)\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+)*/.test(text);
  const isDedication = /^(?:A\s+[A-ZÁÉÍÓÚ]|Para\s+[A-ZÁÉÍÓÚ]|En\s+memoria\s+de|Dedico\s+este\s+libro)/i.test(text);

  return (hasAuthorAttribution && text.length < 350) || (isDedication && text.length < 250);
}

/**
 * Detecta si un texto es una carta o misiva epistolar dentro de una narración.
 */
export function isEpistolaryLetterBlock(content: string): boolean {
  if (!content) return false;
  const text = content.trim();
  const hasGreeting = /^(?:Querid[oa]s?|Estimad[oa]s?|Mi\s+querid[oa]|Apreciad[oa]s?|Muy\s+señor\s+mío|Recordad[oa]|Excelentísim[oa]):/i.test(text);
  const hasDateLocation = /^(?:[A-ZÁÉÍÓÚ][a-záéíóúñ]+,\s+\d{1,2}\s+de\s+[a-z]+|\d{1,2}\s+de\s+[a-z]+\s+de\s+\d{4})/i.test(text);
  const hasFarewell = /(?:Sinceramente|Afectuosamente|Con\s+cariño|Tuyo\s+siempre|Tu\s+humilde\s+servidor|Queda\s+de\s+usted)[,\.]/i.test(text);

  return (hasGreeting && (hasFarewell || hasDateLocation)) || (hasDateLocation && hasFarewell);
}

/**
 * Realiza una auditoría exhaustiva de la jerarquía de títulos y tipología transversal
 * de todos los fragmentos del libro.
 */
export function analyzeTransversalHierarchy(chunks: RawChunk[]): TransversalAuditReport {
  const anomalies: HierarchyAnomaly[] = [];
  const headingCounts = { h1: 0, h2: 0, h3: 0, h4: 0 };
  const literaryCounts = {
    poems: 0,
    epigraphs: 0,
    letters: 0,
    dialogues: 0,
    blockquotes: 0,
    sceneBreaks: 0,
  };
  const academicCounts = {
    tables: 0,
    formulas: 0,
    boxes: 0,
    exercises: 0,
  };

  let totalBlocks = 0;
  let currentActiveLevel = 0; // 0=ninguno, 1=h1, 2=h2, 3=h3, 4=h4
  const detectedHierarchyPath: string[] = [];

  for (const chunk of chunks) {
    const blocks = chunk.blocks || [];
    for (const block of blocks) {
      totalBlocks++;

      // Contadores
      if (block.type === 'heading1') {
        headingCounts.h1++;
        currentActiveLevel = 1;
        if (block.content) {
          detectedHierarchyPath.push(`[H1] ${block.content.substring(0, 40)}`);
        }
      } else if (block.type === 'heading2') {
        headingCounts.h2++;
        if (currentActiveLevel === 0) {
          // Anomalía: H2 sin H1 previo
          anomalies.push({
            id: `anom_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: 'heading2',
            suggestedType: 'heading1',
            reason: 'Se encontró un Título H2 sin haber abierto ningún Capítulo o Título Mayor (H1).',
            titleOrPreview: block.content || block.title || 'Título Secundario',
            severity: 'medium'
          });
        }
        currentActiveLevel = 2;
      } else if (block.type === 'heading3') {
        headingCounts.h3++;
        if (currentActiveLevel < 2) {
          // Anomalía: H3 sin H2 previo
          anomalies.push({
            id: `anom_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: 'heading3',
            suggestedType: currentActiveLevel === 1 ? 'heading2' : 'heading1',
            reason: 'Salto abrupto de jerarquía: H3 sin existir un Subtítulo H2 contenedor.',
            titleOrPreview: block.content || block.title || 'Subtema',
            severity: 'low'
          });
        }
        currentActiveLevel = 3;
      } else if (block.type === 'heading4') {
        headingCounts.h4++;
        currentActiveLevel = 4;
      }

      // Verificación de títulos demasiado largos (posible falso positivo de OCR)
      if (['heading1', 'heading2', 'heading3'].includes(block.type)) {
        const textLen = (block.content || '').length;
        if (textLen > 160) {
          anomalies.push({
            id: `anom_long_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: block.type,
            suggestedType: 'paragraph',
            reason: `Texto clasificado como ${block.type} excede los 160 caracteres (${textLen} caracteres). Probable párrafo normal con formato negrita confundido por la IA.`,
            titleOrPreview: (block.content || '').substring(0, 50) + '...',
            severity: 'high'
          });
        }
      }

      // Verificación de elementos literarios
      if (block.type === 'poem_verse') literaryCounts.poems++;
      if (block.type === 'epigraph') literaryCounts.epigraphs++;
      if (block.type === 'epistolary_letter') literaryCounts.letters++;
      if (block.type === 'novel_dialogue') literaryCounts.dialogues++;
      if (block.type === 'blockquote') literaryCounts.blockquotes++;
      if (block.type === 'ornamental_break') literaryCounts.sceneBreaks++;

      // Verificación de elementos académicos
      if (block.type === 'table') academicCounts.tables++;
      if (block.type === 'latex_math') academicCounts.formulas++;
      if (['theory_box', 'important_note', 'definition', 'curiosity'].includes(block.type)) academicCounts.boxes++;
      if (block.type === 'exercise') academicCounts.exercises++;

      // Detección de párrafos que en realidad son versos poéticos o separadores
      if (block.type === 'paragraph') {
        const raw = block.content || '';
        if (raw.trim() === '* * *' || raw.trim() === '***' || raw.trim() === '— • —') {
          anomalies.push({
            id: `anom_break_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: 'paragraph',
            suggestedType: 'ornamental_break',
            reason: 'Separador de descanso de escena novelístico detectado como párrafo simple.',
            titleOrPreview: raw.trim(),
            severity: 'low'
          });
        } else if (isPoeticVerseBlock(raw)) {
          anomalies.push({
            id: `anom_poem_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: 'paragraph',
            suggestedType: 'poem_verse',
            reason: 'Estructura métrica poética con versos cortos detectada en párrafo genérico.',
            titleOrPreview: raw.substring(0, 45) + '...',
            severity: 'medium'
          });
        } else if (isEpigraphBlock(raw)) {
          anomalies.push({
            id: `anom_epi_${block.id}`,
            blockId: block.id,
            chunkId: chunk.id,
            currentType: 'paragraph',
            suggestedType: 'epigraph',
            reason: 'Cita introductoria / dedicatoria con autor detectada en párrafo normal.',
            titleOrPreview: raw.substring(0, 45) + '...',
            severity: 'low'
          });
        } else if (raw.trim().startsWith('— ') || raw.trim().startsWith('– ') || raw.trim().startsWith('- ')) {
          if (raw.split('\n').some(l => l.trim().startsWith('—'))) {
            literaryCounts.dialogues++;
          }
        }
      }
    }
  }

  const highCount = anomalies.filter(a => a.severity === 'high').length;
  const medCount = anomalies.filter(a => a.severity === 'medium').length;
  const lowCount = anomalies.filter(a => a.severity === 'low').length;
  const healthScore = Math.max(10, Math.min(100, Math.round(100 - (highCount * 15 + medCount * 5 + lowCount * 2))));
  const isUniform = highCount === 0 && healthScore >= 80;

  return {
    isUniform,
    healthScore,
    totalBlocks,
    headingCounts,
    literaryCounts,
    academicCounts,
    anomalies,
    detectedHierarchyPath: detectedHierarchyPath.slice(0, 10)
  };
}

/**
 * Normaliza y unifica de manera transversal todos los bloques del libro:
 * - Corrige saltos de títulos
 * - Tipifica poemas, epígrafes, diálogos novelísticos y descansos ornamentales
 * - Aplica rayas de diálogo largas '— '
 */
export function applyTransversalNormalization(
  chunks: RawChunk[],
  options: {
    autoFixHeadings?: boolean;
    unifyDialogues?: boolean;
    detectLiteraryBlocks?: boolean;
  } = { autoFixHeadings: true, unifyDialogues: true, detectLiteraryBlocks: true }
): { updatedChunks: RawChunk[]; fixedCount: number } {
  let fixedCount = 0;
  let activeH1 = false;
  let activeH2 = false;

  const updatedChunks = chunks.map(chunk => {
    if (!chunk.blocks || chunk.blocks.length === 0) return chunk;

    const newBlocks: ContentBlock[] = chunk.blocks.map(block => {
      let updatedType: ContentBlockType = block.type;
      let updatedContent = block.content || '';
      let wasModified = false;

      // 1. Normalización de Títulos y Niveles
      if (options.autoFixHeadings) {
        if (block.type === 'heading1') {
          activeH1 = true;
          activeH2 = false;
          // Si el texto de un H1 es excesivamente largo, revertir a párrafo destacado
          if (updatedContent.length > 180) {
            updatedType = 'paragraph';
            wasModified = true;
          }
        } else if (block.type === 'heading2') {
          // Si no hay H1 activo, promover a H1 para uniformidad transversal
          if (!activeH1) {
            updatedType = 'heading1';
            activeH1 = true;
            wasModified = true;
          } else {
            activeH2 = true;
          }
          if (updatedContent.length > 180) {
            updatedType = 'paragraph';
            wasModified = true;
          }
        } else if (block.type === 'heading3') {
          // Si no hay ni H1 ni H2, corregir
          if (!activeH1) {
            updatedType = 'heading1';
            activeH1 = true;
            wasModified = true;
          } else if (!activeH2) {
            updatedType = 'heading2';
            activeH2 = true;
            wasModified = true;
          }
          if (updatedContent.length > 180) {
            updatedType = 'paragraph';
            wasModified = true;
          }
        }
      }

      // 2. Normalización de Tipografía Literaria (Guiones de Diálogo)
      if (options.unifyDialogues && (block.type === 'paragraph' || block.type === 'novel_dialogue')) {
        const normalized = normalizeLiteraryTypography(updatedContent);
        if (normalized !== updatedContent) {
          updatedContent = normalized;
          wasModified = true;
        }

        if (updatedContent.trim().startsWith('— ') && updatedType === 'paragraph') {
          updatedType = 'novel_dialogue';
          wasModified = true;
        }
      }

      // 3. Detección de Bloques Literarios Delicados (Poemas, Epígrafes, Descansos)
      if (options.detectLiteraryBlocks && updatedType === 'paragraph') {
        const trimmed = updatedContent.trim();
        if (trimmed === '* * *' || trimmed === '***' || trimmed === '❦' || trimmed === '— • —') {
          updatedType = 'ornamental_break';
          updatedContent = '* * *';
          wasModified = true;
        } else if (isPoeticVerseBlock(updatedContent)) {
          updatedType = 'poem_verse';
          wasModified = true;
        } else if (isEpigraphBlock(updatedContent)) {
          updatedType = 'epigraph';
          wasModified = true;
        } else if (isEpistolaryLetterBlock(updatedContent)) {
          updatedType = 'epistolary_letter';
          wasModified = true;
        }
      }

      if (wasModified) {
        fixedCount++;
        return {
          ...block,
          type: updatedType,
          content: updatedContent
        };
      }

      return block;
    });

    return {
      ...chunk,
      blocks: newBlocks
    };
  });

  return { updatedChunks, fixedCount };
}
