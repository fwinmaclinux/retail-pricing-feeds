import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import type { FeedStatus } from '@/api/types';
import { colors, font, radius, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  testID,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.primary, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
    danger: { bg: colors.surface, fg: colors.danger, border: colors.border },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={palette.fg} />}
          <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={font.label}>{String(children).toUpperCase()}</Text>
      {right}
    </View>
  );
}

export function Field({
  label,
  error,
  hint,
  prefix,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string; prefix?: string }) {
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={font.label}>{label.toUpperCase()}</Text>
      <View style={[styles.inputWrap, error ? { borderColor: colors.danger } : null]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          placeholderTextColor={colors.textSubtle}
          accessibilityLabel={label}
          style={styles.input}
          {...input}
        />
      </View>
      {error ? <Text style={[font.caption, { color: colors.danger }]}>{error}</Text> : hint ? <Text style={font.caption}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.primary : colors.textMuted} />}
      <Text style={[styles.chipText, selected && { color: colors.primary }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const STATUS_STYLE: Record<FeedStatus, { label: string; fg: string; bg: string; icon: IconName }> = {
  AWAITING_UPLOAD: { label: 'Uploading', fg: colors.info, bg: colors.infoSoft, icon: 'cloud-upload-outline' },
  QUEUED: { label: 'Queued', fg: colors.info, bg: colors.infoSoft, icon: 'time-outline' },
  PROCESSING: { label: 'Processing', fg: colors.info, bg: colors.infoSoft, icon: 'sync-outline' },
  COMPLETED: { label: 'Completed', fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' },
  COMPLETED_WITH_ERRORS: { label: 'Completed with errors', fg: colors.warning, bg: colors.warningSoft, icon: 'alert-circle' },
  FAILED: { label: 'Failed', fg: colors.danger, bg: colors.dangerSoft, icon: 'close-circle' },
};

export function StatusBadge({ status }: { status: FeedStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={13} color={s.fg} />
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export function Notice({
  tone,
  title,
  message,
  children,
}: {
  tone: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  message?: string;
  children?: ReactNode;
}) {
  const t = {
    info: { fg: colors.info, bg: colors.infoSoft, icon: 'information-circle' as IconName },
    warning: { fg: colors.warning, bg: colors.warningSoft, icon: 'warning' as IconName },
    danger: { fg: colors.danger, bg: colors.dangerSoft, icon: 'alert-circle' as IconName },
    success: { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' as IconName },
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <Ionicons name={t.icon} size={20} color={t.fg} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <Text style={[font.bodyStrong, { color: t.fg }]}>{title}</Text>
        {message ? <Text style={[font.caption, { color: colors.text }]}>{message}</Text> : null}
        {children}
      </View>
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text style={[font.heading, { textAlign: 'center' }]}>{title}</Text>
      {message ? <Text style={[font.caption, { textAlign: 'center' }]}>{message}</Text> : null}
      {action}
    </View>
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round((value ?? 0) * 100) }}>
      <View style={[styles.progressFill, { width: `${Math.round(Math.min(1, Math.max(0.03, value ?? 0.35)) * 100)}%` }]} />
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.kv}>
      <Text style={font.caption}>{label}</Text>
      {typeof value === 'string' ? <Text style={[font.body, { textAlign: 'right', flexShrink: 1 }]}>{value}</Text> : value}
    </View>
  );
}

/** Shown on every tab while the device is offline; cached search results remain browsable. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false)), []);
  if (!offline) return null;
  return (
    <View style={styles.offline} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={16} color="#fff" />
      <Text style={styles.offlineText}>Offline - showing saved results. Changes will sync when you reconnect.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  prefix: { ...font.body, color: colors.textMuted, marginRight: spacing.xs },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 220,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 13, fontWeight: '500', color: colors.text },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
  kv: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, minHeight: 28 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  offlineText: { color: '#fff', fontSize: 13, flex: 1 },
});
