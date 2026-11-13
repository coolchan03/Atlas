/** Colours of the Home tiles, by name: a light tint, a dark tint and two accents (light mode, dark mode). One place, so a tile never carries its own colours. */
export interface TileColors { tint: string; tintDark: string; color: [string, string] }
export const TILE: Record<'sky' | 'blue' | 'amber' | 'violet' | 'teal' | 'green' | 'red' | 'rose' | 'pink' | 'cyan', TileColors> = {
  sky: { tint: '#DBF0FF', tintDark: '#12283A', color: ['#1D4ED8', '#60A5FA'] },
  blue: { tint: '#E6EEFB', tintDark: '#14243D', color: ['#1D4ED8', '#60A5FA'] },
  amber: { tint: '#FFF0D4', tintDark: '#33260F', color: ['#B3620F', '#F2A93B'] },
  violet: { tint: '#EDE5FF', tintDark: '#241A3D', color: ['#6D28D9', '#A78BFA'] },
  teal: { tint: '#E4F2F0', tintDark: '#10302C', color: ['#0F766E', '#2DD4BF'] },
  green: { tint: '#E1F6E8', tintDark: '#12291C', color: ['#047857', '#34D399'] },
  red: { tint: '#FDE7E2', tintDark: '#3A1A15', color: ['#B91C1C', '#F87171'] },
  rose: { tint: '#FBE8F0', tintDark: '#381827', color: ['#BE185D', '#F472B6'] },
  pink: { tint: '#FFE4EF', tintDark: '#321422', color: ['#9D174D', '#F472B6'] },
  cyan: { tint: '#E6EEFB', tintDark: '#14243D', color: ['#0E7490', '#22D3EE'] },
};
