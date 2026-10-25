import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  ShadingType
} from "docx";
import { saveAs } from "file-saver";
import { 
  BookMetadata, 
  ContentBlock, 
  EditorialSettings, 
  RawChunk, 
  ParallelBookConfig, 
  ParallelPageSpread, 
  ParallelPair 
} from "../types";
import { 
  curateOcrTextAndParagraphContinuity, 
  splitMergedNumberedQuestionsAndDialogues, 
  parseMarkdownTable 
} from "../services/gemini";

function parseMarkdownAndLatexRuns(text: string, font: string = "Calibri"): TextRun[] {
  if (!text) return [new TextRun({ text: "" })];

  const runs: TextRun[] = [];
  // Expresión para detectar negritas **, itálicas *, código ``, o fórmulas latex $...$
  const regex = /(\*\*|__|\*|_|`|\$)(.*?)\1/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const plain = text.substring(lastIndex, match.index);
      if (plain) {
        runs.push(new TextRun({ text: plain, font }));
      }
    }

    const delimiter = match[1];
    const content = match[2];

    if (delimiter === '**' || delimiter === '__') {
      runs.push(new TextRun({ text: content, bold: true, font }));
    } else if (delimiter === '*' || delimiter === '_') {
      runs.push(new TextRun({ text: content, italics: true, font }));
    } else if (delimiter === '`') {
      runs.push(new TextRun({ text: content, font: "Consolas", color: "9C4221" }));
    } else if (delimiter === '$') {
      // Fórmula matemática inline
      runs.push(new TextRun({ 
        text: `$${content}$`, 
        font: "Cambria Math", 
        italics: true,
        color: "0F766E"
      }));
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    const plain = text.substring(lastIndex);
    if (plain) {
      runs.push(new TextRun({ text: plain, font }));
    }
  }

  return runs.length > 0 ? runs : [new TextRun({ text: text, font })];
}

export function generateEditorialTable(
  headers: string[],
  rows: string[][],
  settings: EditorialSettings
): Table {
  const cleanHeaders = headers.length > 0 ? headers : ["Columna 1", "Columna 2"];
  const maxCols = Math.max(cleanHeaders.length, ...rows.map(r => r.length));
  
  // Normalizar filas para que coincidan con maxCols
  const balancedHeaders = [...cleanHeaders];
  while (balancedHeaders.length < maxCols) balancedHeaders.push("");

  const balancedRows = rows.map(r => {
    const rowCopy = [...r];
    while (rowCopy.length < maxCols) rowCopy.push("");
    return rowCopy;
  });

  const headerBgColor = (settings.tableHeaderBg || "1E3A8A").replace('#', '');
  const headerTextColor = (settings.tableHeaderTextColor || "FFFFFF").replace('#', '');
  const borderColor = (settings.tableBorderColor || "CBD5E1").replace('#', '');
  const altRowBg = (settings.tableAlternateRowBg || "F8FAFC").replace('#', '');

  const tableRows: TableRow[] = [];

  // Fila de encabezado
  tableRows.push(new TableRow({
    tableHeader: true,
    children: balancedHeaders.map(h => new TableCell({
      children: [
        new Paragraph({
          children: parseMarkdownAndLatexRuns(h, settings.bodyFont),
          alignment: AlignmentType.LEFT,
          spacing: { before: 100, after: 100 }
        })
      ],
      shading: {
        type: ShadingType.CLEAR,
        fill: headerBgColor,
        color: "auto"
      },
      margins: { top: 120, bottom: 120, left: 140, right: 140 }
    }))
  }));

  // Filas de datos con alternancia
  balancedRows.forEach((row, rowIndex) => {
    const isAlt = rowIndex % 2 === 1;
    tableRows.push(new TableRow({
      children: row.map(cell => new TableCell({
        children: [
          new Paragraph({
            children: parseMarkdownAndLatexRuns(cell, settings.bodyFont),
            alignment: AlignmentType.LEFT,
            spacing: { before: 80, after: 80 }
          })
        ],
        shading: isAlt ? {
          type: ShadingType.CLEAR,
          fill: altRowBg,
          color: "auto"
        } : undefined,
        margins: { top: 100, bottom: 100, left: 140, right: 140 }
      }))
    }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
      left: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
      right: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: borderColor },
    },
    rows: tableRows
  });
}

