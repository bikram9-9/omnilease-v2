import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { colors } from '@/lib/theme';

export default function AppLayout() {
  const auth = useAuth();

  if (auth.status === 'loading') return null;
  if (auth.status === 'signed-out') return <Redirect href="/sign-in" />;
  if (auth.status === 'no-org') return <Redirect href="/onboarding" />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
