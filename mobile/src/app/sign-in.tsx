import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import type { User } from '@/api/types';
import { useSession } from '@/auth/SessionProvider';
import { Button, Field, Notice } from '@/components/ui';
import { config, setApiBaseUrl } from '@/config';
import { colors, font, radius, spacing } from '@/theme';
import { ROLE_LABELS } from '@/utils/format';

function scopeLabel(u: User) {
  if (u.role === 'PRICING_ADMIN') return 'All stores, all countries';
  if (u.role === 'PRICING_ANALYST') return `Countries: ${u.countryCodes.join(', ')}`;
  return `Store: ${u.storeIds.join(', ')}`;
}

export default function SignInScreen() {
  const { signInAsPersona } = useSession();
  const [server, setServer] = useState(config.apiBaseUrl);
  const [editingServer, setEditingServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(server);
  const personas = useQuery({ queryKey: ['personas', server], queryFn: authApi.personas, retry: 1 });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveServer = async (url: string | null) => {
    await setApiBaseUrl(url);
    setServer(config.apiBaseUrl);
    setServerDraft(config.apiBaseUrl);
    setEditingServer(false);
  };
  const serverValid = /^https?:\/\/[^\s/]+(:\d+)?(\/.*)?$/.test(serverDraft.trim());

  const signIn = async (userId: string) => {
    setPending(userId);
    setError(null);
    try {
      await signInAsPersona(userId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setPending(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.logo}>
          <Ionicons name="pricetags" size={30} color="#fff" />
        </View>
        <Text style={font.title}>Pricing Feeds</Text>
        <Text style={[font.body, { color: colors.textMuted }]}>
          Upload store price feeds, then search and correct prices from the shop floor.
        </Text>

        <Button title="Sign in with corporate SSO" icon="business-outline" variant="secondary" disabled onPress={() => {}} />
        <Text style={[font.caption, { textAlign: 'center' }]}>
          SSO (OIDC + PKCE) is wired in release builds. This demo build signs in as a sample user.
        </Text>

        <Text style={[font.label, { marginTop: spacing.lg }]}>DEMO USERS</Text>
        {personas.isError && (
          <Notice tone="danger" title="Can't reach the pricing API" message={`Tried ${server}. Start the backend with "npm run dev" in /backend, or change the server below.`}>
            <Button title="Retry" variant="ghost" onPress={() => personas.refetch()} style={{ alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: 0 }} />
          </Notice>
        )}
        {error && <Notice tone="danger" title={error} />}
        {personas.data?.map((p) => (
          <Pressable
            key={p.userId}
            accessibilityRole="button"
            accessibilityLabel={`Sign in as ${p.displayName}, ${ROLE_LABELS[p.role]}`}
            onPress={() => signIn(p.userId)}
            disabled={pending !== null}
            style={({ pressed }) => [styles.persona, pressed && { opacity: 0.8 }]}
          >
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {p.displayName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font.bodyStrong}>{p.displayName}</Text>
              <Text style={font.caption}>
                {ROLE_LABELS[p.role]} · {scopeLabel(p)}
              </Text>
            </View>
            <Ionicons name={pending === p.userId ? 'hourglass-outline' : 'chevron-forward'} size={18} color={colors.textSubtle} />
          </Pressable>
        ))}

        <View style={styles.server}>
          {editingServer ? (
            <>
              <Field
                label="Pricing API server"
                value={serverDraft}
                onChangeText={setServerDraft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="http://192.168.1.20:4000"
                error={serverDraft && !serverValid ? 'Use a full URL, e.g. http://192.168.1.20:4000' : undefined}
                hint="Android emulator: http://10.0.2.2:4000 · phone on Wi-Fi: http://<your computer's IP>:4000"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Button title="Save" onPress={() => void saveServer(serverDraft)} disabled={!serverValid} style={{ flex: 1 }} />
                <Button title="Reset" variant="secondary" onPress={() => void saveServer(null)} style={{ flex: 1 }} />
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setEditingServer(true)} style={styles.serverRow}>
              <Ionicons name="server-outline" size={16} color={colors.textMuted} />
              <Text style={[font.caption, { flex: 1 }]} numberOfLines={1}>
                Server: {server}
              </Text>
              <Text style={[font.caption, { color: colors.primary, fontWeight: '600' }]}>Change</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.xl, gap: spacing.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
  persona: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.primary, fontWeight: '700' },
  server: { marginTop: spacing.lg, gap: spacing.md },
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
});
