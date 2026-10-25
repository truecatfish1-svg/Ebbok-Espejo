import { GoogleGenAI, Type } from "@google/genai";
import { 
  AuditIssue,
  BookMetadata, 
  BookTocEntry, 
  CleanMetadata, 
  ContentBlock, 
  ContentBlockType, 
  ContentSectionMapEntry,
  EditorialStyleGuide, 
  FallbackLog, 
  ModelTelemetry,
  OptionItem,
  RawChunk,
  TableData
} from '../types';

export interface ModelLimit {
  id: string;
  name: string;
  category: string;
  rpm: number;
  tpm: number;
  rpd: number;
}

export const GLOBAL_MODELS_LIST: ModelLimit[] = [
  { id: 'auto-cascade', name: '⚡ Cascada Inteligente (Flash-Lite → 3.8-Flash → Flash-Latest → Local)', category: 'Recomendado / Máxima Velocidad y 0 Desperdicio de Tokens', rpm: 60, tpm: 2000000, rpd: 3000 },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash-Lite (Ultrarrápido, Económico, Ahorro de Tokens)', category: 'Modelos Ligeros y Rápidos', rpm: 60, tpm: 2000000, rpd: 3000 },
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Visión OCR, Gran Contexto y Fidelidad Editorial)', category: 'Modelos Principales', rpm: 60, tpm: 2000000, rpd: 3000 },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest (Velocidad y Resiliencia Continua)', category: 'Modelos Principales', rpm: 60, tpm: 2000000, rpd: 3000 },
  { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash (Equilibrado y Alta Capacidad de Contexto)', category: 'Modelos Principales', rpm: 60, tpm: 2000000, rpd: 3000 },
  { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Razonamiento Complejo y Traducción Crítica)', category: 'Modelos Avanzados de Síntesis', rpm: 30, tpm: 1000000, rpd: 1500 },
  { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Razonamiento Avanzado y Síntesis Crítica)', category: 'Modelos Avanzados de Síntesis', rpm: 30, tpm: 1000000, rpd: 1500 },
];

export interface ModelTestResult {
  modelId: string;
  name: string;
  status: 'ok' | 'rate_limited' | 'error' | 'not_found' | 'testing';
  latencyMs?: number;
  message?: string;
}

class TelemetryStore {
  private data: Record<string, ModelTelemetry> = {};
  private fallbacksLog: FallbackLog[] = [];

  constructor() {
    this.load();
  }

  private load() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sape_model_telemetry_v5');
        if (saved) {
          const parsed = JSON.parse(saved);
          const now = Date.now();
          for (const key of Object.keys(parsed)) {
            // Limpiar banderas de cuota expiradas o estáticas
            if (parsed[key].rateLimitedUntil && parsed[key].rateLimitedUntil < now) {
              parsed[key].rateLimitedUntil = undefined;
            }
            // Si el registro es de una fecha anterior, resetear contadores a 0
            if (!parsed[key].dayStartTime || (now - parsed[key].dayStartTime > 86400000)) {
              parsed[key].rpdCount = 0;
              parsed[key].rpmCount = 0;
              parsed[key].tpmCount = 0;
              parsed[key].dayStartTime = now;
            }
            parsed[key].isOnline = true;
            parsed[key].failuresCount = 0;
          }
          this.data = parsed;
        }
      } catch (e) {
        this.data = {};
      }
      this.fallbacksLog = [];
      try {
        localStorage.removeItem('sape_fallbacks_log_v5');
      } catch (_) {}
    }
  }

  public save() {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('sape_model_telemetry_v5', JSON.stringify(this.data));
        localStorage.setItem('sape_fallbacks_log_v5', JSON.stringify(this.fallbacksLog));
      } catch (e) {
        console.warn('No se pudo guardar la telemetría en localStorage:', e);
      }
      try {
        window.dispatchEvent(new CustomEvent('sape-telemetry-updated'));
      } catch (_) {}
    }
  }

  public getTelemetry(modelId: string): ModelTelemetry {
    const now = Date.now();
    if (!this.data[modelId]) {
      this.data[modelId] = {
        rpmCount: 0,
        tpmCount: 0,
        rpdCount: 0,
        lastRequestTime: 0,
        dayStartTime: now,
        isOnline: true,
        failuresCount: 0
      };
    }
    const t = this.data[modelId];
    if (now - t.lastRequestTime > 60000) {
      t.rpmCount = 0;
    }
    if (now - t.dayStartTime > 86400000) {
      t.rpdCount = 0;
      t.dayStartTime = now;
    }
    return t;
  }

  public recordRequest(modelId: string, tokens: number) {
    const telemetry = this.getTelemetry(modelId);
    telemetry.rpmCount += 1;
    telemetry.rpdCount += 1;
    telemetry.tpmCount += tokens;
    telemetry.lastRequestTime = Date.now();
    telemetry.isOnline = true;
    telemetry.failuresCount = 0;
    this.save();
  }

  public recordRateLimit(modelId: string, durationMs: number = 25000) {
    const telemetry = this.getTelemetry(modelId);
    telemetry.rateLimitedUntil = Date.now() + durationMs;
    telemetry.failuresCount += 1;
    this.save();
  }

  public recordFailure(modelId: string) {
    const telemetry = this.getTelemetry(modelId);
    telemetry.failuresCount += 1;
    if (telemetry.failuresCount >= 3) {
      telemetry.isOnline = false;
    }
    this.save();
  }

  public logFallback(from: string, to: string, reason: string) {
    this.fallbacksLog.unshift({
      timestamp: new Date().toLocaleTimeString(),
      from,
      to,
      reason
    });
    if (this.fallbacksLog.length > 30) {
      this.fallbacksLog.pop();
    }
    this.save();
  }

  public getLogs(): FallbackLog[] {
    return this.fallbacksLog;
  }

  public clearTelemetry() {
    this.data = {};
    this.fallbacksLog = [];
    this.save();
  }

  public getStatus(modelId: string): 'Online' | 'Approaching Limits' | 'Depleted/Rate Limited' | 'Offline' {
    if (modelId === 'auto-cascade') return 'Online';
    const limit = GLOBAL_MODELS_LIST.find(m => m.id === modelId);
    if (!limit) return 'Online';
    
    const t = this.getTelemetry(modelId);
    if (!t.isOnline) return 'Offline';

    if (t.rateLimitedUntil && Date.now() < t.rateLimitedUntil) {
      return 'Depleted/Rate Limited';
    }

    const rpdRatio = limit.rpd > 0 ? t.rpdCount / limit.rpd : 0;
    const rpmRatio = limit.rpm > 0 ? t.rpmCount / limit.rpm : 0;
    const tpmRatio = limit.tpm > 0 ? t.tpmCount / limit.tpm : 0;

    const maxRatio = Math.max(rpdRatio, rpmRatio, tpmRatio);

    if (maxRatio >= 0.95) return 'Depleted/Rate Limited';
    if (maxRatio >= 0.75) return 'Approaching Limits';
    return 'Online';
  }
}

export const telemetryStore = new TelemetryStore();

export function isQuotaOrRateLimitError(error: any): boolean {
  if (!error) return false;
  if (error.status === 429 || error.status === 'RESOURCE_EXHAUSTED' || error.statusCode === 429) return true;
  if (error.error?.code === 429 || error.error?.status === 'RESOURCE_EXHAUSTED') return true;
  const str = (error.message || '') + ' ' + (typeof error === 'string' ? error : JSON.stringify(error));
  const lower = str.toLowerCase();
  return (
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('resource has been exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('rate-limit') ||
    lower.includes('exceeded your current quota')
  );
}

export const ORDERED_MODEL_FLEET = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-4-argon'
];

export function getFallbackModelChain(currentModel: string): string[] {
  if (currentModel === 'auto-cascade') {
    return [...ORDERED_MODEL_FLEET];
  }
  const filtered = ORDERED_MODEL_FLEET.filter(m => m !== currentModel);
  return filtered.length > 0 ? filtered : ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
}

