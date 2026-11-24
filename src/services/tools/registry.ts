import { ToolDefinition } from './types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the live web and return real-time result titles, snippets, and URLs. Use this for any question about current events, prices, weather, news, or anything that requires up-to-date information. When the snippet is insufficient, call read_url on the most relevant result URL to get the full page content. When your answer uses a result, cite it by its number in square brackets, like [1], so the reader can see where it came from.',
    icon: 'globe',
    requiresNetwork: true,
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'calculator',
    name: 'calculator',
    displayName: 'Calculator',
    description: 'Evaluate math expressions',
    icon: 'hash',
    parameters: {
      expression: {
        type: 'string',
        description: 'Math expression',
        required: true,
      },
    },
  },
  {
    id: 'random_number',
    name: 'random_number',
    displayName: 'Random number',
    description: 'Draw truly random whole numbers on the phone (never invent random numbers yourself). Give min and max (default 1 to 100), optional count (1 to 1000) and unique=true for numbers that are all different. Add seed only for a repeatable test.',
    icon: 'shuffle',
    parameters: {
      min: { type: 'string', description: 'Smallest whole number (default 1)' },
      max: { type: 'string', description: 'Largest whole number (default 100)' },
      count: { type: 'string', description: 'How many numbers (default 1)' },
      unique: { type: 'string', description: 'true for numbers that are all different' },
      seed: { type: 'string', description: 'Whole number for a reproducible test draw (not random)' },
    },
  },
  {
    id: 'roll_dice',
    name: 'roll_dice',
    displayName: 'Roll dice',
    description: 'Roll dice on the phone and report each roll and the total (never make up dice results). sides 2 to 1000 (default 6), count 1 to 100 dice (default 1), optional modifier to add. Add seed only for a repeatable test.',
    icon: 'box',
    parameters: {
      sides: { type: 'string', description: 'Sides per die (default 6)' },
      count: { type: 'string', description: 'Number of dice (default 1)' },
      modifier: { type: 'string', description: 'Whole number added to the total' },
      seed: { type: 'string', description: 'Whole number for a reproducible test roll (not random)' },
    },
  },
  {
    id: 'study_math',
    name: 'study_math',
    displayName: 'Study maths',
    description: 'Exact maths done in code, not by guessing. action: describe (mean, median, stdev of values), t_test (values, optional second, mu0, paired), regression (x, y), sample_size (margin, confidence), convert (value, from, to units), date (from, to or add_days, as YYYY-MM-DD), tvm (time value of money: give all of pv, fv, pmt, rate, nper except the one to solve). Also, with input as JSON text: solve {type:linear|quadratic|system,a,b,c...}, number {op:gcd|lcm|factorial|choose|permute|prime_factors|is_prime,n,k,a,b}, percent {op:change|of|what_percent,...}, geometry {shape:circle|rectangle|triangle|right_triangle|sphere|cylinder|cone,r,w,h,...}, fraction {op:add|subtract|multiply|divide|simplify,a,b}. Use this for ANY arithmetic you are not certain of; never calculate by guessing. Lists are comma separated.',
    icon: 'percent',
    parameters: {
      action: { type: 'string', description: 'describe, t_test, regression, sample_size, convert, date or tvm', required: true },
      values: { type: 'string', description: 'Comma separated numbers' },
      second: { type: 'string', description: 'Second sample for t_test' },
      x: { type: 'string', description: 'Comma separated x values' },
      y: { type: 'string', description: 'Comma separated y values' },
      value: { type: 'string', description: 'Number to convert' },
      from: { type: 'string', description: 'Unit to convert from, or start date YYYY-MM-DD' },
      to: { type: 'string', description: 'Unit to convert to, or end date YYYY-MM-DD' },
      add_days: { type: 'string', description: 'Days to add to the from date' },
      margin: { type: 'string', description: 'Margin of error, e.g. 0.05' },
      confidence: { type: 'string', description: '0.80, 0.90, 0.95 or 0.99' },
      mu0: { type: 'string', description: 'Hypothesised mean for a one-sample t_test' },
      paired: { type: 'string', description: 'true for a paired t_test' },
      input: { type: 'string', description: 'JSON text of inputs for solve, number, percent, geometry or fraction' },
      pv: { type: 'string', description: 'Present value' }, fv: { type: 'string', description: 'Future value' },
      pmt: { type: 'string', description: 'Payment per period' }, rate: { type: 'string', description: 'Rate per period, e.g. 0.05' },
      nper: { type: 'string', description: 'Number of periods' },
    },
  },
  {
    id: 'study_helpers',
    name: 'study_helpers',
    displayName: 'Study helpers',
    description: 'Planner, rubric check and references, computed in code from what the person gives. action: plan (exams = JSON [{name,date YYYY-MM-DD,topics[],done[]}] in the order taken, today, done_topics), rubric (rubric text one criterion per line, draft text: lists criteria the draft does not address), apa (source = JSON {author,year,title,publisher,url,page}), matrix (papers = JSON list of {title,author,year,question,method,sample,findings,limitations}), text_stats (text: word and sentence counts, reading ease and grade level, most-used words; use for English and writing help). Never invent author, year or title: leave a field out if unknown.',
    icon: 'book-open',
    parameters: {
      action: { type: 'string', description: 'plan, rubric, apa or matrix', required: true },
      exams: { type: 'string', description: 'JSON list of exams for plan' },
      today: { type: 'string', description: 'Today as YYYY-MM-DD for plan' },
      done_topics: { type: 'string', description: 'Topics already finished (JSON list)' },
      rubric: { type: 'string', description: 'Rubric text, one criterion per line' },
      draft: { type: 'string', description: 'The draft text to check' },
      source: { type: 'string', description: 'JSON source for apa' },
      papers: { type: 'string', description: 'JSON list of papers for matrix' },
      text: { type: 'string', description: 'The passage for text_stats' },
    },
  },
  {
    id: 'find_image',
    name: 'find_image',
    displayName: 'Find a picture',
    description: 'Find freely licensed pictures (Wikimedia Commons) for a subject, such as a diagram, map, specimen or historic photo. Returns each picture with its author, licence and link. Matches are not guaranteed to be right: tell the person to check them.',
    icon: 'image',
    requiresNetwork: true,
    parameters: { query: { type: 'string', description: 'What the picture should show', required: true } },
  },
  {
    id: 'science_data',
    name: 'science_data',
    displayName: 'Science data',
    description: 'Look up science facts instead of recalling them. action: element (input = symbol, name or atomic number: mass, group, period, category), molar_mass (input = formula such as Ca(OH)2 or CuSO4.5H2O), moles (input JSON {formula, grams or moles}), ph (input JSON {concentration, of: "H+" or "OH-"}), constant (input = c, g, G, h, kB, NA, R, e, me, mp, F or atm).',
    icon: 'thermometer',
    parameters: {
      action: { type: 'string', description: 'element, molar_mass, moles, ph or constant', required: true },
      input: { type: 'string', description: 'Plain text or JSON for the action', required: true },
    },
  },
  {
    id: 'get_current_datetime',
    name: 'get_current_datetime',
    displayName: 'Date & Time',
    description: 'Get current date and time',
    icon: 'clock',
    parameters: {
      timezone: {
        type: 'string',
        description: 'IANA timezone, e.g. America/New_York',
      },
    },
  },
  {
    id: 'get_device_info',
    name: 'get_device_info',
    displayName: 'Device Info',
    description: 'Get device hardware info',
    icon: 'smartphone',
    parameters: {
      info_type: {
        type: 'string',
        description: 'Info type',
        enum: ['battery', 'storage', 'memory', 'all'],
      },
    },
  },
  {
    id: 'search_knowledge_base',
    name: 'search_knowledge_base',
    displayName: 'Knowledge Base',
    description: 'Search uploaded project documents',
    icon: 'book-open',
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'update_project_document',
    name: 'update_project_document',
    displayName: 'Update project document',
    description: 'Create or update a named text document in this chat\'s project, shared with every chat in the project (for example "Current Progress"). Use mode "append" to add a dated note, "replace" to rewrite it. Only when the user asks or the project instructions say so.',
    icon: 'edit-3',
    parameters: {
      name: { type: 'string', description: 'Document name, e.g. Current Progress', required: true },
      content: { type: 'string', description: 'Text to write', required: true },
      mode: { type: 'string', description: 'append (default) or replace', enum: ['append', 'replace'] },
    },
  },
  {
    id: 'search_offline_library',
    name: 'search_offline_library',
    displayName: 'Offline Library',
    description: 'Search the offline encyclopedias on this phone (Wikipedia, medical wiki, iFixit repair guides, travel guides) and return article text. Works without internet.',
    icon: 'book',
    parameters: {
      query: {
        type: 'string',
        description: 'A few search words, e.g. "tetanus" or "solar charge controller"',
        required: true,
      },
    },
  },
  {
    id: 'list_files', name: 'list_files', displayName: 'List files',
    description: 'List files and folders on the phone. Default is the Atlas workspace folder.', icon: 'folder',
    parameters: { path: { type: 'string', description: 'Folder path (optional, relative to the workspace or absolute)' } },
  },
  {
    id: 'read_file', name: 'read_file', displayName: 'Read file',
    description: 'Read a text file (txt, md, html, csv, json, code) or the text of a PDF/Word file on the phone.', icon: 'file-text',
    parameters: {
      path: { type: 'string', description: 'File path', required: true },
      offset: { type: 'number', description: 'Character position to start from, for long files (default 0)' },
    },
  },
  {
    id: 'write_file', name: 'write_file', displayName: 'Write file',
    description: 'Create or change a text/markdown/html/csv file on the phone. The user is asked to approve first.', icon: 'edit',
    parameters: {
      path: { type: 'string', description: 'File path, e.g. notes/plan.md', required: true },
      content: { type: 'string', description: 'Full file content', required: true },
      append: { type: 'boolean', description: 'true to add to the end instead of replacing' },
    },
  },
  {
    id: 'create_web_page', name: 'create_web_page', displayName: 'Build web page',
    description: 'Build a web page or small website (complete HTML with CSS/JS inside) and open it for preview. The user approves first.', icon: 'globe',
    parameters: {
      name: { type: 'string', description: 'Site name', required: true },
      html: { type: 'string', description: 'Complete HTML document', required: true },
    },
  },
  {
    id: 'open_file', name: 'open_file', displayName: 'Open file',
    description: 'Open a file on the phone in the right app (browser, document viewer).', icon: 'external-link',
    parameters: { path: { type: 'string', description: 'File path', required: true } },
  },
  {
    id: 'calendar_events', name: 'calendar_events', displayName: 'Read calendar',
    description: "Read the user's calendar events.", icon: 'calendar',
    parameters: {
      days_ahead: { type: 'number', description: 'How many days ahead (default 7)' },
      days_back: { type: 'number', description: 'How many days back (default 0)' },
    },
  },
  {
    id: 'add_calendar_event', name: 'add_calendar_event', displayName: 'Add calendar event',
    description: 'Add an event to the calendar (opens the calendar app filled in for the user to save).', icon: 'calendar',
    parameters: {
      title: { type: 'string', description: 'Event title', required: true },
      start: { type: 'string', description: 'Start, ISO format like 2026-10-05T14:00', required: true },
      end: { type: 'string', description: 'End, ISO format (optional)' },
      location: { type: 'string', description: 'Location (optional)' },
    },
  },
  {
    id: 'draft_message', name: 'draft_message', displayName: 'Draft text or email',
    description: 'Open the Messages or Email app with a message already written, or the phone app with a number ready, for the user to send or call themselves. Nothing is sent or dialled by Atlas. Use ONLY when the user asks to text, email or call a particular person or number. Never use it to answer a question, to tell the user something, or to write something for the user to read here in the chat: answer in the chat instead.', icon: 'send',
    parameters: {
      kind: { type: 'string', description: 'text, email or call', enum: ['text', 'email', 'call'], required: true },
      body: { type: 'string', description: 'The message (not needed for a call)' },
      to: { type: 'string', description: 'Phone number or email address (optional)' },
      subject: { type: 'string', description: 'Email subject (optional)' },
    },
  },
  {
    id: 'schedule_task', name: 'schedule_task', displayName: 'Schedule a task',
    description: 'Schedule something to happen later or repeatedly: a notification at that time, and the task runs when the user opens it (for example a reminder, a daily briefing, a plan). Use when the user says remind me, every morning, tomorrow at, each week.', icon: 'clock',
    parameters: {
      task: { type: 'string', description: 'What the AI should do at that time (a prompt). Leave empty for a daily briefing.' },
      time: { type: 'string', description: 'Time of day, like 07:30 or 7am', required: true },
      repeat: { type: 'string', description: 'once, daily, weekdays or weekly', enum: ['once', 'daily', 'weekdays', 'weekly'], required: true },
      weekday: { type: 'string', description: 'For weekly: monday ... sunday' },
      kind: { type: 'string', description: 'briefing for the daily news briefing, otherwise prompt', enum: ['prompt', 'briefing'] },
      name: { type: 'string', description: 'Short name (optional)' },
    },
  },
  {
    id: 'make_helper', name: 'make_helper', displayName: 'Make a multi-step helper', icon: 'list',
    description: "Make a reusable multi-step helper for the user, when they ask for a repeatable job (for example 'a reply writer', 'a meeting recap', 'a study plan from notes'). A helper is a name plus step lines, one per line: 'field: <label> | <choice>, <choice>' (asked first; leave off the choices for a typed answer), 'ask: <question> | <choice>, <choice>' (a choice part-way) 'ai: <one instruction>' and 'calc: <label> | <expression>' (an exact calculation done by code, for example 'calc: Total | {Price} * {Qty}'; {Name} is a field written above it; use it for totals, conversions and splits instead of asking the AI to do arithmetic). Use at least one ai: or calc: line and at most 8 lines. It is saved in Multi-step helpers for the user to read and run; it can only use the text and answers the user gives it.",
    parameters: {
      title: { type: 'string', description: 'Short name, 2 to 5 words', required: true },
      steps: { type: 'string', description: 'The step lines, one per line', required: true },
      summary: { type: 'string', description: 'One sentence about what it does (optional)' },
    },
  },
  {
    id: 'my_location', name: 'my_location', displayName: 'My location',
    description: "The user's GPS position (works offline) and the distance and direction to their saved places (camp, car, water...). Use for 'where am I', 'how far to camp', 'which way is the car'. It gives coordinates only: it does not know what is nearby, so never name airports, towns or landmarks from it.", icon: 'map-pin',
    parameters: {},
  },
  {
    id: 'learned_knowledge', name: 'learned_knowledge', displayName: 'What I learned', icon: 'book-open',
    description: "Look up what the AI has learned in its learning sessions about a question, with where each point came from and whether it has been checked. If it says nothing was learned, it also lists the connected sources (project documents, offline library, the web) to check next. Use this first when the user asks what you know or learned about a subject.",
    parameters: { question: { type: 'string', description: 'The question or subject to look up', required: true } },
  },
  {
    id: 'standards_check', name: 'standards_check', displayName: 'Latest standards', icon: 'shield',
    description: "Look up what the standard-setter itself (FASB for accounting; also the SEC, IRS, AICPA and PCAOB) has published on a topic, to check a textbook against the latest rule. Use when a question is about accounting standards, GAAP, an ASC topic or an ASU, or when a textbook may be out of date. A newer standard overrules the textbook: say what each says, the ASU number and effective date, and quote it. If nothing official is found, say it is not checked.",
    parameters: { topic: { type: 'string', description: 'The standard or topic, for example "ASC 842 leases", "credit losses CECL" or "segment reporting"', required: true } },
  },
  {
    id: 'source_updates', name: 'source_updates', displayName: 'Look for newer sources', icon: 'refresh-cw',
    description: "Look on the official sites of this project's field only (for tax: IRS, eCFR, the U.S. Code, Congress and the courts; for markets, accounting, law or a profile the user wrote: its own list of sites) for a newer version of a source the project holds, or for something new on a topic. Each page found is marked in code as NEWER, the same edition or OLDER than a document the project already has. Use when the user asks to look for updates, check whether a source is current, or find a newer rule, filing, standard, law or decision. Tell the user what was found and ask before adding anything. To check whether a court case is still good law, use case_status.",
    parameters: { source: { type: 'string', description: 'What to look for: a document name in the project, a citation such as "Rev. Proc. 2024-40", "ASC 842" or "10-K Apple", or a topic', required: true } },
  },
  {
    id: 'case_status', name: 'case_status', displayName: 'Check a court case', icon: 'check-circle',
    description: "Check whether a court case is still good law: searches the web for later treatment (overruled, reversed, vacated, superseded by statute, followed, affirmed) and shows each result with the signals found in its text. Use before relying on a court decision, and whenever the user asks whether a case is still good law. A negative word can describe the case's own appeal rather than later treatment, so open a result with read_url to see which court did what, and when, before saying the case is no longer good law.",
    parameters: { case: { type: 'string', description: 'The case name and, if known, the citation or court and year, for example "Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)"', required: true } },
  },
  {
    id: 'add_source', name: 'add_source', displayName: 'Add a source to the project', icon: 'plus-circle',
    description: "Add one web page from this project's official sites to the project as a document, after the user agrees in a dialog. Use only after source_updates found it and the user said to add it. A newer edition of a work the project holds replaces the older one in answers.",
    parameters: { url: { type: 'string', description: 'The full address of the page, exactly as source_updates showed it', required: true } },
  },
  {
    id: 'drug_label', name: 'drug_label', displayName: 'Drug label', icon: 'activity',
    description: "Look up the FDA label of a medicine by brand or generic name: what it is for, dose, warnings, who must not use it and interactions, in the manufacturer's own words. Use when the user asks about a medicine, a dose, a side effect or whether two medicines mix. Needs a connection for a first lookup; labels looked up before work offline. Quote the label and say it is not medical advice.",
    parameters: { name: { type: 'string', description: 'The medicine, brand or generic name, for example ibuprofen or Advil', required: true } },
  },
  {
    id: 'work_in_steps', name: 'work_in_steps', displayName: 'Do a big job in steps', icon: 'list',
    description: "Do a job that has several parts, or that works on a long text, in small steps instead of all at once. The job is split into short steps and each is done on its own, so nothing is forgotten or cut off. Use it when the user asks for several things in one message (for example summarise, then list the actions, then write an email), or gives a long text and wants more than one thing done with it. Pass the job in the user's words, and the text when there is one.",
    parameters: {
      job: { type: 'string', description: 'What to do, in the user\'s words, with every part of it', required: true },
      text: { type: 'string', description: 'The material to work on (a document, notes, an article), when the user gave one' },
      skill: { type: 'string', description: 'The name of an installed skill whose steps to follow one at a time (for a long skill), when the user called one' },
    },
  },
  {
    id: 'make_music', name: 'make_music', displayName: 'Make music', icon: 'music',
    description: "Make an original instrumental tune and play it. A specialist composer with dozens of instruments writes it, not you: just describe what the user wants. Use when they ask for music, a song, a tune, background music, a lullaby, a soundtrack or a beat. Instrumental only, no singing.",
    parameters: {
      description: { type: 'string', description: 'What the music should be like: mood, style, scene, instruments the user named', required: true },
      seconds: { type: 'string', description: 'Length in seconds, 20 to 120 (default 60)' },
      style: { type: 'string', description: 'A style word if the user gave one, for example jazz, lo-fi, classical, rock, film' },
    },
  },
  {
    id: 'list_maps', name: 'list_maps', displayName: 'Offline maps', icon: 'map',
    description: "The offline map files on this phone and the area each covers, and whether the user's position is inside one. Use before searching places, or when the user asks what maps they have.",
    parameters: {},
  },
  {
    id: 'map_places', name: 'map_places', displayName: 'Places on the map', icon: 'map-pin',
    description: "Find named places (hospital, cafe, campsite, peak, street, shop...) in the offline map file near the user or near a latitude and longitude. Works with no internet. Use for 'what is near me', 'where is the nearest hospital', 'is there a campground around here'. Only places OpenStreetMap names are listed.",
    parameters: {
      query: { type: 'string', description: 'What to look for, for example hospital, cafe or a place name. Leave empty for everything named.' },
      lat: { type: 'string', description: 'Latitude to search around (default: the user\'s position)' },
      lon: { type: 'string', description: 'Longitude to search around' },
      radius_km: { type: 'string', description: 'How far to look, 1 to 30 km (default 5)' },
      limit: { type: 'string', description: 'How many results, 1 to 25 (default 10)' },
    },
  },
  {
    id: 'remember', name: 'remember', displayName: 'Remember',
    description: 'Save a lasting fact about the user that they want you to remember in future chats (preferences, people, health, plans). Only when the user shares it or asks you to remember.', icon: 'bookmark',
    parameters: { fact: { type: 'string', description: 'One short fact', required: true } },
  },
  {
    id: 'read_url',
    name: 'read_url',
    displayName: 'URL Reader',
    description: 'Fetch the full live content of any URL. Use this after web_search to read the complete text of a result page, or directly when the user shares a link.',
    icon: 'link',
    requiresNetwork: true,
    parameters: {
      url: {
        type: 'string',
        description: 'Full URL to fetch',
        required: true,
      },
    },
  },
];

export function getToolsAsOpenAISchema(enabledToolIds: string[]) {
  return AVAILABLE_TOOLS
    .filter(tool => enabledToolIds.includes(tool.id))
    .map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ]),
          ),
          required: Object.entries(tool.parameters)
            .filter(([_, param]) => param.required)
            .map(([key]) => key),
        },
      },
    }));
}

export function buildToolSystemPromptHint(enabledToolIds: string[]): string {
  const enabledTools = AVAILABLE_TOOLS.filter(t => enabledToolIds.includes(t.id));
  if (enabledTools.length === 0) return '';

  const toolList = enabledTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `\n\nTools available:\n${toolList}\nUse these tools proactively and precisely - call the right tool at the right moment rather than guessing or saying you cannot help.`;
}
