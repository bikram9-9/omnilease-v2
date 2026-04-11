import { Redirect, Stack } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

export default function AuthLayout() {
  const auth = useAuth();

  // If somebody who's already signed in lands on /sign-in, kick them home.
  if (auth.status === 'ready') {
    return <Redirect href="/home" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0b0b0c' },
      }}
    />
  );
}
