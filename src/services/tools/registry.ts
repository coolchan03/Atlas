import { ToolDefinition } from './types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'read_health_summary', name: 'read_health_summary', displayName: 'Health Connect', icon: 'heart',
    description: 'With separate user approval, read steps and average recorded heart rate for the last 1-7 days from Android Health Connect. Not a live heart rate measurement.',
    parameters: { days: { type: 'number', description: 'Days including today (1-7), default 1' } },
  },
  {
    id: 'web_search',
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the live web and return real-time result titles, snippets, and URLs. Use this for any question about current events, prices, weather, news, or anything that requires up-to-date information. When the snippet is insufficient, call read_url on the most relevant result URL to get the full page content.',
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
    id: 'draft_email', name: 'draft_email', displayName: 'Email draft',
    description: 'Open the email app with recipient, subject and body filled in. User reviews and sends. Never sends automatically.',
    icon: 'mail', parameters: {
      to: { type: 'string', description: 'Email address', required: true },
      subject: { type: 'string', description: 'Email subject' },
      body: { type: 'string', description: 'Email body' },
    },
  },
  {
    id: 'draft_text', name: 'draft_text', displayName: 'SMS draft',
    description: 'Open the SMS app with recipient and text filled in. Never sends automatically. Use calendar events to tailor a draft.',
    icon: 'message-circle', parameters: {
      to: { type: 'string', description: 'Phone number', required: true },
      body: { type: 'string', description: 'Message body' },
    },
  },
  {
    id: 'open_dialer', name: 'open_dialer', displayName: 'Phone dialer',
    description: 'Open the dialer with a phone number filled in; does not place the call.',
    icon: 'phone', parameters: { phone: { type: 'string', description: 'Phone number', required: true } },
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
    id: 'create_code_project', name: 'create_code_project', displayName: 'Code project',
    description: 'Create multiple UTF-8 source files (Python, Kotlin, Java, Rust, TypeScript, etc.) with one confirmation. Does not execute or build the files.',
    icon: 'code', parameters: {
      name: { type: 'string', description: 'Project name', required: true },
      files_json: { type: 'string', description: 'JSON array of {path, content}', required: true },
    },
  },
  {
    id: 'open_file', name: 'open_file', displayName: 'Open file',
    description: 'Open a file on the phone in the right app (browser, document viewer).', icon: 'external-link',
    parameters: { path: { type: 'string', description: 'File path', required: true } },
  },
  {
    id: 'find_contact', name: 'find_contact', displayName: 'Find contact',
    description: 'Ask the user for permission to search a phone contact by name. Use with calendar events to draft a friend a text; confirm the matching person before composing. Never sends.',
    icon: 'users',
    parameters: { name: { type: 'string', description: 'Contact name fragment', required: true } },
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
    id: 'my_location', name: 'my_location', displayName: 'My location',
    description: "The user's GPS position (works offline) and the distance and direction to their saved places (camp, car, water...). Use for 'where am I', 'how far to camp', 'which way is the car'.", icon: 'map-pin',
    parameters: {},
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
  const enabled = AVAILABLE_TOOLS.filter(t => enabledToolIds.includes(t.id));
  const disabled = AVAILABLE_TOOLS.filter(t => !enabledToolIds.includes(t.id));
  const active = enabled.length
    ? enabled.map(t => `- ${t.name}: ${t.description}`).join('\n')
    : '(no tools enabled)';
  const inactive = disabled.map(t => `${t.displayName} (${t.id})`).join(', ');
  return `\n\nEnabled tools you may call this turn:\n${active}\nOther available capabilities currently OFF: ${inactive}. If a disabled tool would help, ask the user to enable it in Settings > Tools. Never call a disabled tool or assume permission was granted.`;
}
