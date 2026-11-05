import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Feed } from '@/api/types';
import { Button, EmptyState, Notice, OfflineBanner, StatusBadge } from '@/components/ui';
import { useFeeds } from '@/features/feeds/hooks';
import { colors, font, spacing } from '@/theme';
import { formatCount, formatRelative } from '@/utils/format';

export default function FeedsScreen() {
  const feeds = useFeeds();

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {feeds.isError && !feeds.data ? (
        <View style={{ padding: spacing.lg }}>
          <Notice tone="danger" title="Couldn't load uploads" message={feeds.error.message} />
        </View>
      ) : (
        <FlashList<Feed>
          data={feeds.data ?? []}
          keyExtractor={(f) => f.feedId}
          refreshControl={<RefreshControl refreshing={feeds.isRefetching} onRefresh={() => void feeds.refetch()} />}
          renderItem={({ item }) => <FeedRow feed={item} />}
          ListEmptyComponent={
            feeds.isPending ? (
              <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} />
            ) : (
              <EmptyState
                icon="cloud-upload-outline"
                title="No uploads yet"
                message="Feeds you upload appear here with their processing results."
                action={<Button title="Upload a feed" onPress={() => router.navigate('/upload')} />}
              />
            )
          }
        />
      )}
    </View>
  );
}

function FeedRow({ feed }: { feed: Feed }) {
  const summary =
    feed.status === 'FAILED'
      ? feed.failureReason ?? 'Failed'
      : `${formatCount(feed.totalRows)} rows · ${formatCount(feed.insertedRows + feed.updatedRows)} applied${feed.rejectedRows ? ` · ${formatCount(feed.rejectedRows)} rejected` : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/feeds/[id]', params: { id: feed.feedId } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.background }]}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={font.bodyStrong} numberOfLines={1}>
          {feed.fileName}
        </Text>
        <Text style={font.caption} numberOfLines={1}>
          {summary}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <StatusBadge status={feed.status} />
        <Text style={font.caption}>{formatRelative(feed.createdAt)}</Text>
      </View>
    </Pressable>
  );
}

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
});
