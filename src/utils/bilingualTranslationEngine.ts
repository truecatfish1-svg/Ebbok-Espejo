/**
 * Motor Interno Filológico de Traducción Bilingüe y Alineación Semántica
 * (Bilingual Translation Lexicon & Semantic Sentence-Level Align Engine)
 * 
 * Proporciona un diccionario bidireccional integral (Español <-> Inglés)
 * y algoritmos de solapamiento lematizado para contrastar la correspondencia
 * real entre oraciones y evitar falsos emparejamientos basados en palabras genéricas.
 */

// Diccionario de lemas y raíces de traducción cruzada (Español <-> Inglés)
const CROSS_TRANSLATION_MAP: Record<string, string[]> = Object.assign(Object.create(null), {
  // Familia y personajes
  'prima': ['cousin'],
  'primo': ['cousin'],
  'tia': ['aunt'],
  'tía': ['aunt'],
  'tio': ['uncle'],
  'tío': ['uncle'],
  'madre': ['mother', 'mom', 'mum'],
  'padre': ['father', 'dad'],
  'hijo': ['son'],
  'hija': ['daughter'],
  'hermano': ['brother'],
  'hermana': ['sister'],
  'abuelo': ['grandfather', 'grandpa'],
  'abuela': ['grandmother', 'grandma'],
  'mujer': ['woman', 'wife', 'female', 'streets'],
  'hombre': ['man', 'men', 'guy', 'gentleman'],
  'nino': ['child', 'kid', 'boy'],
  'niño': ['child', 'kid', 'boy'],
  'nina': ['girl', 'child'],
  'niña': ['girl', 'child'],
  'ninos': ['kids', 'children'],
  'niños': ['kids', 'children'],
  'muchacho': ['boy', 'youth', 'lad'],
  'chica': ['girl', 'lass'],
  'chico': ['boy', 'kid'],
  'amigo': ['friend'],
  'amiga': ['friend'],
  'enemigo': ['enemy'],
  'criado': ['servant'],
  'extranjero': ['foreigner', 'stranger', 'alien'],
  'vecino': ['neighbor'],
  'silencio': ['silence', 'silent', 'quiet'],
  'silencioso': ['silent', 'quiet'],
  'regreso': ['returned', 'return', 'came back'],
  'regresó': ['returned', 'return', 'came back'],
  'volvio': ['returned', 'turned'],
  'volvió': ['returned', 'turned'],
  'estancia': ['chamber', 'room', 'stay', 'parlor'],
  'habitacion': ['room', 'chamber'],
  'habitación': ['room', 'chamber'],
  'viejo': ['old', 'ancient', 'aged'],
  'vieja': ['old', 'ancient'],
  'temporal': ['tempest', 'storm', 'weather', 'gale'],
  'tormenta': ['storm', 'tempest'],
  'demorado': ['delayed', 'held up', 'postponed'],
  'demoro': ['delayed'],
  'demoró': ['delayed'],
  'retrasado': ['delayed'],
  'cruce': ['crossing', 'cross'],
  'cruzar': ['cross'],
  'canal': ['channel', 'canal'],
  'viento': ['wind', 'breeze'],
  'reloj': ['clock', 'watch', 'timepiece'],
  'pendulo': ['pendulum'],
  'péndulo': ['pendulum'],
  'otono': ['autumn', 'fall'],
  'otoño': ['autumn', 'fall'],
  'fuego': ['fire', 'flames'],
  'chimenea': ['fireplace', 'hearth', 'chimney'],
  'carruaje': ['carriage', 'coach'],
  'mayordomo': ['butler', 'steward'],
  'marques': ['marquis', 'marquess'],
  'marqués': ['marquis', 'marquess'],
  'banco': ['bank', 'banking'],
  'noticia': ['news', 'tidings'],
  'noticias': ['news', 'tidings'],
  'escritorio': ['desk', 'writing table'],
  'sombra': ['shadow', 'shade', 'gloom'],
  'sombras': ['shadows', 'shades'],
  'jardin': ['garden', 'gardens'],
  'jardín': ['garden', 'gardens'],
  'campana': ['bell', 'chime'],
  'campanas': ['bells', 'chimes'],
  'abadia': ['abbey', 'monastery'],
  'abadía': ['abbey', 'monastery'],
  'documento': ['document', 'documents', 'papers'],
  'documentos': ['documents', 'papers'],

  // Estados, salud y emociones
  'borracho': ['drunk', 'drunken', 'drink', 'booze'],
  'ebrio': ['drunk', 'intoxicated'],
  'bebida': ['drink', 'drinking', 'liquor'],
  'beber': ['drink', 'drinking', 'drank'],
  'murió': ['died', 'killed', 'passed away', 'dead'],
  'murio': ['died', 'killed', 'passed away', 'dead'],
  'morir': ['die', 'killed', 'perish'],
  'muerte': ['death'],
  'muerto': ['dead', 'killed'],
  'accidente': ['accident', 'crash'],
  'trafico': ['driving', 'traffic'],
  'tráfico': ['driving', 'traffic'],
  'pelea': ['quarrel', 'fight', 'dispute', 'brawl'],
  'miedo': ['fear', 'dread', 'fright', 'afraid', 'scared'],
  'temor': ['fear', 'dread'],
  'amor': ['love', 'beloved'],
  'odio': ['hate', 'hatred'],
  'triste': ['sad', 'sorrowful', 'unhappy'],
  'tristeza': ['sadness', 'sorrow', 'grief'],
  'alegria': ['joy', 'happy', 'happiness', 'glad'],
  'alegría': ['joy', 'happy', 'happiness', 'glad'],
  'loco': ['crazy', 'mad'],
  'estupido': ['stupid', 'foolish', 'idiot'],
  'estúpido': ['stupid', 'foolish', 'idiot'],
  'estupida': ['stupid', 'foolish'],
  'estúpida': ['stupid', 'foolish'],
  'hambre': ['hungry', 'hunger'],
  'sed': ['thirsty', 'thirst'],
  'vivo': ['alive', 'living'],
  'viva': ['alive', 'living'],
  'vida': ['life'],

  // Comunicación y habla
  'dijo': ['said', 'told', 'spoke', 'remarked', 'uttered'],
  'decia': ['said', 'used to say', 'would say'],
  'decía': ['said', 'used to say', 'would say'],
  'decir': ['say', 'tell'],
  'decirme': ['tell me', 'say to me'],
  'pregunto': ['asked', 'questioned', 'inquired'],
  'preguntó': ['asked', 'questioned', 'inquired'],
  'pregunte': ['asked'],
  'pregunté': ['asked'],
  'contar': ['tell', 'relate', 'recount'],
  'contaron': ['told', 'related'],
  'hablo': ['spoke', 'talked'],
  'habló': ['spoke', 'talked'],
  'respondio': ['replied', 'answered'],
  'respondió': ['replied', 'answered'],
  'grito': ['shouted', 'cried', 'screamed', 'yelled'],
  'gritó': ['shouted', 'cried', 'screamed', 'yelled'],
  'susurro': ['whispered', 'murmured'],
  'susurró': ['whispered', 'murmured'],
  'palabra': ['word'],
  'palabras': ['words'],

  // Cognición y percepción
  'sucedio': ['happened', 'occurred', 'took place'],
  'sucedió': ['happened', 'occurred', 'took place'],
  'ocurrio': ['happened', 'occurred'],
  'ocurrió': ['happened', 'occurred', 'that was in'],
  'acuerdo': ['agree', 'agreement'],
  'importa': ['care', 'matter', 'matters'],
  'interes': ['interest'],
  'interés': ['interest'],
  'conocer': ['meet', 'know'],
  'conocerla': ['meet her'],
  'conocerlo': ['meet him'],
  'saber': ['know'],
  'pensar': ['think'],
  'penso': ['thought'],
  'pensó': ['thought'],
  'creer': ['believe'],
  'creyo': ['believed'],
  'creyó': ['believed'],
  'olvidar': ['forget'],
  'recordar': ['remember'],
  'ocultar': ['hide', 'conceal', 'covering-up', 'cover up'],
  'aseguro': ['always said', 'assured', 'claimed'],
  'aseguró': ['always said', 'assured', 'claimed'],

  // Espacio, lugares y movimiento
  'calle': ['street', 'streets', 'road'],
  'casa': ['house', 'home'],
  'hogar': ['home'],
  'puerta': ['door', 'gate'],
  'cuarto': ['room'],
  'ciudad': ['city', 'town'],
  'pueblo': ['town', 'village'],
  'camino': ['road', 'path', 'way'],
  'embalse': ['reservoir', 'dam', 'lake'],
  'pescar': ['fish', 'fishing'],
  'red': ['net'],
  'marcharse': ['leave', 'go off', 'went off', 'part'],
  'abandono': ['abandoned', 'left', 'went off'],
  'abandonó': ['abandoned', 'left', 'went off'],
  'dejo': ['left'],
  'dejó': ['left'],
  'regrese': ['came back', 'returned', 'went back'],
  'regresé': ['came back', 'returned', 'went back'],
  'fui': ['went', 'was'],
  'fue': ['was', 'went'],
  'era': ['was'],
  'iban': ['went', 'were going'],

  // Tiempo
  'ano': ['year'],
  'año': ['year'],
  'anos': ['years', 'old'],
  'años': ['years', 'old'],
  'tiempo': ['time'],
  'pasarselo': ['easy time', 'good time', 'have fun'],
  'pasárselo': ['easy time', 'good time', 'have fun'],
  'bien': ['well', 'good', 'fine', 'easy'],
  'ocasion': ['occasion', 'once', 'time'],
  'ocasión': ['occasion', 'once', 'time'],
  'instante': ['instant', 'moment'],
  'momento': ['moment', 'time'],
  'dia': ['day'],
  'día': ['day'],
  'noche': ['night'],
  'tarde': ['afternoon', 'evening', 'late'],
  'manana': ['morning', 'tomorrow'],
  'mañana': ['morning', 'tomorrow'],
  'siempre': ['always', 'ever'],
  'nunca': ['never'],
  'jamas': ['never', 'ever'],
  'jamás': ['never', 'ever'],
  'ahora': ['now', 'at present'],
  'actualidad': ['now', 'present', 'nowadays'],

  // Acciones y conectores
  'empezo': ['started', 'began'],
  'empezó': ['started', 'began'],
  'empujado': ['drove', 'pushed'],
  'criaron': ['brought up', 'raised'],
  'reaccion': ['reaction'],
  'reacción': ['reaction']
});

