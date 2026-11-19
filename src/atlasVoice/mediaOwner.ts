/**
 * Read Aloud and the music player share ONE phone notification (the media controls). Whichever started showing it last owns it: only the
 * owner's presses are acted on, and only the owner may take it down, so a reader that finishes cannot remove the music's controls and a
 * press meant for the music cannot pause the reader.
 */
export type MediaOwner = 'reader' | 'music';
let owner: MediaOwner | null = null;

export const claimMedia = (who: MediaOwner): void => { owner = who; };
export const ownsMedia = (who: MediaOwner): boolean => owner === who;
/** Lets go; returns true when `who` was the owner (so it should now take the notification down). */
export function releaseMedia(who: MediaOwner): boolean {
  if (owner !== who) return false;
  owner = null;
  return true;
}
