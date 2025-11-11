import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Language, Translations } from '@/types/language';
import { translations } from '@/lib/translations';

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'en', // Default to English
      setLanguage: (language: Language) => set({ language }),
    }),
    {
      name: 'language-storage',
    }
  )
);

// Hook for using translations
export const useTranslation = () => {
  const { language } = useLanguageStore();
  return (key: keyof Translations) => {
    return translations[language][key] || key;
  };
};