export async function generateBookDocx(
  metadata: BookMetadata,
  chunks: RawChunk[],
  settings: EditorialSettings,
  filename: string = "Libro_Editorial_Limpio.docx"
) {
  const children: any[] = [];
  const primaryColorHex = (settings.primaryColor || "1E3A8A").replace('#', '');
  const secondaryColorHex = (settings.secondaryColor || "0F766E").replace('#', '');

  // 1. Portada / Cabecera de Metadatos
  if (settings.includeCoverPage) {
    children.push(new Paragraph({
      text: metadata.title || "Documento Editorial",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 200 }
    }));

    if (metadata.subject) {
      children.push(new Paragraph({
        text: `Asignatura / Área: ${metadata.subject}`,
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { after: 150 }
      }));
    }

    if (metadata.author || metadata.educationLevel) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: metadata.author ? `Autor: ${metadata.author}  |  ` : '', italics: true }),
          new TextRun({ text: metadata.educationLevel ? `Nivel: ${metadata.educationLevel}` : '', italics: true })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 600 }
      }));
    }

    if (metadata.editorialNotes) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: "Notas Editoriales de Transformación: ", bold: true }),
          new TextRun({ text: metadata.editorialNotes, italics: true })
        ],
        spacing: { after: 400 },
        shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" }
      }));
    }

    // Salto de página tras portada
    children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
  }

  // 2. Procesamiento de Chunks y Bloques Estructurados
  for (const chunk of chunks) {
    // Evitar exportar placeholders residuales
    if ((!chunk.blocks || chunk.blocks.length === 0) && chunk.cleanContent?.includes('(Unificado en macro-bloque)')) {
      continue;
    }

    const blocks = chunk.blocks && chunk.blocks.length > 0 
      ? chunk.blocks 
      : (chunk.cleanContent ? [{ 
          id: `b_${chunk.id}`, 
          type: 'paragraph' as const, 
          content: splitMergedNumberedQuestionsAndDialogues(chunk.cleanContent), 
          isApproved: true 
        }] : []);

    for (const block of blocks) {
      const cleanContent = curateOcrTextAndParagraphContinuity(block.content || '');
      const cleanTitle = block.title ? curateOcrTextAndParagraphContinuity(block.title) : undefined;

      switch (block.type) {
        case 'heading1':
          children.push(new Paragraph({
            text: cleanContent || cleanTitle || "Unidad / Capítulo",
            style: "Heading1",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400, after: 180 }
          }));
          break;

        case 'heading2':
          children.push(new Paragraph({
            text: cleanContent || cleanTitle || "Tema Principal",
            style: "Heading2",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 300, after: 140 }
          }));
          break;

        case 'heading3':
          children.push(new Paragraph({
            text: cleanContent || cleanTitle || "Subtema",
            style: "Heading3",
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 240, after: 100 }
          }));
          break;

        case 'heading4':
          children.push(new Paragraph({
            text: cleanContent || cleanTitle || "Apartado",
            style: "Heading4",
            heading: HeadingLevel.HEADING_4,
            spacing: { before: 180, after: 80 }
          }));
          break;

        case 'paragraph': {
          const subParagraphs = cleanContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
          if (subParagraphs.length === 0 && cleanContent) {
            subParagraphs.push(cleanContent);
          }
          subParagraphs.forEach(subP => {
            // Verificar si es una tabla Markdown
            if (subP.startsWith('|') && subP.endsWith('|') && subP.split('\n').length >= 2) {
              const tableData = parseMarkdownTable(subP);
              if (tableData) {
                children.push(generateEditorialTable(tableData.headers, tableData.rows, settings));
                children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
                return;
              }
            }

            // Si es un enunciado de balotario o entrevista
            const isInterviewOrNumbered = /^(?:Entrevistador|Candidato|Postulante|Pregunta|Respuesta|Jurado):\s*/i.test(subP) || /^\d{1,3}[\.\)]\s+¿/.test(subP);

            children.push(new Paragraph({
              children: parseMarkdownAndLatexRuns(subP, settings.bodyFont),
              style: isInterviewOrNumbered ? "PreguntaBalotario" : "Normal",
              spacing: { after: 140 }
            }));
          });
          break;
        }

        case 'theory_box':
          children.push(new Paragraph({
            children: [
              ...(cleanTitle ? [
                new TextRun({ 
                  text: `${cleanTitle}\n`, 
                  bold: true, 
                  color: secondaryColorHex 
                })
              ] : []),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "CajaTeorica",
            shading: { type: ShadingType.CLEAR, fill: "F0FDF4", color: "auto" },
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: secondaryColorHex }
            },
            spacing: { before: 180, after: 180 }
          }));
          break;

        case 'definition':
          children.push(new Paragraph({
            children: [
              ...(cleanTitle ? [
                new TextRun({ 
                  text: `${cleanTitle}\n`, 
                  bold: true, 
                  color: "0891B2" 
                })
              ] : []),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "DefinicionEditorial",
            shading: { type: ShadingType.CLEAR, fill: "ECFEFF", color: "auto" },
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: "06B6D4" }
            },
            spacing: { before: 180, after: 180 }
          }));
          break;

        case 'important_note':
        case 'curiosity':
          children.push(new Paragraph({
            children: [
              ...(cleanTitle ? [
                new TextRun({ 
                  text: `${cleanTitle}\n`, 
                  bold: true, 
                  color: "B45309" 
                })
              ] : []),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "NotaImportante",
            shading: { type: ShadingType.CLEAR, fill: "FEF3C7", color: "auto" },
            border: {
              left: { style: BorderStyle.SINGLE, size: 24, color: "F59E0B" }
            },
            spacing: { before: 180, after: 180 }
          }));
          break;

        case 'exercise':
          // Enunciado del reactivo con estilo OOXML transversal EnunciadoReactivo
          children.push(new Paragraph({
            children: [
              ...(cleanTitle ? [new TextRun({ text: `${cleanTitle} `, bold: true, color: primaryColorHex })] : []),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "EnunciadoReactivo",
            spacing: { before: 180, after: 60 }
          }));

          // Alternativas con estilo OOXML transversal OpcionReactivo y sangría
          if (block.options && block.options.length > 0) {
            block.options.forEach(opt => {
              const cleanOptText = curateOcrTextAndParagraphContinuity(opt.text);
              children.push(new Paragraph({
                children: [
                  new TextRun({ text: `    ${opt.letter}) `, bold: true }),
                  ...parseMarkdownAndLatexRuns(cleanOptText, settings.bodyFont),
                  opt.isCorrect ? new TextRun({ text: "  [Correcta ✓]", color: "047857", bold: true, italics: true }) : new TextRun({ text: "" })
                ],
                style: "OpcionReactivo",
                indent: { left: 400 },
                spacing: { after: 40 }
              }));
            });
          }

          // Solucionario / Clave con estilo OOXML transversal SolucionarioClave
          if (block.solution || block.explanation) {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: "    Explicación / Solucionario: ", bold: true, italics: true, color: "0F766E" }),
                new TextRun({ text: `${block.solution ? `[Clave: ${block.solution}] ` : ''}${curateOcrTextAndParagraphContinuity(block.explanation || '')}`, italics: true })
              ],
              style: "SolucionarioClave",
              indent: { left: 400 },
              spacing: { before: 40, after: 160 }
            }));
          }
          break;

        case 'latex_math':
          children.push(new Paragraph({
            children: [
              new TextRun({ 
                text: block.latex || cleanContent, 
                font: "Cambria Math", 
                size: 24,
                bold: true,
                color: "1E293B" 
              })
            ],
            style: "FormulaMatematica",
            alignment: AlignmentType.CENTER,
            spacing: { before: 160, after: 160 },
            shading: { type: ShadingType.CLEAR, fill: "F8FAFC", color: "auto" }
          }));
          break;

        case 'figure_desc':
          children.push(new Paragraph({
            children: [
              new TextRun({ text: "[Figura / Gráfico]: ", bold: true, color: "475569" }),
              new TextRun({ text: block.figureCaption || cleanContent, italics: true })
            ],
            style: "FiguraDescripcion",
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 140 },
            shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" }
          }));
          break;

        case 'table': {
          let tableData = block.tableData;
          if (!tableData && cleanContent) {
            tableData = parseMarkdownTable(cleanContent) || undefined;
          }
          if (tableData && tableData.headers && tableData.headers.length > 0) {
            if (tableData.caption || cleanTitle) {
              children.push(new Paragraph({
                text: `Tabla: ${tableData.caption || cleanTitle}`,
                style: "Heading4",
                heading: HeadingLevel.HEADING_4,
                spacing: { before: 180, after: 60 }
              }));
            }
            const tableElement = generateEditorialTable(tableData.headers, tableData.rows, settings);
            children.push(tableElement);
            children.push(new Paragraph({ text: "", spacing: { after: 100 } }));
          } else {
            children.push(new Paragraph({
              children: parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont),
              style: "Normal",
              spacing: { after: 120 }
            }));
          }
          break;
        }

        case 'bullet_list': {
          const listItems = cleanContent.split('\n').map(l => l.trim()).filter(Boolean);
          listItems.forEach(item => {
            const cleanItem = item.replace(/^[•\-\*]\s*/, '');
            children.push(new Paragraph({
              children: parseMarkdownAndLatexRuns(cleanItem, settings.bodyFont),
              style: "ListParagraph",
              bullet: { level: 0 },
              spacing: { after: 60 }
            }));
          });
          break;
        }

        case 'numbered_list': {
          const listItems = cleanContent.split('\n').map(l => l.trim()).filter(Boolean);
          listItems.forEach(item => {
            children.push(new Paragraph({
              children: parseMarkdownAndLatexRuns(item, settings.bodyFont),
              style: "ListParagraph",
              spacing: { after: 60 }
            }));
          });
          break;
        }

        case 'glossary_item':
          children.push(new Paragraph({
            children: [
              new TextRun({ text: cleanTitle ? `${cleanTitle}: ` : "• Término: ", bold: true }),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "GlosarioItem",
            spacing: { after: 80 }
          }));
          break;

        case 'poem_verse': {
          const verses = cleanContent.split(/\r?\n/).map(v => v.trim()).filter(Boolean);
          verses.forEach((verse, vIdx) => {
            const isLastVerse = vIdx === verses.length - 1;
            children.push(new Paragraph({
              children: parseMarkdownAndLatexRuns(verse, settings.bodyFont),
              style: "PoemaVerso",
              indent: { left: settings.poemIndentDxa || 1440 },
              spacing: { after: isLastVerse ? 200 : 40, line: 240 }
            }));
          });
          break;
        }

        case 'epigraph':
          children.push(new Paragraph({
            children: parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont),
            style: "Epigrafe",
            alignment: AlignmentType.RIGHT,
            spacing: { before: 300, after: 300 }
          }));
          break;

        case 'epistolary_letter':
          children.push(new Paragraph({
            children: parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont),
            style: "CartaEpistolar",
            indent: { left: 720, right: 720 },
            spacing: { before: 200, after: 200 }
          }));
          break;

        case 'novel_dialogue': {
          let dialogueText = cleanContent;
          if (!dialogueText.startsWith('—')) {
            dialogueText = `— ${dialogueText.replace(/^[–\-]\s*/, '')}`;
          }
          children.push(new Paragraph({
            children: parseMarkdownAndLatexRuns(dialogueText, settings.bodyFont),
            style: "DialogoNovela",
            indent: { left: 240, hanging: 240 },
            spacing: { after: 140 }
          }));
          break;
        }

        case 'blockquote':
          children.push(new Paragraph({
            children: parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont),
            style: "CitaBloque",
            indent: { left: 1080 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: secondaryColorHex } },
            spacing: { before: 180, after: 180 }
          }));
          break;

        case 'ornamental_break':
          children.push(new Paragraph({
            text: settings.ornamentalBreakSymbol || "* * *",
            style: "DescansoEscena",
            alignment: AlignmentType.CENTER,
            spacing: { before: 320, after: 320 }
          }));
          break;

        case 'author_footnote':
          children.push(new Paragraph({
            children: [
              new TextRun({ text: "[Nota]: ", bold: true, size: 18 }),
              ...parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont)
            ],
            style: "NotaAlPieAutor",
            spacing: { before: 100, after: 100 }
          }));
          break;

        default:
          children.push(new Paragraph({
            children: parseMarkdownAndLatexRuns(cleanContent, settings.bodyFont),
            style: "Normal",
            spacing: { after: 120 }
          }));
      }
    }
  }

  // 3. Configuración del Documento con Metadatos Nativos de Word y Diccionario de Estilos Transversales
  const doc = new Document({
    title: metadata.title || "Libro Editorial",
    subject: metadata.subject || "Material Didáctico",
    creator: metadata.author || "Factoría Editorial",
    keywords: `${metadata.subject}, ${metadata.educationLevel}, Editorial, Reconocido`,
    description: metadata.editorialNotes || "Transformación de texto y digitalización limpia.",
    lastModifiedBy: "Factoría Editorial",
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22, // 11pt
            color: "18181B"
          },
          paragraph: {
            spacing: { line: 276, after: 140 }
          }
        },
        {
          id: "Heading1",
          name: "Título 1",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 40, // 20pt
            bold: true,
            color: primaryColorHex
          },
          paragraph: {
            spacing: { before: 400, after: 180 },
            keepNext: true
          }
        },
        {
          id: "Heading2",
          name: "Título 2",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 30, // 15pt
            bold: true,
            color: secondaryColorHex
          },
          paragraph: {
            spacing: { before: 300, after: 140 },
            keepNext: true
          }
        },
        {
          id: "Heading3",
          name: "Título 3",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 26, // 13pt
            bold: true,
            color: "334155"
          },
          paragraph: {
            spacing: { before: 240, after: 100 },
            keepNext: true
          }
        },
        {
          id: "Heading4",
          name: "Título 4",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 23, // 11.5pt
            bold: true,
            italics: true,
            color: "475569"
          },
          paragraph: {
            spacing: { before: 180, after: 80 },
            keepNext: true
          }
        },
        {
          id: "EnunciadoReactivo",
          name: "Reactivo - Enunciado",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            bold: true,
            color: primaryColorHex
          },
          paragraph: {
            spacing: { before: 180, after: 60 }
          }
        },
        {
          id: "OpcionReactivo",
          name: "Reactivo - Opción A-E",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "18181B"
          },
          paragraph: {
            indent: { left: 400 },
            spacing: { after: 40 }
          }
        },
        {
          id: "PreguntaBalotario",
          name: "Pregunta de Balotario / Entrevista",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            bold: true,
            color: "1E293B"
          },
          paragraph: {
            spacing: { before: 140, after: 80 }
          }
        },
        {
          id: "SolucionarioClave",
          name: "Solucionario y Clave",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 21,
            italics: true,
            color: secondaryColorHex
          },
          paragraph: {
            indent: { left: 400 },
            spacing: { before: 40, after: 140 }
          }
        },
        {
          id: "CajaTeorica",
          name: "Caja de Teoría",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "064E3B"
          },
          paragraph: {
            spacing: { before: 160, after: 160 }
          }
        },
        {
          id: "NotaImportante",
          name: "Nota Importante / Advertencia",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "78350F"
          },
          paragraph: {
            spacing: { before: 160, after: 160 }
          }
        },
        {
          id: "DefinicionEditorial",
          name: "Definición Formal",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "164E63"
          },
          paragraph: {
            spacing: { before: 160, after: 160 }
          }
        },
        {
          id: "ListParagraph",
          name: "Párrafo de lista",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "18181B"
          },
          paragraph: {
            spacing: { after: 60 }
          }
        },
        {
          id: "FormulaMatematica",
          name: "Ecuación Matemática",
          quickFormat: true,
          run: {
            font: "Cambria Math",
            size: 24,
            bold: true,
            color: "1E293B"
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 140, after: 140 }
          }
        },
        {
          id: "FiguraDescripcion",
          name: "Descripción de Figura / Gráfico",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 20,
            italics: true,
            color: "475569"
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120 }
          }
        },
        {
          id: "GlosarioItem",
          name: "Elemento de Glosario",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "18181B"
          },
          paragraph: {
            spacing: { after: 80 }
          }
        },
        {
          id: "PoemaVerso",
          name: "Poema y Verso",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 21,
            italics: settings.poemItalic !== false,
            color: "1E293B"
          },
          paragraph: {
            indent: { left: settings.poemIndentDxa || 1440 },
            spacing: { line: 240, after: 40 }
          }
        },
        {
          id: "Epigrafe",
          name: "Epígrafe Editorial",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 21,
            italics: true,
            color: "475569"
          },
          paragraph: {
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240, after: 240 }
          }
        },
        {
          id: "CartaEpistolar",
          name: "Carta y Misiva",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 21,
            color: "1E293B"
          },
          paragraph: {
            indent: { left: 720, right: 720 },
            spacing: { before: 180, after: 180 }
          }
        },
        {
          id: "DialogoNovela",
          name: "Diálogo Narrativo",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 22,
            color: "0F172A"
          },
          paragraph: {
            indent: { left: 240, hanging: 240 },
            spacing: { after: 140 }
          }
        },
        {
          id: "CitaBloque",
          name: "Cita en Bloque",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 21,
            italics: true,
            color: "334155"
          },
          paragraph: {
            indent: { left: 1080 },
            spacing: { before: 160, after: 160 }
          }
        },
        {
          id: "DescansoEscena",
          name: "Descanso de Escena",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 24,
            bold: true,
            color: primaryColorHex
          },
          paragraph: {
            alignment: AlignmentType.CENTER,
            spacing: { before: 280, after: 280 }
          }
        },
        {
          id: "NotaAlPieAutor",
          name: "Nota al Pie del Autor",
          quickFormat: true,
          run: {
            font: settings.bodyFont || "Calibri",
            size: 18,
            color: "64748B"
          },
          paragraph: {
            spacing: { before: 80, after: 80 }
          }
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440, // 1 pulgada (2.54 cm)
            bottom: 1440,
            left: 1440,
            right: 1440
          }
        }
      },
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`);
}

// ----------------------------------------------------
// EXPORTADOR COMPATIBLE CON GOOGLE DOCS (HTML Clipboard)
// ----------------------------------------------------

export function generateGoogleDocsHtml(
  metadata: BookMetadata,
  chunks: RawChunk[],
  settings: EditorialSettings
): string {
  const primaryColor = settings.primaryColor || '#1E3A8A';
  const secondaryColor = settings.secondaryColor || '#0F766E';
  const font = settings.bodyFont || 'Calibri';

  let html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${metadata.title || 'Libro Editorial'}</title>
<style>
  body { font-family: '${font}', sans-serif; font-size: 11pt; line-height: 1.5; color: #18181b; max-width: 800px; margin: auto; }
  h1 { font-size: 20pt; font-weight: bold; color: ${primaryColor}; margin-top: 24px; margin-bottom: 12px; }
  h2 { font-size: 15pt; font-weight: bold; color: ${secondaryColor}; margin-top: 20px; margin-bottom: 10px; }
  h3 { font-size: 13pt; font-weight: bold; color: #334155; margin-top: 16px; margin-bottom: 8px; }
  h4 { font-size: 11.5pt; font-weight: bold; font-style: italic; color: #475569; margin-top: 12px; margin-bottom: 6px; }
  p { margin-bottom: 10px; }
  .box-theory { background-color: #f0fdf4; border-left: 4px solid ${secondaryColor}; padding: 12px 16px; margin: 14px 0; border-radius: 4px; }
  .box-note { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 14px 0; border-radius: 4px; }
  .exercise { margin: 14px 0; padding-left: 8px; }
  .exercise-q { font-weight: bold; color: ${primaryColor}; }
  .exercise-opt { margin-left: 20px; margin-top: 4px; }
  .exercise-sol { margin-left: 20px; margin-top: 6px; font-style: italic; color: #0f766e; }
  .latex-block { text-align: center; background: #f8fafc; padding: 10px; margin: 12px 0; font-family: 'Cambria Math', serif; font-size: 13pt; font-weight: bold; }
  .figure-desc { text-align: center; background: #f1f5f9; padding: 8px 12px; font-style: italic; color: #475569; margin: 10px 0; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th { background-color: ${settings.tableHeaderBg || '#1E3A8A'}; color: ${settings.tableHeaderTextColor || '#FFFFFF'}; padding: 8px 12px; text-align: left; border: 1px solid #cbd5e1; font-weight: bold; }
  td { padding: 8px 12px; border: 1px solid #cbd5e1; }
  tr:nth-child(even) td { background-color: ${settings.tableAlternateRowBg || '#F8FAFC'}; }
</style>
</head>
<body>
`;

  if (settings.includeCoverPage && metadata.title) {
    html += `
  <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px;">
    <h1 style="font-size: 24pt; margin-bottom: 8px;">${metadata.title}</h1>
    ${metadata.subject ? `<h2 style="font-size: 16pt; color: ${secondaryColor};">${metadata.subject}</h2>` : ''}
    <p style="color: #64748b; font-style: italic;">
      ${metadata.author ? `Autor: ${metadata.author} &bull; ` : ''}
      ${metadata.educationLevel ? `Nivel: ${metadata.educationLevel}` : ''}
    </p>
  </div>
`;
  }

  for (const chunk of chunks) {
    if ((!chunk.blocks || chunk.blocks.length === 0) && chunk.cleanContent?.includes('(Unificado en macro-bloque)')) {
      continue;
    }

    const blocks = chunk.blocks && chunk.blocks.length > 0
      ? chunk.blocks
      : (chunk.cleanContent ? [{ 
          id: `b_${chunk.id}`, 
          type: 'paragraph' as const, 
          content: splitMergedNumberedQuestionsAndDialogues(chunk.cleanContent), 
          isApproved: true 
        }] : []);

    for (const block of blocks) {
      const cleanBlockContent = splitMergedNumberedQuestionsAndDialogues(block.content || '');
      const contentSafe = cleanBlockContent.replace(/\n/g, '<br>');

      switch (block.type) {
        case 'heading1':
          html += `<h1>${block.content || block.title}</h1>\n`;
          break;
        case 'heading2':
          html += `<h2>${block.content || block.title}</h2>\n`;
          break;
        case 'heading3':
          html += `<h3>${block.content || block.title}</h3>\n`;
          break;
        case 'heading4':
          html += `<h4>${block.content || block.title}</h4>\n`;
          break;
        case 'paragraph': {
          const subParagraphs = cleanBlockContent.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
          if (subParagraphs.length === 0 && cleanBlockContent) {
            subParagraphs.push(cleanBlockContent);
          }
          subParagraphs.forEach(subP => {
            if (subP.startsWith('|') && subP.endsWith('|') && subP.split('\n').length >= 2) {
              const tbl = parseMarkdownTable(subP);
              if (tbl && tbl.headers) {
                html += `
<table>
  <thead>
    <tr>${tbl.headers.map(h => `<th>${h}</th>`).join('')}</tr>
  </thead>
  <tbody>
    ${tbl.rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
  </tbody>
</table>\n`;
                return;
              }
            }
            html += `<p>${subP.replace(/\n/g, '<br>')}</p>\n`;
          });
          break;
        }
        case 'theory_box':
        case 'definition':
          html += `
<div class="box-theory">
  ${block.title ? `<strong>${block.title}</strong><br>` : ''}
  ${contentSafe}
</div>\n`;
          break;
        case 'important_note':
        case 'curiosity':
          html += `
<div class="box-note">
  ${block.title ? `<strong>${block.title}</strong><br>` : ''}
  ${contentSafe}
</div>\n`;
          break;
        case 'exercise':
          html += `
<div class="exercise">
  <div class="exercise-q">${block.title ? `<strong>${block.title}</strong> ` : ''}${contentSafe}</div>
  ${block.options ? block.options.map(opt => `
    <div class="exercise-opt"><strong>${opt.letter})</strong> ${opt.text} ${opt.isCorrect ? '<span style="color: #047857; font-weight: bold;">[Correcta ✓]</span>' : ''}</div>
  `).join('') : ''}
  ${block.solution || block.explanation ? `
    <div class="exercise-sol"><em>Explicación / Solucionario:</em> ${block.solution ? `[Clave ${block.solution}] ` : ''}${block.explanation || ''}</div>
  ` : ''}
</div>\n`;
          break;
        case 'latex_math':
          html += `<div class="latex-block">${block.latex || block.content}</div>\n`;
          break;
        case 'figure_desc':
          html += `<div class="figure-desc">🖼️ [Figura / Gráfico]: ${block.figureCaption || block.content}</div>\n`;
          break;
        case 'table': {
          let tbl = block.tableData;
          if (!tbl && block.content) {
            tbl = parseMarkdownTable(block.content) || undefined;
          }
          if (tbl && tbl.headers) {
            html += `
<table>
  <thead>
    <tr>
      ${tbl.headers.map(h => `<th>${h}</th>`).join('')}
    </tr>
  </thead>
  <tbody>
    ${tbl.rows.map(row => `
      <tr>
        ${row.map(cell => `<td>${cell}</td>`).join('')}
      </tr>
    `).join('')}
  </tbody>
</table>\n`;
          }
          break;
        }
        case 'poem_verse':
          html += `<div style="margin: 16px 0 16px 40px; font-style: italic; line-height: 1.4; color: #1e293b;">${contentSafe}</div>\n`;
          break;
        case 'epigraph':
          html += `<div style="text-align: right; margin: 24px 0 24px 40px; font-style: italic; color: #475569;">${contentSafe}</div>\n`;
          break;
        case 'epistolary_letter':
          html += `<div style="margin: 18px 30px; padding: 12px; background: #f8fafc; border-left: 3px solid #94a3b8; font-style: normal;">${contentSafe}</div>\n`;
          break;
        case 'novel_dialogue':
          html += `<p style="text-indent: -20px; padding-left: 20px; margin-bottom: 8px;">${contentSafe}</p>\n`;
          break;
        case 'blockquote':
          html += `<blockquote style="margin: 16px 30px; padding-left: 15px; border-left: 3px solid ${primaryColor}; font-style: italic; color: #334155;">${contentSafe}</blockquote>\n`;
          break;
        case 'ornamental_break':
          html += `<div style="text-align: center; margin: 30px 0; font-size: 16pt; letter-spacing: 6px; color: ${primaryColor};">* * *</div>\n`;
          break;
        case 'author_footnote':
          html += `<p style="font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 12px;"><em>${contentSafe}</em></p>\n`;
          break;
        case 'bullet_list':
          html += `<ul><li>${contentSafe}</li></ul>\n`;
          break;
        case 'numbered_list':
          html += `<ol><li>${contentSafe}</li></ol>\n`;
          break;
        default:
          html += `<p>${contentSafe}</p>\n`;
      }
    }
  }

  html += `
</body>
</html>
`;
  return html;
}

