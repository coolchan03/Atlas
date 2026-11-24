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
    id: 'budget-502030', title: 'Budget: needs, wants, savings', summary: 'Splits an income 50, 30 and 20', help: 'Fill in the monthly income after tax.',
    steps: 'field: Monthly income\ncalc: Needs (50%) | round({Monthly income} * 0.5, 2)\ncalc: Wants (30%) | round({Monthly income} * 0.3, 2)\ncalc: Savings (20%) | round({Monthly income} * 0.2, 2)',
  },
  {
    id: 'own-rate', title: 'Money at my own rate', summary: 'Converts an amount at a rate you type', help: 'The rate is how much of the other money one unit of yours buys (for example 0.92).',
    steps: 'field: Amount\nfield: Rate\ncalc: Converted | round({Amount} * {Rate}, 2)\ncalc: Back again | round({Converted} / {Rate}, 2)',
  },
  {
    id: 'temperature', title: 'Temperature', summary: 'Celsius to Fahrenheit and back', help: 'Type a temperature in Celsius.',
    steps: 'field: Celsius\ncalc: Fahrenheit | round({Celsius} * 9 / 5 + 32, 1)\ncalc: Kelvin | round({Celsius} + 273.15, 2)',
  },
  {
    id: 'distance', title: 'Distance', summary: 'Kilometres to miles, and the walking time', help: 'Type a distance in kilometres.',
    steps: 'field: Kilometres\ncalc: Miles | round({Kilometres} * 0.621371, 2)\ncalc: Hours walking at 5 km/h | round({Kilometres} / 5, 1)\ncalc: Hours driving at 80 km/h | round({Kilometres} / 80, 1)',
  },
  {
    id: 'recipe-scaler', title: 'Recipe scaler', summary: 'Scales every quantity in a recipe', help: 'Paste the recipe, then say how many it serves and how many you want.',
    steps: 'field: Serves now\nfield: Serves wanted\ncalc: Scale | round({Serves wanted} / {Serves now}, 3)\nai: Rewrite the recipe with every quantity multiplied by the scale, keeping the same units. Do not change the steps.',
  },
  {
    id: 'step-by-step', title: 'Meeting follow-up', summary: 'Three plain steps, one after the other', help: 'Paste the notes or transcript of the meeting.',
    steps: '1. List the decisions that were made, one per line.\n2. List who has to do what, and by when, using only what the text says.\n3. Write a short, friendly email to the group with both lists.',
  },
  {
    id: 'devils-advocate', title: "Devil's advocate", summary: 'Argues against your decision, then for it, then asks the questions that matter', help: 'Describe the decision or opinion in a few sentences.',
    steps: '1. Say the decision in one sentence and what it takes for granted.\n2. Give the three strongest arguments against it, one per line.\n3. Give the three strongest arguments for it, one per line.\n4. Ask the two questions whose answers would change the decision most.',
  },
  {
    id: 'weighted-decision', title: 'Weighted decision', summary: 'Scores two options on three things that matter', help: 'Weight is how much it matters (1 to 10). Score each option on each thing (1 to 10). Higher total wins.',
    steps: 'field: Weight 1\nfield: Weight 2\nfield: Weight 3\nfield: A score 1\nfield: A score 2\nfield: A score 3\nfield: B score 1\nfield: B score 2\nfield: B score 3\ncalc: Option A | {Weight 1} * {A score 1} + {Weight 2} * {A score 2} + {Weight 3} * {A score 3}\ncalc: Option B | {Weight 1} * {B score 1} + {Weight 2} * {B score 2} + {Weight 3} * {B score 3}\ncalc: A ahead by | {Option A} - {Option B}',
  },
  {
    id: 'reply-writer', title: 'Reply writer', summary: 'A reply in the tone you choose', help: 'Paste the message you are answering.',
    steps: 'field: Tone | Friendly, Formal, Short\nai: Write a reply to the text in that tone. Do not invent facts, dates or names.',
  },
];
