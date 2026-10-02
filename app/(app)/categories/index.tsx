import { Stack, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Button, EmptyState, Icon, ListRow, Screen, Section, Skeleton } from '@/components/ui';
import { useArchiveCategory, useCategories, useReorderCategories, useSeedSuggestedCategories } from '@/features/categories/hooks';
import { useActiveHouse } from '@/features/houses/hooks';
import { describeSchedule } from '@/features/schedule/occurrences';
import { useT } from '@/i18n';
import { haptics } from '@/lib/haptics';
import { spacing, useTheme } from '@/theme';

export default function CategoriesScreen() {
  const { t, locale } = useT();
  const { colors } = useTheme();
  const router = useRouter();
  const { house, isAdmin } = useActiveHouse();
  const houseId = house?.id ?? '';
  const { data: categories = [], isLoading } = useCategories(house?.id);
  const archive = useArchiveCategory(houseId);
  const reorder = useReorderCategories(houseId);
  const seed = useSeedSuggestedCategories(houseId);

  const active = categories.filter((c) => c.isActive);
  const archived = categories.filter((c) => !c.isActive);

  const move = (index: number, dir: -1 | 1) => {
    const ids = active.map((c) => c.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    haptics.selection();
    reorder.mutate(ids);
  };

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: isAdmin
            ? () => (
                <Pressable accessibilityRole="button" accessibilityLabel={t('categories.new')} onPress={() => router.push('/categories/new')} hitSlop={12}>
                  <Icon name="plus" color={colors.tint} size={22} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.lg }}>
        {isLoading ? <Skeleton height={200} radius={12} /> : null}
        {!isLoading && categories.length === 0 ? (
          <EmptyState
            icon="folder"
            title={t('categories.empty')}
            actionLabel={isAdmin ? t('categories.seedSuggested') : undefined}
            onAction={isAdmin ? () => seed.mutate() : undefined}
          />
        ) : null}
        {active.length > 0 ? (
          <Section footer={isAdmin ? t('hub.categoryDeleteHint') : undefined}>
            {active.map((c, i) => (
              <ListRow
                key={c.id}
                icon={c.icon as never}
                iconColor={c.color}
                title={c.name}
                subtitle={describeSchedule(c, locale).full}
                chevron
                onPress={() => router.push({ pathname: '/categories/[id]', params: { id: c.id } })}
                swipeActions={isAdmin ? [{ label: t('categories.archive'), onPress: () => archive.mutate({ id: c.id, isActive: false }), destructive: true }] : undefined}
                trailing={
                  isAdmin ? (
                    <View style={{ flexDirection: 'row' }}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('hub.reorderUp')} onPress={() => move(i, -1)} hitSlop={8} style={{ padding: spacing.xs, opacity: i === 0 ? 0.3 : 1 }}>
                        <Icon name="arrowUp" size={16} color={colors.secondaryLabel} />
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('hub.reorderDown')} onPress={() => move(i, 1)} hitSlop={8} style={{ padding: spacing.xs, opacity: i === active.length - 1 ? 0.3 : 1 }}>
                        <Icon name="arrowDown" size={16} color={colors.secondaryLabel} />
                      </Pressable>
                    </View>
                  ) : undefined
                }
              />
            ))}
          </Section>
        ) : null}
        {archived.length > 0 ? (
          <Section header={t('hub.archivedSection')}>
            {archived.map((c) => (
              <ListRow
                key={c.id}
                icon="archive"
                title={c.name}
                subtitle={describeSchedule(c, locale).full}
                trailing={isAdmin ? <Button title={t('hub.unarchive')} variant="plain" fullWidth={false} onPress={() => archive.mutate({ id: c.id, isActive: true })} /> : undefined}
              />
            ))}
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}
