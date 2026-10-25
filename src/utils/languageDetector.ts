/**
 * Detector Automático de Idiomas para Obras Literarias y Ebooks
 * Utiliza análisis léxico y pesos de palabras funcionales (stop words) de alta frecuencia
 * para discernir con precisión entre Español, Inglés, Alemán, Francés, Italiano y Portugués.
 */

export type SupportedLanguageCode = 'es' | 'en' | 'de' | 'fr' | 'it' | 'pt' | 'unknown';

export interface LanguageInfo {
  code: SupportedLanguageCode;
  name: string;
  confidence: number;
  wordCountSampled: number;
}

const LANGUAGE_PROFILES: Record<Exclude<SupportedLanguageCode, 'unknown'>, { name: string; stopWords: Set<string> }> = {
  es: {
    name: 'Español',
    stopWords: new Set([
      'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no',
      'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'sí', 'porque',
      'esta', 'son', 'entre', 'está', 'cuando', 'él', 'sobre', 'ser', 'tiene', 'también', 'fue', 'había',
      'era', 'muy', 'hasta', 'desde', 'mi', 'sin', 'yo', 'me', 'nos', 'todo', 'ella', 'ellos', 'capítulo', 'prólogo'
    ])
  },
  en: {
    name: 'Inglés',
    stopWords: new Set([
      'the', 'of', 'and', 'to', 'a', 'in', 'that', 'is', 'was', 'he', 'for', 'it', 'with', 'as', 'his',
      'on', 'be', 'at', 'by', 'i', 'this', 'had', 'not', 'are', 'but', 'from', 'or', 'have', 'an',
      'they', 'which', 'one', 'you', 'were', 'her', 'all', 'she', 'there', 'would', 'their', 'we',
      'him', 'been', 'has', 'when', 'who', 'will', 'more', 'no', 'if', 'out', 'so', 'said', 'what', 'chapter', 'preface'
    ])
  },
  de: {
    name: 'Alemán',
    stopWords: new Set([
      'der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist',
      'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat',
      'dass', 'daß', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem',
      'über', 'einen', 'so', 'zum', 'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'kapitel', 'vorwort'
    ])
  },
  fr: {
    name: 'Francés',
    stopWords: new Set([
      'de', 'la', 'le', 'et', 'les', 'des', 'en', 'un', 'du', 'une', 'que', 'est', 'pour', 'qui',
      'dans', 'a', 'par', 'plus', 'pas', 'au', 'sur', 'ne', 'ce', 'se', 'avec', 'sont', 'comme',
      'ou', 'il', 'ont', 'mais', 'nous', 'vous', 'elle', 'été', 'tout', 'aux', 'faire', 'chapitre', 'préface'
    ])
  },
  it: {
    name: 'Italiano',
    stopWords: new Set([
      'di', 'e', 'il', 'la', 'che', 'in', 'per', 'un', 'del', 'da', 'non', 'si', 'una', 'con',
      'i', 'sono', 'le', 'dei', 'ma', 'come', 'ha', 'ed', 'nel', 'più', 'al', 'alla', 'gli',
      'se', 'dalla', 'questo', 'era', 'anche', 'della', 'dei', 'nelle', 'cosa', 'capitolo', 'prefazione'
    ])
  },
  pt: {
    name: 'Portugués',
    stopWords: new Set([
      'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não', 'uma',
      'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi', 'ao', 'ele',
      'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito', 'nos', 'já', 'capítulo', 'prefácio'
    ])
  }
};

/**
 * Detecta automáticamente el idioma predominante de un fragmento o ebook completo.
 */
export function detectTextLanguage(text: string): LanguageInfo {
  if (!text || text.trim().length === 0) {
    return {
      code: 'unknown',
      name: 'Desconocido',
      confidence: 0,
      wordCountSampled: 0
    };
  }

  // Tomamos una muestra representativa de hasta 30,000 caracteres
  const sample = text.slice(0, 30000).toLowerCase();
  // Extracción de tokens alfabéticos
  const tokens = sample.match(/[\p{L}]+/gu) || [];
  const totalTokens = tokens.length;

  if (totalTokens < 10) {
    return {
      code: 'unknown',
      name: 'Indeterminado (muestra corta)',
      confidence: 0,
      wordCountSampled: totalTokens
    };
  }

  const scores: Record<Exclude<SupportedLanguageCode, 'unknown'>, number> = {
    es: 0,
    en: 0,
    de: 0,
    fr: 0,
    it: 0,
    pt: 0
  };

  for (const token of tokens) {
    for (const [lang, profile] of Object.entries(LANGUAGE_PROFILES)) {
      if (profile.stopWords.has(token)) {
        scores[lang as Exclude<SupportedLanguageCode, 'unknown'>]++;
      }
    }
  }

  // Encontrar el idioma con mayor puntuación
  let bestLang: Exclude<SupportedLanguageCode, 'unknown'> = 'es';
  let bestScore = -1;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang as Exclude<SupportedLanguageCode, 'unknown'>;
    }
  }

  const confidence = totalTokens > 0 ? Math.min(1, Number((bestScore / (totalTokens * 0.35)).toFixed(2))) : 0;

  // Si la puntuación es extremadamente baja, marcar desconocido
  if (bestScore < 3) {
    return {
      code: 'unknown',
      name: 'No identificado',
      confidence: 0,
      wordCountSampled: totalTokens
    };
  }

  return {
    code: bestLang,
    name: LANGUAGE_PROFILES[bestLang].name,
    confidence: Math.max(0.2, confidence),
    wordCountSampled: totalTokens
  };
}
