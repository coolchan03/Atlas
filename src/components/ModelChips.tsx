import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import { useAppStore } from '../stores/appStore';

/** Horizontal chip picker of downloaded text models. '' = "Current model". */
export function ModelChips({ value, onChange, colors, emptyLabel = 'Current model', disabled }: {
  value: string; onChange: (id: string) => void; colors: any; emptyLabel?: string; disabled?: boolean;
}) {
  const models = useAppStore((s) => s.downloadedModels);
  const items = [{ id: '', name: emptyLabel }, ...models.map((m) => ({ id: m.id, name: m.name }))];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
      {items.map((m) => {
        const on = m.id === value;
        return (
          <TouchableOpacity
            key={m.id || 'current'}
            disabled={disabled}
            onPress={() => onChange(m.id)}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, marginRight: 8, backgroundColor: on ? colors.primary : colors.surface, maxWidth: 260 }}
          >
            <Text numberOfLines={1} style={{ color: on ? '#fff' : colors.text, fontSize: 13 }}>{m.name}</Text>
          </TouchableOpacity>
        );
      })}
      {models.length === 0 && <Text style={{ color: colors.textMuted, fontSize: 13, paddingVertical: 7 }}>No models downloaded yet.</Text>}
    </ScrollView>
  );
}
