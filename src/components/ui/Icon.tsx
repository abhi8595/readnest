import React from 'react';
import * as icons from 'lucide-react-native/icons';
import type { LucideIcon } from 'lucide-react-native';
import { iconSize, iconStroke } from '@/theme/tokens';

export type IconName = keyof typeof icons;

interface Props {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: string;
  strokeWidth?: number;
  /** decorative by default → hidden from a11y tree; pass label when meaningful */
  accessibilityLabel?: string;
}

/** Single Lucide gateway: consistent family, strokeWidth 1.5, token sizes. */
export function Icon({ name, size = 'md', color = 'currentColor', strokeWidth = iconStroke, accessibilityLabel }: Props) {
  // eslint-disable-next-line import/namespace -- dynamic icon gateway is the design
  const Cmp = icons[name] as LucideIcon;
  const resolved = typeof size === 'number' ? size : iconSize[size];
  return (
    <Cmp
      size={resolved}
      color={color}
      strokeWidth={strokeWidth}
      aria-hidden={accessibilityLabel ? undefined : true}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