export async function testSingleGeminiModel(modelId: string): Promise<ModelTestResult> {
  const modelDef = GLOBAL_MODELS_LIST.find(m => m.id === modelId);
  const name = modelDef?.name || modelId;
  const start = Date.now();
  try {
    const rawKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
    if (!rawKey || rawKey === 'MY_GEMINI_API_KEY' || rawKey.length < 10) {
      return {
        modelId,
        name,
        status: 'error',
        message: 'Clave GEMINI_API_KEY no configurada o incompleta.'
      };
    }
    const ai = new GoogleGenAI({ 
      apiKey: rawKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });
    const targetModel = modelId === 'auto-cascade' ? 'gemini-3.1-flash-lite' : modelId;
    const callPromise = ai.models.generateContent({
      model: targetModel,
      contents: 'Ping de prueba. Responde únicamente "OK".',
      config: { maxOutputTokens: 10, temperature: 0.1 }
    });
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Timeout de 10s')), 10000)
    );
    const res: any = await Promise.race([callPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;
    telemetryStore.recordRequest(targetModel, 10);
    return {
      modelId,
      name,
      status: 'ok',
      latencyMs,
      message: `Activo y funcional (${latencyMs}ms): "${res.text?.trim() || 'OK'}"`
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('429')) {
      return { modelId, name, status: 'rate_limited', latencyMs, message: 'Límite de cuota alcanzado (429).' };
    }
    if (msg.includes('404') || msg.includes('not found') || msg.includes('unsupported')) {
      return { modelId, name, status: 'not_found', latencyMs, message: 'Modelo no admitido en este endpoint (404).' };
    }
    return { modelId, name, status: 'error', latencyMs, message: err?.message || 'Error en llamada.' };
  }
}

export async function testAllGeminiModels(): Promise<ModelTestResult[]> {
  const modelsToTest = GLOBAL_MODELS_LIST.filter(m => m.id !== 'auto-cascade');
  const results: ModelTestResult[] = [];
  for (const m of modelsToTest) {
    const res = await testSingleGeminiModel(m.id);
    results.push(res);
  }
  return results;
}

export function hasValidGeminiApiKey(): boolean {
  const apiKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY' && !apiKey.startsWith('MY_') && apiKey.length >= 10);
}

export async function callGeminiWithResilience(
  request: any,
  maxTotalAttempts = 2,
  baseDelayMs = 600
): Promise<any> {
  const rawKey = (process.env.API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!rawKey || rawKey === 'MY_GEMINI_API_KEY' || rawKey.startsWith('MY_') || rawKey.length < 10) {
    throw new Error('No se encontró una clave de API válida (GEMINI_API_KEY). Por favor configure una clave válida o use el procesamiento local offline.');
  }
  const apiKey = rawKey;
  const ai = new GoogleGenAI({ 
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build'
      }
    }
  });

  const requestedModel = request.model || 'auto-cascade';
  let activeModel = requestedModel === 'auto-cascade' ? 'gemini-3.1-flash-lite' : requestedModel;
  let attempt = 0;
  const triedModels = new Set<string>();

  while (attempt < maxTotalAttempts) {
    attempt++;
    triedModels.add(activeModel);
    try {
      request.model = activeModel;
      // Timeout ágil de 12 segundos por llamada para evitar colgar la interfaz
      const callPromise = ai.models.generateContent(request);
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`Timeout de respuesta en ${activeModel} (12s)`)), 12000)
      );
      const response = await Promise.race([callPromise, timeoutPromise]);
      
      const inputChars = typeof request.contents === 'string' ? request.contents.length : JSON.stringify(request.contents).length;
      const outputChars = response.text ? response.text.length : 0;
      const estimatedTokens = Math.ceil((inputChars + outputChars) / 3.8);

      telemetryStore.recordRequest(activeModel, estimatedTokens);
      return response;
    } catch (error: any) {
      console.warn(`[Resiliencia IA] Intento ${attempt}/${maxTotalAttempts} con modelo ${activeModel}:`, error?.message || error);

      const errorMsg = String(error?.message || '').toLowerCase();
      const isApiKeyInvalid = errorMsg.includes('api_key_invalid') || 
        errorMsg.includes('api key not valid') || 
        errorMsg.includes('invalid api key') ||
        error?.status === 400 && errorMsg.includes('key');
      const isPermissionDenied = error?.status === 403 || 
        error?.statusCode === 403 || 
        error?.error?.code === 403 || 
        error?.error?.status === 'PERMISSION_DENIED';

      // Si la clave es inválida o no tiene permisos, no tiene sentido rotar modelos: fallar de inmediato
      if (isApiKeyInvalid || isPermissionDenied) {
        telemetryStore.recordFailure(activeModel);
        throw new Error(`Error de autenticación con Gemini (${activeModel}): Clave no autorizada o inválida. Pasando a resolución local.`);
      }

      const isRateLimit = isQuotaOrRateLimitError(error);
      const isUnavailable = error?.status === 503 || 
        error?.statusCode === 503 || 
        error?.status === 404 ||
        error?.status === 'UNAVAILABLE' || 
        error?.error?.status === 'UNAVAILABLE' ||
        errorMsg.includes('503') || 
        errorMsg.includes('404') ||
        errorMsg.includes('high demand') || 
        errorMsg.includes('timeout') ||
        errorMsg.includes('no longer available');

      if (isRateLimit || isUnavailable) {
        if (isRateLimit) {
          telemetryStore.recordRateLimit(activeModel, 15000);
        } else {
          telemetryStore.recordFailure(activeModel);
        }

        const fallbackCandidates = getFallbackModelChain(activeModel);
        const nextModel = fallbackCandidates.find(m => !triedModels.has(m) && telemetryStore.getStatus(m) !== 'Depleted/Rate Limited') 
          || fallbackCandidates.find(m => m !== activeModel)
          || fallbackCandidates[0];

        if (nextModel && nextModel !== activeModel) {
          const reason = isUnavailable
            ? `Servicio saturado o timeout en ${activeModel}. Rotando inmediatamente a ${nextModel}.`
            : `Cuota temporal alcanzada en ${activeModel}. Rotando a ${nextModel}.`;
          
          telemetryStore.logFallback(activeModel, nextModel, reason);
          if (typeof window !== 'undefined') {
            try {
              window.dispatchEvent(new CustomEvent('sape-model-switched', { detail: { from: activeModel, to: nextModel, reason } }));
            } catch (_) {}
          }
          activeModel = nextModel;
          await new Promise(r => setTimeout(r, 60));
          continue;
        }
      }

      const jitterDelay = baseDelayMs + Math.floor(Math.random() * 400);
      console.info(`[Resiliencia IA] Pausa de recuperación (${jitterDelay}ms)...`);
      
      try {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sape-rate-limit-waiting', { 
            detail: { model: activeModel, attempt, maxTotalAttempts } 
          }));
        }
      } catch (_) {}

      await new Promise(r => setTimeout(r, jitterDelay));

      const nextFleetModel = ORDERED_MODEL_FLEET[(attempt) % ORDERED_MODEL_FLEET.length];
      if (nextFleetModel) {
        activeModel = nextFleetModel;
      }
    }
  }

  throw new Error("No se pudo completar la operación tras múltiples rotaciones de modelos. Por favor espera unos segundos y reanuda.");
}

// ----------------------------------------------------
// NORMALIZADOR Y SEPARADOR DETERMINISTA DE PREGUNTAS Y DIÁLOGOS
// ----------------------------------------------------

export function splitMergedNumberedQuestionsAndDialogues(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Separar preguntas numeradas pegadas a frases anteriores (ej. "...amistad. 5. Señor postulante...", "...acuerdo 6. Durante la...")
  cleaned = cleaned.replace(/([^\n\d])\s+(\d{1,3}\.\s+[A-ZÁÉÍÓÚÑ¿¡])/g, '$1\n\n$2');

  // 2. Separar alternativas pegadas en la misma línea (ej. "...pregunta A) primera opción B) segunda opción C) tercera...")
  cleaned = cleaned.replace(/([^\n])\s+([A-E]\)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ0-9])/g, '$1\n$2');

  // 3. Separar turnos de entrevista o diálogo ("Entrevistador:", "Candidato:", "Pregunta:", "Respuesta:")
  cleaned = cleaned.replace(/([^\n])\s+((?:Entrevistador|Candidato|Postulante|Pregunta|Respuesta|Jurado|Examinador|Testimonio):\s*)/gi, '$1\n\n$2');

  // 4. Separar viñetas o guiones pegados
  cleaned = cleaned.replace(/([^\n])\s+([•\-]\s+[A-ZÁÉÍÓÚÑ])/g, '$1\n$2');

  // 5. Eliminar espacios múltiples en exceso pero preservando saltos
  cleaned = cleaned.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');

  return cleaned.trim();
}

/**
 * Curación determinista completa de artefactos OCR:
 * - Unificación de palabras cortadas por guion ("espá-  ragos" -> "espárragos", "apren- \nder" -> "aprender", "debe- mos" -> "debemos", "auto- confianza" -> "autoconfianza")
 * - Corrección de signos de puntuación huérfanos ("hacerlo ." -> "hacerlo.", "Perú es :" -> "Perú es:")
 * - Recomposición de líneas rotas dentro de oraciones o viñetas
 * - Cero consumo de tokens de API
 */
export function curateOcrTextAndParagraphContinuity(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Reconstrucción de palabras cortadas con guion silábico (con saltos de línea o espacios internos)
  // Ej: "espá-  ragos" -> "espárragos", "apren-\nder" -> "aprender", "debe- mos" -> "debemos"
  cleaned = cleaned.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ]+)-\s*\n\s*([a-záéíóúñ]+)/g, '$1$2');
  cleaned = cleaned.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ]+)-\s{1,4}([a-záéíóúñ]+)/g, '$1$2');

  // 2. Corrección de puntuación flotante con espacios previos
  // Ej: "hacerlo ." -> "hacerlo.", "Perú es :" -> "Perú es:", "etc ." -> "etc."
  cleaned = cleaned.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ0-9\)])\s+([,\.:;\?!])/g, '$1$2');
  cleaned = cleaned.replace(/¿\s+([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '¿$1');
  cleaned = cleaned.replace(/¡\s+([a-záéíóúñA-ZÁÉÍÓÚÑ])/g, '¡$1');

  // 3. Continuidad de oraciones y viñetas cortadas por límites de línea
  // Ej: "• ¿Cuál es su principal carencia y\nprincipal virtud?"
  const lines = cleaned.split('\n');
  const mergedLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const curr = lines[i].trim();
    if (!curr) {
      mergedLines.push('');
      continue;
    }

    if (mergedLines.length > 0) {
      const prev = mergedLines[mergedLines.length - 1];
      
      const isPrevOpen = prev && !/[.:?!»"”\)]$/.test(prev) && !prev.startsWith('---') && !prev.startsWith('|') && !prev.startsWith('#');
      
      // Si la línea anterior es una viñeta abierta y la actual continúa la pregunta/oración
      const isBulletContinuation = (prev.startsWith('•') || prev.startsWith('-')) && 
        !curr.startsWith('•') && 
        !curr.startsWith('-') && 
        !/^[A-E]\)/.test(curr) && 
        !/^\d{1,3}[\.\)]/.test(curr) && 
        !/^[¿¡]/.test(curr);

      const isSentenceContinuation = isPrevOpen && /^[a-záéíóúñ]/.test(curr) && !curr.startsWith('|') && !curr.startsWith('---');

      if (isBulletContinuation || isSentenceContinuation) {
        mergedLines[mergedLines.length - 1] = `${prev} ${curr}`;
        continue;
      }
    }

    mergedLines.push(curr);
  }

  cleaned = mergedLines.join('\n');

  // 4. Separación de reactivos y diálogos estructurados
  cleaned = splitMergedNumberedQuestionsAndDialogues(cleaned);

  return cleaned.trim();
}

/**
 * Curación masiva determinista de continuidad de párrafos, guionado y opciones en todos los fragmentos y bloques
 */
export function curateEntireDocumentContinuityAndHyphenation(chunks: RawChunk[]): { chunks: RawChunk[]; fixedCount: number } {
  let fixedCount = 0;

  const updatedChunks = chunks.map(chunk => {
    let hasChanges = false;
    let newClean = chunk.cleanContent ? curateOcrTextAndParagraphContinuity(chunk.cleanContent) : chunk.cleanContent;
    if (newClean !== chunk.cleanContent) {
      hasChanges = true;
    }

    let newBlocks = chunk.blocks;
    if (chunk.blocks && chunk.blocks.length > 0) {
      const curatedBlockResult = curateAllBlocksQuestionsAndOptionsLocally(chunk.blocks);
      
      newBlocks = curatedBlockResult.blocks.map(b => {
        const curatedContent = curateOcrTextAndParagraphContinuity(b.content);
        const curatedTitle = b.title ? curateOcrTextAndParagraphContinuity(b.title) : b.title;
        let curatedOptions = b.options;
        if (b.options && b.options.length > 0) {
          curatedOptions = b.options.map(opt => ({
            ...opt,
            text: curateOcrTextAndParagraphContinuity(opt.text)
          }));
        }

        if (curatedContent !== b.content || curatedTitle !== b.title) {
          hasChanges = true;
        }

        return {
          ...b,
          content: curatedContent,
          title: curatedTitle,
          options: curatedOptions
        };
      });

      if (curatedBlockResult.fixedCount > 0) {
        hasChanges = true;
      }
    }

    if (hasChanges) {
      fixedCount++;
    }

    return {
      ...chunk,
      cleanContent: newClean,
      blocks: newBlocks
    };
  });

  return { chunks: updatedChunks, fixedCount };
}

