// Favorites (principles and exercises): star button and toggle helper.
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useUserId } from '@/lib/auth/AuthProvider';
import { useFavorites } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme';

export type FavoriteType = 'exercise' | 'principle';

export function useFavoriteSet(type: FavoriteType): Set<string> {
  const favorites = useFavorites(useUserId()).data ?? [];
  return new Set(favorites.filter((f) => f.entity_type === type).map((f) => f.entity_id));
}

export function FavoriteButton({
  type,
  id,
  title,
}: {
  type: FavoriteType;
  id: string;
  title: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const userId = useUserId();
  const queryClient = useQueryClient();
  const active = useFavoriteSet(type).has(id);

  const toggle = async () => {
    if (active) {
      await supabase.from('favorites').delete().eq('entity_type', type).eq('entity_id', id);
    } else {
      await supabase
        .from('favorites')
        .insert({ user_id: userId, entity_type: type, entity_id: id });
    }
    await queryClient.invalidateQueries({ queryKey: ['favorites', userId] });
  };

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={t('library.favoriteFor', { title })}
      hitSlop={10}
      onPress={() => void toggle()}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5z"
          fill={active ? colors.momentum : 'none'}
          stroke={active ? colors.momentum : colors.textSecondary}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}
