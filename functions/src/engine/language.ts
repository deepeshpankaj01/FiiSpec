/**
 * Language identification for specification input.
 *
 * This only IDENTIFIES the language/script so the pipeline can decide whether
 * AI normalisation is required. It never translates: meaning normalisation is
 * done by the AI extraction step, and when AI is unavailable the pipeline
 * reports that normalisation was not possible instead of guessing.
 */
import type { LanguageInfo } from '../../../shared/analysis';

/**
 * High-frequency Hindi function words as written in Latin script. Used purely
 * as a script/language identification signal (like a stopword list), not as a
 * translation dictionary.
 */
const HINGLISH_MARKERS = new Set([
  'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'se', 'mein', 'mujhe', 'humein', 'hamein', 'liye', 'chahiye', 'banana',
  'karna', 'karni', 'wala', 'wali', 'waale', 'aur', 'kya', 'kaise', 'hona', 'hoga', 'hogi', 'jo', 'yeh', 'ye', 'woh',
  'nahi', 'lagana', 'kharidna', 'kharid', 'chaiye',
]);

export function detectLanguage(text: string): LanguageInfo {
  let devanagari = 0;
  let latin = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x0900 && code <= 0x097f) devanagari += 1;
    else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) latin += 1;
    else if (/\p{L}/u.test(char)) other += 1;
  }
  const letters = devanagari + latin + other;
  if (letters === 0) return { detected: 'other', script: 'OTHER', normalization: 'NOT_REQUIRED' };

  const devRatio = devanagari / letters;
  const latinRatio = latin / letters;

  if (devRatio > 0.6) return { detected: 'hi', script: 'DEVANAGARI', normalization: 'UNAVAILABLE' };
  if (devRatio > 0.1 && latinRatio > 0.1) return { detected: 'mixed', script: 'MIXED', normalization: 'UNAVAILABLE' };
  if (other / letters > 0.5) return { detected: 'other', script: 'OTHER', normalization: 'UNAVAILABLE' };

  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const markers = new Set(words.filter((w) => HINGLISH_MARKERS.has(w)));
  const markerRatio = words.length ? words.filter((w) => HINGLISH_MARKERS.has(w)).length / words.length : 0;
  if (markers.size >= 2 && markerRatio >= 0.08) {
    return { detected: 'hi-Latn', script: 'LATIN', normalization: 'UNAVAILABLE' };
  }
  return { detected: 'en', script: 'LATIN', normalization: 'NOT_REQUIRED' };
}

export function needsNormalization(info: LanguageInfo): boolean {
  return info.detected !== 'en';
}
