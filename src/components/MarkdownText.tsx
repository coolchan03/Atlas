import { ChartBlock } from './ChartCard';
import React, { useCallback, useMemo } from 'react';
import { Clipboard, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from '@ronradtke/react-native-markdown-display';
import { useTheme } from '../theme';
import type { ThemeColors } from '../theme';
import { TYPOGRAPHY, SPACING, FONTS } from '../constants';
import { tableRows, tableToMarkdown, tableToTsv } from './markdownTable';
import { useTablePrefs } from './tablePrefs';

/**
 * Escape asterisks used as multiplication operators (digit*digit) so
 * markdown-it doesn't treat them as emphasis markers.
 * Lookahead handles chains like 5*5*5*5 in a single pass.
 */
export function preprocessMarkdown(text: string): string {
  return fixTables(htmlTablesToMarkdown(text.replaceAll(/(\d)\*(?=\d)/g, String.raw`$1\*`)));
}

/**
 * Models sometimes write a table as HTML (<table><tr><th>...), which shows as raw tags. Each such table becomes a Markdown table: the first row is
 * the header, line breaks inside a cell become spaces, any other tag is dropped. Text with no <table> is returned as it was.
 */
function htmlTablesToMarkdown(text: string): string {
  if (!/<table/i.test(text)) return text;
  return text.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_all, inner: string) => {
    const rows = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) =>
      [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => c[1].replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim()));
    const cols = Math.max(0, ...rows.map((r) => r.length));
    if (!rows.length || cols < 1) return '';
    const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, i) => r[i] ?? '').join(' | ')} |`;
    return `\n\n${[line(rows[0]), line(Array(cols).fill('---')), ...rows.slice(1).map(line)].join('\n')}\n\n`;
  });
}

const DASHES = '\\-\u2014\u2013\u2212\u2012\u2015';
const SEPARATOR_CELL = new RegExp(`^\\s*:?[${DASHES}]+:?\\s*$`);
const isTableLine = (line: string) => line.trim().startsWith('|') || (line.includes('|') && line.trim().endsWith('|'));

/**
 * Models often write the divider row of a table with long dashes ("| :— | :— |"), which is not a table to the parser, so the raw
 * bars show. Those dividers are rewritten with ordinary hyphens (keeping any alignment colons), and a table that follows a line of
 * text with no blank line between is given one, so it is read as a table.
 */
function fixTables(text: string): string {
  if (!text.includes('|')) return text;
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const cells = line.trim().replace(/^\||\|$/g, '').split('|');
    const divider = line.includes('|') && cells.length >= 1 && cells.every((c) => SEPARATOR_CELL.test(c)) && /[\u2014\u2013\u2212\u2012\u2015-]/.test(line);
    if (divider) {
      const indent = line.match(/^\s*/)?.[0] ?? '';
      const fixed = `${indent}| ${cells.map((c) => `${c.trim().startsWith(':') ? ':' : ''}---${c.trim().endsWith(':') ? ':' : ''}`).join(' | ')} |`;
      // The header row above it starts the table: a blank line before it, unless the text above is already part of the table.
      const header = out.length - 1;
      if (header >= 0 && isTableLine(out[header]) && header >= 1 && out[header - 1].trim() !== '' && !isTableLine(out[header - 1])) out.splice(header, 0, '');
      out.push(fixed);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Custom link rule — renders as inline Text so it wraps correctly inside list items */
function createLinkRule(onPress: (url: string) => void) {
  return (node: any, children: any, ...[, styles]: any[]) => (
    <Text
      key={node.key}
      accessibilityRole="link"
      style={styles.link}
      onPress={() => onPress(node.attributes?.href ?? '')}
    >
      {children}
    </Text>
  );
}

/** Drop the trailing newline markdown-it appends to code blocks. */
function trimTrailingNewline(content: string): string {
  return typeof content === 'string' && content.endsWith('\n') ? content.slice(0, -1) : content;
}

/**
 * Make rendered text selectable so users can long-press to select and copy
 * partial text (selectable propagates to nested inline Text). `textgroup` wraps
 * all paragraph/inline text; fence/code_block cover code so it can be copied too.
 */
const selectableRules = {
  // rest-param signature (node, children, parent, styles, inheritedStyles) keeps
  // within the param limit while matching the markdown lib's rule API.
  textgroup: (node: any, children: any, ...[, styles]: any[]) => (
    <Text key={node.key} style={styles.textgroup} selectable>
      {children}
    </Text>
  ),
  fence: (node: any, _children: any, ...[, styles, inheritedStyles = {}]: any[]) => (node.sourceInfo?.trim() === 'chart' ? <View key={node.key}><ChartBlock content={node.content} /></View> : (
    <View key={node.key}>
      {/* Code keeps its line breaks and indentation, so a wide line scrolls sideways instead of running off the screen. */}
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={markdownLayout.codeScroll}>
        <Text style={[inheritedStyles, styles.fence, markdownLayout.codeText]} selectable>
          {trimTrailingNewline(node.content)}
        </Text>
      </ScrollView>
      <CopyActions testID="copy-code" actions={[{ label: 'Copy code', text: () => trimTrailingNewline(node.content) }]} />
    </View>
  )),
  code_block: (node: any, _children: any, ...[, styles, inheritedStyles = {}]: any[]) => (
    <Text key={node.key} style={[inheritedStyles, styles.code_block]} selectable>
      {trimTrailingNewline(node.content)}
    </Text>
  ),
};

/** Small copy actions under a table or code block. */
function CopyActions({ actions, testID, extra }: { actions: { label: string; text: () => string }[]; testID: string; extra?: React.ReactNode }) {
  const { colors } = useTheme();
  const [done, setDone] = React.useState<string | null>(null);
  return (
    <View style={copyStyles.row} testID={testID}>
      {actions.map((a) => (
        <TouchableOpacity key={a.label} accessibilityRole="button" accessibilityLabel={a.label} testID={`${testID}-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
          onPress={() => { Clipboard.setString(a.text()); setDone(a.label); }}>
          <Text style={[copyStyles.label, { color: done === a.label ? colors.primary : colors.textMuted }]}>{done === a.label ? 'Copied' : a.label}</Text>
        </TouchableOpacity>
      ))}
      {extra}
    </View>
  );
}

const copyStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACING.lg, marginBottom: SPACING.sm },
  label: { ...TYPOGRAPHY.meta },
});

const markdownLayout = StyleSheet.create({
  codeScroll: { marginVertical: SPACING.sm },
  codeText: { marginVertical: 0 },
  table: { minWidth: '100%' },
  fitTable: { width: '100%' },
});

/** A table: even columns that fit the screen's width, or a wide table that scrolls sideways. The choice is remembered. */
function TableBlock({ node, styles, children }: { node: any; styles: any; children: React.ReactNode }) {
  const { colors } = useTheme();
  const fit = useTablePrefs((s) => s.fit);
  const setFit = useTablePrefs((s) => s.setFit);
  const toggle = (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={fit ? 'Show wide table' : 'Fit table to screen'} testID="table-fit-toggle" onPress={() => setFit(!fit)}>
      <Text style={[copyStyles.label, { color: colors.primary }]}>{fit ? 'Wide view' : 'Fit to screen'}</Text>
    </TouchableOpacity>
  );
  return (
    <View key={node.key}>
      {fit
        ? <View style={[styles._VIEW_SAFE_table, markdownLayout.fitTable]}>{children}</View>
        : (
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
            <View style={[styles._VIEW_SAFE_table, markdownLayout.table]}>{children}</View>
          </ScrollView>
        )}
      <CopyActions testID="copy-table" extra={toggle} actions={[
        { label: 'Copy table', text: () => tableToTsv(tableRows(node)) },
        { label: 'Copy as Markdown', text: () => tableToMarkdown(tableRows(node)) },
      ]} />
    </View>
  );
}

const copyRules = {
  table: (node: any, children: any, ...[, styles]: any[]) => <TableBlock key={node.key} node={node} styles={styles}>{children}</TableBlock>,
};

interface MarkdownTextProps {
  children: string;
  dimmed?: boolean;
  /** Bold words are drawn in the accent colour (a lesson's key terms), not only heavier. */
  accentTerms?: boolean;
}

export function MarkdownText({ children, dimmed, accentTerms }: MarkdownTextProps) {
  const { colors } = useTheme();
  const fit = useTablePrefs((s) => s.fit);
  const markdownStyles = useMemo(
    () => createMarkdownStyles(colors, { dimmed, fit, accentTerms }),
    [colors, dimmed, fit, accentTerms],
  );

  const handleLinkPress = useCallback((url: string) => {
    Linking.openURL(url);
    return false;
  }, []);

  const processed = useMemo(() => preprocessMarkdown(children), [children]);
  const rules = useMemo(
    () => ({ link: createLinkRule(handleLinkPress), ...selectableRules, ...copyRules }),
    [handleLinkPress],
  );

  return (
    <Markdown style={markdownStyles} onLinkPress={handleLinkPress} rules={rules}>
      {processed}
    </Markdown>
  );
}

