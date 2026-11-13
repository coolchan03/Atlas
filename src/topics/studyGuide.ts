/**
 * A printable study guide from a course: every written square as a page section (lessons in full, quizzes with their answers and
 * reasons, flashcards as a table), so a course can be read on paper or sent to someone who does not use Atlas. Pure; the HTML opens
 * in any browser and prints cleanly.
 */
import type { SquareContent } from './formats';
import type { Course } from './store';

const esc = (s: unknown): string => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const list = (items: string[]) => (items.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '');

function body(c: SquareContent): string {
  switch (c.kind) {
    case 'lesson': return [
      ...c.sections.map((s) => `<h4>${esc(s.heading)}</h4><p>${esc(s.text)}</p>${s.example ? `<p class="ex"><b>Example:</b> ${esc(s.example)}</p>` : ''}`),
      c.keyPoints.length ? `<h4>Key points</h4>${list(c.keyPoints)}` : '', c.commonMistakes?.length ? `<h4>Common mistakes</h4>${list(c.commonMistakes)}` : '',
    ].join('');
    case 'quiz': return (c.passage ? `<p class="ex">${esc(c.passage)}</p>` : '') + c.questions.map((q, i) =>
      `<p><b>${i + 1}. ${esc(q.q)}</b></p><ol type="A">${q.options.map((o) => `<li>${esc(o)}</li>`).join('')}</ol><p class="ans">Answer: ${String.fromCharCode(65 + q.answer)}. ${esc(q.why)}</p>`).join('');
    case 'cards': return `<table>${c.cards.map((k) => `<tr><td>${esc(k.front)}</td><td>${esc(k.back)}</td></tr>`).join('')}</table>`;
    case 'match': return `<table>${c.pairs.map((p) => `<tr><td>${esc(p.left)}</td><td>${esc(p.right)}</td></tr>`).join('')}</table>`;
    case 'order': return `<p>${esc(c.prompt)}</p><ol>${c.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    case 'worked': return `<p>${esc(c.problem)}</p><ol>${c.steps.map((s) => `<li>${esc(s.step)} <i>${esc(s.why)}</i></li>`).join('')}</ol><p><b>${esc(c.takeaway)}</b></p>`;
    case 'table': return `<h4>${esc(c.title)}</h4><pre>${esc(c.markdown)}</pre>`;
    case 'numeric': return `<p>${esc(c.task)}</p>${list(c.working)}<p class="ans">Answer: ${esc(c.answer)} ${esc(c.unit)}</p>`;
    case 'practice': return `<p>${esc(c.task)}</p><p class="ans">A good answer: ${esc(c.model)}</p>`;
    default: return '<p><i>Practice squares are played in Atlas.</i></p>';
  }
}

export function studyGuideHtml(course: Course): string {
  let unit = '';
  const sections = course.squares.map((sq) => {
    const heading = sq.unit !== unit ? `<h2>${esc(sq.unit)}</h2>` : '';
    unit = sq.unit;
    const content = course.content[sq.key];
    return `${heading}<section><h3>${esc(sq.title)}</h3>${content ? body(content) : '<p><i>Not written yet. Open this square in Atlas to write it.</i></p>'}</section>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(course.title)}</title>
<style>body{font-family:Georgia,serif;max-width:760px;margin:2em auto;padding:0 1em;line-height:1.5}h1,h2,h3,h4{font-family:Helvetica,Arial,sans-serif;font-weight:600}section{page-break-inside:avoid;margin-bottom:1.5em}
table{border-collapse:collapse;width:100%}td{border:1px solid #bbb;padding:6px}.ans{color:#1b5e20}.ex{background:#f4f4f4;padding:8px}</style></head>
<body><h1>${esc(course.title)}</h1><p>${esc(course.summary)}</p>${sections}</body></html>`;
}