export async function copyFormattedContentToClipboard(
  metadata: BookMetadata,
  chunks: RawChunk[],
  settings: EditorialSettings
): Promise<boolean> {
  const html = generateGoogleDocsHtml(metadata, chunks, settings);
  
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
    try {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([chunks.map(c => c.cleanContent || c.rawContent).join('\n\n')], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ]);
      return true;
    } catch (e) {
      console.warn('ClipboardItem no soportado o denegado, usando fallback:', e);
    }
  }

  // Fallback
  try {
    const textarea = document.createElement('textarea');
    textarea.value = html;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (err) {
    return false;
  }
}

// ----------------------------------------------------
// EXPORTADOR ESPECIALIZADO: LIBRO PARALELO / EDICIÓN ESPEJO BILINGÜE
// ----------------------------------------------------

export async function generateParallelBookDocx(
  pairs: ParallelPair[],
  spreads: ParallelPageSpread[],
  config: ParallelBookConfig,
  settings: EditorialSettings,
  filename: string = "Libro_Bilingue_Paralelo.docx"
) {
  const primaryColorHex = (settings.primaryColor || "1E3A8A").replace('#', '');
  const secondaryColorHex = (settings.secondaryColor || "0F766E").replace('#', '');
  const children: any[] = [];

  // Portada del Libro Bilingüe
  children.push(new Paragraph({
    text: config.titleA || "Edición Paralela",
    heading: HeadingLevel.TITLE,
    alignment: AlignmentType.CENTER,
    spacing: { before: 800, after: 120 }
  }));

  if (config.titleB) {
    children.push(new Paragraph({
      text: config.titleB,
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }));
  }

  children.push(new Paragraph({
    children: [
      new TextRun({ text: config.author ? `Autor: ${config.author}  |  ` : '', italics: true }),
      new TextRun({ text: `Edición Espejo: ${config.languageA} & ${config.languageB}`, bold: true, color: primaryColorHex })
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));

  children.push(new Paragraph({
    children: [
      new TextRun({ 
        text: `Modo de Maquetación: ${
          config.layoutMode === 'facing_pages' 
            ? 'Páginas Enfrentadas (Pliego a Pliego: Izq. Idioma A / Der. Idioma B)' 
            : (config.layoutMode === 'side_by_side_columns' ? 'Tabla Espejo de 2 Columnas Paralelas' : 'Párrafos Intercalados')
        }`, 
        italics: true, 
        size: 18, 
        color: "64748B" 
      })
    ],
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 }
  }));

  // Salto de página tras portada
  children.push(new Paragraph({ pageBreakBefore: true, text: "" }));

  // Inyección de Material Preliminar Flotante (Prólogo / Introducción) si existe
  if ((config.prologueTextA && config.prologueTextA.trim().length > 0) || (config.prologueTextB && config.prologueTextB.trim().length > 0)) {
    if (config.prologueTextA && config.prologueTextA.trim().length > 0) {
      children.push(new Paragraph({
        text: config.prologueTitleA || "Prólogo / Introducción",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      }));
      const pLinesA = config.prologueTextA.split(/\n\s*\n+/).filter(Boolean);
      for (const pl of pLinesA) {
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(pl, settings.bodyFont),
          style: "Normal",
          spacing: { after: 140 }
        }));
      }
      children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
    }

    if (config.prologueTextB && config.prologueTextB.trim().length > 0 && config.prologueTextB !== config.prologueTextA) {
      children.push(new Paragraph({
        text: config.prologueTitleB || "Preface / Introduction",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      }));
      const pLinesB = config.prologueTextB.split(/\n\s*\n+/).filter(Boolean);
      for (const pl of pLinesB) {
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(pl, settings.bodyFont),
          style: "Normal",
          spacing: { after: 140 }
        }));
      }
      children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
    }
  }

  if (config.layoutMode === 'facing_pages') {
    // ------------------------------------------------------------------
    // MODO PÁGINAS ENFRENTADAS (FACING PAGES)
    // Pliego a Pliego:
    // Página Par (Izquierda) = Idioma A con salto de página forzado
    // Página Impar (Derecha) = Idioma B con salto de página forzado
    // ------------------------------------------------------------------
    spreads.forEach((spread) => {
      // --- PÁGINA IZQUIERDA (PAR) - IDIOMA A ---
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `[Pág. ${spread.pageLeftNumber} — ${config.languageA}]`, bold: true, size: 18, color: primaryColorHex }),
          new TextRun({ text: ` • ${config.titleA}`, italics: true, size: 18, color: "64748B" })
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" } },
        spacing: { before: 100, after: 180 }
      }));

      spread.pairs.forEach(pair => {
        if (!pair.textA) return;
        const isH = ['heading1', 'heading2', 'heading3'].includes(pair.type);
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(pair.textA, settings.bodyFont),
          heading: isH ? (pair.type === 'heading1' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2) : undefined,
          style: isH ? (pair.type === 'heading1' ? "Heading1" : "Heading2") : (pair.type === 'novel_dialogue' ? "DialogoNovela" : "Normal"),
          spacing: { before: isH ? 240 : 0, after: 120 }
        }));
      });

      // Salto obligatorio para ir a la página derecha del pliego
      children.push(new Paragraph({ pageBreakBefore: true, text: "" }));

      // --- PÁGINA DERECHA (IMPAR) - IDIOMA B (ESPEJO) ---
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `[Pág. ${spread.pageRightNumber} — ${config.languageB}]`, bold: true, size: 18, color: secondaryColorHex }),
          new TextRun({ text: ` • ${config.titleB}`, italics: true, size: 18, color: "64748B" })
        ],
        border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" } },
        spacing: { before: 100, after: 180 }
      }));

      spread.pairs.forEach(pair => {
        if (!pair.textB) return;
        const isH = ['heading1', 'heading2', 'heading3'].includes(pair.type);
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(pair.textB, settings.bodyFont),
          heading: isH ? (pair.type === 'heading1' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2) : undefined,
          style: isH ? (pair.type === 'heading1' ? "Heading1" : "Heading2") : (pair.type === 'novel_dialogue' ? "DialogoNovela" : "Normal"),
          spacing: { before: isH ? 240 : 0, after: 120 }
        }));
      });

      // Salto para el siguiente pliego
      children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
    });

  } else if (config.layoutMode === 'side_by_side_columns') {
    // ------------------------------------------------------------------
    // MODO COLUMNAS PARALELAS (TABLA DE 2 COLUMNAS 50% / 50%)
    // ------------------------------------------------------------------
    const tableRows: TableRow[] = [];

    // Fila cabecera fija de idiomas
    tableRows.push(new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `Columna Izquierda: ${config.languageA}`, bold: true, color: primaryColorHex }),
                new TextRun({ text: `\n${config.titleA}`, italics: true, size: 18, color: "64748B" })
              ],
              spacing: { before: 100, after: 100 }
            })
          ],
          margins: { top: 120, bottom: 120, left: 140, right: 140 }
        }),
        new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `Columna Derecha: ${config.languageB}`, bold: true, color: secondaryColorHex }),
                new TextRun({ text: `\n${config.titleB}`, italics: true, size: 18, color: "64748B" })
              ],
              spacing: { before: 100, after: 100 }
            })
          ],
          margins: { top: 120, bottom: 120, left: 140, right: 140 }
        })
      ]
    }));

    // Filas sincronizadas par a par
    pairs.forEach((pair) => {
      const isH = ['heading1', 'heading2', 'heading3'].includes(pair.type);
      tableRows.push(new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: parseMarkdownAndLatexRuns(pair.textA || '', settings.bodyFont),
                heading: isH ? HeadingLevel.HEADING_2 : undefined,
                style: isH ? "Heading2" : (pair.type === 'novel_dialogue' ? "DialogoNovela" : "Normal"),
                spacing: { before: 60, after: 60 }
              })
            ],
            margins: { top: 80, bottom: 80, left: 120, right: 120 }
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: parseMarkdownAndLatexRuns(pair.textB || '', settings.bodyFont),
                heading: isH ? HeadingLevel.HEADING_2 : undefined,
                style: isH ? "Heading2" : (pair.type === 'novel_dialogue' ? "DialogoNovela" : "Normal"),
                spacing: { before: 60, after: 60 }
              })
            ],
            margins: { top: 80, bottom: 80, left: 120, right: 120 }
          })
        ]
      }));
    });

    const parallelTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.DOTTED, size: 4, color: "E2E8F0" },
        insideVertical: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" }
      },
      rows: tableRows
    });

    children.push(parallelTable);

  } else {
    // ------------------------------------------------------------------
    // MODO INTERCALADO (PÁRRAFOS ALTERNOS A / B)
    // ------------------------------------------------------------------
    pairs.forEach(pair => {
      if (pair.textA) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `[${config.languageA}] `, bold: true, color: primaryColorHex, size: 18 }),
            ...parseMarkdownAndLatexRuns(pair.textA, settings.bodyFont)
          ],
          style: "Normal",
          spacing: { before: 100, after: 40 }
        }));
      }
      if (pair.textB) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `[${config.languageB}] `, bold: true, color: secondaryColorHex, size: 18 }),
            ...parseMarkdownAndLatexRuns(pair.textB, settings.bodyFont)
          ],
          style: "Normal",
          indent: { left: 360 },
          shading: { type: ShadingType.CLEAR, fill: "F8FAFC", color: "auto" },
          spacing: { before: 40, after: 160 }
        }));
      }
    });
  }

  // Inyección de Material Posterior Flotante (Colofón / Apéndices) si existe
  if ((config.backMatterTextA && config.backMatterTextA.trim().length > 0) || (config.backMatterTextB && config.backMatterTextB.trim().length > 0)) {
    children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
    if (config.backMatterTextA && config.backMatterTextA.trim().length > 0) {
      children.push(new Paragraph({
        text: config.backMatterTitleA || "Aparato Crítico / Colofón (A)",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      }));
      const bmParasA = config.backMatterTextA.split(/\n\s*\n+/).filter(Boolean);
      for (const bmp of bmParasA) {
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(bmp, settings.bodyFont),
          style: "Normal",
          spacing: { after: 120 }
        }));
      }
    }

    if (config.backMatterTextB && config.backMatterTextB.trim().length > 0 && config.backMatterTextB !== config.backMatterTextA) {
      children.push(new Paragraph({
        text: config.backMatterTitleB || "Appendix / Colophon (B)",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 400, after: 200 }
      }));
      const bmParasB = config.backMatterTextB.split(/\n\s*\n+/).filter(Boolean);
      for (const bmp of bmParasB) {
        children.push(new Paragraph({
          children: parseMarkdownAndLatexRuns(bmp, settings.bodyFont),
          style: "Normal",
          spacing: { after: 120 }
        }));
      }
    }
  }

  // Documento Word con metadatos bilingües
  const doc = new Document({
    title: `${config.titleA} / ${config.titleB}`,
    subject: `Edición Bilingüe Paralela: ${config.languageA} - ${config.languageB}`,
    creator: config.author || "Factoría Editorial",
    keywords: `Bilingüe, Espejo, Facing Pages, ${config.languageA}, ${config.languageB}, Novela`,
    description: `Edición paralela ensamblada con preservación de ritmo y párrafos sincronizados.`,
    styles: {
      paragraphStyles: [
        {
          id: "Normal",
          name: "Normal",
          quickFormat: true,
          run: { font: settings.bodyFont || "Calibri", size: 22, color: "18181B" },
          paragraph: { spacing: { line: 260, after: 120 } }
        },
        {
          id: "Heading1",
          name: "Título 1",
          quickFormat: true,
          run: { font: settings.bodyFont || "Calibri", size: 36, bold: true, color: primaryColorHex },
          paragraph: { spacing: { before: 360, after: 160 }, keepNext: true }
        },
        {
          id: "Heading2",
          name: "Título 2",
          quickFormat: true,
          run: { font: settings.bodyFont || "Calibri", size: 28, bold: true, color: secondaryColorHex },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true }
        },
        {
          id: "DialogoNovela",
          name: "Diálogo Novela",
          quickFormat: true,
          run: { font: settings.bodyFont || "Calibri", size: 22, color: "0F172A" },
          paragraph: { indent: { left: 240, hanging: 240 }, spacing: { after: 120 } }
        }
      ]
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
        }
      },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}

