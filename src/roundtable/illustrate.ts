/**
 * Draws a scene for a roundtable turn with the shared picture drawing. The picture is a bonus: with no image model, or a
 * failure, nothing is drawn.
 */
import { canDraw, drawText } from '../services/drawScene';
import type { Ask, Session, Turn } from './engine';

export { canDraw };

export function illustrateScene(turn: Turn, session: Session, ask: Ask): Promise<string | null> {
  return drawText(turn.text, ask, { known: session.state });
}