export interface QuestionCurationResult {
  isMultipleChoice: boolean;
  questionStem: string;
  options: OptionItem[];
  solution?: string;
}

export function parseAndSeparateQuestionOptions(text: string): QuestionCurationResult {
  if (!text) {
    return { isMultipleChoice: false, questionStem: '', options: [] };
  }

  let cleaned = text.trim();
  let solution: string | undefined = undefined;

  // Detectar solucionario o clave al final
  const solMatch = cleaned.match(/(?:Clave|Rpta|Respuesta|Solución|Solucionario):\s*([A-Ea-e\d]+(?:[^\n]*))/i);
  if (solMatch) {
    solution = solMatch[1].trim();
    cleaned = cleaned.replace(/(?:Clave|Rpta|Respuesta|Solución|Solucionario):\s*[A-Ea-e\d]+(?:[^\n]*)/i, '').trim();
  }

  // Buscar alternativas estructuradas tipo A) o A. o (A)
  const optionRegex = /(?:^|\n|\s{2,})([A-Ea-e])[\)\.\-]\s+/g;
  const matches = [...cleaned.matchAll(optionRegex)];

  if (matches.length >= 2) {
    const firstOptionIndex = matches[0].index ?? 0;
    const questionStem = cleaned.substring(0, firstOptionIndex).trim();
    const optionsText = cleaned.substring(firstOptionIndex);
    const options: OptionItem[] = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const letter = match[1].toUpperCase();
      const startPos = (match.index ?? 0) - firstOptionIndex + match[0].length;
      const endPos = (i < matches.length - 1) 
        ? (matches[i + 1].index ?? 0) - firstOptionIndex 
        : optionsText.length;

      const optText = optionsText.substring(startPos, endPos).trim();
      if (optText) {
        options.push({
          letter,
          text: optText,
          isCorrect: solution ? solution.toUpperCase().includes(letter) : false
        });
      }
    }

    if (options.length >= 2) {
      return {
        isMultipleChoice: true,
        questionStem: questionStem || 'Enunciado de reactivo:',
        options,
        solution
      };
    }
  }

  // Pregunta abierta pura (sin alternativas)
  return {
    isMultipleChoice: false,
    questionStem: cleaned,
    options: [],
    solution
  };
}

export function curateAllBlocksQuestionsAndOptionsLocally(blocks: ContentBlock[]): {
  blocks: ContentBlock[];
  fixedCount: number;
  multipleChoiceCount: number;
  openQuestionsCount: number;
} {
  let fixedCount = 0;
  let multipleChoiceCount = 0;
  let openQuestionsCount = 0;

  const curatedBlocks: ContentBlock[] = [];

  for (const block of blocks) {
    const isExercise = block.type === 'exercise';
    const isNumberedQuestion = /^\(?\d{1,3}[\.\)]\s+/.test(block.content.trim()) || /^\¿|^\?/.test(block.content.trim());
    const hasOptionsPattern = /(?:[A-Ea-e]\)|\([A-Ea-e]\))/.test(block.content);

    if (isExercise || isNumberedQuestion || hasOptionsPattern) {
      const splitted = splitMergedNumberedQuestionsAndDialogues(block.content);
      const subParts = splitted.split(/\n\s*\n/).filter(Boolean);

      if (subParts.length > 1) {
        for (let idx = 0; idx < subParts.length; idx++) {
          const part = subParts[idx];
          const cur = parseAndSeparateQuestionOptions(part);
          fixedCount++;
          if (cur.isMultipleChoice) {
            multipleChoiceCount++;
            curatedBlocks.push({
              id: `${block.id}_split_${idx}`,
              type: 'exercise',
              title: block.title,
              content: cur.questionStem,
              options: cur.options,
              solution: cur.solution || block.solution,
              isApproved: true
            });
          } else {
            openQuestionsCount++;
            curatedBlocks.push({
              id: `${block.id}_split_${idx}`,
              type: isExercise ? 'exercise' : block.type,
              title: block.title,
              content: cur.questionStem,
              options: [],
              solution: cur.solution || block.solution,
              isApproved: true
            });
          }
        }
        continue;
      }

      const cur = parseAndSeparateQuestionOptions(block.content);
      if (cur.isMultipleChoice) {
        multipleChoiceCount++;
        if (!block.options || block.options.length < cur.options.length || block.content !== cur.questionStem) {
          fixedCount++;
        }
        curatedBlocks.push({
          ...block,
          type: 'exercise',
          content: cur.questionStem,
          options: cur.options,
          solution: cur.solution || block.solution
        });
      } else {
        openQuestionsCount++;
        if (block.options && block.options.length > 0) {
          fixedCount++;
        }
        curatedBlocks.push({
          ...block,
          content: cur.questionStem,
          options: [], // Limpio para preguntas abiertas
          solution: cur.solution || block.solution
        });
      }
      continue;
    }

    curatedBlocks.push(block);
  }

  return {
    blocks: curatedBlocks,
    fixedCount,
    multipleChoiceCount,
    openQuestionsCount
  };
}

// Re-análisis quirúrgico y económico de reactivos con IA (solo procesa bloques con preguntas)
export async function reanalyzeTargetedQuestionsWithAI(
  blocks: ContentBlock[],
  bookContext: { title: string; subject: string },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<{ blocks: ContentBlock[]; curatedCount: number; multipleChoiceCount: number; openQuestionsCount: number }> {
  // 1. Filtrar únicamente bloques de tipo exercise o que contengan preguntas / opciones
  const candidateIndices: number[] = [];
  const candidateBlocks: { index: number; block: ContentBlock }[] = [];

  blocks.forEach((b, idx) => {
    if (b.type === 'exercise' || /^\(?\d{1,3}[\.\)]/.test(b.content.trim()) || /(?:[A-Ea-e]\)|\([A-Ea-e]\))/.test(b.content)) {
      candidateIndices.push(idx);
      candidateBlocks.push({ index: idx, block: b });
    }
  });

  if (candidateBlocks.length === 0) {
    const local = curateAllBlocksQuestionsAndOptionsLocally(blocks);
    return { blocks: local.blocks, curatedCount: local.fixedCount, multipleChoiceCount: local.multipleChoiceCount, openQuestionsCount: local.openQuestionsCount };
  }

  // 2. Procesar en micro-lotes de hasta 20 preguntas (muy económico en tokens)
  const BATCH_SIZE = 20;
  const updatedBlocks = [...blocks];
  let curatedCount = 0;
  let multipleChoiceCount = 0;
  let openQuestionsCount = 0;

  for (let i = 0; i < candidateBlocks.length; i += BATCH_SIZE) {
    const batch = candidateBlocks.slice(i, i + BATCH_SIZE);
    const batchPromptPayload = batch.map((item) => ({
      tempId: `q_${item.index}`,
      originalType: item.block.type,
      rawText: item.block.content,
      existingOptions: item.block.options || []
    }));

    const prompt = `
Eres un CURADOR EDITORIAL EXPERTO EN PREGUNTAS Y REACTIVOS DE EVALUACIÓN.
Tu ÚNICA misión es clasificar y estructurar con extrema delicadeza este conjunto de preguntas del libro "${bookContext.title}":

DIFERENCIACIÓN MANDATORIA:
1. 📖 PREGUNTAS ABIERTAS / BALOTARIOS / ENTREVISTAS (SIN ALTERNATIVAS):
   - El texto es un enunciado puro de reflexión, investigación o pregunta abierta (ej. "¿Cómo se aplica el teorema?", "19. ¿Cuál es la función...?").
   - Devuelve 'isMultipleChoice': false.
   - Coloca el enunciado completo y limpio en 'questionStem'.
   - 'options': [] (OBLIGATORIAMENTE VACÍO, ¡NO INVENTES OPCIONES NI CONVIERTAS EN LISTAS!).

2. 🎯 REACTIVOS DE OPCIÓN MÚLTIPLE (CON ALTERNATIVAS A, B, C, D, E):
   - La pregunta presenta alternativas de respuesta.
   - Devuelve 'isMultipleChoice': true.
   - Coloca ÚNICAMENTE el enunciado en 'questionStem' (¡PROHIBIDO incluir las letras A/B/C/D pegadas dentro de 'questionStem'!).
   - Extrae cada opción nítidamente en 'options': [{ letter: "A", text: "..." }, { letter: "B", text: "..." }].
   - Si se incluye la clave o respuesta correcta, colócala en 'solution'.

PREGUNTAS A CURAR:
${JSON.stringify(batchPromptPayload, null, 2)}
`;

    try {
      const response = await callGeminiWithResilience({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tempId: { type: Type.STRING },
                isMultipleChoice: { type: Type.BOOLEAN },
                questionStem: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      letter: { type: Type.STRING },
                      text: { type: Type.STRING },
                      isCorrect: { type: Type.BOOLEAN }
                    },
                    required: ["letter", "text"]
                  }
                },
                solution: { type: Type.STRING }
              },
              required: ["tempId", "isMultipleChoice", "questionStem"]
            }
          }
        }
      });

      const parsedResults = JSON.parse(response.text.trim());
      if (Array.isArray(parsedResults)) {
        parsedResults.forEach((res: any) => {
          const originalItem = batch.find(b => `q_${b.index}` === res.tempId);
          if (originalItem) {
            const isMC = !!res.isMultipleChoice && Array.isArray(res.options) && res.options.length >= 2;
            if (isMC) {
              multipleChoiceCount++;
            } else {
              openQuestionsCount++;
            }
            curatedCount++;

            updatedBlocks[originalItem.index] = {
              ...originalItem.block,
              type: isMC ? 'exercise' : originalItem.block.type,
              content: res.questionStem || originalItem.block.content,
              options: isMC ? res.options : [],
              solution: res.solution || originalItem.block.solution,
              isApproved: true
            };
          }
        });
      }
    } catch (err) {
      console.warn("Error curando micro-lote de reactivos con IA, aplicando curador determinista:", err);
      // Fallback local determinista para el lote
      batch.forEach(item => {
        const localCur = parseAndSeparateQuestionOptions(item.block.content);
        if (localCur.isMultipleChoice) {
          multipleChoiceCount++;
        } else {
          openQuestionsCount++;
        }
        updatedBlocks[item.index] = {
          ...item.block,
          type: localCur.isMultipleChoice ? 'exercise' : item.block.type,
          content: localCur.questionStem,
          options: localCur.options,
          solution: localCur.solution || item.block.solution
        };
      });
    }
  }

  return {
    blocks: updatedBlocks,
    curatedCount,
    multipleChoiceCount,
    openQuestionsCount
  };
}