export function generateParallelGoogleDocsHtml(
  pairs: ParallelPair[],
  spreads: ParallelPageSpread[],
  config: ParallelBookConfig,
  settings: EditorialSettings
): string {
  const primaryColor = settings.primaryColor || "#1E3A8A";
  const secondaryColor = settings.secondaryColor || "#0F766E";

  let html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${config.titleA} - ${config.titleB}</title>
<style>
  body { font-family: ${settings.bodyFont || 'Calibri'}, sans-serif; font-size: 11pt; line-height: 1.5; color: #18181b; }
  .parallel-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  .parallel-table td { width: 50%; vertical-align: top; padding: 10px 14px; border-bottom: 1px dotted #e2e8f0; border-right: 1px solid #cbd5e1; }
  .parallel-table td:last-child { border-right: none; }
  .parallel-header { background: #f1f5f9; font-weight: bold; padding: 12px; }
  .page-spread-break { page-break-before: always; margin: 40px 0 20px 0; border-top: 2px solid ${primaryColor}; padding-top: 15px; font-weight: bold; }
  .lang-tag-a { color: ${primaryColor}; font-weight: bold; }
  .lang-tag-b { color: ${secondaryColor}; font-weight: bold; }
</style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px;">
    <h1 style="font-size: 22pt; margin-bottom: 6px;">${config.titleA} / ${config.titleB}</h1>
    <h3 style="color: #64748b; font-weight: normal;">Edición Paralela Bilingüe (${config.languageA} - ${config.languageB})</h3>
    ${config.author ? `<p><em>Autor: ${config.author}</em></p>` : ''}
  </div>
`;

  if (config.layoutMode === 'side_by_side_columns') {
    html += `
<table class="parallel-table">
  <thead>
    <tr class="parallel-header">
      <td class="lang-tag-a">${config.languageA} (${config.titleA})</td>
      <td class="lang-tag-b">${config.languageB} (${config.titleB})</td>
    </tr>
  </thead>
  <tbody>
`;
    pairs.forEach(p => {
      html += `
    <tr>
      <td>${(p.textA || '').replace(/\n/g, '<br>')}</td>
      <td>${(p.textB || '').replace(/\n/g, '<br>')}</td>
    </tr>
`;
    });
    html += `  </tbody>\n</table>\n`;
  } else if (config.layoutMode === 'facing_pages') {
    spreads.forEach(spread => {
      html += `
  <div class="page-spread-break">
    Pliego ${spread.spreadNumber} (Pág. Izquierda ${spread.pageLeftNumber} [${config.languageA}] / Pág. Derecha ${spread.pageRightNumber} [${config.languageB}])
  </div>
  <table class="parallel-table">
    <tbody>
`;
      spread.pairs.forEach(p => {
        html += `
      <tr>
        <td>${(p.textA || '').replace(/\n/g, '<br>')}</td>
        <td>${(p.textB || '').replace(/\n/g, '<br>')}</td>
      </tr>
`;
      });
      html += `    </tbody>\n  </table>\n`;
    });
  } else {
    // Intercalado
    pairs.forEach(p => {
      html += `<p><strong class="lang-tag-a">[${config.languageA}]:</strong> ${(p.textA || '').replace(/\n/g, '<br>')}</p>\n`;
      html += `<p style="margin-left: 20px; background: #f8fafc; padding: 6px 12px;"><strong class="lang-tag-b">[${config.languageB}]:</strong> ${(p.textB || '').replace(/\n/g, '<br>')}</p>\n`;
    });
  }

  html += `</body></html>`;
  return html;
}

export async function copyParallelContentToClipboard(
  pairs: ParallelPair[],
  spreads: ParallelPageSpread[],
  config: ParallelBookConfig,
  settings: EditorialSettings
): Promise<boolean> {
  const html = generateParallelGoogleDocsHtml(pairs, spreads, config, settings);
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.ClipboardItem) {
    try {
      const blobHtml = new Blob([html], { type: 'text/html' });
      const blobText = new Blob([pairs.map(p => `[${config.languageA}]\n${p.textA}\n\n[${config.languageB}]\n${p.textB}`).join('\n\n---\n\n')], { type: 'text/plain' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        })
      ]);
      return true;
    } catch (e) {
      console.warn('ClipboardItem error:', e);
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = html;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Exporta un libro individual completamente limpio con tipografía y maquetación editorial.
 * Soporta sangría de primera línea, capítulos con salto de página, y diálogo con guión largo.
 */
export async function generateCleanSingleBookDocx(
  title: string,
  author: string,
  language: string,
  bodyText: string,
  settings: EditorialSettings,
  filename: string = "Libro_Limpio.docx",
  preliminaryTitle?: string,
  preliminaryText?: string,
  backMatterTitle?: string,
  backMatterText?: string
): Promise<void> {
  const children: Paragraph[] = [];
  const font = settings.bodyFont || "Georgia";

  // Portada editorial sobria
  if (settings.includeCoverPage) {
    children.push(new Paragraph({
      text: title || "Edición Editorial Limpia",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 1200, after: 300 }
    }));

    if (author) {
      children.push(new Paragraph({
        children: [new TextRun({ text: author, italics: true, size: 28, font })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 }
      }));
    }

    if (language) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `Idioma: ${language}`, size: 20, color: "666666", font })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 800 }
      }));
    }

    children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
  }

  // 1. INYECCIÓN DEL MATERIAL PRELIMINAR (Prólogo, Introducción, Estudio Preliminar)
  if (preliminaryText && preliminaryText.trim().length > 0) {
    children.push(new Paragraph({
      text: preliminaryTitle || "Prólogo / Estudio Introductorio",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 400 }
    }));

    const prelimParas = preliminaryText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    for (const p of prelimParas) {
      children.push(new Paragraph({
        children: [new TextRun({ text: p, font, size: 23, italics: true })],
        indent: settings.novelFirstLineIndent ? { firstLine: 720 } : undefined,
        spacing: { after: 180, line: 276 },
        alignment: AlignmentType.JUSTIFIED
      }));
    }

    // Salto de página antes del arranque de la novela
    children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
  }

  // 2. CUERPO DE LA NOVELA (Capítulos y párrafos limpios)
  const paras = bodyText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
  let isFirstParaOfChapter = true;

  for (let idx = 0; idx < paras.length; idx++) {
    const p = paras[idx];

    // Encabezado de capítulo (Markdown ### o palabras clave)
    if (/^###\s+/.test(p) || /^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|LIBRO|BOOK|PARTE)\s+[0-9IVXLCDM]+/i.test(p)) {
      const cleanHeader = p.replace(/^#+\s*/, '').trim();
      children.push(new Paragraph({
        text: cleanHeader,
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: idx > 0,
        spacing: { before: 800, after: 400 },
        alignment: AlignmentType.CENTER
      }));
      isFirstParaOfChapter = true;
      continue;
    }

    // Dateline / Epígrafe
    if (/^\*[^\n*]+\*$/.test(p)) {
      children.push(new Paragraph({
        children: [new TextRun({ text: p.replace(/\*/g, ''), italics: true, font, size: 22 })],
        spacing: { before: 200, after: 300 },
        alignment: AlignmentType.RIGHT
      }));
      continue;
    }

    // Párrafo normal o Diálogo
    const indent = (!isFirstParaOfChapter && (settings.novelFirstLineIndent ?? true)) ? 720 : 0;

    children.push(new Paragraph({
      children: [new TextRun({ text: p, font, size: 24 })],
      indent: indent > 0 ? { firstLine: indent } : undefined,
      spacing: { after: 180, line: 276 },
      alignment: AlignmentType.JUSTIFIED
    }));

    isFirstParaOfChapter = false;
  }

  // 3. INYECCIÓN DEL MATERIAL POSTERIOR (Epílogo, Bibliografía, Apéndices)
  if (backMatterText && backMatterText.trim().length > 0) {
    children.push(new Paragraph({ pageBreakBefore: true, text: "" }));
    children.push(new Paragraph({
      text: backMatterTitle || "Material Posterior (Epílogo y Referencias)",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 800, after: 400 }
    }));

    const backParas = backMatterText.split(/\n\s*\n+/).map(p => p.trim()).filter(Boolean);
    for (const p of backParas) {
      children.push(new Paragraph({
        children: [new TextRun({ text: p, font, size: 22 })],
        indent: settings.novelFirstLineIndent ? { firstLine: 720 } : undefined,
        spacing: { after: 160, line: 260 },
        alignment: AlignmentType.JUSTIFIED
      }));
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font, size: 24, color: "111827" },
          paragraph: { spacing: { line: 276 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }
        }
      },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename);
}


