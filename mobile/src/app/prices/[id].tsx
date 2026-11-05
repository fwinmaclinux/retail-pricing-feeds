import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AuditEntry, PriceRecord } from '@/api/types';
import { Button, Card, KeyValue, Notice, SectionTitle } from '@/components/ui';
import { EditPriceForm } from '@/features/prices/EditPriceForm';
import { usePrice, usePriceHistory } from '@/features/prices/hooks';
import { colors, font, radius, spacing } from '@/theme';
import { formatDate, formatDateTime, formatMoney } from '@/utils/format';

const ACTION_LABEL: Record<AuditEntry['action'], { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  CREATED: { label: 'Created from feed', icon: 'add-circle-outline' },
  FEED_UPDATE: { label: 'Updated by feed', icon: 'cloud-download-outline' },
  MANUAL_EDIT: { label: 'Edited', icon: 'create-outline' },
};

export default function PriceRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const record = usePrice(id);
  const history = usePriceHistory(id);
  const [editing, setEditing] = useState(false);

  if (record.isPending) return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />;
  if (record.isError) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Notice tone="danger" title="Couldn't load this record" message={record.error.message} />
      </View>
    );
  }
  const r = record.data;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
        <Card>
          <Text style={font.caption}>
            {r.storeName} · {r.storeId} · {r.countryCode}
          </Text>
          <Text style={[font.heading, { fontSize: 20 }]}>{r.productName}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.price} testID="record-price">
              {formatMoney(r.price, r.currency)}
            </Text>
            <View style={styles.skuPill}>
              <Text style={styles.skuText}>{r.sku}</Text>
            </View>
          </View>
          <KeyValue label="Effective date" value={formatDate(r.effectiveDate)} />
          <KeyValue label="Last change" value={`${r.sourceFeedId ? 'Feed upload' : 'Manual edit'} by ${r.updatedBy}`} />
          <KeyValue label="Updated" value={formatDateTime(r.updatedAt)} />
          <KeyValue label="Version" value={String(r.version)} />
        </Card>

        {editing ? (
          <Card>
            <EditPriceForm record={r} onDone={() => setEditing(false)} />
          </Card>
        ) : (
          <Button title="Edit price record" icon="create-outline" onPress={() => setEditing(true)} testID="edit-button" />
        )}

        <SectionTitle>Change history</SectionTitle>
        <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
          {history.isPending && <ActivityIndicator color={colors.primary} />}
          {history.data?.map((h, i) => (
            <HistoryItem key={h.auditId} entry={h} record={r} last={i === history.data.length - 1} />
          ))}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function HistoryItem({ entry, record, last }: { entry: AuditEntry; record: PriceRecord; last: boolean }) {
  const meta = ACTION_LABEL[entry.action];
  const priceChanged = entry.oldValues && entry.oldValues.price !== entry.newValues.price;
  const nameChanged = entry.oldValues && entry.oldValues.productName !== entry.newValues.productName;
  return (
    <View style={[styles.historyItem, !last && styles.historyDivider]}>
      <Ionicons name={meta.icon} size={18} color={entry.action === 'MANUAL_EDIT' ? colors.primary : colors.textMuted} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={font.bodyStrong}>
          {meta.label} · v{entry.version}
        </Text>
        {entry.oldValues === null && <Text style={font.body}>{formatMoney(entry.newValues.price, record.currency)}</Text>}
        {priceChanged && (
          <Text style={font.body}>
            {formatMoney(entry.oldValues!.price, record.currency)} → {formatMoney(entry.newValues.price, record.currency)}
          </Text>
        )}
        {nameChanged && (
          <Text style={font.caption}>
            Name: "{entry.oldValues!.productName}" → "{entry.newValues.productName}"
          </Text>
        )}
        {entry.changeReason && <Text style={[font.caption, { fontStyle: 'italic' }]}>"{entry.changeReason}"</Text>}
        <Text style={font.caption}>
          {entry.changedBy} · {formatDateTime(entry.changedAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  price: { fontSize: 32, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  skuPill: { backgroundColor: colors.background, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  skuText: { ...font.mono, color: colors.text },
  historyItem: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  historyDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
