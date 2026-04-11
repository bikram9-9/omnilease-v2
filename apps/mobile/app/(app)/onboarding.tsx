import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Shown when the user is authenticated to Supabase but doesn't yet have a
 * row in public.users (no org membership). For now this is a dead end with
 * a sign-out — onboarding flows live in the web admin.
 */
export default function OnboardingScreen() {
  const { signOut } = useAuth();

  return (
    <>
      <Stack.Screen options={{ title: 'Almost there', headerBackVisible: false }} />
      <View style={styles.container}>
        <Text style={styles.title}>You're not in an organization yet</Text>
        <Text style={styles.body}>
          Ask your administrator to invite you to an organization, then sign in again.
        </Text>
        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, gap: spacing.lg },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
  },
  buttonText: { color: colors.accentText, fontSize: 16, fontWeight: '600' },
});