export function parseMarkdownTable(text: string): TableData | null {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  const tableLines = lines.filter(l => l.startsWith('|') && l.endsWith('|'));
  if (tableLines.length < 2) return null;

  const headerLine = tableLines[0];
  const headers = headerLine.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
  
  let startRowIdx = 1;
  if (tableLines.length > 1 && tableLines[1].includes('---')) {
    startRowIdx = 2;
  }

  const rows: string[][] = [];
  for (let i = startRowIdx; i < tableLines.length; i++) {
    const rowLine = tableLines[i];
    const cells = rowLine.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  if (headers.length > 0 && rows.length > 0) {
    return {
      headers,
      rows
    };
  }
  return null;
}

// ----------------------------------------------------
// 1. DETECCIÓN PREVIA DEL ÍNDICE (TOC) Y MAPA DE TIPOS DE CONTENIDO
// ----------------------------------------------------

export async function detectBookStructureAndContentMap(
  samplePagesText: string[],
  bookContext?: { title?: string; subject?: string } | string,
  modelName: string = "gemini-3.1-flash-lite"
): Promise<{ toc: BookTocEntry[]; contentMap: ContentSectionMapEntry[] }> {
  const contextObj = typeof bookContext === 'string' 
    ? { title: bookContext, subject: '' } 
    : (bookContext || { title: 'Documento', subject: '' });
  const combined = samplePagesText.slice(0, 10).join("\n\n=== PÁGINA O FRAGMENTO ===\n\n").substring(0, 16000);

  const prompt = `
Eres un ANALISTA EDITORIAL Y ARQUITECTO ESTRUCTURAL DE LIBROS Y DOCUMENTOS ACADÉMICOS.
Tu objetivo es examinar las páginas del libro "${contextObj.title || 'Documento'}" (que incluyen las páginas iniciales y/o finales donde tradicionalmente se ubica el Índice o Sumario) y extraer o estructurar:

1. TABLA DE CONTENIDOS (Índice / TOC de Capítulos y Secciones con niveles 1 a 4):
   - Si el libro contiene un Índice, Sumario o Contenido explícito: extrae fielmente todos los capítulos, títulos y subtítulos con su nivel jerárquico (1 a 4).
   - Si NO contiene un sumario explícito: genera y deduce automáticamente el árbol de capítulos y temas principales a partir de los títulos, encabezados y transiciones temáticas observadas en el material.

2. MAPA DE TIPOS DE CONTENIDO: Diagnostica en qué capítulos o secciones se encuentran:
   - "theory" (Marco teórico, definiciones, conceptos)
   - "question_bank" (Balotario de preguntas abiertas / entrevistas)
   - "multiple_choice" (Reactivos con alternativas A, B, C, D, E y solucionario)
   - "tables_statistics" (Tablas de datos, cuadros comparativos)
   - "dialogue_interview" (Guiones de entrevista o diálogo)
   - "glossary" (Glosario o términos)

MUESTRA DE PÁGINAS INICIALES Y FINALES DEL LIBRO:
"""
${combined}
"""

Devuelve en JSON estricto.
`;

  try {
    const response = await callGeminiWithResilience({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            toc: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  level: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  sectionCode: { type: Type.STRING },
                  pageNumber: { type: Type.NUMBER },
                  description: { type: Type.STRING }
                },
                required: ["level", "title"]
              }
            },
            contentMap: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  sectionName: { type: Type.STRING },
                  pageRange: { type: Type.STRING },
                  contentType: {
                    type: Type.STRING,
                    enum: ["theory", "question_bank", "multiple_choice", "dialogue_interview", "tables_statistics", "glossary", "mixed"]
                  },
                  description: { type: Type.STRING },
                  suggestedStyles: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["sectionName", "contentType", "description"]
              }
            }
          },
          required: ["toc", "contentMap"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    return {
      toc: (parsed.toc || []).map((item: any, idx: number) => ({
        id: item.id || `toc_${idx + 1}`,
        level: (item.level >= 1 && item.level <= 4) ? item.level : 1,
        title: item.title,
        sectionCode: item.sectionCode,
        pageNumber: item.pageNumber,
        description: item.description
      })),
      contentMap: (parsed.contentMap || []).map((item: any, idx: number) => ({
        id: item.id || `cmap_${idx + 1}`,
        sectionName: item.sectionName,
        pageRange: item.pageRange || 'Sección',
        contentType: item.contentType || 'theory',
        description: item.description,
        suggestedStyles: item.suggestedStyles || ['Normal', 'Encabezado']
      }))
    };
  } catch (e) {
    console.warn("Fallo extrayendo estructura y mapa de contenido:", e);
    return { toc: [], contentMap: [] };
  }
}

export async function detectBookTableOfContents(
  samplePagesText: string[],
  bookContext?: { title?: string; subject?: string } | string,
  modelName: string = "gemini-3.1-flash-lite"
): Promise<BookTocEntry[]> {
  const res = await detectBookStructureAndContentMap(samplePagesText, bookContext, modelName);
  return res.toc;
}

// ----------------------------------------------------
// 2. PROCESAMIENTO HOLÍSTICO POR MACRO-BLOQUES (BATCHES)
// Purificación + Tipificación Concurrente con Conocimiento del TOC
// ----------------------------------------------------

export interface MacroBlockResult {
  cleanContent: string;
  cleanMetadata: CleanMetadata;
  blocks: ContentBlock[];
}

export async function processMacroBlockPurifyAndStyle(
  macroBlockRawText: string,
  bookContext: {
    title: string;
    subject: string;
    author?: string;
    educationLevel?: string;
    styleGuide?: EditorialStyleGuide | null;
    toc?: BookTocEntry[];
    editorialMemory?: {
      lastHeading1?: string;
      lastHeading2?: string;
      lastHeading3?: string;
      lastExerciseNumber?: number;
      ongoingContext?: string;
    };
  },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<MacroBlockResult> {
  const tocReference = (bookContext.toc && bookContext.toc.length > 0)
    ? `\nTABLA DE CONTENIDOS Y ESTRUCTURA GLOBAL DEL LIBRO (BRÚJULA EDITORIAL):\n${bookContext.toc.map(t => `- [Nivel ${t.level}] ${t.sectionCode ? t.sectionCode + ': ' : ''}${t.title}`).join('\n')}\n`
    : '';

  const memoryReference = bookContext.editorialMemory ? `
MEMORIA Y CONTINUIDAD DEL BLOQUE ANTERIOR:
- Último Capítulo/Unidad activo: "${bookContext.editorialMemory.lastHeading1 || 'Inicio'}"
- Último Subtema activo: "${bookContext.editorialMemory.lastHeading2 || bookContext.editorialMemory.lastHeading3 || 'N/A'}"
- Último Reactivo numerado: #${bookContext.editorialMemory.lastExerciseNumber || '0'}
- Contexto de cierre previo: "${bookContext.editorialMemory.ongoingContext || ''}"
` : '';

  const prompt = `
Eres el MOTOR DE TRANSCRIPCIÓN FIEL, PURIFICACIÓN OCR Y TIPIFICACIÓN SEMÁNTICA NO GENÉRICA.
Tu misión es procesar este MACRO-BLOQUE CONTINUO del libro "${bookContext.title}" (${bookContext.subject}) garantizando CERO PÉRDIDA DE CONTENIDO y PRESERVACIÓN TOTAL DE LA ESTRUCTURA ORIGINAL.

${tocReference}
${memoryReference}

🚨 REGLAS CRÍTICAS DE ESTRUCTURA Y FORMATO (MANDATORIAS):
1. 🚫 CERO AMALGAMACIÓN DE PREGUNTAS O DIÁLOGOS:
   - Cada pregunta numerada o reactivo (ej. "19. ¿...?", "20. ¿...?", "1. ¿...?") DEBE SER UN BLOQUE O PÁRRAFO INDEPENDIENTE.
   - ¡BAJO NINGUNA CIRCUNSTANCIA UNAS DOS PREGUNTAS EN UN MISMO PÁRRAFO O LÍNEA CORRIDA!
   - En balotarios, cuestionarios y entrevistas: separa siempre la pregunta de la respuesta y de la siguiente pregunta con doble salto (\\n\\n).
2. 🎯 REACTIVOS CON ALTERNATIVAS:
   - Si el reactivo tiene alternativas A), B), C), D), E): colócalas en el arreglo 'options' con su letra y texto, o en líneas separadas.
   - Si tiene clave o solucionario, asígnalo en 'solution' o 'explanation'.
   - Continúa la numeración correlativa a partir del último reactivo #${bookContext.editorialMemory?.lastExerciseNumber || 0}.
3. 📝 PRESERVACIÓN DE PÁRRAFOS Y DIÁLOGOS:
   - NO aplanes el texto. Respeta los párrafos originales (\\n\\n).
   - En turnos de conversación o entrevista ("Entrevistador:", "Candidato:", "— ..."): cada turno va en su propia línea separada.
4. 🚫 FILTRO DE CORNISAS REPETITIVAS:
   - Elimina encabezados de página repetitivos (running headers) y números de página aislados (ej. "Pág. 12", "143").
   - NO conviertas cornisas repetitivas en títulos (heading1/2/3). Solo asigna títulos a divisiones legítimas del libro según la Tabla de Contenidos.
5. 🧮 FÓRMULAS Y TABLAS:
   - Fórmulas matemáticas en notación LaTeX ($...$, $$...$$).
   - Tablas completas en 'tableData' con headers y rows.
6. 📖 PRESERVACIÓN EDITORIAL DE NOVELAS Y TEXTOS LARGOS:
   - "poem_verse": Si hay un poema, estrofa o conjunto de versos dentro de la novela o texto, clasifícalo como 'poem_verse'. Mantén los saltos de verso exactos.
   - "epigraph": Dedicatorias, epígrafes al inicio de capítulos o citas literarias con autor.
   - "novel_dialogue": Diálogos novelísticos que inician con raya (— o -).
   - "epistolary_letter": Cartas o correspondencia insertada en medio de la narración.
   - "blockquote": Citas textuales extensas en bloque indentado.
   - "ornamental_break": Separadores de descanso de escena (* * *, ***, ❦, — • —).
   - "author_footnote": Notas aclaratorias al pie del autor.
7. ⚖️ UNIFORMIDAD TRANSVERSAL ESTRICTA:
   - Mantén estrictamente uniforme la jerarquía en todo el libro.
   - Los capítulos principales SIEMPRE son 'heading1'. Los subtemas internos son 'heading2'.
   - No clasifiques párrafos largos como encabezados.

CATÁLOGO DE BLOQUES (type):
- "heading1" (Capítulo / Unidad Mayor)
- "heading2" (Tema principal / Subcapítulo)
- "heading3" (Subtema)
- "heading4" (Apartado menor)
- "paragraph" (Párrafo narrativo ordinario)
- "novel_dialogue" (Diálogo con raya de personaje)
- "poem_verse" (Poema, estrofa o versos poéticos)
- "epigraph" (Epígrafe, dedicatoria o cita de apertura)
- "epistolary_letter" (Carta, misiva o telegrama dentro de la novela)
- "blockquote" (Cita textual en bloque)
- "ornamental_break" (Descanso de escena o separador * * *)
- "author_footnote" (Nota al pie del autor)
- "exercise" (Reactivo con opciones A-E o pregunta de evaluación)
- "table" (Tabla estructurada)
- "latex_math" (Ecuación matemática destacada)
- "theory_box" (Recuadro teórico o teorema)
- "important_note" (Nota clave, advertencia o consejo)
- "definition" (Definición formal)
- "bullet_list", "numbered_list", "figure_desc", "glossary_item"

MACRO-BLOQUE CRUDO:
"""
${macroBlockRawText}
"""
`;

  try {
    const response = await callGeminiWithResilience({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cleanContent: { type: Type.STRING, description: "Texto completo continuo purificado con fórmulas en LaTeX" },
            cleanMetadata: {
              type: Type.OBJECT,
              properties: {
                runningHeadersRemoved: { type: Type.ARRAY, items: { type: Type.STRING } },
                pageNumbersRemoved: { type: Type.ARRAY, items: { type: Type.NUMBER } },
                latexFormulasFound: { type: Type.NUMBER },
                figuresDescribed: { type: Type.NUMBER },
                tablesDetected: { type: Type.NUMBER },
                noiseLinesRemoved: { type: Type.NUMBER },
                notes: { type: Type.STRING },
                fidelityScore: { type: Type.NUMBER }
              }
            },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  type: {
                    type: Type.STRING,
                    enum: [
                      "heading1", "heading2", "heading3", "heading4",
                      "paragraph", "novel_dialogue", "poem_verse", "epigraph", "epistolary_letter", "blockquote", "ornamental_break", "author_footnote",
                      "theory_box", "important_note", "definition", "curiosity",
                      "exercise", "table", "latex_math", "figure_desc", "bullet_list", "numbered_list", "glossary_item"
                    ]
                  },
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        letter: { type: Type.STRING },
                        text: { type: Type.STRING },
                        isCorrect: { type: Type.BOOLEAN }
                      },
                      required: ["letter", "text"]
                    }
                  },
                  solution: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  tableData: {
                    type: Type.OBJECT,
                    properties: {
                      headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                      rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                      caption: { type: Type.STRING }
                    }
                  },
                  latex: { type: Type.STRING },
                  figureCaption: { type: Type.STRING },
                  customStyleName: { type: Type.STRING }
                },
                required: ["type", "content"]
              }
            }
          },
          required: ["cleanContent", "blocks"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    const blocks: ContentBlock[] = (parsed.blocks || []).map((b: any, i: number) => ({
      ...b,
      id: b.id || `blk_${Date.now()}_${i}`,
      isApproved: true
    }));

    return {
      cleanContent: parsed.cleanContent || macroBlockRawText,
      cleanMetadata: {
        runningHeadersRemoved: parsed.cleanMetadata?.runningHeadersRemoved || [],
        pageNumbersRemoved: parsed.cleanMetadata?.pageNumbersRemoved || [],
        latexFormulasFound: parsed.cleanMetadata?.latexFormulasFound || 0,
        figuresDescribed: parsed.cleanMetadata?.figuresDescribed || 0,
        tablesDetected: parsed.cleanMetadata?.tablesDetected || 0,
        noiseLinesRemoved: parsed.cleanMetadata?.noiseLinesRemoved || 0,
        notes: parsed.cleanMetadata?.notes || 'Procesado por Macro-Bloque Inteligente',
        fidelityScore: parsed.cleanMetadata?.fidelityScore || 99
      },
      blocks
    };
  } catch (err) {
    console.error("Error en macro-bloque:", err);
    // Fallback básico
    return {
      cleanContent: macroBlockRawText,
      cleanMetadata: { notes: 'Procesado en fallback', fidelityScore: 90 },
      blocks: [{
        id: `blk_fb_${Date.now()}`,
        type: 'paragraph',
        content: macroBlockRawText,
        isApproved: false
      }]
    };
  }
}

