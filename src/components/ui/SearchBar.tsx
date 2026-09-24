import React from 'react';
import { TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Icon } from './Icon';
import { Pressable } from './pressable';

export function SearchBar({ value, onChange, placeholder, autoFocus, onSubmit }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const { palette } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row', alignItems: 'center', backgroundColor: palette.surface2,
        borderRadius: 12, paddingHorizontal: 12, minHeight: 48, gap: 8,
        borderWidth: 1, borderColor: palette.border,
      }}
    >
      <Icon name="Search" size={20} color={palette.muted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={palette.muted}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        accessibilityLabel={placeholder}
        style={{ flex: 1, fontSize: 16, color: palette.foreground, fontFamily: 'Inter', paddingVertical: 10 }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="CircleX" size={20} color={palette.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
