import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card, KeyValue, Notice, ProgressBar, SectionTitle, StatusBadge } from '@/components/ui';
import { IN_PROGRESS, useFeed, useFeedErrors } from '@/features/feeds/hooks';
import { colors, font, radius, spacing } from '@/theme';
import { formatBytes, formatCount, formatDateTime } from '@/utils/format';

export default function FeedStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const feed = useFeed(id);
  const done = !!feed.data && !IN_PROGRESS.includes(feed.data.status);
  const errors = useFeedErrors(id, done && (feed.data?.rejectedRows ?? 0) > 0);

  if (feed.isPending) return <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />;
  if (feed.isError) {
    return (
      <View style={{ padding: spacing.lg }}>
        <Notice tone="danger" title="Couldn't load this feed" message={feed.error.message} />
      </View>
    );
  }
  const f = feed.data;
  const durationSec = f.startedAt && f.completedAt ? (new Date(f.completedAt).getTime() - new Date(f.startedAt).getTime()) / 1000 : null;

  return (
    <ScrollView contentContainerStyle={styles.container} contentInsetAdjustmentBehavior="automatic">
      <Card>
        <StatusBadge status={f.status} />
        <Text style={font.heading} numberOfLines={2}>
          {f.fileName}
        </Text>
        {!done && (
          <>
            <ProgressBar value={null} />
            <Text style={font.caption}>
              {f.status === 'PROCESSING' ? `Validating and loading… ${formatCount(f.totalRows)} rows so far` : 'Waiting for a worker…'}
            </Text>
          </>
        )}
        {f.status === 'FAILED' && <Notice tone="danger" title="The feed was not loaded" message={f.failureReason ?? undefined} />}
        <KeyValue label="Uploaded" value={formatDateTime(f.createdAt)} />
        {f.sizeBytes ? <KeyValue label="Size" value={formatBytes(f.sizeBytes)} /> : null}
        {durationSec !== null && <KeyValue label="Processing time" value={`${durationSec.toFixed(1)} s`} />}
      </Card>

      {f.totalRows > 0 && (
        <View style={styles.tiles}>
          <Tile label="Rows read" value={f.totalRows} />
          <Tile label="New" value={f.insertedRows} tone="success" />
          <Tile label="Changed" value={f.updatedRows} tone="success" />
          <Tile label="Unchanged" value={f.unchangedRows} />
          <Tile label="Rejected" value={f.rejectedRows} tone={f.rejectedRows ? 'danger' : undefined} />
        </View>
      )}

      {f.rejectedRows > 0 && done && (
        <>
          <SectionTitle>Rejected rows</SectionTitle>
          <Text style={font.caption}>Fix these rows in the source file and upload them again - the rows that loaded are not affected.</Text>
          {errors.isPending && <ActivityIndicator color={colors.primary} />}
          {errors.data?.map((e) => (
            <Card key={e.rowNumber} style={{ gap: spacing.xs, padding: spacing.md }}>
              <Text style={font.bodyStrong}>Row {e.rowNumber}</Text>
              {e.messages.map((m) => (
                <Text key={m} style={[font.caption, { color: colors.danger }]}>
                  • {m}
                </Text>
              ))}
              <Text style={styles.raw} numberOfLines={2}>
                {e.rawRow}
              </Text>
            </Card>
          ))}
          {errors.data && errors.data.length < f.rejectedRows && (
            <Text style={font.caption}>Showing the first {errors.data.length} of {formatCount(f.rejectedRows)} rejected rows.</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'danger' }) {
  const color = tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={styles.tile}>
      <Text style={[styles.tileValue, { color }]}>{formatCount(value)}</Text>
      <Text style={font.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, maxWidth: 720, width: '100%', alignSelf: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 2,
  },
  tileValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  raw: { ...font.mono, backgroundColor: colors.background, padding: spacing.sm, borderRadius: radius.sm },
});