// ----------------------------------------------------
// 3. MOTOR DE PURIFICACIÓN Y LIMPIEZA INDIVIDUAL (COMPATIBILIDAD)
// ----------------------------------------------------

export interface CleanChunkResult {
  cleanContent: string;
  metadata: CleanMetadata;
}

export async function cleanAndPurifyChunk(
  rawText: string,
  bookContext: { title: string; subject: string; author?: string; styleGuide?: any },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<CleanChunkResult> {
  const prompt = `
Eres el MOTOR DE PURIFICACIÓN EDITORIAL Y TRANSCRIPCIÓN DE ALTA FIDELIDAD.
Tu misión fundamental es TRANSCRIPCIÓN FIEL: depurar el texto de artefactos mecánicos de escaneo/OCR y maquetación editorial SIN ALTERAR NI UNA SOLA PALABRA DEL CONTENIDO ORIGINAL Y PRESERVANDO SU ESTRUCTURA EN PÁRRAFOS Y DIÁLOGOS.

CONTEXTO DEL LIBRO:
- Título: ${bookContext.title || 'No especificado'}
- Disciplina / Asignatura: ${bookContext.subject || 'General'}
- Autor / Fuente: ${bookContext.author || 'No especificado'}

⚠️ REGLA DE ORO DE FIDELIDAD (MANDATORIO):
- ¡ERES UN TRANSCRIPTOR, NO UN MODIFICADOR NI REDACTOR!
- PROHIBIDO REESCRIBIR, PARAFRASEAR, RESUMIR O "EMBELLECER" EL TEXTO.
- Conserva intacto todo el vocabulario técnico, giros del autor, ejemplos, problemas, preguntas y opciones originales.

🚫 PROHIBIDO PEGAR TODO EN UN SOLO BLOQUE CONTINUO:
- ¡NO APLANES NI AMALGAMES EL TEXTO EN UN SOLO PÁRRAFO!
- DEBES CONSERVAR LOS SALTOS DE PÁRRAFO (\n\n) entre párrafos distintos, entre turnos de diálogo y entre preguntas.
- Cada pregunta numerada (ej. "19. ¿...?", "20. ¿...?", "1. ¿...?") o turno de entrevista ("Entrevistador:", "Candidato:") DEBE ESTAR OBLIGATORIAMENTE EN SU PROPIA LÍNEA O PÁRRAFO SEPARADO. ¡Jamás pegues una pregunta con la anterior!
- Solo debes unir las líneas que se hayan cortado mecánicamente a mitad de una misma frase por el límite del margen impreso.

🚫 DETECCIÓN Y ELIMINACIÓN RIGUROSA DE CORNISAS / RUNNING HEADERS:
- ELIMINA la cornisa o encabezado repetitivo de borde de página (ej: "ENTREVISTA PERSONAL", nombre de editorial/autor repetido arriba).
- ELIMINA números de página o folios sueltos (ej: "Pág. 45", "142", "- 12 -").

CONVERSIONES:
1. PALABRAS CORTADAS CON GUION: "cons- trucción" -> "construcción".
2. ÁLGEBRA Y MATEMÁTICAS EN LATEX: $f(x) = ax^2 + bx + c$, $$\\int_{a}^{b} f(x) dx$$.
3. TABLAS ESTRUCTURADAS: A Markdown (| Encabezado 1 | Encabezado 2 |).
4. REACTIVOS: Mantén íntegros los enunciados y alternativas (A, B, C, D, E...).

TEXTO CRUDO A PURIFICAR:
"""
${rawText}
"""
`;

  const response = await callGeminiWithResilience({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cleanContent: {
            type: Type.STRING,
            description: "El texto completo purificado, continuo, con fórmulas LaTeX y sin ruido de página."
          },
          metadata: {
            type: Type.OBJECT,
            properties: {
              runningHeadersRemoved: { type: Type.ARRAY, items: { type: Type.STRING } },
              pageNumbersRemoved: { type: Type.ARRAY, items: { type: Type.NUMBER } },
              latexFormulasFound: { type: Type.NUMBER },
              figuresDescribed: { type: Type.NUMBER },
              tablesDetected: { type: Type.NUMBER },
              noiseLinesRemoved: { type: Type.NUMBER },
              notes: { type: Type.STRING },
              wordsPreservedCount: { type: Type.NUMBER },
              fidelityScore: { type: Type.NUMBER }
            }
          }
        },
        required: ["cleanContent", "metadata"]
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text.trim());
    return {
      cleanContent: parsed.cleanContent || rawText,
      metadata: {
        ...parsed.metadata,
        fidelityScore: parsed.metadata?.fidelityScore || 98
      }
    };
  } catch (e) {
    return {
      cleanContent: response.text || rawText,
      metadata: { notes: "Procesado con transcripción directa", fidelityScore: 95 }
    };
  }
}

// ----------------------------------------------------
// 4. MOTOR DE ESTILO Y TIPIFICACIÓN INDIVIDUAL (COMPATIBILIDAD)
// ----------------------------------------------------

export interface EditorialMemory {
  lastHeading1?: string;
  lastHeading2?: string;
  lastHeading3?: string;
  lastExerciseNumber?: number;
  ongoingContext?: string;
  totalPages?: number;
  currentBatchIndex?: number;
}