function createMarkdownStyles(colors: ThemeColors, opts: { dimmed?: boolean; fit?: boolean; accentTerms?: boolean } = {}) {
  const { dimmed, fit = true, accentTerms = false } = opts;
  const textColor = dimmed ? colors.textSecondary : colors.text;

  return {
    body: {
      ...TYPOGRAPHY.body,
      color: textColor,
      lineHeight: 20,
      flexShrink: 1,
    },
    heading1: {
      ...TYPOGRAPHY.h2,
      fontWeight: '600' as const,
      color: textColor,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    heading2: {
      ...TYPOGRAPHY.h2,
      color: textColor,
      marginTop: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    heading3: {
      ...TYPOGRAPHY.h3,
      fontWeight: '600' as const,
      color: textColor,
      marginTop: SPACING.xs,
      marginBottom: 2,
    },
    heading4: {
      ...TYPOGRAPHY.h3,
      color: textColor,
      marginTop: SPACING.xs,
      marginBottom: 2,
    },
    strong: {
      fontWeight: '700' as const,
      ...(accentTerms ? { color: colors.primary } : {}),
    },
    em: {
      fontStyle: 'italic' as const,
    },
    s: {
      textDecorationLine: 'line-through' as const,
    },
    code_inline: {
      fontFamily: FONTS.mono,
      fontSize: 13,
      backgroundColor: colors.surfaceLight,
      color: colors.primary,
      paddingHorizontal: 4,
      paddingVertical: 1,
      borderRadius: 3,
      // Override default border
      borderWidth: 0,
    },
    fence: {
      fontFamily: FONTS.mono,
      fontSize: 12,
      backgroundColor: colors.surfaceLight,
      color: textColor,
      borderRadius: 6,
      padding: SPACING.md,
      marginVertical: SPACING.sm,
      borderWidth: 0,
    },
    code_block: {
      fontFamily: FONTS.mono,
      fontSize: 12,
      backgroundColor: colors.surfaceLight,
      color: textColor,
      borderRadius: 6,
      padding: SPACING.md,
      marginVertical: SPACING.sm,
      borderWidth: 0,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      paddingLeft: SPACING.md,
      marginLeft: 0,
      marginVertical: SPACING.sm,
      backgroundColor: colors.surfaceLight,
      borderRadius: 0,
      paddingVertical: SPACING.xs,
    },
    bullet_list: {
      marginVertical: SPACING.xs,
    },
    ordered_list: {
      marginVertical: SPACING.xs,
    },
    list_item: {
      marginVertical: 4,
    },
    // Tables
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 4,
      marginVertical: SPACING.sm,
    },
    thead: {
      backgroundColor: colors.surfaceLight,
    },
    // Fit to screen: every column the same width, the text wrapped and a little smaller. Wide view: a readable width each, scrolled sideways.
    th: {
      ...(fit ? { flex: 1, flexBasis: 0, minWidth: 0, fontSize: 13 } : { minWidth: 110 }),
      padding: fit ? SPACING.xs + 2 : SPACING.sm,
      borderWidth: 0.5,
      borderColor: colors.border,
      fontWeight: '600' as const,
    },
    td: {
      ...(fit ? { flex: 1, flexBasis: 0, minWidth: 0, fontSize: 13 } : { minWidth: 110 }),
      padding: fit ? SPACING.xs + 2 : SPACING.sm,
      borderWidth: 0.5,
      borderColor: colors.border,
    },
    tr: {
      borderBottomWidth: 0.5,
      borderColor: colors.border,
    },
    hr: {
      backgroundColor: colors.border,
      height: 1,
      marginVertical: SPACING.md,
    },
    link: {
      color: colors.primary,
      textDecorationLine: 'underline' as const,
    },
    paragraph: {
      marginTop: 0,
      marginBottom: SPACING.sm,
    },
    // Image (unlikely in LLM text but handle gracefully)
    image: {
      borderRadius: 6,
      maxWidth: '100%' as const,
    },
  };
}
