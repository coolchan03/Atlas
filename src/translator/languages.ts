/** The languages the translator offers. `code` is the BCP-47 tag the phone's speech recognizer and voices use; `name` is what the AI is told. */
export interface TranslatorLanguage { code: string; name: string; native: string }

export const TRANSLATOR_LANGUAGES: TranslatorLanguage[] = [
  { code: 'en-US', name: 'English', native: 'English' },
  { code: 'es-ES', name: 'Spanish', native: 'Español' },
  { code: 'fr-FR', name: 'French', native: 'Français' },
  { code: 'de-DE', name: 'German', native: 'Deutsch' },
  { code: 'it-IT', name: 'Italian', native: 'Italiano' },
  { code: 'pt-BR', name: 'Portuguese', native: 'Português' },
  { code: 'nl-NL', name: 'Dutch', native: 'Nederlands' },
  { code: 'ru-RU', name: 'Russian', native: 'Русский' },
  { code: 'uk-UA', name: 'Ukrainian', native: 'Українська' },
  { code: 'pl-PL', name: 'Polish', native: 'Polski' },
  { code: 'cs-CZ', name: 'Czech', native: 'Čeština' },
  { code: 'ro-RO', name: 'Romanian', native: 'Română' },
  { code: 'hu-HU', name: 'Hungarian', native: 'Magyar' },
  { code: 'bg-BG', name: 'Bulgarian', native: 'Български' },
  { code: 'hr-HR', name: 'Croatian', native: 'Hrvatski' },
  { code: 'sv-SE', name: 'Swedish', native: 'Svenska' },
  { code: 'nb-NO', name: 'Norwegian', native: 'Norsk' },
  { code: 'da-DK', name: 'Danish', native: 'Dansk' },
  { code: 'fi-FI', name: 'Finnish', native: 'Suomi' },
  { code: 'el-GR', name: 'Greek', native: 'Ελληνικά' },
  { code: 'tr-TR', name: 'Turkish', native: 'Türkçe' },
  { code: 'ar-SA', name: 'Arabic', native: 'العربية' },
  { code: 'he-IL', name: 'Hebrew', native: 'עברית' },
  { code: 'fa-IR', name: 'Persian', native: 'فارسی' },
  { code: 'ur-PK', name: 'Urdu', native: 'اردو' },
  { code: 'hi-IN', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn-BD', name: 'Bengali', native: 'বাংলা' },
  { code: 'ta-IN', name: 'Tamil', native: 'தமிழ்' },
  { code: 'th-TH', name: 'Thai', native: 'ไทย' },
  { code: 'vi-VN', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'id-ID', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms-MY', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'fil-PH', name: 'Filipino', native: 'Filipino' },
  { code: 'ja-JP', name: 'Japanese', native: '日本語' },
  { code: 'ko-KR', name: 'Korean', native: '한국어' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'sw-KE', name: 'Swahili', native: 'Kiswahili' },
];

/** The language for a code, or a stand-in that still carries the code so an unknown saved value never crashes a screen. */
export function languageFor(code: string): TranslatorLanguage {
  return TRANSLATOR_LANGUAGES.find((l) => l.code === code) ?? { code, name: code, native: code };
}

/** Languages whose name (English or native) contains the search text, in list order; all of them for an empty search. */
export function searchLanguages(query: string): TranslatorLanguage[] {
  const q = query.trim().toLocaleLowerCase();
  return q ? TRANSLATOR_LANGUAGES.filter((l) => l.name.toLocaleLowerCase().includes(q) || l.native.toLocaleLowerCase().includes(q)) : TRANSLATOR_LANGUAGES;
}
