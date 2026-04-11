import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth-context';

/**
 * Role-routed home. Workers go to a task list, managers go to properties,
 * admins get the admin overview. Each role's "home" is wherever they spend
 * 80% of their time.
 */
export default function Home() {
  const auth = useAuth();
  if (auth.status !== 'ready') return null;

  switch (auth.userContext.role) {
    case 'worker':
      return <Redirect href="/tasks" />;
    case 'property_manager':
    case 'supervisor_manager':
      return <Redirect href="/properties" />;
    case 'admin':
      return <Redirect href="/admin" />;
  }
}
