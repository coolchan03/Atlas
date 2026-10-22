/** A small, reviewed English vocabulary bank for the Daily News briefing.
 * Facts and examples are curated in-app, not generated as a purported news story.
 * Deterministic by local calendar date so the displayed and spoken word match.
 */
export interface EnglishWord { word: string; part: string; meaning: string; example: string }
const WORDS: EnglishWord[] = [
  { word: 'lucid', part: 'adjective', meaning: 'clear and easy to understand', example: 'The reporter gave a lucid account of the decision.' },
  { word: 'nuance', part: 'noun', meaning: 'a subtle difference in meaning or feeling', example: 'The analysis captured a nuance in the debate.' },
  { word: 'resilient', part: 'adjective', meaning: 'able to recover after difficulty', example: 'The community remained resilient after the storm.' },
  { word: 'meticulous', part: 'adjective', meaning: 'showing great attention to detail', example: 'The scientist kept meticulous notes.' },
  { word: 'candid', part: 'adjective', meaning: 'truthful and direct', example: 'The official gave a candid explanation.' },
  { word: 'pragmatic', part: 'adjective', meaning: 'focused on practical results', example: 'The council adopted a pragmatic approach.' },
  { word: 'scrutiny', part: 'noun', meaning: 'careful and close examination', example: 'The proposal faced public scrutiny.' },
  { word: 'coherent', part: 'adjective', meaning: 'logical and well organized', example: 'The article offered a coherent timeline.' },
  { word: 'plausible', part: 'adjective', meaning: 'seeming reasonable or likely', example: 'The witness gave a plausible explanation.' },
  { word: 'concur', part: 'verb', meaning: 'to agree with someone or something', example: 'Several researchers concur with the findings.' },
  { word: 'inference', part: 'noun', meaning: 'a conclusion drawn from evidence', example: 'That inference needs more supporting data.' },
  { word: 'salient', part: 'adjective', meaning: 'most important or noticeable', example: 'The salient point was the cost.' },
  { word: 'ameliorate', part: 'verb', meaning: 'to make a situation better', example: 'The new policy may ameliorate congestion.' },
  { word: 'ubiquitous', part: 'adjective', meaning: 'found almost everywhere', example: 'Smartphones are ubiquitous in modern cities.' },
  { word: 'tenuous', part: 'adjective', meaning: 'weak or not strongly supported', example: 'The claim rests on tenuous evidence.' },
  { word: 'conspicuous', part: 'adjective', meaning: 'easy to notice', example: 'A conspicuous gap appeared in the budget.' },
  { word: 'equitable', part: 'adjective', meaning: 'fair and impartial', example: 'The plan calls for equitable access.' },
  { word: 'precedent', part: 'noun', meaning: 'an earlier action used as a guide', example: 'The ruling established an important precedent.' },
  { word: 'pervasive', part: 'adjective', meaning: 'present throughout something', example: 'The investigation found a pervasive problem.' },
  { word: 'assiduous', part: 'adjective', meaning: 'hardworking and persistent', example: 'Her assiduous research clarified the issue.' },
  { word: 'catalyst', part: 'noun', meaning: 'something that brings about change', example: 'The discovery became a catalyst for reform.' },
  { word: 'disparity', part: 'noun', meaning: 'a significant difference between things', example: 'The report identified a disparity in wages.' },
  { word: 'intrepid', part: 'adjective', meaning: 'brave when facing danger or difficulty', example: 'The intrepid crew explored the coast.' },
  { word: 'ambivalent', part: 'adjective', meaning: 'having mixed feelings', example: 'Residents were ambivalent about the plan.' },
  { word: 'arbitrary', part: 'adjective', meaning: 'based on whim rather than a clear rule', example: 'The panel rejected arbitrary deadlines.' },
  { word: 'empirical', part: 'adjective', meaning: 'based on observation or experiment', example: 'The findings are supported by empirical research.' },
  { word: 'reticent', part: 'adjective', meaning: 'reluctant to speak freely', example: 'The spokesperson remained reticent.' },
  { word: 'prolific', part: 'adjective', meaning: 'producing many works or results', example: 'The prolific author released a new book.' },
  { word: 'synthesize', part: 'verb', meaning: 'to combine parts into a coherent whole', example: 'The briefing will synthesize several reports.' },
  { word: 'anomaly', part: 'noun', meaning: 'something that differs from what is usual', example: 'Analysts investigated an anomaly in the figures.' },
  { word: 'delineate', part: 'verb', meaning: 'to describe or mark out precisely', example: 'The map delineates the affected area.' },
  { word: 'fortuitous', part: 'adjective', meaning: 'happening by chance, often favorably', example: 'A fortuitous meeting led to the partnership.' },
  { word: 'provisional', part: 'adjective', meaning: 'arranged for now and subject to change', example: 'The agency published provisional estimates.' },
  { word: 'conjecture', part: 'noun', meaning: 'a guess made without complete information', example: 'The explanation remains conjecture.' },
  { word: 'reconcile', part: 'verb', meaning: 'to make conflicting things consistent', example: 'Accountants worked to reconcile the totals.' },
  { word: 'obfuscate', part: 'verb', meaning: 'to make something less clear', example: 'The vague wording may obfuscate the issue.' },
  { word: 'exacerbate', part: 'verb', meaning: 'to make a problem worse', example: 'Heavy rain could exacerbate the flooding.' },
  { word: 'paradigm', part: 'noun', meaning: 'a model or typical pattern', example: 'The discovery challenged an established paradigm.' },
  { word: 'veracity', part: 'noun', meaning: 'truthfulness or accuracy', example: 'Editors checked the veracity of the report.' },
  { word: 'perspicacious', part: 'adjective', meaning: 'quick to understand what matters', example: 'Her perspicacious questions exposed the weakness.' },
];
export function englishWordOfDay(date = new Date()): EnglishWord {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return WORDS[((day % WORDS.length) + WORDS.length) % WORDS.length];
}
