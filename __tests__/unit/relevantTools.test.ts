import { relevantTools } from '../../src/services/tools/relevantTools';

const ALL = ['web_search', 'calculator', 'get_current_datetime', 'my_location', 'add_calendar_event', 'write_file', 'draft_message', 'remember', 'search_knowledge_base', 'mcp_server_tool'];

describe('sending only the tools a message needs', () => {
  it('sends none of the built-in tools for small talk, and keeps tools from servers', () => {
    expect(relevantTools('thanks, that was helpful', ALL)).toEqual(['mcp_server_tool']);
  });
  it('picks the tools that fit the message', () => {
    expect(relevantTools('what is 15% of 240', ALL)).toEqual(expect.arrayContaining(['calculator']));
    expect(relevantTools('what is the latest news on the election', ALL)).toEqual(expect.arrayContaining(['web_search']));
    expect(relevantTools('add a meeting with Sam to my calendar tomorrow', ALL)).toEqual(expect.arrayContaining(['add_calendar_event', 'get_current_datetime']));
    expect(relevantTools('how far is the car from camp', ALL)).toContain('my_location');
    expect(relevantTools('email my landlord that the rent is late', ALL)).toContain('draft_message');
    expect(relevantTools('which way is the car', ALL)).not.toContain('calculator');
  });
  it('keeps a tool already used in this chat for the follow-up', () => {
    expect(relevantTools('and for 300?', ALL, { used: ['calculator'] })).toContain('calculator');
  });
  it('keeps knowledge-base search only in a project that has documents', () => {
    expect(relevantTools('summarise my notes', ALL, { projectHasDocs: true })).toContain('search_knowledge_base');
    expect(relevantTools('summarise my notes', ALL)).not.toContain('search_knowledge_base');
  });
  it('sends far fewer tools than it was given for a typical message', () => {
    expect(relevantTools('write me a poem about the sea', ALL).length).toBeLessThan(ALL.length / 2);
  });
});

describe('the draft text or email tool is only offered when the person means to reach someone', () => {
  const offered = (m: string) => relevantTools(m, ['draft_message']).includes('draft_message');
  it('is offered for texting, emailing or calling a person', () => {
    for (const m of ['text my wife that I am running late', 'email Sam the report', 'send a message to the landlord', 'tell him I am late', 'call mum', 'reply to Dana', 'draft an email to my boss']) expect(offered(m)).toBe(true);
  });
  it('is not offered when the person is asking the assistant to answer or tell them something', () => {
    for (const m of ['tell me something interesting', 'tell me about volcanoes', 'can you tell me what a fund is', 'text me the steps here', 'message me back with the answer', 'what is the message of this poem', 'tell us a story', 'Tell Me something fun', 'Message me back', 'explain how to call a function in Python']) expect(offered(m)).toBe(false);
  });
});
