import React, { useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Text, View, type ViewToken } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/controls';
import { Pressable } from '@/components/ui/pressable';
import { Icon, type IconName } from '@/components/ui/Icon';

const SLIDES: { icon: IconName; title: string; desc: string }[] = [
  {
    icon: 'LibraryBig', title: 'Your whole library,\none cozy nest',
    desc: 'ReadNest finds your EPUBs, PDFs, comics and documents, and keeps them organized by author, series and collections. No sign-up needed.',
  },
  {
    icon: 'FolderOpen', title: 'Scan or import\nin seconds',
    desc: 'Grant a folder once and we index every supported file — or just pick files manually. Your books stay on your device.',
  },
  {
    icon: 'BookOpen', title: 'A reader that\nfeels like paper',
    desc: 'Warm themes, beautiful serif type, bookmarks, highlights, notes, dictionary and read-aloud. Day, Sepia, Night, Console and OLED.',
  },
  {
    icon: 'Feather', title: 'Quotes & notes,\nall in one place',
    desc: 'Everything you highlight across every book lands in one searchable hub. Export and revisit your best lines anytime.',
  },
];

export default function Onboarding() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const set = useSettingsStore((s) => s.set);
  const [index, setIndex] = useState(0);
  const ref = useRef<FlatList>(null);
  const { width } = Dimensions.get('window');

  const finish = () => {
    set({ onboarded: true });
    router.replace('/(tabs)');
  };

  const onViewable = ({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.background, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('@/assets/icon.png')} style={{ width: 32, height: 32, borderRadius: 10 }} accessibilityLabel="ReadNest logo" />
          <Text style={{ fontSize: 18, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro' }}>ReadNest</Text>
        </View>
        <Pressable onPress={finish} accessibilityRole="button" accessibilityLabel="Skip onboarding" style={{ padding: 10 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: palette.muted, fontFamily: 'Inter' }}>Skip</Text>
        </Pressable>
      </View>

      <FlatList
        ref={ref}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScrollToIndexFailed={() => {}}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 32, justifyContent: 'center', gap: 16 }}>
            <View style={{ width: 96, height: 96, borderRadius: 28, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 }}>
              <Icon name={item.icon} size={44} color={palette.primary} />
            </View>
            <Text style={{ fontSize: 32, fontWeight: '800', color: palette.foreground, fontFamily: 'CrimsonPro', lineHeight: 38 }}>
              {item.title}
            </Text>
            <Text style={{ fontSize: 16, color: palette.muted, fontFamily: 'Inter', lineHeight: 25 }}>
              {item.desc}
            </Text>
          </View>
        )}
      />

      <View style={{ paddingHorizontal: 24, paddingBottom: Math.max(insets.bottom, 20), gap: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>
          {SLIDES.map((_, i) => (
            <View key={i} style={{ width: i === index ? 24 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? palette.primary : palette.border }} />
          ))}
        </View>
        {index < SLIDES.length - 1 ? (
          <Button
            title="Continue"
            onPress={() => ref.current?.scrollToIndex({ index: index + 1, animated: true })}
          />
        ) : (
          <View style={{ gap: 10 }}>
            <Button title="Build my library" icon="Sparkles" onPress={finish} />
            <Text style={{ fontSize: 12, color: palette.faint, fontFamily: 'Inter', textAlign: 'center' }}>
              Free forever for core reading · No account required
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
