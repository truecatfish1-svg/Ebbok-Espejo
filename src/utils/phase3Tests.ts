import { isStandaloneNumeralOrSubheading, executePhase3MirrorAssembly } from './phase3MirrorAssemblyEngine';
import { alignChapterTextsGaleChurch } from './galeChurchAlignmentEngine';
import { evaluateBoundaryConcordance } from './parallelMatcher';
import { executePhase2UnifiedCurator } from './phase2CuratorEngine';
import { parseManualTableOfContents } from './novelCurator';

export async function runPhase3EngineTests(): Promise<{ passed: number; failed: number; errors: string[] }> {
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ PASS: ${testName}`);
    } else {
      failed++;
      errors.push(testName);
      console.error(`  ✗ FAIL: ${testName}`);
    }
  }

  console.log('--- TEST SUITE 1: Universal Subheading & Standalone Numeral Recognition ---');
  assert(isStandaloneNumeralOrSubheading('I') === true, 'Roman numeral "I" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('II.') === true, 'Roman numeral "II." is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('XIV') === true, 'Roman numeral "XIV" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('1') === true, 'Arabic numeral "1" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('1.') === true, 'Arabic numeral "1." is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('Capítulo 1') === true, '"Capítulo 1" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('Chapter I') === true, '"Chapter I" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('Parte Primera') === true, '"Parte Primera" is detected as subheading');
  assert(isStandaloneNumeralOrSubheading('***') === true, 'Ornamental divider "***" is detected as subheading');
  
  // Prosa narrativa real NO debe detectarse como subencabezado, incluso si contiene "I" en inglés
  assert(
    isStandaloneNumeralOrSubheading('When she was home from her boarding-school I used to see her almost every day sometimes.') === false,
    'Narrative prose containing "I" is NOT detected as subheading'
  );
  assert(
    isStandaloneNumeralOrSubheading('Cuando ella regresaba del internado, solía verla casi todos los días a veces.') === false,
    'Spanish narrative prose is NOT detected as subheading'
  );

  console.log('\n--- TEST SUITE 2: Boundary Concordance and Status Truthfulness ---');
  const boundaryMismatch = evaluateBoundaryConcordance(
    'Cuando ella regresaba del internado...',
    'She and her younger sister used to go in and out a lot...'
  );
  assert(
    boundaryMismatch.status !== 'verified_mutual',
    'Mismatched paragraphs are NOT marked as verified_mutual'
  );

  console.log('\n--- TEST SUITE 3: Full Chapter Mirror Assembly & Numeral Disambiguation ---');
  // Simular exactamente el caso reportado por el usuario:
  // Libro A tiene "Capítulo 1" con primer párrafo "I" y luego la narración.
  // Libro B tiene "Capítulo 1" sin numeral "I" (arranca directamente con "When she was home...").
  const result = await executePhase3MirrorAssembly({
    textA: 'Capítulo 1\n\nI\n\nCuando ella regresaba del internado, solía verla casi todos los días a veces.\n\nElla y su hermana menor solían salir mucho juntos.',
    textB: 'Chapter 1\n\nWhen she was home from her boarding-school I used to see her almost every day sometimes.\n\nShe and her younger sister used to go in and out a lot together.',
    config: {
      languageA: 'Español',
      languageB: 'Inglés',
      titleA: 'Libro A',
      titleB: 'Book B',
      author: 'Autor',
      layoutMode: 'facing_pages',
      targetCharsPerPage: 1400,
      targetParagraphsPerPage: 4,
      syncMethod: 'by_content_mirror',
      includeSyncHeader: true,
      unifyDialogueDashes: true
    },
    mirrorHarmonizationResult: {
      pureBodyA: '',
      pureBodyB: '',
      totalParagraphsA: 3,
      totalParagraphsB: 2,
      totalSplitsA: 0,
      totalSplitsB: 0,
      totalFusionsA: 0,
      totalFusionsB: 0,
      globalRhythmScore: 95,
      breaksApplied: [],
      concludingMirrorMatch: {
        matched: true,
        endSnippetA: '',
        endSnippetB: '',
        confidenceScore: 100
      },
      chapters: [
        {
          chapterIndex: 1,
          titleA: 'Capítulo 1',
          titleB: 'Chapter 1',
          initialCountA: 3,
          initialCountB: 2,
          finalCountA: 3,
          finalCountB: 2,
          splitsAppliedA: 0,
          splitsAppliedB: 0,
          fusionsAppliedA: 0,
          fusionsAppliedB: 0,
          isomorphic: true,
          coherenceScore: 98,
          paragraphsA: [
            'I',
            'Cuando ella regresaba del internado, solía verla casi todos los días a veces.',
            'Ella y su hermana menor solían salir mucho juntos.'
          ],
          paragraphsB: [
            'When she was home from her boarding-school I used to see her almost every day sometimes.',
            'She and her younger sister used to go in and out a lot together.'
          ]
        }
      ]
    }
  });

  const pairs = result.pairs;
  console.log(`Generated ${pairs.length} pairs in test result:`);
  pairs.forEach(p => console.log(`  [${p.type}] Order ${p.order}: "${p.textA.slice(0, 30)}..." <-> "${p.textB.slice(0, 30)}..." | Status: ${p.status}`));

  // Par 1 debe ser el encabezado fusionado
  assert(pairs[0]?.type.startsWith('heading') === true, 'First pair is chapter heading');
  assert(pairs[0]?.textA.includes('Capítulo 1') === true, 'First pair title contains Capítulo 1');
  assert(pairs[0]?.textA.includes('I') === true, 'First pair absorbed the numeral I into title');

  // Par 2 DEBE ser el primer párrafo narrativo concordante (NO "I" frente a "When she was home...")
  assert(pairs[1]?.type === 'paragraph', 'Second pair is a narrative paragraph');
  assert(pairs[1]?.textA.startsWith('Cuando ella regresaba') === true, 'Second pair textA begins with "Cuando ella regresaba"');
  assert(pairs[1]?.textB.startsWith('When she was home') === true, 'Second pair textB begins with "When she was home"');
  
  // Par 3 DEBE ser el segundo párrafo narrativo concordante
  assert(pairs[2]?.textA.startsWith('Ella y su hermana') === true, 'Third pair textA begins with "Ella y su hermana"');
  assert(pairs[2]?.textB.startsWith('She and her younger sister') === true, 'Third pair textB begins with "She and her younger sister"');

  console.log('\n--- TEST SUITE 4: Compound Paragraph Pre-Splitting & Asymmetric Disparity Defense ---');
  // Simular caso de image_d3c556ac.png:
  // Párrafo español compuesto de múltiples oraciones que contiene un acontecimiento (1937, Annie)
  // en la segunda parte, frente a un párrafo inglés breve que comienza en 1937 con Annie.
  const compoundSpanish = 'En aquellos primeros años de la década transcurrieron muchas estaciones sin novedad alguna. La familia continuó viviendo en el valle con la misma tranquilidad de siempre. Los inviernos eran gélidos y las cosechas se sucedían año tras año con un ritmo predecible. Nadie sospechaba que pronto sobrevendrían tiempos de cambio acelerado para todos los habitantes de la comarca. ' +
    'En 1937, Annie decidió que era el momento propicio para iniciar su viaje hacia el sur de la provincia. La despedida fue silenciosa y cargada de emoción contenida. ' +
    'Pronto llegó a su nuevo destino al comenzar el otoño.';
  
  const shortEnglish1 = 'In those early years of the decade many seasons passed without any particular novelty. The family continued living in the valley with the usual calm. Winters were chilly and harvests followed year after year in a predictable cadence.';
  const shortEnglish2 = 'In 1937, Annie decided it was the right time to start her journey southward to the province. The departure was quiet and full of restrained emotion.';

  const compoundResult = await executePhase3MirrorAssembly({
    textA: compoundSpanish,
    textB: `${shortEnglish1}\n\n${shortEnglish2}`,
    config: {
      languageA: 'Español',
      languageB: 'Inglés',
      titleA: 'Prueba',
      titleB: 'Test',
      author: 'Autor',
      layoutMode: 'facing_pages',
      targetCharsPerPage: 1400,
      targetParagraphsPerPage: 4,
      syncMethod: 'by_content_mirror',
      includeSyncHeader: true,
      unifyDialogueDashes: true
    }
  });

  const compoundPairs = compoundResult.pairs;
  console.log(`Generated ${compoundPairs.length} pairs from compound test:`);
  compoundPairs.forEach(p => console.log(`  Order ${p.order}: A(${p.textA.length} chars) vs B(${p.textB.length} chars) | "${p.textA.slice(0, 40)}..." <-> "${p.textB.slice(0, 40)}..."`));

  assert(compoundPairs.length >= 2, 'Compound paragraph was correctly pre-split into multiple concordant pairs');
  assert(
    compoundPairs.some(p => p.textA.includes('1937') && p.textB.includes('1937')),
    'Pair matching 1937 is synchronized correctly on both sides'
  );
  
  // Verificar que NINGÚN pliego con gran disparidad sea etiquetado como "Ritmo Equilibrado"
  const spreads = compoundResult.spreads;
  const hasUnbalancedSpreadWithBalancedLabel = spreads.some(s => {
    const hasDisparity = s.pairs.some(p => {
      const lenA = (p.textA || '').length;
      const lenB = (p.textB || '').length;
      return (Math.max(lenA, lenB) > 2.0 * Math.min(lenA, lenB) && Math.abs(lenA - lenB) > 220);
    });
    return hasDisparity && s.isBalanced === true;
  });

  assert(
    hasUnbalancedSpreadWithBalancedLabel === false,
    'Zero spreads with severe paragraph disparity are erroneously labeled as "Ritmo Equilibrado"'
  );

  console.log('\n--- TEST SUITE 5: Phase 2 Chapter Boundary Isolation & Heading Attachment ---');
  const bookAText = `Capítulo 1
Había una vez en un valle lejano una pequeña aldea rodeada de montañas verdes. Todos los días los aldeanos comenzaban sus labores al despuntar el alba.

Capítulo 2
El bosque oscuro se extendía más allá del río caudaloso. Pocos se atrevían a cruzar sus senderos sombríos durante la noche.`;

  const bookBText = `Chapter 1
Once upon a time in a faraway valley there was a small hamlet bordered by green peaks. Every single day the villagers started their work at dawn.

Chapter 2
The dark forest stretched beyond the roaring river. Few people dared to cross its shadowy paths during the night.`;

  const phase2Res = await executePhase2UnifiedCurator({
    rawBodyA: bookAText,
    rawBodyB: bookBText,
    titleA: 'Prueba Capítulos',
    titleB: 'Test Chapters'
  });

  const cleanChaps = phase2Res.cleanChapters;
  console.log(`Phase 2 recognized ${cleanChaps.length} chapters.`);
  cleanChaps.forEach(ch => {
    console.log(`  Chap #${ch.chapterIndex}: "${ch.title}" | A paras: ${ch.cleanParagraphsA.length}, B paras: ${ch.cleanParagraphsB.length}`);
    console.log(`    A[0]: "${ch.cleanParagraphsA[0]?.slice(0, 30)}..." | A[last]: "${ch.cleanParagraphsA[ch.cleanParagraphsA.length - 1]?.slice(0, 30)}..."`);
  });

  assert(cleanChaps.length === 2, 'Phase 2 correctly sliced exactly 2 canonical chapters');
  assert(
    !cleanChaps[0].cleanTextA.includes('Capítulo 2'),
    'Chapter 1 does NOT contain "Capítulo 2" trailing at the end'
  );
  assert(
    cleanChaps[1].cleanTextA.includes('Capítulo 2') || cleanChaps[1].title.includes('2') || cleanChaps[1].title.includes('Capítulo 2'),
    'Chapter 2 starts with its own heading'
  );

  console.log('\n--- TEST SUITE 6: Manual Table of Contents (TOC) Parsing & Normalization ---');
  const sampleToc = `Índice General
Capítulo 1 - La Partida ... 14
Capítulo II - El Encuentro en el Bosque ... 45
Capítulo 3: El Desenlace del Viaje ... 112`;

  const parsedToc = parseManualTableOfContents(sampleToc);
  console.log(`Parsed ${parsedToc.length} chapters from manual TOC:`);
  parsedToc.forEach(c => console.log(`  Index ${c.index}: [${c.label}] "${c.title}" (Page ${c.pageOrMarker})`));

  assert(parsedToc.length === 3, 'parseManualTableOfContents extracted exactly 3 chapters');
  assert(parsedToc[0]?.index === 1, 'First chapter is index 1');
  assert(parsedToc[1]?.index === 2, 'Roman numeral "II" converted to index 2');
  assert(parsedToc[2]?.index === 3, 'Third chapter is index 3');
  assert(parsedToc[0]?.pageOrMarker === '14', 'First chapter extracted page 14');
  assert(parsedToc[1]?.pageOrMarker === '45', 'Second chapter extracted page 45');

  console.log('\n--- TEST SUITE 7: Multi-Part Literary Work with Pagination Artifacts & Dual Headings ---');
  const bookA_Sample = `Cuando ella regresaba del internado, solía verla casi todos los días. Ella y su hermana menor salían a menudo con sus perros. Yo las observaba desde la ventana.

Tenía el pelo largo y pálido y unos ojos grises muy bonitos. Lo supe todo sobre ella antes de dar ningún paso.

¿14 de octubre? No sé si es 14 de octubre. Llevo aquí dos semanas y he perdido la cuenta del tiempo. La habitación del sótano ya está preparada.

Intenté tratarla como a una invitada. Le compré ropa en las mejores tiendas de Londres y libros de arte.

Lo que intento decir es que todo el tiempo Miranda estuvo conmigo, incluso cuando tuve que conducir al pueblo por provisiones. Nunca pude sacarla de mis pensamientos.

Seguía pensando en lo agradable que sería cuando nos entendiésemos.

Al final las cosas salieron de otra manera. Todo se complicó en los últimos días del invierno cuando cayó enferma.`;

  const bookB_Sample = `Annotation He tells the story first—Frederick Clegg, an obscure, lonely young clerk who wins a fortune in the football pools.

When she was home from her boarding-school I used to see her almost every day sometimes. She and her younger sister used to go in and out a lot with their dogs. I would watch them from the window.

She had long pale hair and very pretty grey eyes. I knew everything about her before I made any move.

John Fowles 1 2
October 14th? I don't know if it is October 14th. I have been here two weeks and I have lost count of time. The cellar room is all prepared.

I tried to treat her like a guest. I bought clothes from the best shops in London and art books.

--- [PÁGINA 96] ---
What I am trying to say is that all through Miranda was with me, even when I had to drive into town for supplies. I could never get her out of my thoughts.

I kept thinking of how nice it would be when we understood each other.

4

As it happened, things turned out different. Everything went wrong toward the end when she caught a heavy cold.`;

  const multiPartChapters = [
    {
      number: 1,
      title: 'Parte 1',
      startPhrase: 'Cuando ella regresaba del inte',
      startPhraseB: 'When she was home from her b'
    },
    {
      number: 2,
      title: 'Parte 2 (Miranda Grey)',
      startPhrase: '¿14 de octubre?',
      startPhraseB: 'October 14th?'
    },
    {
      number: 3,
      title: 'Dios, no me dejes morir.',
      startPhrase: 'Lo que intento decir es que to',
      // Frase con marca de página residual tal como la envía la interfaz en el escenario reportado
      startPhraseB: '--- [PÁGINA 96] ---What I am trying to say is tha'
    },
    {
      number: 4,
      title: 'Parte 4',
      startPhrase: 'Al final las cosas salieron de',
      startPhraseB: 'As it happened, things turned'
    }
  ];

  const curatorRes = await executePhase2UnifiedCurator({
    rawBodyA: bookA_Sample,
    rawBodyB: bookB_Sample,
    canonicalChapters: multiPartChapters,
    titleA: 'Obra Bilingüe A',
    titleB: 'Bilingual Work B'
  });

  const cChaps = curatorRes.cleanChapters;
  console.log(`Bilingual multi-part work processed: ${cChaps.length} chapters.`);
  cChaps.forEach(ch => {
    console.log(`  Part ${ch.chapterIndex} ("${ch.title}"):`);
    console.log(`    A (${ch.cleanParagraphsA.length} paras): "${ch.cleanParagraphsA[0]?.slice(0, 40)}..."`);
    console.log(`    B (${ch.cleanParagraphsB.length} paras): "${ch.cleanParagraphsB[0]?.slice(0, 40)}..."`);
  });

  assert(cChaps.length === 4, 'Phase 2 correctly segmented exactly 4 narrative parts');
  assert(cChaps[1].title === 'Parte 2 (Miranda Grey)', 'Chapter 2 user title is preserved without corruption');
  assert(cChaps[2].title === 'Dios, no me dejes morir.', 'Chapter 3 user title is preserved without corruption');
  assert(cChaps[1].cleanParagraphsB.length >= 2, 'Chapter 2 Book B has full narrative paragraphs, NOT a 1-word collapse');
  
  // Verificación Part 1: Sin anotación previa
  assert(
    !cChaps[0].cleanTextB.includes('Annotation He tells the story'),
    'Part 1 Book B does NOT contain the Annotation front matter'
  );
  assert(
    cChaps[0].cleanParagraphsB[0].startsWith('When she was home from her boarding-school'),
    'Part 1 Book B starts cleanly with "When she was home from her boarding-school"'
  );
  assert(
    cChaps[0].cleanParagraphsA[0].startsWith('Cuando ella regresaba del internado'),
    'Part 1 Book A starts cleanly with "Cuando ella regresaba del internado"'
  );

  // Verificación Part 2: Sin "John Fowles 1 2"
  assert(
    !cChaps[1].cleanTextB.includes('John Fowles 1 2'),
    'Part 2 Book B does NOT contain the running header "John Fowles 1 2"'
  );
  assert(
    cChaps[1].cleanParagraphsB[0].startsWith('October 14th?'),
    'Part 2 Book B starts cleanly with "October 14th?"'
  );
  assert(
    cChaps[1].cleanParagraphsA[0].startsWith('¿14 de octubre?'),
    'Part 2 Book A starts cleanly with "¿14 de octubre?"'
  );

  // Verificación Part 3: Frase narrativa ubicada correctamente sin fallbacks desviados
  assert(
    cChaps[2].cleanParagraphsB[0].startsWith('What I am trying to say is that'),
    'Part 3 Book B starts cleanly with "What I am trying to say is that"'
  );
  assert(
    cChaps[2].cleanParagraphsA[0].startsWith('Lo que intento decir es que todo el tiempo'),
    'Part 3 Book A starts cleanly with "Lo que intento decir es que todo el tiempo"'
  );

  // Verificación Part 4: Frase narrativa no destruida por numeral
  assert(
    cChaps[3].cleanTextB.includes('As it happened, things turned out different.'),
    'Part 4 Book B contains narrative paragraph "As it happened, things turned out different."'
  );
  assert(
    cChaps[3].cleanParagraphsA[0].startsWith('Al final las cosas salieron de otra manera'),
    'Part 4 Book A starts cleanly with "Al final las cosas salieron de otra manera"'
  );

  // --- TEST SUITE 8: 5-Layer Deterministic Gale-Church Engine with Zero Filler ---
  console.log('--- TEST SUITE 8: 5-Layer Deterministic Gale-Church Engine with Zero Filler ---');
  
  // Caso de prueba: Párrafos asimétricos con diálogos y puntuación divergente
  const gcInputA = [
    '—¿Adónde vas tan deprisa? —preguntó Miranda observando el reloj de pared con inquietud. Eran casi las 1945.',
    'Él no respondió de inmediato. Recogió sus llaves de la mesa y se dirigió hacia la puerta con paso firme.'
  ];
  const gcInputB = [
    '"Where are you going so fast?" Miranda asked, looking at the wall clock with unease.',
    'It was almost 1945. He did not answer right away.',
    'He picked up his keys from the table and walked steadily toward the door.'
  ];

  const tStart = Date.now();
  const gcAlignment = alignChapterTextsGaleChurch(
    gcInputA,
    gcInputB,
    'Español',
    'Inglés',
    1
  );
  const tElapsed = Date.now() - tStart;

  assert(gcAlignment.blocks.length >= 1, 'Gale-Church produced mirror blocks');
  assert(tElapsed < 100, `Gale-Church executed ultra-fast (${tElapsed}ms < 100ms) without locking event loop`);
  
  const hasFiller = gcAlignment.blocks.some(b => 
    b.textA.includes('[Párrafo continuo') || 
    b.textB.includes('[Párrafo continuo') ||
    b.textA.includes('[Párrafo vacío') ||
    b.textB.includes('[Párrafo vacío')
  );
  assert(!hasFiller, 'Zero filler blocks ([Párrafo continuo]) generated');
  
  const hasConfidenceNote = gcAlignment.blocks.every(b => 
    b.note && b.note.includes('orac.') && b.note.includes('Confianza:')
  );
  assert(hasConfidenceNote, 'Every mirror block includes sentence count audit and mathematical confidence percentage');

  // Verificar que el invariante numérico 1945 se alinea sin desvío
  const blockWith1945 = gcAlignment.blocks.find(b => b.textA.includes('1945'));
  assert(
    !!blockWith1945 && blockWith1945.textB.includes('1945'),
    'Numerical invariant 1945 is preserved in the same mirror block on both sides'
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  return { passed, failed, errors };

}

// Ejecutar si se invoca directamente desde CLI
runPhase3EngineTests().then(res => {
  if (res.failed > 0) {
    process.exit(1);
  }
});

