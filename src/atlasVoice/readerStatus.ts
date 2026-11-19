/** What the Read Aloud reader is doing. Its own file so the lock-screen controls can use the type without importing the reader (that made an import cycle). */
export type ReaderStatus = 'idle' | 'reading' | 'paused';
