import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, KeyValue, Notice, OfflineBanner, ProgressBar, SectionTitle } from '@/components/ui';
import { COLUMN_LABELS, FEED_COLUMNS, type CsvPreview } from '@/features/feeds/csvPreview';
import { buildSampleFeed } from '@/features/feeds/sampleFeed';
import { useFeedUpload } from '@/features/feeds/useFeedUpload';
import { useStores } from '@/features/prices/hooks';
import { colors, font, radius, spacing } from '@/theme';
import { formatBytes, formatCount } from '@/utils/format';

const SAMPLE_MULTIPLIER: Record<string, number> = { INR: 85, JPY: 150, AED: 3.7, SGD: 1.35, EUR: 0.95, GBP: 0.8, USD: 1 };

export default function UploadScreen() {
  const stores = useStores();
  const knownStoreIds = useMemo(() => (stores.data ? new Set(stores.data.map((s) => s.storeId)) : undefined), [stores.data]);
  const onUploaded = useCallback((feedId: string) => router.push({ pathname: '/feeds/[id]', params: { id: feedId } }), []);
  const { state, pickFile, loadText, upload, cancel, reset, retry } = useFeedUpload(knownStoreIds, onUploaded);

  const useSample = () => {
    const store = stores.data?.[0];
    if (!store) return;
    const sample = buildSampleFeed(store.storeId, SAMPLE_MULTIPLIER[store.currency] ?? 1);
    loadText(sample.name, sample.text, sample.text.length);
  };

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      <ScrollView contentContainerStyle={styles.container}>
        {(state.step === 'idle' || state.step === 'reading') && (
          <>
            <Card>
              <View style={styles.hero}>
                <Ionicons name="document-text-outline" size={28} color={colors.primary} />
              </View>
              <Text style={font.heading}>Upload a pricing feed</Text>
              <Text style={font.caption}>
                CSV exported from your store system. Rows are checked on this device first, then validated and loaded by the
                pricing service. Valid rows load even if some rows are rejected.
              </Text>
              <View style={styles.columns}>
                {FEED_COLUMNS.map((c) => (
                  <View key={c} style={styles.columnPill}>
                    <Text style={styles.columnText}>{COLUMN_LABELS[c]}</Text>
                  </View>
                ))}
              </View>
              <Text style={font.caption}>Dates as YYYY-MM-DD · '.' for decimals · up to 50 MB</Text>
            </Card>
            <Button title="Choose CSV file" icon="folder-open-outline" onPress={pickFile} loading={state.step === 'reading'} testID="pick-file" />
            <Button title="Use a sample feed" variant="ghost" icon="flask-outline" onPress={useSample} disabled={!stores.data} testID="use-sample" />
          </>
        )}

        {(state.step === 'ready' || state.step === 'uploading') && (
          <PreviewCard
            fileName={state.file.name}
            sizeBytes={state.file.sizeBytes}
            preview={state.preview}
            uploading={state.step === 'uploading'}
            progress={state.step === 'uploading' ? state.progress : 0}
            onUpload={upload}
            onCancel={cancel}
            onChooseAnother={reset}
          />
        )}

        {state.step === 'duplicate' && (
          <Notice tone="info" title="Already uploaded" message={`"${state.file.name}" has exactly the same content as an earlier upload, so it was not applied again.`}>
            <View style={styles.inlineActions}>
              <Button title="View that feed" variant="secondary" onPress={() => router.push({ pathname: '/feeds/[id]', params: { id: state.feedId } })} style={{ minHeight: 36 }} />
              <Button title="Upload another" variant="ghost" onPress={reset} style={{ minHeight: 36 }} />
            </View>
          </Notice>
        )}

        {state.step === 'error' && (
          <Notice tone="danger" title="Upload problem" message={state.message}>
            <View style={styles.inlineActions}>
              <Button title={state.file ? 'Try again' : 'Choose another file'} variant="secondary" onPress={retry} style={{ minHeight: 36 }} />
            </View>
          </Notice>
        )}
      </ScrollView>
    </View>
  );
}

