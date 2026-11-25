// Splits a stream of generated text into "thinking" and answer text. llama.rn / llama-server do this
// natively; engines that return raw text (wllama, WebGPU runtimes) use this instead.
const OPEN = ['<think>', '<|channel>thought', '<|think|>', '<thinking>'];
const CLOSE = ['</think>', '<channel|>', '<|/think|>', '</thinking>'];

export interface Split { content: string; reasoning: string; thinking: boolean }

export function splitReasoning(text: string, startsInThinking = false): Split {
  let reasoning = '';
  let content = '';
  let i = 0;
  let thinking = startsInThinking;
  while (i < text.length) {
    const marks = (thinking ? CLOSE : OPEN)
      .map((m) => ({ m, at: text.indexOf(m, i) }))
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at);
    if (!marks.length) {
      // A partial tag at the very end is held back so it never flashes on screen.
      const tail = heldBack(text.slice(i), thinking ? CLOSE : OPEN);
      const piece = text.slice(i, text.length - tail);
      if (thinking) reasoning += piece; else content += piece;
      break;
    }
    const { m, at } = marks[0];
    const piece = text.slice(i, at);
    if (thinking) reasoning += piece; else content += piece;
    i = at + m.length;
    thinking = !thinking;
  }
  return { content: content.replace(/^\s+/, ''), reasoning: reasoning.replace(/^\s+/, ''), thinking };
}

function heldBack(rest: string, tags: string[]): number {
  let best = 0;
  for (const t of tags) for (let n = Math.min(t.length - 1, rest.length); n > best; n--) if (t.startsWith(rest.slice(rest.length - n))) { best = n; break; }
  return best;
}
