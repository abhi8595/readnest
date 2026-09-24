import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { darkPalette, lightPalette, type AppPalette, type ColorScheme } from './tokens';

interface ThemeCtx {
  scheme: ColorScheme;
  palette: AppPalette;
}

const Ctx = createContext<ThemeCtx>({ scheme: 'light', palette: lightPalette });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const appTheme = useSettingsStore((s) => s.appTheme);
  const [system, setSystem] = useState<ColorScheme>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  );

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystem(colorScheme === 'dark' ? 'dark' : 'light'),
    );
    return () => sub.remove();
  }, []);

  const scheme: ColorScheme = appTheme === 'system' ? system : appTheme;
  const value = useMemo<ThemeCtx>(
    () => ({ scheme, palette: scheme === 'dark' ? darkPalette : lightPalette }),
    [scheme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
