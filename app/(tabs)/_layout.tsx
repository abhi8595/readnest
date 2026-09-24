import React from 'react';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon, type IconName } from '@/components/ui/Icon';

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Icon name={name} size={22} color={color as string} strokeWidth={focused ? 2 : 1.5} />;
  };
}

export default function TabsLayout() {
  const { palette } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          minHeight: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Inter', fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Library', tabBarIcon: tabIcon('LibraryBig') }} />
      <Tabs.Screen name="catalogs" options={{ title: 'Catalogs', tabBarIcon: tabIcon('Globe') }} />
      <Tabs.Screen name="folders" options={{ title: 'Folders', tabBarIcon: tabIcon('FolderOpen') }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: tabIcon('Search') }} />
      <Tabs.Screen name="notes" options={{ title: 'Notes', tabBarIcon: tabIcon('Highlighter') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('Settings') }} />
    </Tabs>
  );
}
