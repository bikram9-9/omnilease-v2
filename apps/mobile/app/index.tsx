import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { colors } from '@/lib/theme';

/**
 * Root index — the only place that decides which side of the app the user
 * lands on. Auth-gated routes live under (app); the sign-in screen lives
 * under (auth). This file just dispatches based on auth status.
 */
export default function Index() {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (auth.status === 'signed-out') {
    return <Redirect href="/sign-in" />;
  }

  if (auth.status === 'no-org') {
    return <Redirect href="/onboarding" />;
  }

  return <Redirect href="/home" />;
}