export async function analyzeAndStyleChunk(
  cleanText: string,
  bookContext: { title: string; subject: string; educationLevel?: string; styleGuide?: any; editorialMemory?: EditorialMemory },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<ContentBlock[]> {
  const memoryInfo = bookContext.editorialMemory ? `
MEMORIA Y CONTINUIDAD GLOBAL DEL LIBRO:
- Último Capítulo/Unidad activo: "${bookContext.editorialMemory.lastHeading1 || 'Inicio del libro'}"
- Último Tema/Subtema activo: "${bookContext.editorialMemory.lastHeading2 || bookContext.editorialMemory.lastHeading3 || 'N/A'}"
- Último Reactivo numerado: #${bookContext.editorialMemory.lastExerciseNumber || '0'}
` : '';

  const prompt = `
Eres el MOTOR DE TIPIFICACIÓN SEMÁNTICA Y ESTILOS EDITORIALES NO GENÉRICOS.
Tu misión es estructurar este texto fielmente transcrito en bloques semánticos con tipos específicos para maquetar en Word y Google Docs, garantizando CERO PÉRDIDA y MÁXIMA ESTRUCTURA.

CONTEXTO:
- Título: ${bookContext.title} | Asignatura: ${bookContext.subject}
${memoryInfo}

🚨 REGLAS CRÍTICAS DE TIPIFICACIÓN:
1. 🚫 CERO AMALGAMACIÓN: Cada pregunta numerada (ej. "19. ¿...?", "20. ¿...?") DEBE SER SU PROPIO BLOQUE (tipo 'exercise' o 'paragraph'). ¡Jamás agrupes varias preguntas en un solo bloque!
2. 🎯 REACTIVOS CON OPCIONES: Si una pregunta tiene alternativas A), B), C), D), tipifícala como 'exercise' y coloca las alternativas en 'options'.
3. 💬 DIÁLOGOS Y ENTREVISTAS: Cada turno ("Entrevistador:", "Candidato:") debe ser un bloque 'paragraph' independiente.
4. 🚫 NO CONVIERTAS CORNISAS EN TÍTULOS: Ignora encabezados repetitivos de página. Solo crea 'heading1', 'heading2', 'heading3' para divisiones temáticas reales.

CATÁLOGO DE BLOQUES (type):
1. "heading1" (Capítulo mayor), 2. "heading2" (Tema), 3. "heading3", 4. "heading4"
5. "paragraph" (Párrafo narrativo)
6. "novel_dialogue" (Diálogo con raya de personaje —)
7. "poem_verse" (Poema, estrofa o versos poéticos)
8. "epigraph" (Epígrafe o dedicatoria)
9. "epistolary_letter" (Carta o correspondencia)
10. "blockquote" (Cita textual en bloque)
11. "ornamental_break" (Descanso de escena * * *)
12. "author_footnote" (Nota al pie del autor)
13. "theory_box", 14. "important_note", 15. "definition", 16. "curiosity"
17. "exercise" (con options: [{ letter, text, isCorrect }], solution, explanation)
18. "table" (con tableData: { headers, rows, caption })
19. "latex_math", 20. "figure_desc", 21. "bullet_list", 22. "numbered_list", 23. "glossary_item"

TEXTO PURIFICADO:
"""
${cleanText}
"""
`;

  const response = await callGeminiWithResilience({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            type: { 
              type: Type.STRING,
              enum: [
                "heading1", "heading2", "heading3", "heading4",
                "paragraph", "novel_dialogue", "poem_verse", "epigraph", "epistolary_letter", "blockquote", "ornamental_break", "author_footnote",
                "theory_box", "important_note", "definition", "curiosity",
                "exercise", "table", "latex_math", "figure_desc", "bullet_list", "numbered_list", "glossary_item"
              ]
            },
            title: { type: Type.STRING },
            content: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  letter: { type: Type.STRING },
                  text: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN }
                },
                required: ["letter", "text"]
              }
            },
            solution: { type: Type.STRING },
            explanation: { type: Type.STRING },
            tableData: {
              type: Type.OBJECT,
              properties: {
                headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                caption: { type: Type.STRING }
              }
            },
            latex: { type: Type.STRING }
          },
          required: ["type", "content"]
        }
      }
    }
  });

  try {
    const rawBlocks = JSON.parse(response.text.trim());
    if (Array.isArray(rawBlocks)) {
      return rawBlocks.map((b: any, index: number) => ({
        ...b,
        id: b.id || `blk_${Date.now()}_${index}`,
        isApproved: true
      }));
    }
    return [];
  } catch (e) {
    return [{
      id: `blk_${Date.now()}_0`,
      type: 'paragraph',
      content: cleanText,
      isApproved: false
    }];
  }
}

export async function purifyAndStyleInOneStep(
  rawText: string,
  bookContext: { title: string; subject: string; educationLevel?: string; author?: string; styleGuide?: any; editorialMemory?: EditorialMemory },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<{ cleanContent: string; cleanMetadata: CleanMetadata; blocks: ContentBlock[] }> {
  return processMacroBlockPurifyAndStyle(rawText, bookContext, modelName);
}

// ----------------------------------------------------
// 5. ANÁLISIS DE TAXONOMÍA EDITORIAL PREVIA
// ----------------------------------------------------

export async function analyzeEditorialTaxonomy(
  contentSamples: string[],
  bookMetadata: BookMetadata,
  modelName: string = "gemini-3.1-flash-lite"
): Promise<EditorialStyleGuide> {
  const sample = contentSamples.slice(0, 5).join("\n\n--- SIGUIENTE PÁGINA ---\n\n").substring(0, 9000);

  const prompt = `
Eres un JEFE EDITORIAL DE MAQUETACIÓN Y ARQUITECTURA DE CONTENIDO.
Analiza esta muestra del libro "${bookMetadata.title}" (${bookMetadata.subject}) y construye la TAXONOMÍA EDITORIAL Y GUÍA DE ESTILOS.

MUESTRA DEL LIBRO:
"""
${sample}
"""

Devuelve en JSON estricto.
`;

  const response = await callGeminiWithResilience({
    model: modelName,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          taxonomyName: { type: Type.STRING },
          detectedStructure: { type: Type.STRING },
          hasExercisesWithOptions: { type: Type.BOOLEAN },
          hasTheoryBoxes: { type: Type.BOOLEAN },
          hasLatexMath: { type: Type.BOOLEAN },
          hasTables: { type: Type.BOOLEAN },
          headingLevelsDetected: { type: Type.ARRAY, items: { type: Type.STRING } },
          editorialRules: { type: Type.ARRAY, items: { type: Type.STRING } },
          hierarchy: {
            type: Type.OBJECT,
            properties: {
              heading1: { type: Type.STRING },
              heading2: { type: Type.STRING },
              heading3: { type: Type.STRING },
              exercises: { type: Type.STRING },
              boxes: { type: Type.STRING },
              tables: { type: Type.STRING }
            }
          }
        },
        required: ["taxonomyName", "detectedStructure", "hasExercisesWithOptions", "hasTheoryBoxes", "hasLatexMath", "hasTables", "editorialRules"]
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text.trim());
    return {
      taxonomyName: parsed.taxonomyName || 'Taxonomía Editorial Académica',
      detectedStructure: parsed.detectedStructure || 'Estructura con teoría y reactivos',
      hasExercisesWithOptions: Boolean(parsed.hasExercisesWithOptions),
      hasTheoryBoxes: Boolean(parsed.hasTheoryBoxes),
      hasLatexMath: Boolean(parsed.hasLatexMath),
      hasTables: Boolean(parsed.hasTables),
      headingLevelsDetected: parsed.headingLevelsDetected || ['Capítulo', 'Sección'],
      editorialRules: parsed.editorialRules || ['Preservar notación LaTeX estricta', 'No modificar vocabulario del autor'],
      hierarchy: parsed.hierarchy || {
        heading1: 'Capítulo / Unidad',
        heading2: 'Tema principal',
        heading3: 'Subtema',
        exercises: 'Reactivos con opciones',
        boxes: 'Cajas de teoría',
        tables: 'Tablas de datos'
      }
    };
  } catch (e) {
    return {
      taxonomyName: 'Taxonomía Editorial Académica Estándar',
      detectedStructure: 'Estructura académica estándar con teoría y ejercicios',
      hasExercisesWithOptions: true,
      hasTheoryBoxes: true,
      hasLatexMath: true,
      hasTables: true,
      headingLevelsDetected: ['Capítulo', 'Sección', 'Subsección'],
      editorialRules: ['Preservar notación LaTeX', 'No mutar palabras del autor', 'Identificar alternativas de evaluación'],
      hierarchy: {
        heading1: 'CAPÍTULO / UNIDAD',
        heading2: '1.1 TEMA',
        heading3: 'Subtema',
        exercises: 'Ejercicios con alternativas A) B) C) D)',
        boxes: 'Cajas de teoría y notas',
        tables: 'Tablas estructuradas'
      }
    };
  }
}

// ----------------------------------------------------
// 6. MOTOR DE OCR POR VISIÓN (IMÁGENES / PDF ESCANEADO)
// ----------------------------------------------------

export interface OcrTranscriptionResult {
  transcribedText: string;
  detectedTitle?: string;
  detectedPageNumber?: number;
  latexCount: number;
  tablesCount: number;
  figuresCount: number;
  exercisesCount: number;
  notes?: string;
}

export async function ocrTranscribeImagePage(
  imageDataUrl: string,
  pageNumber?: number,
  bookContext?: { title?: string; subject?: string },
  modelName: string = "gemini-3.8-flash"
): Promise<OcrTranscriptionResult> {
  const base64Data = imageDataUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const mimeMatch = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  const promptText = `
Eres un MOTOR DE OCR EDITORIAL Y TRANSCRIPCIÓN DE ALTA PRECISIÓN ESPECIALIZADO EN LIBROS EDUCATIVOS, CIENTÍFICOS Y ACADÉMICOS.
Transcribe COMPLETA, FIEL Y EXACTAMENTE todo el contenido visible en esta imagen escaneada de la página ${pageNumber || ''}.

REGLAS:
1. Conserva párrafos (\\n\\n) y turnos de diálogo.
2. ATENCIÓN CRÍTICA A LETRAS CAPITULARES (DROP CAPS): Si la primera letra de un capítulo, sección o página es una letra capitular grande o artística (ej: 'A' seguida de 'LS Gregor Samsa', 'U' seguida de 'NA mañana', 'E' seguida de 'N un lugar'), DEBES FUSIONARLA INMEDIATAMENTE en la primera palabra completa ('Als Gregor Samsa...', 'Una mañana...', 'En un lugar...'). NUNCA omitas la letra capitular inicial ni la dejes como un dibujo o carácter huérfano.
3. OMITE la cornisa repetitiva del margen superior y números de página aislados.
4. Fórmulas en LaTeX ($...$, $$...$$).
5. Tablas en Markdown.
6. Figuras: [FIGURA: ...]
7. Preguntas con alternativas A, B, C, D...

Devuelve en JSON estructurado.
`;

  const response = await callGeminiWithResilience({
    model: modelName,
    contents: { 
      parts: [
        { inlineData: { data: base64Data, mimeType } },
        { text: promptText }
      ] 
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcribedText: { type: Type.STRING },
          detectedTitle: { type: Type.STRING },
          detectedPageNumber: { type: Type.NUMBER },
          latexCount: { type: Type.NUMBER },
          tablesCount: { type: Type.NUMBER },
          figuresCount: { type: Type.NUMBER },
          exercisesCount: { type: Type.NUMBER },
          notes: { type: Type.STRING }
        },
        required: ["transcribedText"]
      }
    }
  });

  try {
    const parsed = JSON.parse(response.text.trim());
    return {
      transcribedText: parsed.transcribedText || '',
      detectedTitle: parsed.detectedTitle,
      detectedPageNumber: parsed.detectedPageNumber || pageNumber,
      latexCount: parsed.latexCount || 0,
      tablesCount: parsed.tablesCount || 0,
      figuresCount: parsed.figuresCount || 0,
      exercisesCount: parsed.exercisesCount || 0,
      notes: parsed.notes
    };
  } catch (e) {
    return {
      transcribedText: response.text || '',
      latexCount: 0,
      tablesCount: 0,
      figuresCount: 0,
      exercisesCount: 0,
      notes: 'Transcripción directa en modo texto'
    };
  }
}

// ----------------------------------------------------
// 7. AUTO-DETECCIÓN DE METADATOS DEL LIBRO
// ----------------------------------------------------

