import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * Worker home. Placeholder until the work_orders / tasks schema lands.
 */
export default function TasksScreen() {
  const { userContext, signOut } = useAuth();

  return (
    <>
      <Stack.Screen options={{ title: 'My Tasks' }} />
      <View style={styles.container}>
        <View>
          <Text style={styles.greeting}>
            {userContext?.name ? `Hi ${userContext.name.split(' ')[0]}` : 'Hi there'}
          </Text>
          <Text style={styles.sub}>You have no open tasks.</Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            Work orders and assignments will appear here once the schema is wired up.
          </Text>
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
  greeting: { color: colors.text, fontSize: 24, fontWeight: '700' },
  sub: { color: colors.textMuted, fontSize: 14, marginTop: spacing.xs },
  placeholder: {
    flex: 1,
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
  signOut: { paddingVertical: spacing.lg, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14 },
});
