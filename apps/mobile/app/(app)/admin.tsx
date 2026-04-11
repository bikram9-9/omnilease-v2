import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { colors, radius, spacing } from '@/lib/theme';

export default function AdminScreen() {
  const { userContext, signOut } = useAuth();

  return (
    <>
      <Stack.Screen options={{ title: 'Admin' }} />
      <View style={styles.container}>
        <View>
          <Text style={styles.title}>Admin overview</Text>
          <Text style={styles.sub}>{userContext?.org_name}</Text>
        </View>

        <View style={styles.cards}>
          <Link href="/properties" asChild>
            <Pressable style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
              <Text style={styles.cardTitle}>Properties</Text>
              <Text style={styles.cardSub}>View all properties in the org</Text>
            </Pressable>
          </Link>

          <View style={[styles.card, styles.cardDisabled]}>
            <Text style={styles.cardTitle}>Users</Text>
            <Text style={styles.cardSub}>Coming soon</Text>
          </View>

          <View style={[styles.card, styles.cardDisabled]}>
            <Text style={styles.cardTitle}>Reports</Text>
            <Text style={styles.cardSub}>Coming soon</Text>
          </View>
        </View>

        <Pressable
          onPress={() => void signOut()}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: 24, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  cards: { gap: spacing.md, marginTop: spacing.xl, flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceElevated },
  cardDisabled: { opacity: 0.5 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  signOut: { paddingVertical: spacing.lg, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14 },
});