export async function extractBookMetadataFromContent(
  contentSamples: string[],
  modelName: string = "gemini-3.1-flash-lite"
): Promise<Partial<BookMetadata>> {
  const combinedSample = contentSamples.slice(0, 4).join("\n\n--- SIGUIENTE FRAGMENTO / PÁGINA ---\n\n").substring(0, 8000);

  // Detección heurística de respaldo inmediata
  let fallbackTitle = '';
  let fallbackAuthor = '';
  const lines = combinedSample.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i];
    if (!fallbackAuthor && /^(?:por|by|von)\s+([A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+(?:\s+[A-ZÁÉÍÓÚÑÄÖÜ][a-záéíóúñäöüß]+){1,3})/i.test(l)) {
      fallbackAuthor = l.replace(/^(?:por|by|von)\s+/i, '').trim();
    }
    if (!fallbackTitle && /^[A-ZÁÉÍÓÚÑÄÖÜ\s]{3,40}$/.test(l) && !/^(?:CAP[IÍ]TULO|CHAPTER|KAPITEL|CHAPITRE|PREFACIO|PREFACE|PROLOGUE|PR[OÓ]LOGO)\b/i.test(l)) {
      fallbackTitle = l;
    }
  }

  const prompt = `
Eres un ANALISTA EDITORIAL Y CATALOGADOR BIBLIOGRÁFICO DE LIBROS.
A continuación tienes las primeras páginas o fragmentos de un documento / libro digitalizado o escaneado.
Tu misión es deducir los METADATOS EDITORIALES de la obra.

MUESTRA DE TEXTO:
"""
${combinedSample}
"""

Devuelve en JSON estricto.
`;

  try {
    const response = await callGeminiWithResilience({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subject: { type: Type.STRING },
            author: { type: Type.STRING },
            educationLevel: { type: Type.STRING },
            publisherOrSource: { type: Type.STRING },
            editorialNotes: { type: Type.STRING }
          },
          required: ["title", "subject"]
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    return {
      title: parsed.title || fallbackTitle,
      author: parsed.author || fallbackAuthor,
      subject: parsed.subject || 'Literatura Clásica / Humanidades',
      educationLevel: parsed.educationLevel || 'General',
      publisherOrSource: parsed.publisherOrSource || '',
      editorialNotes: parsed.editorialNotes || 'Metadatos detectados automáticamente tras la ingesta.'
    };
  } catch (e) {
    console.warn("Fallo o no configurada IA para metadatos, usando heurística local:", e);
    return {
      title: fallbackTitle || undefined,
      author: fallbackAuthor || undefined,
      subject: 'Literatura Clásica / Narrativa',
      editorialNotes: 'Metadatos determinados automáticamente por análisis estructural.'
    };
  }
}

// ----------------------------------------------------
// 8. AUDITORÍA EDITORIAL POR IA Y CORRECCIÓN ASISTIDA
// ----------------------------------------------------

export async function auditDocumentWithAI(
  blocks: ContentBlock[],
  bookContext: { title: string; subject: string; toc?: BookTocEntry[] },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<AuditIssue[]> {
  if (blocks.length === 0) return [];

  // Muestra estructurada de los bloques para auditar
  const blocksSummary = blocks.map((b, i) => `[ID: ${b.id} | Tipo: ${b.type}] ${b.title ? `Título: "${b.title}" | ` : ''}Contenido: ${b.content.substring(0, 180)}`).join('\n\n').substring(0, 15000);

  const prompt = `
Eres un AUDITOR EDITORIAL SENIOR Y CONTROLADOR DE CALIDAD DE LIBROS DIGITALIZADOS.
Examina los bloques estructurados del libro "${bookContext.title}" (${bookContext.subject}) y detecta posibles defectos o mejoras pendientes:

DEFECTOS A IDENTIFICAR:
1. "merged_questions": Párrafos donde haya múltiples preguntas numeradas pegadas en el mismo bloque (ej: "19. ¿...? 20. ¿...?").
2. "unformatted_table": Bloques que contienen tablas o datos tabulados pero no tienen 'tableData' estructurado.
3. "missing_options": Preguntas de opción múltiple con alternativas A, B, C, D mezcladas en el texto en vez de en el arreglo 'options'.
4. "unlinked_header": Títulos que en realidad son cornisas repetitivas o encabezados fuera de lugar.
5. "general": Errores de tipificación o saltos de línea rotos.

MUESTRA DE BLOQUES:
"""
${blocksSummary}
"""

Devuelve un arreglo JSON de incidencias encontradas.
`;

  try {
    const response = await callGeminiWithResilience({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: {
                type: Type.STRING,
                enum: ["merged_questions", "unformatted_table", "missing_options", "unlinked_header", "general"]
              },
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              targetChunkId: { type: Type.STRING },
              suggestedFix: { type: Type.STRING },
              severity: { type: Type.STRING, enum: ["high", "medium", "low"] }
            },
            required: ["type", "title", "description", "suggestedFix", "severity"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    if (Array.isArray(parsed)) {
      return parsed.map((item: any, idx: number) => ({
        id: item.id || `issue_${Date.now()}_${idx}`,
        type: item.type || 'general',
        title: item.title || 'Observación editorial',
        description: item.description || '',
        targetChunkId: item.targetChunkId,
        suggestedFix: item.suggestedFix || 'Revisar formato',
        severity: item.severity || 'medium'
      }));
    }
  } catch (e) {
    console.warn("Error durante auditoría IA:", e);
  }

  // Auditoría heurística de respaldo
  const heuristicIssues: AuditIssue[] = [];
  blocks.forEach((b, idx) => {
    if (b.type === 'paragraph' && /(\d{1,3}\.\s+[A-ZÁÉÍÓÚÑ¿¡].*?){2,}/s.test(b.content)) {
      heuristicIssues.push({
        id: `heur_${idx}`,
        type: 'merged_questions',
        title: `Múltiples preguntas pegadas en el bloque #${idx + 1}`,
        description: `El párrafo contiene varias preguntas numeradas juntas sin separar.`,
        suggestedFix: 'Separar cada pregunta en su propio bloque o reactivo independiente.',
        severity: 'high'
      });
    }
    if ((b.type === 'paragraph' || b.type === 'theory_box') && b.content.includes('|') && b.content.split('\n').filter(l => l.includes('|')).length >= 2) {
      heuristicIssues.push({
        id: `heur_tbl_${idx}`,
        type: 'unformatted_table',
        title: `Tabla detectada en texto plano en bloque #${idx + 1}`,
        description: `El bloque contiene estructura de tabla Markdown pero no está tipificado como tipo 'table'.`,
        suggestedFix: 'Convertir a bloque de tabla estructurada con celdas.',
        severity: 'medium'
      });
    }
  });

  return heuristicIssues;
}

export async function applyGlobalAiCorrection(
  blocks: ContentBlock[],
  instruction: string,
  bookContext: { title: string; subject: string; toc?: BookTocEntry[] },
  modelName: string = "gemini-3.1-flash-lite"
): Promise<ContentBlock[]> {
  if (blocks.length === 0) return [];

  const rawBlocksJson = JSON.stringify(blocks.slice(0, 50), null, 2).substring(0, 16000);

  const prompt = `
Eres un EDITOR JEFE Y MAQUETADOR DE PRODUCCIÓN EDITORIAL DE LIBROS.
Aplica con máxima precisión la siguiente INSTRUCCIÓN DE CORRECCIÓN en este conjunto de bloques del libro "${bookContext.title}":

🎯 INSTRUCCIÓN DE CORRECCIÓN:
"${instruction}"

REGLAS FUNDAMENTALES:
1. Si la instrucción pide separar preguntas o reactivos: divide los párrafos amalgados en bloques individuales (tipo 'exercise' o 'paragraph').
2. Si la instrucción pide estructurar tablas: convierte el texto tabular a tipo 'table' con 'tableData' ({ headers: [...], rows: [[...], [...]] }).
3. Si la instrucción pide reconocer alternativas de examen: separa el enunciado en 'content' y las opciones en 'options' ({ letter: "A", text: "..." }).
4. Conserva el 100% del texto y fórmulas LaTeX ($...$). No inventes ni cortes contenido.

BLOQUES ORIGINALES:
${rawBlocksJson}

Devuelve la lista COMPLETA de bloques corregidos en JSON:
`;

  try {
    const response = await callGeminiWithResilience({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: {
                type: Type.STRING,
                enum: [
                  "heading1", "heading2", "heading3", "heading4",
                  "paragraph", "theory_box", "important_note", "definition", "curiosity",
                  "exercise", "table", "latex_math", "figure_desc", "bullet_list", "numbered_list", "glossary_item"
                ]
              },
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              options: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    letter: { type: Type.STRING },
                    text: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN }
                  },
                  required: ["letter", "text"]
                }
              },
              solution: { type: Type.STRING },
              explanation: { type: Type.STRING },
              tableData: {
                type: Type.OBJECT,
                properties: {
                  headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                  rows: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.STRING } } },
                  caption: { type: Type.STRING }
                }
              },
              latex: { type: Type.STRING },
              figureCaption: { type: Type.STRING }
            },
            required: ["type", "content"]
          }
        }
      }
    });

    const parsed = JSON.parse(response.text.trim());
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((b: any, idx: number) => ({
        ...b,
        id: b.id || `blk_corr_${Date.now()}_${idx}`,
        content: splitMergedNumberedQuestionsAndDialogues(b.content || ''),
        isApproved: true
      }));
    }
  } catch (err) {
    console.error("Error aplicando corrección con IA:", err);
  }

  return blocks;
}

/**
 * Traduce un prefacio, prólogo o estudio preliminar literario al idioma destino
 * preservando la riqueza crítica, nombres propios y división exacta de párrafos.
 */
export async function translateLiteraryPreface(
  prefaceText: string,
  targetLanguage: string = 'español',
  model: string = 'gemini-3.1-flash-lite'
): Promise<string> {
  if (!prefaceText || !prefaceText.trim()) return '';

  const prompt = `Eres un traductor y curador editorial literario de alto nivel.
Traduce el siguiente prefacio, prólogo o estudio introductorio al idioma ${targetLanguage}.
Directrices editoriales estrictas:
1. Mantén la elegancia, tono erudito y fidelidad filológica del original.
2. Preserva estrictamente los nombres propios, citas y fechas.
3. Conserva exactamente la misma estructura de párrafos: cada párrafo debe estar separado por un doble salto de línea (\\n\\n).
4. No añadas notas del traductor ni comentarios explicativos; entrega directamente el texto traducido.

Texto a traducir:
"""
${prefaceText}
"""`;

  try {
    const response = await callGeminiWithResilience({
      model,
      contents: prompt,
      config: {
        temperature: 0.2,
      }
    });

    const translated = response.text ? response.text.trim() : '';
    return translated || prefaceText;
  } catch (err) {
    console.error('Error traduciendo prefacio con Gemini:', err);
    throw err;
  }
}

