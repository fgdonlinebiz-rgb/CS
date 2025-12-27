
export type AppTab = 'production' | 'story' | 'export';

export interface HeroCharacter {
  id: string;
  name: string;
  images: string[];
  description: string;
  isAnalyzing: boolean;
}

export interface AnimationScene {
  id: string;
  sceneNumber: number;
  title: string;
  location: string;
  timeOfDay: string;
  visual: string;
  action: string;
  emotion: string;
  dialogue: string;
  cinematicNotes: string;
  image: string | null;
  videoUrl?: string | null;
  status: 'idle' | 'loading' | 'done' | 'error';
  videoStatus?: 'idle' | 'extending' | 'done' | 'error';
}

export interface SavedProject {
  id: string;
  name: string; // Title of the movie
  synopsis: string;
  date: string;
  hero: HeroCharacter;
  visualStyle: string;
  language: string;
  scenes: AnimationScene[];
}

export enum ImageModel {
  FLASH = 'gemini-3-flash-preview',
  PRO = 'gemini-3-pro-preview'
}
