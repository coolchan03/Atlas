/** Offline, editable 16:9 presentation templates shared by PPTX and PDF export. */
export type PresentationStyleId = 'minimal' | 'modern' | 'colorful' | 'dark' | 'academic' | 'editorial' | 'pastel' | 'ocean';
export type SlideLayout = 'title' | 'bullets' | 'closing' | 'section' | 'quote' | 'two_column' | 'timeline' | 'infographic' | 'emoji';
export interface PresentationSlide {
  layout: SlideLayout;
  title: string;
  subtitle: string;
  bullets: string[];
}
export interface PresentationTemplate {
  id: PresentationStyleId;
  name: string;
  description: string;
  background: string;
  foreground: string;
  secondary: string;
  accent: string;
  panel: string;
  font: string;
}
export const PRESENTATION_TEMPLATES: PresentationTemplate[] = [
  { id: 'minimal', name: 'Minimal', description: 'Clean and understated', background: 'FFFFFF', foreground: '111827', secondary: '475569', accent: '2563EB', panel: 'F1F5F9', font: 'Aptos' },
  { id: 'modern', name: 'Modern', description: 'Teal with structured sections', background: 'F3F9FA', foreground: '10333C', secondary: '42636B', accent: '008E89', panel: 'DCEFED', font: 'Aptos Display' },
  { id: 'colorful', name: 'Colorful', description: 'Playful violet and pastel', background: 'F7F3FF', foreground: '281548', secondary: '65578C', accent: '8351E2', panel: 'EEE0FF', font: 'Aptos' },
  { id: 'dark', name: 'Dark', description: 'High-contrast midnight', background: '101827', foreground: 'F8FAFC', secondary: 'CBD5E1', accent: '38BDF8', panel: '253247', font: 'Aptos' },
  { id: 'academic', name: 'Academic', description: 'Traditional research presentation', background: 'FFFCF5', foreground: '292524', secondary: '57534E', accent: '995D23', panel: 'F4EBDA', font: 'Georgia' },
  { id: 'editorial', name: 'Editorial', description: 'Warm print and strong contrast', background: 'F8F5EF', foreground: '292521', secondary: '75685A', accent: 'BA5537', panel: 'EDE5D9', font: 'Georgia' },
  { id: 'pastel', name: 'Pastel', description: 'Soft colors for approachable talks', background: 'F8F7FF', foreground: '32304B', secondary: '706C8D', accent: '9F7FD6', panel: 'EDE7F8', font: 'Aptos' },
  { id: 'ocean', name: 'Ocean', description: 'Blue-green data slides', background: '071A22', foreground: 'F2FAFD', secondary: 'B0D0D8', accent: '51D1CB', panel: '163340', font: 'Aptos' },
];
export const defaultPresentationSlides = (): PresentationSlide[] => [
  { layout: 'title', title: 'My Presentation', subtitle: 'Add a subtitle or presenter name', bullets: [] },
  { layout: 'bullets', title: 'Key Points', subtitle: 'Overview', bullets: ['First key point', 'Second key point', 'Third key point'] },
  { layout: 'closing', title: 'Thank You', subtitle: 'Questions?', bullets: [] },
];
export const cleanPresentationSlides = (slides: PresentationSlide[]): PresentationSlide[] =>
  slides.slice(0, 40).map(slide => ({
    layout: slide.layout,
    title: slide.title.trim().slice(0, 140),
    subtitle: slide.subtitle.trim().slice(0, 260),
    bullets: slide.bullets.slice(0, 10).map(b => b.trim().slice(0, 260)).filter(Boolean),
  }));