/**
 * Investiga y recupera el Índice de Contenido canónico de una obra literaria
 * para estructurar fielmente sus capítulos y secciones preliminares/posteriores.
 */
export async function queryCanonicalTableOfContentsOnline(
  title: string,
  author?: string,
  language: string = 'español',
  model: string = 'auto-cascade'
): Promise<{
  hasIndex: boolean;
  chapters: { index: number; label: string; title: string }[];
  preliminaries: string[];
  backMatter: string[];
  summaryNote: string;
}> {
  if (!title || !title.trim()) {
    return { hasIndex: false, chapters: [], preliminaries: [], backMatter: [], summaryNote: 'Sin título para consultar.' };
  }

  const prompt = `Actúa como bibliógrafo erudito y curador literario.
Investiga y proporciona la estructura canónica del ÍNDICE DE CONTENIDO de la siguiente obra:
- TÍTULO: "${title}"
- AUTOR: "${author || 'Desconocido'}"
- IDIOMA DESEADO: "${language}"

Devuelve un JSON estrictamente estructurado con:
1. "chapters": Arreglo de los capítulos o partes auténticos de la obra con su número, etiqueta (ej. "Capítulo 1", "Parte I") y título formal si lo tiene (o el mismo nombre si solo están numerados).
2. "preliminaries": Lista de títulos de secciones preliminares típicas (ej. "Prefacio", "Dedicatoria", "Prólogo").
3. "backMatter": Lista de títulos de secciones posteriores típicas (ej. "Epílogo", "Notas", "Colofón").
4. "summaryNote": Breve nota sobre la estructura de la edición canónica.`;

  try {
    const response = await callGeminiWithResilience({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            chapters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  index: { type: Type.INTEGER },
                  label: { type: Type.STRING },
                  title: { type: Type.STRING }
                },
                required: ["index", "label", "title"]
              }
            },
            preliminaries: { type: Type.ARRAY, items: { type: Type.STRING } },
            backMatter: { type: Type.ARRAY, items: { type: Type.STRING } },
            summaryNote: { type: Type.STRING }
          },
          required: ["chapters", "summaryNote"]
        }
      }
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    return {
      hasIndex: Array.isArray(parsed.chapters) && parsed.chapters.length > 0,
      chapters: parsed.chapters || [],
      preliminaries: parsed.preliminaries || [],
      backMatter: parsed.backMatter || [],
      summaryNote: parsed.summaryNote || 'Índice canónico obtenido.'
    };
  } catch (err: any) {
    console.warn('Fallo al consultar índice canónico online:', err);
    return {
      hasIndex: false,
      chapters: [],
      preliminaries: [],
      backMatter: [],
      summaryNote: 'No se pudo consultar el índice online en este momento.'
    };
  }
}
/**
 * Traducción literaria directa por bloques o capítulos con Gemini (Flash-Lite / Flash).
 * Conserva estrictamente los saltos de párrafo, formatos Markdown y marcas de diálogo con raya.
 */
export async function translateTextWithFastAi(
  text: string,
  fromLang: string,
  toLang: string,
  modelName: string = 'gemini-3.1-flash-lite'
): Promise<string> {
  if (!text || !text.trim()) return '';
  if (fromLang.toLowerCase() === toLang.toLowerCase()) return text;
  if (!hasValidGeminiApiKey()) {
    throw new Error('No hay clave de Gemini API configurada.');
  }

  const prompt = `Actúa como traductor literario y filólogo editorial profesional.
Traduce el siguiente texto completo de ${fromLang} a ${toLang}.

REGLAS DE TRADUCCIÓN OBLIGATORIAS:
1. Conserva estrictamente la división de párrafos (separados por doble salto de línea "\\n\\n").
2. Conserva íntegramente las marcas de diálogo con raya (— o -) y comillas literarias.
3. Conserva intactos los formatos Markdown (títulos, negritas, cursivas).
4. No resumas, no omitas contenido y no agregues notas introductorias ni comentarios de traducción.
5. Devuelve única y exclusivamente el texto traducido.

TEXTO A TRADUCIR:
"""
${text}
"""`;

  const response = await callGeminiWithResilience({
    model: modelName,
    contents: prompt,
    config: {
      temperature: 0.1
    }
  });

  return (response.text || '').trim();
}

export interface AiMirrorFragmentResult {
  textA: string;
  textB: string;
  contentEventSummary?: string;
}

/**
 * Segmenta y corta un bloque o par de texto bilingüe en fragmentos espejo homólogos por contenido
 * utilizando IA (Gemini) con rotación automática de modelos cuando se agota la cuota/tokens.
 * 
 * Regla de Oro:
 * Los cortes deben realizarse estrictamente por CONTENIDO (acontecimientos, acciones, diálogos y significado).
 * Los fragmentos resultantes jamás deben diferenciarse por un desbalance excesivo de texto ni dejar
 * acontecimientos en un lado que no estén reflejados en el otro.
 */
export async function segmentBilingualFragmentIntoMirrorPairsWithAI(
  textA: string,
  textB: string,
  languageA: string = 'español',
  languageB: string = 'inglés',
  model: string = 'auto-cascade',
  onModelRotated?: (from: string, to: string, reason: string) => void
): Promise<{
  success: boolean;
  fragments: AiMirrorFragmentResult[];
  modelUsed: string;
  error?: string;
}> {
  const cleanA = (textA || '').trim();
  const cleanB = (textB || '').trim();

  if (!cleanA || !cleanB) {
    return {
      success: false,
      fragments: cleanA ? [{ textA: cleanA, textB: cleanB }] : [],
      modelUsed: model,
      error: 'Uno de los textos está vacío.'
    };
  }

  // Si ambos lados son muy breves (< 200 caracteres), ya forman una unidad atómica
  if (cleanA.length < 200 && cleanB.length < 200) {
    return {
      success: true,
      fragments: [{ textA: cleanA, textB: cleanB, contentEventSummary: 'Unidad atómica breve' }],
      modelUsed: model
    };
  }

  const prompt = `Eres un editor literario filológico maestro, especializado en maquetación de libros bilingües enfrentados (edición espejo).
Tu misión es segmentar y cortar el siguiente texto en ${languageA} (Texto A) y su traducción en ${languageB} (Texto B) en FRAGMENTOS ESPEJO HOMÓLOGOS EXACTOS POR CONTENIDO.

DIRECTRICES EDITORIALES ESTRICTAS DE CORTE POR CONTENIDO (INVARIANTE DEL ESPEJO):
1. CORTE EXCLUSIVO POR CONTENIDO Y ACONTECIMIENTO:
   - Los cortes deben realizarse donde el significado, la acción narrativa o el diálogo concluyan coherentemente en ambos idiomas.
   - Si en el fragmento en ${languageA} ocurre un suceso ("Alicia mira el conejo"), el fragmento homólogo en ${languageB} DEBE terminar exactamente en ese mismo suceso ("Alice looks at the rabbit").
   - NUNCA dejes que un fragmento contenga acciones adicionales que en la otra cara del espejo queden desplazadas al siguiente fragmento.
2. BALANCE DE EXTENSIÓN Y PROPORCIÓN VISUAL:
   - Los fragmentos de cada par no deben diferenciarse por un exceso de texto. Si un párrafo es largo y denso, córtalo en 2 o más fragmentos espejo más breves (aprox. 250 a 500 caracteres por fragmento) para que la página izquierda y la derecha fluyan en perfecta sincronía.
   - Respeta siempre las fronteras oracionales completas o intervenciones de diálogo.
3. CONCORDANCIA OBLIGATORIA DE MICRO-CONTENIDO (INICIO Y CIERRE):
   - El micro-contenido de la frase inicial de "textA" en el primer fragmento DEBE corresponder semánticamente a la frase inicial de "textB". Si no inician con el mismo suceso, diálogo o planteamiento, NO fuerces una falsa correspondencia: separa la frase inicial asimétrica en un fragmento propio para no arrastrar un desfase destructivo.
   - Igualmente, la frase de cierre del último fragmento DEBE culminar en el mismo acontecimiento exacto en ambos idiomas.
4. CONSERVACIÓN TOTAL DEL TEXTO (CERO MUTILACIÓN):
   - Cada palabra de Texto A y cada palabra de Texto B debe estar presente en los fragmentos resultantes en el orden exacto original.
   - No agregues texto nuevo, ni resúmenes, ni omitas frases.

Texto A (${languageA}):
"""
${cleanA}
"""

Texto B (${languageB}):
"""
${cleanB}
"""

Responde ÚNICAMENTE con un objeto JSON válido con la siguiente estructura:
{
  "mirrorFragments": [
    {
      "textA": "Fragmento exacto en ${languageA}",
      "textB": "Fragmento homólogo exacto en ${languageB}",
      "contentEventSummary": "Breve nota del acontecimiento que comparten (ej: Inicio de travesía / Diálogo del capitán)"
    }
  ]
}`;

  let targetModel = model;
  const unsubscribe = typeof window !== 'undefined' ? (e: any) => {
    if (e.detail?.to) {
      targetModel = e.detail.to;
      if (onModelRotated) onModelRotated(e.detail.from, e.detail.to, e.detail.reason);
    }
  } : null;

  if (typeof window !== 'undefined' && unsubscribe) {
    window.addEventListener('sape-model-switched', unsubscribe);
  }

  try {
    const response = await callGeminiWithResilience({
      model: targetModel,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mirrorFragments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  textA: { type: Type.STRING },
                  textB: { type: Type.STRING },
                  contentEventSummary: { type: Type.STRING }
                },
                required: ["textA", "textB"]
              }
            }
          },
          required: ["mirrorFragments"]
        }
      }
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const fragments: AiMirrorFragmentResult[] = (parsed.mirrorFragments || [])
      .map((f: any) => ({
        textA: String(f.textA || '').trim(),
        textB: String(f.textB || '').trim(),
        contentEventSummary: f.contentEventSummary ? String(f.contentEventSummary).trim() : undefined
      }))
      .filter((f: any) => f.textA.length > 0 && f.textB.length > 0);

    if (fragments.length > 0) {
      return {
        success: true,
        fragments,
        modelUsed: targetModel
      };
    }

    return {
      success: false,
      fragments: [{ textA: cleanA, textB: cleanB }],
      modelUsed: targetModel,
      error: 'La respuesta de IA no devolvió fragmentos utilizables.'
    };
  } catch (err: any) {
    console.warn(`[Corte por Contenido IA] Error al segmentar con ${targetModel}:`, err?.message || err);
    return {
      success: false,
      fragments: [{ textA: cleanA, textB: cleanB }],
      modelUsed: targetModel,
      error: err?.message || 'Error durante la segmentación con IA.'
    };
  } finally {
    if (typeof window !== 'undefined' && unsubscribe) {
      window.removeEventListener('sape-model-switched', unsubscribe);
    }
  }
}


