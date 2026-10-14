import { adjustTextStyle, installTextAppearance, setTextAppearance, textAppearanceFor } from '../../../src/theme/globalText';
import React from 'react';
import { create, act } from 'react-test-renderer';

const NEUTRAL = textAppearanceFor(undefined);

describe('global text appearance', () => {
  afterEach(() => act(() => setTextAppearance(NEUTRAL)));

  it('leaves text alone with the default font and size', () => {
    const style = { fontSize: 16 };
    expect(adjustTextStyle(style, NEUTRAL)).toBe(style);
  });

  it('scales inline sizes and line heights and follows the chosen font', () => {
    const a = textAppearanceFor({ font: 'mono', textSize: 'xlarge' });
    expect(adjustTextStyle({ fontSize: 20, lineHeight: 30 }, a)).toMatchObject({ fontSize: 26, lineHeight: 39, fontFamily: 'monospace' });
    // Text with no size at all uses React Native's 14 default.
    expect(adjustTextStyle([{ color: 'red' }], a)).toMatchObject({ fontSize: Math.round(14 * 1.3), color: 'red' });
  });

  it('keeps code in its own monospace face and maps serif headings to the chosen heading font', () => {
    const a = textAppearanceFor({ font: 'sans', textSize: 'normal' });
    expect(adjustTextStyle({ fontFamily: 'monospace' }, a)).toMatchObject({ fontFamily: 'monospace' });
    expect(adjustTextStyle({ fontFamily: 'serif' }, a)).toMatchObject({ fontFamily: 'sans-serif' });
  });

  it('re-renders text that is already on screen when the choice changes', () => {
    const seen: unknown[] = [];
    // A stand-in for React Native's forwardRef Text: records the style it is asked to draw.
    const Fake: any = { render: (props: any) => { seen.push(props.style); return null; } };
    installTextAppearance([Fake]);
    const View = () => React.createElement(() => Fake.render({ style: { fontSize: 10 } }, null));
    let tree: any;
    act(() => { tree = create(React.createElement(View)); });
    expect(seen[seen.length - 1]).toEqual({ fontSize: 10 });
    act(() => setTextAppearance(textAppearanceFor({ textSize: 'large' })));
    expect(seen[seen.length - 1]).toMatchObject({ fontSize: 12 });
    act(() => tree.unmount());
  });
});