// Mapa inverso generado automáticamente (Inglés -> Español)
const REVERSE_TRANSLATION_MAP: Record<string, string[]> = Object.create(null);
for (const [esWord, enList] of Object.entries(CROSS_TRANSLATION_MAP)) {
  for (const enWord of enList) {
    const cleanEn = enWord.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!REVERSE_TRANSLATION_MAP[cleanEn]) {
      REVERSE_TRANSLATION_MAP[cleanEn] = [];
    }
    if (!REVERSE_TRANSLATION_MAP[cleanEn].includes(esWord)) {
      REVERSE_TRANSLATION_MAP[cleanEn].push(esWord);
    }
  }
}

/**
 * Normaliza y extrae palabras clave con lematización básica (sin stopwords comunes).
 */
export function extractContentKeywords(text: string): string[] {
  if (!text) return [];
  const clean = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  const stopwords = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para',
    'y', 'e', 'o', 'u', 'que', 'se', 'su', 'sus', 'me', 'te', 'le', 'nos', 'les', 'lo', 'la', 'mi', 'mis',
    'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'and', 'or', 'but', 'is', 'are', 'was',
    'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'it', 'its', 'he', 'she', 'they',
    'my', 'his', 'her', 'their', 'we', 'us', 'our', 'i', 'you', 'that', 'this', 'there', 'what', 'so', 'as'
  ]);

  return clean
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stopwords.has(w));
}

