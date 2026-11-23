/**
 * Helpers to start from in the helper editor. Several use calc: steps, so the arithmetic is exact. Each is plain text the person can change.
 */
export interface ExampleHelper { id: string; title: string; summary: string; help: string; steps: string }

export const EXAMPLE_HELPERS: ExampleHelper[] = [
  {
    id: 'split-bill', title: 'Split the bill', summary: 'Adds a tip and divides the bill', help: 'Type anything (for example the place) and fill in the three answers.',
    steps: 'field: Bill total\nfield: Tip percent\nfield: People\ncalc: Tip | round({Bill total} * {Tip percent} / 100, 2)\ncalc: Total | {Bill total} + {Tip}\ncalc: Each pays | round({Total} / {People}, 2)',
  },
  {
    id: 'trip-cost', title: 'Fuel cost of a trip', summary: 'Litres and cost for a distance', help: 'Fill in the three answers.',
    steps: 'field: Distance in km\nfield: Litres per 100 km\nfield: Price per litre\ncalc: Litres needed | round({Distance in km} * {Litres per 100 km} / 100, 1)\ncalc: Cost | round({Litres needed} * {Price per litre}, 2)',
  },
  {
    id: 'loan', title: 'Monthly loan payment', summary: 'The payment for a loan at a yearly rate', help: 'Fill in the three answers (the rate as a plain number: 6 for 6 percent).',
    steps: 'field: Amount borrowed\nfield: Yearly rate\nfield: Months\ncalc: Monthly rate | {Yearly rate} / 100 / 12\ncalc: Payment | round({Amount borrowed} * {Monthly rate} / (1 - (1 + {Monthly rate}) ^ (0 - {Months})), 2)\ncalc: Total paid | round({Payment} * {Months}, 2)',
  },
  {
    id: 'recipe-scaler', title: 'Recipe scaler', summary: 'Scales every quantity in a recipe', help: 'Paste the recipe, then say how many it serves and how many you want.',
    steps: 'field: Serves now\nfield: Serves wanted\ncalc: Scale | round({Serves wanted} / {Serves now}, 3)\nai: Rewrite the recipe with every quantity multiplied by the scale, keeping the same units. Do not change the steps.',
  },
  {
    id: 'reply-writer', title: 'Reply writer', summary: 'A reply in the tone you choose', help: 'Paste the message you are answering.',
    steps: 'field: Tone | Friendly, Formal, Short\nai: Write a reply to the text in that tone. Do not invent facts, dates or names.',
  },
];
