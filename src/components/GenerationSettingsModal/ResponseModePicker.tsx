import React from 'react';
import { ChipPicker } from './ChatPickers';
import { useAppStore } from '../../stores';
import { RESPONSE_MODES, modeOf, settingsFor, type ResponseMode } from '../../services/responseMode';

/** Quick, Balanced or Deep: sets existing settings in one tap. Shows "Custom" once any of them has been changed by hand. */
export const ResponseModePicker: React.FC = () => {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const mode = modeOf(settings);
  const hint = RESPONSE_MODES.find((m) => m.id === mode)?.hint ?? 'Your own settings. Pick a mode to replace them.';
  return (
    <ChipPicker
      title={`How it answers: ${mode === 'custom' ? 'Custom' : RESPONSE_MODES.find((m) => m.id === mode)?.name}. ${hint}`}
      active={mode}
      onChoose={(id) => updateSettings(settingsFor(id as ResponseMode))}
      options={RESPONSE_MODES.map((m) => ({ id: m.id, label: m.name }))}
    />
  );
};