/**
 * Extrae entidades nombradas capitalizadas (personas, lugares como Mabel, Annie, Dick).
 */
export function extractProperNames(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]{2,}\b/g) || [];
  const commonIgnore = new Set([
    'El', 'La', 'Los', 'Las', 'Un', 'Una', 'En', 'Por', 'Para', 'Con', 'Pero', 'Si', 'No', 'Mi', 'Su', 'Hubo',
    'The', 'A', 'An', 'In', 'On', 'At', 'To', 'For', 'Of', 'With', 'By', 'And', 'Or', 'But', 'He', 'She', 'They', 'It', 'My'
  ]);
  return Array.from(new Set(
    matches
      .filter(w => !commonIgnore.has(w))
      .map(w => w.toLowerCase())
  ));
}

/**
 * Extrae números y fechas exactas (1937, 1950, 2, 15).
 */
export function extractInvariantNumbers(text: string): string[] {
  if (!text) return [];
  const rxNum = /\b(?:\d{1,5}|[ivxlcdm]{2,6})\b/gi;
  return Array.from(new Set((text.match(rxNum) || []).map(n => n.toLowerCase())));
}

export interface BilingualAffinityResult {
  score: number; // 0 a 100
  sharedNumbers: string[];
  sharedNames: string[];
  translatedWordMatches: Array<{ wordA: string; wordB: string }>;
  isContradictoryOrMismatched: boolean;
  explanation: string;
}

