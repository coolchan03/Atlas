import React from 'react';
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from 'react-native-svg';

// The dial is a fixed black-and-white instrument so it reads the same in every theme.
export const DIAL_INK = '#FFFFFF';
const DIAL_DIM = '#9A9A9A';
const DIAL_BUBBLE = 'rgba(255,255,255,0.22)';
const TARGET = '#34D399';

interface Props {
  size: number;
  /** Which way the top of the phone faces, in degrees. The ring turns the other way. */
  heading: number;
  /** The red north marker and the pointer; red in daylight, brighter red at night. */
  accent: string;
  /** Bearing to a chosen saved place, or null. */
  target: number | null;
  /** Phone tilt in degrees, which slides the bubble the way a level does. */
  tilt: { pitch: number; roll: number } | null;
}

const point = (c: number, radius: number, angle: number) => {
  const a = (angle * Math.PI) / 180;
  return { x: c + radius * Math.sin(a), y: c - radius * Math.cos(a) };
};

const LABEL_DEGREES = Array.from({ length: 12 }, (_, i) => i * 30);
const TICK_DEGREES = Array.from({ length: 180 }, (_, i) => i * 2);
const CARDINALS: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];

/** The ring of the old iOS compass: fine ticks, a number every 30 degrees, N E S W inside, a bubble and a crosshair. */
export const CompassDial: React.FC<Props> = ({ size, heading, accent, target, tilt }) => {
  const c = size / 2;
  const ring = size * 0.33;
  const bubbleOffset = (v: number) => Math.max(-ring * 0.45, Math.min(ring * 0.45, v * 3));
  const bx = c + (tilt ? bubbleOffset(tilt.roll) : 0);
  const by = c + (tilt ? bubbleOffset(tilt.pitch) : 0);
  return (
    <Svg width={size} height={size} testID="compass-dial">
      {TICK_DEGREES.map((deg) => {
        const major = deg % 30 === 0;
        const from = point(c, ring, deg - heading);
        const to = point(c, ring + (major ? size * 0.05 : size * 0.035), deg - heading);
        return <Line key={deg} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={major ? DIAL_INK : DIAL_DIM} strokeWidth={major ? 3 : 1} />;
      })}
      {LABEL_DEGREES.map((deg) => {
        const at = point(c, ring + size * 0.105, deg - heading);
        return <SvgText key={deg} x={at.x} y={at.y + size * 0.02} fill={DIAL_INK} fontSize={size * 0.045} fontWeight="300" textAnchor="middle">{deg}</SvgText>;
      })}
      {CARDINALS.map(([letter, deg]) => {
        const at = point(c, ring * 0.66, deg - heading);
        return <SvgText key={letter} x={at.x} y={at.y + size * 0.03} fill={DIAL_INK} fontSize={size * 0.075} textAnchor="middle">{letter}</SvgText>;
      })}
      <G rotation={-heading} origin={`${c}, ${c}`}>
        <Polygon points={`${c - 7},${c - ring - size * 0.07} ${c + 7},${c - ring - size * 0.07} ${c},${c - ring - size * 0.01}`} fill={accent} />
      </G>
      {target !== null && (
        <G rotation={target - heading} origin={`${c}, ${c}`}>
          <Polygon points={`${c - 8},${c - ring + size * 0.02} ${c + 8},${c - ring + size * 0.02} ${c},${c - ring + size * 0.075}`} fill={TARGET} />
        </G>
      )}
      <Line x1={c - ring * 0.8} y1={c} x2={c + ring * 0.8} y2={c} stroke={DIAL_DIM} strokeWidth={1} />
      <Line x1={c} y1={c - ring * 0.8} x2={c} y2={c + ring * 0.8} stroke={DIAL_DIM} strokeWidth={1} />
      <Circle cx={bx} cy={by} r={ring * 0.32} fill={DIAL_BUBBLE} />
      <Line x1={bx - 9} y1={by} x2={bx + 9} y2={by} stroke={DIAL_INK} strokeWidth={1} />
      <Line x1={bx} y1={by - 9} x2={bx} y2={by + 9} stroke={DIAL_INK} strokeWidth={1} />
      {/* The pointer: the direction the top of the phone faces. */}
      <Line x1={c} y1={c - ring - size * 0.14} x2={c} y2={c - ring + size * 0.01} stroke={DIAL_INK} strokeWidth={4} />
    </Svg>
  );
};
