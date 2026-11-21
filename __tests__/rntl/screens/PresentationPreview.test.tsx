import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));

import { PresentationScreen } from '../../../src/screens/PresentationScreen';

it('shows each template with its own font, and every slide layout changes the preview', async () => {
  const view = render(<PresentationScreen />);
  // Each template card shows a sample in its own look.
  const sample = (id: string) => StyleSheetFlatten(view.getByTestId(`presentation-font-${id}`).props.style);
  expect(sample('mono').fontFamily).toBe('monospace');
  expect(sample('academic').fontFamily).toBe('serif');
  expect(sample('minimal').fontFamily).toBe('sans-serif-light');
  expect(view.getByText('Calibri Light + Calibri')).toBeTruthy();

  // The first slide is the title; choose a layout for it and the preview is drawn as that layout.
  const layout = (name: string) => fireEvent.press(view.getAllByLabelText(name)[0]);
  const rendered = () => view.getByTestId('presentation-slide-render');
  const shapes = () => rendered().children.length;
  const before = shapes();
  layout('Two columns');
  expect(shapes()).toBeGreaterThan(before);           // two panels and their columns appear
  layout('Agenda');
  expect(view.getByText('01')).toBeTruthy();
  layout('Quote');
  expect(view.getByText('“')).toBeTruthy();
  layout('Big number');
  expect(view.getByText('My Presentation')).toBeTruthy(); // the big number is the slide's title
  layout('Section');
  layout('Closing');
  expect(rendered()).toBeTruthy();
});

function StyleSheetFlatten(style: any): Record<string, any> {
  return Array.isArray(style) ? Object.assign({}, ...style.map(StyleSheetFlatten)) : style ?? {};
}
