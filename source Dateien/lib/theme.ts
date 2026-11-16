import { useColorScheme } from 'react-native';

export type ThemeMode = 'system' | 'dark' | 'light';

export type Palette = {
  dark: boolean;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentSoft: string;
  green: string;
  greenSoft: string;
  blue: string;
  blueSoft: string;
  yellow: string;
  yellowSoft: string;
  red: string;
  redSoft: string;
  danger: string;
  overlay: string;
};

const dark: Palette = {
  dark: true,
  bg: '#08080A',
  surface: '#121216',
  surfaceAlt: '#1A1A20',
  border: '#26262E',
  text: '#F4F4F6',
  muted: '#A1A1AC',
  faint: '#6E6E78',
  accent: '#05DF72',
  accentSoft: 'rgba(5,223,114,0.14)',
  green: '#05DF72',
  greenSoft: 'rgba(5,223,114,0.14)',
  blue: '#54A2FF',
  blueSoft: 'rgba(84,162,255,0.14)',
  yellow: '#FAC800',
  yellowSoft: 'rgba(250,200,0,0.14)',
  red: '#FF6568',
  redSoft: 'rgba(255,101,104,0.14)',
  danger: '#FF6568',
  overlay: 'rgba(0,0,0,0.65)',
};

const light: Palette = {
  dark: false,
  bg: '#F5F5F7',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEFF3',
  border: '#DEDEE5',
  text: '#101014',
  muted: '#5A5A66',
  faint: '#8A8A96',
  accent: '#00A854',
  accentSoft: 'rgba(0,168,84,0.12)',
  green: '#00A854',
  greenSoft: 'rgba(0,168,84,0.12)',
  blue: '#1447E6',
  blueSoft: 'rgba(20,71,230,0.10)',
  yellow: '#A36100',
  yellowSoft: 'rgba(163,97,0,0.12)',
  red: '#BF000F',
  redSoft: 'rgba(191,0,15,0.10)',
  danger: '#BF000F',
  overlay: 'rgba(16,16,20,0.45)',
};

export function paletteFor(mode: ThemeMode, system: 'light' | 'dark' | null | undefined): Palette {
  const resolved = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  return resolved === 'light' ? light : dark;
}

export function useSystemScheme() {
  return useColorScheme();
}

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export function shadow(color: string, opacity = 0.35, radiusValue = 16, elevation = 6) {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radiusValue,
    shadowOffset: { width: 0, height: elevation / 2 },
    elevation,
  };
}
