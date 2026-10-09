import { openDB } from 'idb';

export interface Progress {
  slug: string;
  /** Playhead in seconds. */
  position: number;
  /** Indexes of beats the learner has passed. */
  beatsSeen: number[];
  completed: boolean;
  updatedAt: number;
}

const db = openDB('lesson-player', 1, {
  upgrade(d) { d.createObjectStore('progress', { keyPath: 'slug' }); },
});

export const getProgress = async (slug: string): Promise<Progress | undefined> => (await db).get('progress', slug);
export const allProgress = async (): Promise<Progress[]> => (await db).getAll('progress');
export const saveProgress = async (p: Progress) => { await (await db).put('progress', p); };
