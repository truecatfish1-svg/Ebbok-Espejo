export function safeParseJson<T>(jsonString: string | null | undefined, fallback: T): T {
  if (!jsonString) return fallback;
  try {
    const cleanJson = jsonString.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson) as T;
  } catch (e) {
    console.error("Failed to parse JSON:", e, "Raw string:", jsonString);
    return fallback;
  }
}
