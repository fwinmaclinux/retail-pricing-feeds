import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PriceRecord, SearchCriteria } from '@/api/types';
import { useUser } from '@/auth/SessionProvider';
import { Button, Chip, EmptyState, Notice, OfflineBanner } from '@/components/ui';
import { activeFilterCount, EMPTY_FILTERS, FilterSheet, SORT_LABELS } from '@/features/prices/FilterSheet';
import { usePriceSearch, useStores } from '@/features/prices/hooks';
import { PriceRow } from '@/features/prices/PriceRow';
import { colors, font, radius, spacing } from '@/theme';
import { currencySymbol, formatDate } from '@/utils/format';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export default function SearchScreen() {
  const user = useUser();
  const stores = useStores();
  const [text, setText] = useState('');
  const [filters, setFilters] = useState<SearchCriteria>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const q = useDebounced(text.trim(), 350);

  const criteria = useMemo<SearchCriteria>(() => ({ ...filters, q: q || undefined }), [filters, q]);
  const search = usePriceSearch(criteria);
  const items = useMemo(() => search.data?.pages.flatMap((p) => p.items) ?? [], [search.data]);

  const storeList = stores.data ?? [];
  const storeName = (id?: string) => storeList.find((s) => s.storeId === id)?.name ?? id;
  const currency = filters.storeId
    ? storeList.find((s) => s.storeId === filters.storeId)?.currency
    : new Set(storeList.map((s) => s.currency)).size === 1
      ? storeList[0]?.currency
      : undefined;

  const scope =
    user.role === 'PRICING_ADMIN'
      ? 'All countries'
      : user.role === 'PRICING_ANALYST'
        ? `countries ${user.countryCodes.join(', ')}`
        : storeName(user.storeIds[0]);

  const openRecord = useCallback((id: string) => router.push({ pathname: '/prices/[id]', params: { id } }), []);
  const clear = (patch: Partial<SearchCriteria>) => setFilters((f) => ({ ...f, ...patch }));
  const filterCount = activeFilterCount(filters);

  const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (filters.countryCode) chips.push({ key: 'country', label: `Country: ${filters.countryCode}`, onClear: () => clear({ countryCode: undefined }) });
  if (filters.storeId) chips.push({ key: 'store', label: storeName(filters.storeId) ?? '', onClear: () => clear({ storeId: undefined }) });
  if (filters.minPrice || filters.maxPrice) {
    const sym = currency ? currencySymbol(currency) : '';
    chips.push({
      key: 'price',
      label: `${filters.minPrice ? sym + filters.minPrice : 'Any'} – ${filters.maxPrice ? sym + filters.maxPrice : 'Any'}`,
      onClear: () => clear({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      key: 'date',
      label: `${filters.dateFrom ? formatDate(filters.dateFrom) : '…'} → ${filters.dateTo ? formatDate(filters.dateTo) : 'today'}`,
      onClear: () => clear({ dateFrom: undefined, dateTo: undefined }),
    });
  }

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <View style={styles.top}>
        <Text style={font.caption}>Showing prices for {scope}</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textSubtle} />
          <TextInput
            testID="search-input"
            value={text}
            onChangeText={setText}
            placeholder="Search product name or SKU"
            placeholderTextColor={colors.textSubtle}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel="Search product name or SKU"
            clearButtonMode="while-editing"
          />
          {search.isFetching && !search.isFetchingNextPage && <ActivityIndicator size="small" color={colors.primary} />}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
          <Chip label={filterCount ? `Filters · ${filterCount}` : 'Filters'} icon="options-outline" selected={filterCount > 0} onPress={() => setSheetOpen(true)} />
          <Chip label={SORT_LABELS[filters.sort]} icon="swap-vertical" onPress={() => setSheetOpen(true)} />
          {chips.map((c) => (
            <Chip key={c.key} label={`${c.label}  ✕`} selected onPress={c.onClear} />
          ))}
        </ScrollView>
      </View>

      {search.isError && !items.length ? (
        <View style={{ padding: spacing.lg }}>
          <Notice tone="danger" title="Couldn't load prices" message={search.error.message}>
            <Button title="Try again" variant="ghost" onPress={() => search.refetch()} style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} />
          </Notice>
        </View>
      ) : (
        <FlashList<PriceRecord>
          data={items}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <PriceRow record={item} onPress={openRecord} />}
          onEndReachedThreshold={0.6}
          onEndReached={() => {
            if (search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
          }}
          refreshControl={<RefreshControl refreshing={search.isRefetching && !search.isFetchingNextPage} onRefresh={() => void search.refetch()} />}
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            items.length ? (
              <Text style={styles.resultCount}>
                {items.length}
                {search.hasNextPage ? '+' : ''} records
              </Text>
            ) : null
          }
          ListEmptyComponent={
            search.isPending ? (
              <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
            ) : (
              <EmptyState
                icon="pricetag-outline"
                title="No prices match"
                message="Try a different product name or SKU, or remove some filters."
                action={
                  filterCount || text ? (
                    <Button
                      title="Clear search and filters"
                      variant="secondary"
                      onPress={() => {
                        setText('');
                        setFilters(EMPTY_FILTERS);
                      }}
                    />
                  ) : null
                }
              />
            )
          }
          ListFooterComponent={search.isFetchingNextPage ? <ActivityIndicator style={{ margin: spacing.lg }} color={colors.primary} /> : null}
        />
      )}

      <FilterSheet
        visible={sheetOpen}
        value={filters}
        stores={storeList}
        onClose={() => setSheetOpen(false)}
        onApply={(c) => {
          setFilters(c);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.md },
  resultCount: { ...font.caption, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
});
