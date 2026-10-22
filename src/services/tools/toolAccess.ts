import { Alert } from 'react-native';
import { useAppStore } from '../../stores/appStore';
import { AVAILABLE_TOOLS } from './registry';

export type ToolApproval = 'once' | 'always' | 'denied';

/** Explicit three-way consent. NEVER turn a model request into permission on its own. */
export function confirmToolEnable(displayName: string, description: string, scope: 'chat' | 'app' = 'app'): Promise<ToolApproval> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (choice: ToolApproval) => {
      if (!settled) { settled = true; resolve(choice); }
    };
    Alert.alert(
      'Enable Atlas tool?',
      `${displayName}\n\n${description}\n\nAllow this tool for one use, or keep it enabled ${scope === 'chat' ? 'in this chat?' : 'in Settings?'}`,
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish('denied') },
        { text: 'Once', onPress: () => finish('once') },
        { text: 'Always', onPress: () => finish('always') },
      ],
      { cancelable: true, onDismiss: () => finish('denied') },
    );
  });
}

export function parseRequestedToolArguments(json: string | undefined): Record<string, unknown> {
  if (!json || !json.trim()) return {};
  if (json.length > 50000) throw new Error('Tool arguments exceed the 50 KB limit.');
  const parsed: unknown = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object.');
  }
  // Tool inputs may be nested, but must never carry prototype-mutating keys,
  // even if the called tool merges arguments into an application object.
  function validate(value: unknown, depth: number): void {
    if (depth > 12) throw new Error('Tool arguments are nested too deeply.');
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw new Error('Unsafe tool argument key.');
      }
      validate(nested, depth + 1);
    }
  }
  validate(parsed, 0);
  return parsed as Record<string, unknown>;
}

function toolAccessScope(conversationId?: string) {
  if (conversationId !== undefined) {
    const { useChatStore } = require('../../stores/chatStore');
    const conversation = useChatStore.getState().conversations.find((c: { id: string }) => c.id === conversationId);
    if (!conversation) throw new Error('This chat is no longer available. Start a new request.');
    const { toolsForConversation } = require('./chatTools');
    return {
      enabled: toolsForConversation(conversation) as string[],
      persist: (enabledTools: string[]) => useChatStore.getState().setConversationTools(conversationId, enabledTools),
    };
  }
  return {
    enabled: useAppStore.getState().settings.enabledTools,
    persist: (enabledTools: string[]) => useAppStore.getState().updateSettings({ enabledTools }),
  };
}

export async function requestToolAccess(
  request: { toolName: string; json?: string; conversationId?: string },
  execute: (name: string, args: Record<string, any>) => Promise<string>,
): Promise<string> {
  const { toolName, json, conversationId } = request;
  const def = AVAILABLE_TOOLS.find(t => t.id === toolName && t.name === toolName &&
    t.id !== 'request_tool_access');
  if (!def) throw new Error('The requested tool is unavailable or cannot be enabled.');
  const args = parseRequestedToolArguments(json);
  const current = toolAccessScope(conversationId).enabled;
  // A tool already enabled does not need an extra enable prompt, but the ordinary
  // tool-specific confirmation (when applicable) still happens inside the handler.
  const decision: ToolApproval = current.includes(toolName)
    ? 'once'
    : await confirmToolEnable(def.displayName, def.description, conversationId === undefined ? 'app' : 'chat');
  if (decision === 'denied') return `The user declined access to ${def.displayName}. Nothing was executed.`;
  // Re-read after the dialog: preserve concurrent user choices and reject a deleted chat.
  const latest = toolAccessScope(conversationId);
  if (decision === 'always' && !latest.enabled.includes(toolName)) {
    latest.persist([...latest.enabled, toolName]);
  }
  // Run through the exact same dispatch path as ordinary calls. File creation,
  // messages, calendar reads, sensors etc. keep their OWN user approval gates.
  // No external plugin, unregistered tool or arbitrary script may use this route.
  const content = await execute(toolName, args);
  const choice = decision === 'always'
    ? (conversationId === undefined ? 'kept enabled' : 'kept enabled in this chat')
    : 'approved for this request only';
  return `${def.displayName} ${choice}.\n${content}`;
}