function PreviewCard({
  fileName,
  sizeBytes,
  preview,
  uploading,
  progress,
  onUpload,
  onCancel,
  onChooseAnother,
}: {
  fileName: string;
  sizeBytes: number;
  preview: CsvPreview;
  uploading: boolean;
  progress: number;
  onUpload: () => void;
  onCancel: () => void;
  onChooseAnother: () => void;
}) {
  const mapped = new Set(preview.columns.map((c) => c.mappedTo).filter(Boolean));
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
          <Ionicons name="document-attach-outline" size={26} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={font.bodyStrong} numberOfLines={1}>
              {fileName}
            </Text>
            <Text style={font.caption}>
              {formatBytes(sizeBytes)} · {preview.rowCountIsEstimate ? '≈' : ''}
              {formatCount(preview.rowCount)} rows
            </Text>
          </View>
        </View>

        <SectionTitle>Columns</SectionTitle>
        <View style={styles.columns}>
          {FEED_COLUMNS.map((c) => (
            <View key={c} style={[styles.columnPill, { backgroundColor: mapped.has(c) ? colors.successSoft : colors.dangerSoft }]}>
              <Ionicons name={mapped.has(c) ? 'checkmark' : 'close'} size={12} color={mapped.has(c) ? colors.success : colors.danger} />
              <Text style={[styles.columnText, { color: mapped.has(c) ? colors.success : colors.danger }]}>{COLUMN_LABELS[c]}</Text>
            </View>
          ))}
        </View>
        {preview.columns.some((c) => !c.mappedTo && c.header) && (
          <Text style={font.caption}>
            Ignored: {preview.columns.filter((c) => !c.mappedTo && c.header).map((c) => c.header).join(', ')}
          </Text>
        )}

        {preview.previewRows.length > 0 && (
          <>
            <SectionTitle>First rows</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View>
                <View style={styles.tableRow}>
                  {FEED_COLUMNS.map((c) => (
                    <Text key={c} style={[styles.cell, styles.headCell]}>
                      {COLUMN_LABELS[c]}
                    </Text>
                  ))}
                </View>
                {preview.previewRows.map((row, i) => (
                  <View key={i} style={styles.tableRow}>
                    {row.map((v, j) => (
                      <Text key={j} style={styles.cell} numberOfLines={1}>
                        {v}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </Card>

      {preview.missingColumns.length > 0 ? (
        <Notice
          tone="danger"
          title="This file can't be loaded"
          message={`Missing column(s): ${preview.missingColumns.map((c) => COLUMN_LABELS[c]).join(', ')}. The first row must be a header with Store ID, SKU, Product Name, Price and Date.`}
        />
      ) : preview.issueCount > 0 ? (
        <Notice
          tone="warning"
          title={`${formatCount(preview.issueCount)} row${preview.issueCount > 1 ? 's' : ''} will likely be rejected`}
          message={`${preview.sampledRows < preview.rowCount ? `Checked the first ${formatCount(preview.sampledRows)} rows. ` : ''}You can still upload - the valid rows will load and the rest are reported with reasons.`}
        >
          {preview.issues.slice(0, 4).map((issue) => (
            <Text key={issue.rowNumber} style={font.caption}>
              Row {issue.rowNumber}: {issue.message}
            </Text>
          ))}
        </Notice>
      ) : (
        <Notice tone="success" title="Looks good" message="No problems found in the rows checked on this device." />
      )}

      {uploading ? (
        <Card>
          <KeyValue label="Uploading" value={`${Math.round(progress * 100)}%`} />
          <ProgressBar value={progress} />
          <Button title="Cancel upload" variant="danger" onPress={onCancel} />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Button
            title={`Upload ${preview.rowCountIsEstimate ? '≈' : ''}${formatCount(preview.rowCount)} rows`}
            icon="cloud-upload-outline"
            onPress={onUpload}
            disabled={!preview.canUpload}
            testID="upload-button"
          />
          <Button title="Choose another file" variant="ghost" onPress={onChooseAnother} />
        </View>
      )}
      {uploading && progress >= 1 && <ActivityIndicator color={colors.primary} />}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  hero: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  columnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  columnText: { fontSize: 12, fontWeight: '600', color: colors.text },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cell: { width: 120, paddingVertical: 6, paddingRight: spacing.sm, fontSize: 12, color: colors.text },
  headCell: { fontWeight: '700', color: colors.textMuted },
  inlineActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
});
