import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSession, useUser } from '@/auth/SessionProvider';
import { Button, Card, KeyValue } from '@/components/ui';
import { useStores } from '@/features/prices/hooks';
import { config } from '@/config';
import { colors, font, spacing } from '@/theme';
import { ROLE_LABELS } from '@/utils/format';

export default function AccountScreen() {
  const user = useUser();
  const { signOut } = useSession();
  const stores = useStores();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={{ alignItems: 'center' }}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.displayName
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </Text>
        </View>
        <Text style={font.heading}>{user.displayName}</Text>
        <Text style={font.caption}>
          {ROLE_LABELS[user.role]} · {user.userId}
        </Text>
      </Card>

      <Card>
        <Text style={font.label}>YOUR STORES ({stores.data?.length ?? '…'})</Text>
        {stores.data?.map((s) => (
          <KeyValue key={s.storeId} label={s.name} value={`${s.storeId} · ${s.countryCode} · ${s.currency}`} />
        ))}
      </Card>

      <Card>
        <Text style={font.label}>ABOUT</Text>
        <KeyValue label="App version" value={config.appVersion} />
        <KeyValue label="API" value={config.apiBaseUrl} />
      </Card>

      <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => void signOut()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700', fontSize: 22 },
});
