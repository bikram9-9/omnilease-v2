import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { roleLabel } from '@omnilease/shared';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { colors, radius, spacing } from '@/lib/theme';

type PropertyRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

export default function PropertiesScreen() {
  const auth = useAuth();
  const [rows, setRows] = useState<PropertyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, city, state')
        .order('name', { ascending: true });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
        return;
      }
      setRows((data ?? []) as PropertyRow[]);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const greeting = auth.status === 'ready' ? auth.userContext.org_name : '';
  const role = auth.status === 'ready' ? roleLabel(auth.userContext.role) : '';

  return (
    <>
      <Stack.Screen options={{ title: 'Properties' }} />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.org}>{greeting}</Text>
          <Text style={styles.role}>{role}</Text>
        </View>

        {rows === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>No properties yet</Text>
            <Text style={styles.emptyHint}>
              Add a property from the web admin to see it here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <Text style={styles.cardTitle}>{item.name}</Text>
                {(item.city || item.state) && (
                  <Text style={styles.cardSub}>
                    {[item.city, item.state].filter(Boolean).join(', ')}
                  </Text>
                )}
              </Pressable>
            )}
          />
        )}

        <SignOutButton />
      </View>
    </>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable
      onPress={() => void signOut()}
      style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.signOutText}>Sign out</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  org: { color: colors.text, fontSize: 22, fontWeight: '700' },
  role: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  list: { paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  cardPressed: { backgroundColor: colors.surfaceElevated },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  cardSub: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  empty: { color: colors.text, fontSize: 16, fontWeight: '600' },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: spacing.xl },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.xl },
  signOut: { paddingVertical: spacing.lg, alignItems: 'center' },
  signOutText: { color: colors.textMuted, fontSize: 14 },
});
