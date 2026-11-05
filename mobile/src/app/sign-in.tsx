import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '@/api/endpoints';
import type { User } from '@/api/types';
import { useSession } from '@/auth/SessionProvider';
import { Button, Notice } from '@/components/ui';
import { config } from '@/config';
import { colors, font, radius, spacing } from '@/theme';
import { ROLE_LABELS } from '@/utils/format';

function scopeLabel(u: User) {
  if (u.role === 'PRICING_ADMIN') return 'All stores, all countries';
  if (u.role === 'PRICING_ANALYST') return `Countries: ${u.countryCodes.join(', ')}`;
  return `Store: ${u.storeIds.join(', ')}`;
}

export default function SignInScreen() {
  const { signInAsPersona } = useSession();
  const personas = useQuery({ queryKey: ['personas'], queryFn: authApi.personas, retry: 1 });
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <Notice tone="danger" title="Can't reach the pricing API" message={`Tried ${config.apiBaseUrl}. Start the backend with "npm run dev" in /backend, then retry.`}>
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
});