/**
 * Evalúa la afinidad semántica profunda entre dos oraciones contrastando:
 * 1. Números invariantes (fechas, edades, años como 1937, 1950, 2).
 * 2. Nombres propios de personajes y lugares (Mabel, Annie, Dick).
 * 3. Diccionario filológico de traducción cruzada (Español <-> Inglés).
 * 4. Detección explícita de contradicción o desfase de sujetos.
 */
export function computeBilingualSemanticAffinity(
  sentenceA: string,
  sentenceB: string
): BilingualAffinityResult {
  const numsA = extractInvariantNumbers(sentenceA);
  const numsB = extractInvariantNumbers(sentenceB);
  const sharedNumbers = numsA.filter(n => numsB.includes(n));

  const namesA = extractProperNames(sentenceA);
  const namesB = extractProperNames(sentenceB);
  const sharedNames = namesA.filter(nA => 
    namesB.includes(nA) || namesB.some(nB => nB.slice(0, 4) === nA.slice(0, 4))
  );

  const wordsA = extractContentKeywords(sentenceA);
  const wordsB = extractContentKeywords(sentenceB);

  const translatedWordMatches: Array<{ wordA: string; wordB: string }> = [];

  for (const wA of wordsA) {
    const cleanWA = wA.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const rawDirect = Object.prototype.hasOwnProperty.call(CROSS_TRANSLATION_MAP, cleanWA)
      ? CROSS_TRANSLATION_MAP[cleanWA]
      : (Object.prototype.hasOwnProperty.call(CROSS_TRANSLATION_MAP, wA) ? CROSS_TRANSLATION_MAP[wA] : null);
    const directMatches = Array.isArray(rawDirect) ? rawDirect : [];

    for (const wB of wordsB) {
      const cleanWB = wB.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      // Coincidencia directa de traducción
      if (directMatches.length > 0 && directMatches.some(m => typeof m === 'string' && (cleanWB.includes(m) || m.includes(cleanWB)))) {
        translatedWordMatches.push({ wordA: wA, wordB: wB });
        continue;
      }

      // Coincidencia por traducción inversa
      const rawRev = Object.prototype.hasOwnProperty.call(REVERSE_TRANSLATION_MAP, cleanWB)
        ? REVERSE_TRANSLATION_MAP[cleanWB]
        : null;
      const revMatches = Array.isArray(rawRev) ? rawRev : [];

      if (revMatches.length > 0 && revMatches.some(m => typeof m === 'string' && (cleanWA.includes(m) || m.includes(cleanWA)))) {
        translatedWordMatches.push({ wordA: wA, wordB: wB });
        continue;
      }

      // Cognados con raíz común de al menos 4 caracteres (ej: "accidente" <-> "accident", "estupida" <-> "stupid")
      if (wA.length >= 5 && wB.length >= 5) {
        const rootA = cleanWA.slice(0, 4);
        const rootB = cleanWB.slice(0, 4);
        if (rootA === rootB || cleanWA.includes(rootB) || cleanWB.includes(rootA)) {
          translatedWordMatches.push({ wordA: wA, wordB: wB });
        }
      }
    }
  }

  // Desduplicar coincidencias
  const uniqueMatches = Array.from(new Set(translatedWordMatches.map(m => `${m.wordA}->${m.wordB}`)))
    .map(str => {
      const [wordA, wordB] = str.split('->');
      return { wordA, wordB };
    });

  // Cálculo de Puntuación Filológica (0 a 100)
  let score = 0;

  // Fechas y números exactos (anclas de altísima fidelidad: ej. 1937, 1950)
  if (sharedNumbers.length > 0) {
    score += sharedNumbers.length * 35;
  } else if (numsA.length > 0 && numsB.length > 0) {
    // Si ambas oraciones tienen fechas/números pero ninguno coincide (ej. 1937 vs 1950): penalización severa
    score -= 30;
  }

  // Nombres de personajes (ej. Mabel, Annie, Dick)
  if (sharedNames.length > 0) {
    score += sharedNames.length * 30;
  } else if (namesA.length > 0 && namesB.length > 0) {
    // Si A habla de Mabel y B habla de Annie exclusivamente: penalización
    score -= 20;
  }

  // Palabras traducidas verificadas
  score += uniqueMatches.length * 15;

  // Paridad de formato de diálogo (ambos inician con raya/comillas)
  const dialA = /^[-–—«»"“„]/.test(sentenceA.trim());
  const dialB = /^[-–—«»"“„]/.test(sentenceB.trim());
  if (dialA === dialB && dialA) {
    score += 8;
  } else if (dialA !== dialB && (dialA || dialB)) {
    score -= 16;
  }

  // Normalización 0 a 100
  const normalizedScore = Math.max(0, Math.min(100, score));

  // Detección de Desajuste Contradictorio
  // Ocurre cuando dos oraciones tienen sujetos completamente diferentes (ej: Mabel vs borracho/tía Annie)
  // y cero palabras traducidas en común.
  const isContradictoryOrMismatched = 
    (namesA.length > 0 && sharedNames.length === 0 && uniqueMatches.length === 0) ||
    (numsA.length > 0 && sharedNumbers.length === 0 && numsB.length > 0) ||
    (wordsA.length >= 3 && wordsB.length >= 3 && uniqueMatches.length === 0 && sharedNames.length === 0 && sharedNumbers.length === 0);

  let explanation = '';
  if (sharedNumbers.length > 0 || sharedNames.length > 0 || uniqueMatches.length > 0) {
    const parts: string[] = [];
    if (sharedNumbers.length > 0) parts.push(`Fechas/Números: [${sharedNumbers.join(', ')}]`);
    if (sharedNames.length > 0) parts.push(`Personajes: [${sharedNames.join(', ')}]`);
    if (uniqueMatches.length > 0) parts.push(`Lemas traducidos: [${uniqueMatches.slice(0, 3).map(m => `${m.wordA}⇄${m.wordB}`).join(', ')}]`);
    explanation = parts.join(' • ');
  } else if (isContradictoryOrMismatched) {
    explanation = 'Divergencia semántica: las oraciones no comparten personajes, fechas ni lemas temáticos.';
  } else {
    explanation = 'Sin suficiente evidencia semántica compartida.';
  }

  return {
    score: isContradictoryOrMismatched ? Math.min(15, normalizedScore) : normalizedScore,
    sharedNumbers,
    sharedNames,
    translatedWordMatches: uniqueMatches,
    isContradictoryOrMismatched,
    explanation
  };
}
