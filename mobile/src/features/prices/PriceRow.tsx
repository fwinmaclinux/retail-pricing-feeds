import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PriceRecord } from '@/api/types';
import { colors, font, spacing } from '@/theme';
import { formatDate, formatMoney } from '@/utils/format';

export const PriceRow = memo(function PriceRow({ record, onPress }: { record: PriceRecord; onPress: (id: string) => void }) {
  const edited = record.version > 1 && record.sourceFeedId === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${record.productName}, ${formatMoney(record.price, record.currency)}, ${record.storeName}, ${record.countryCode}, effective ${formatDate(record.effectiveDate)}`}
      onPress={() => onPress(record.id)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.bodyStrong} numberOfLines={1}>
          {record.productName}
        </Text>
        <Text style={font.caption} numberOfLines={1}>
          {record.sku} · {record.storeName} ({record.countryCode})
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text style={styles.price}>{formatMoney(record.price, record.currency)}</Text>
        <Text style={font.caption}>
          {edited ? '✎ ' : ''}
          {formatDate(record.effectiveDate)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  price: { fontSize: 16, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});
