import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SearchCriteria, SortOption, Store } from '@/api/types';
import { Button, Chip, Field } from '@/components/ui';
import { colors, font, spacing } from '@/theme';
import { isoDaysAgo } from '@/utils/format';

export const SORT_LABELS: Record<SortOption, string> = {
  'effectiveDate:desc': 'Newest first',
  'effectiveDate:asc': 'Oldest first',
  'price:asc': 'Price: low to high',
  'price:desc': 'Price: high to low',
  'sku:asc': 'SKU A-Z',
};

const DATE_PRESETS = [
  { label: 'Any date', from: undefined, to: undefined },
  { label: 'Last 7 days', from: () => isoDaysAgo(7), to: undefined },
  { label: 'Last 30 days', from: () => isoDaysAgo(30), to: undefined },
];

const DECIMAL = /^\d{0,10}(\.\d{0,4})?$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export const EMPTY_FILTERS: SearchCriteria = { sort: 'effectiveDate:desc' };

export function activeFilterCount(c: SearchCriteria): number {
  return [c.storeId, c.countryCode, c.minPrice || c.maxPrice, c.dateFrom || c.dateTo].filter(Boolean).length;
}

export function FilterSheet({
  visible,
  value,
  stores,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: SearchCriteria;
  stores: Store[];
  onApply: (c: SearchCriteria) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SearchCriteria>(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const countries = useMemo(() => [...new Set(stores.map((s) => s.countryCode))], [stores]);
  const visibleStores = draft.countryCode ? stores.filter((s) => s.countryCode === draft.countryCode) : stores;
  const set = (patch: Partial<SearchCriteria>) => setDraft((d) => ({ ...d, ...patch }));

  const errors = {
    minPrice: draft.minPrice && !DECIMAL.test(draft.minPrice) ? 'Enter an amount like 9.99' : undefined,
    maxPrice:
      draft.maxPrice && !DECIMAL.test(draft.maxPrice)
        ? 'Enter an amount like 9.99'
        : draft.minPrice && draft.maxPrice && Number(draft.minPrice) > Number(draft.maxPrice)
          ? 'Max must be at least min'
          : undefined,
    dateFrom: draft.dateFrom && !ISO.test(draft.dateFrom) ? 'Use YYYY-MM-DD' : undefined,
    dateTo: draft.dateTo && !ISO.test(draft.dateTo) ? 'Use YYYY-MM-DD' : undefined,
  };
  const valid = Object.values(errors).every((e) => !e);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom', 'top']}>
        <View style={styles.header}>
          <Button title="Cancel" variant="ghost" onPress={onClose} style={styles.headerButton} />
          <Text style={font.heading}>Filters</Text>
          <Button title="Reset" variant="ghost" onPress={() => setDraft({ ...EMPTY_FILTERS, q: draft.q })} style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {countries.length > 1 && (
            <Section title="Country">
              <Chip label="All" selected={!draft.countryCode} onPress={() => set({ countryCode: undefined, storeId: undefined })} />
              {countries.map((c) => (
                <Chip key={c} label={c} selected={draft.countryCode === c} onPress={() => set({ countryCode: c, storeId: undefined })} />
              ))}
            </Section>
          )}
          {stores.length > 1 && (
            <Section title="Store">
              <Chip label="All stores" selected={!draft.storeId} onPress={() => set({ storeId: undefined })} />
              {visibleStores.map((s) => (
                <Chip key={s.storeId} label={s.name} selected={draft.storeId === s.storeId} onPress={() => set({ storeId: s.storeId })} />
              ))}
            </Section>
          )}
          <Section title="Effective date">
            {DATE_PRESETS.map((p) => {
              const from = p.from?.();
              const selected = draft.dateFrom === from && !draft.dateTo;
              return <Chip key={p.label} label={p.label} selected={selected} onPress={() => set({ dateFrom: from, dateTo: undefined })} />;
            })}
          </Section>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field label="From" placeholder="YYYY-MM-DD" value={draft.dateFrom ?? ''} onChangeText={(t) => set({ dateFrom: t || undefined })} error={errors.dateFrom} autoCapitalize="none" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="To" placeholder="YYYY-MM-DD" value={draft.dateTo ?? ''} onChangeText={(t) => set({ dateTo: t || undefined })} error={errors.dateTo} autoCapitalize="none" />
            </View>
          </View>
          <Text style={[font.label, { marginTop: spacing.sm }]}>PRICE RANGE</Text>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <Field label="Min" placeholder="0.00" keyboardType="decimal-pad" value={draft.minPrice ?? ''} onChangeText={(t) => set({ minPrice: t.replace(',', '.') || undefined })} error={errors.minPrice} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Max" placeholder="Any" keyboardType="decimal-pad" value={draft.maxPrice ?? ''} onChangeText={(t) => set({ maxPrice: t.replace(',', '.') || undefined })} error={errors.maxPrice} />
            </View>
          </View>
          <Section title="Sort by">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
              <Chip key={s} label={SORT_LABELS[s]} selected={draft.sort === s} onPress={() => set({ sort: s })} />
            ))}
          </Section>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Show results" disabled={!valid} onPress={() => onApply(draft)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={font.label}>{title.toUpperCase()}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerButton: { minHeight: 44, paddingHorizontal: spacing.md },
  body: { padding: spacing.lg, gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.md },
  footer: { padding: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.surface },
});
