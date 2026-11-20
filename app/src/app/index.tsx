import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth/AuthProvider';
import { useProfile } from '@/lib/queries';

// Entry point and navigator anchor: sends to the right group for the current state
export default function Index() {
  const { session } = useAuth();
  const profile = useProfile(session?.user.id);
  if (!session) return <Redirect href="/welcome" />;
  if (profile.data?.deletion_requested_at) return <Redirect href="/deletion-pending" />;
  if (!profile.data?.onboarded_at) return <Redirect href="/onboarding" />;
  return <Redirect href="/today" />;
}
