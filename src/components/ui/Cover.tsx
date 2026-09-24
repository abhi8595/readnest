import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { BookFormat } from '@/db/schema';
import { Icon } from './Icon';

/** Book cover with generated-spine fallback (initials + format badge). */
export function Cover({ uri, title, format, width = 120, ratio = 1.5 }: {
  uri: string | null; title: string | null; format: BookFormat; width?: number; ratio?: number;
}) {
  const { palette } = useTheme();
  const [failed, setFailed] = useState(false);
  const height = width * ratio;
  const showImg = uri && !failed;

  return (
    <View
      style={{
        width, height, borderRadius: 8, overflow: 'hidden',
        backgroundColor: showImg ? palette.surface2 : palette.coverBg,
        borderWidth: 1, borderColor: palette.border,
        ...(width >= 100
          ? { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 }
          : {}),
      }}
    >
      {showImg ? (
        <Image
          source={{ uri: uri as string }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityLabel={title ? `Cover of ${title}` : 'Book cover'}
        />
      ) : (
        <View style={{ flex: 1, padding: 8, justifyContent: 'space-between' }}>
          {/* spine highlight + hinge shadow */}
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: 'rgba(255,255,255,0.30)' }} />
          <View style={{ position: 'absolute', left: 3, top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.14)' }} />
          {/* bottom shade for depth */}
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%', backgroundColor: 'rgba(0,0,0,0.10)' }} />
          <Icon name="BookOpen" size={20} color={palette.onCoverBg} />
          <Text
            numberOfLines={4}
            style={{ color: palette.onCoverBg, fontSize: width > 100 ? 13 : 11, fontWeight: '700', fontFamily: 'CrimsonPro', lineHeight: 16 }}
          >
            {title ?? 'Untitled'}
          </Text>
          <Text style={{ color: palette.onCoverBg, fontSize: 10, fontWeight: '600', opacity: 0.85, fontFamily: 'Inter' }}>
            {format.toUpperCase()}
          </Text>
        </View>
      )}
    </View>
  );
}
