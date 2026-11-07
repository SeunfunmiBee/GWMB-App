import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text, View } from 'react-native';

import { mockBackend } from './support/mock-supabase';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({
  __esModule: true,
  router: mockRouter,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  Stack: Object.assign(({ children }: any) => children, { Screen: () => null }),
}));
jest.mock('expo-linking', () => ({ createURL: (path: string) => `gwmb:///${path}` }));
jest.mock('@/lib/supabase', () => ({
  get supabase() { return jest.requireActual('./support/mock-supabase').mockBackend.supabase; },
  backendNetworkEnabled: true,
}));

import SignUpScreen from '@/app/(auth)/sign-up';
import SignInScreen from '@/app/(auth)/sign-in';
import ForgotPasswordScreen from '@/app/(auth)/forgot-password';
import ResetPasswordScreen from '@/app/reset-password';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';

function SessionProbe() {
  const { loading, sessionExpired, signOut } = useAuth();
  return (
    <View>
      <Text>{loading ? 'loading' : sessionExpired ? 'expired' : 'active'}</Text>
      <Pressable accessibilityRole="button" onPress={() => void signOut()}><Text>Sign out intentionally</Text></Pressable>
    </View>
  );
}

describe('authentication journeys', () => {
  beforeEach(() => {
    mockBackend.reset();
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
  });

  test('signs up with normalized account data and reaches email confirmation', async () => {
    const screen = await render(<SignUpScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('First name'), '  Ada  ');
    await fireEvent.changeText(screen.getByPlaceholderText('Last name'), '  Okafor ');
    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), ' ADA@Example.COM ');
    await fireEvent.changeText(screen.getByPlaceholderText('At least 8 characters'), 'StrongPass123!');
    await fireEvent.press(screen.getByText('Create account'));

    await screen.findByText('Check your inbox');
    expect(mockBackend.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'ada@example.com',
      password: 'StrongPass123!',
      options: expect.objectContaining({
        data: expect.objectContaining({ full_name: 'Ada Okafor', membership_intent: false }),
      }),
    }));
  });

  test('signs in and routes a member-intent account to membership verification', async () => {
    const user = mockBackend.createUser('member-intent@example.com', 'app_user');
    user.user_metadata.membership_intent = true;
    mockBackend.currentUser = null;
    mockBackend.currentRole = 'guest';
    const screen = await render(<SignInScreen />);

    await fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), ' MEMBER-INTENT@example.com ');
    await fireEvent.changeText(screen.getByPlaceholderText('Enter your password'), 'StrongPass123!');
    await fireEvent.press(screen.getByText('Sign in'));

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/verify-membership'));
    expect(mockBackend.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'member-intent@example.com',
      password: 'StrongPass123!',
    });
  });

  test('requests a reset link and updates the password only when confirmation matches', async () => {
    mockBackend.createUser('reset@example.com', 'app_user');
    const forgot = await render(<ForgotPasswordScreen />);
    await fireEvent.changeText(forgot.getByPlaceholderText('you@example.com'), 'RESET@example.com');
    await fireEvent.press(forgot.getByText('Send reset link'));
    await forgot.findByText('Check your inbox');
    expect(mockBackend.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'reset@example.com',
      expect.objectContaining({ redirectTo: 'gwmb:///reset-password' }),
    );
    await forgot.unmount();

    const reset = await render(<ResetPasswordScreen />);
    await fireEvent.changeText(reset.getByPlaceholderText('At least 8 characters'), 'NewStrongPass456!');
    await fireEvent.changeText(reset.getByPlaceholderText('Repeat your password'), 'not-the-same');
    await fireEvent.press(reset.getByText('Update password'));
    expect(reset.getByText('The passwords do not match.')).toBeTruthy();
    expect(mockBackend.auth.updateUser).not.toHaveBeenCalledWith({ password: 'NewStrongPass456!' });

    await fireEvent.changeText(reset.getByPlaceholderText('Repeat your password'), 'NewStrongPass456!');
    await fireEvent.press(reset.getByText('Update password'));
    await reset.findByText('You’re ready to continue');
    expect(mockBackend.auth.updateUser).toHaveBeenCalledWith({ password: 'NewStrongPass456!' });
  });

  test('shows session expiry for an unexpected sign-out but not an intentional one', async () => {
    mockBackend.createUser('active@example.com', 'app_user');
    const unexpected = await render(<AuthProvider><SessionProbe /></AuthProvider>);
    await unexpected.findByText('active');
    await act(async () => mockBackend.expireSession());
    await unexpected.findByText('expired');
    await unexpected.unmount();

    mockBackend.reset();
    mockBackend.createUser('intentional@example.com', 'app_user');
    const intentional = await render(<AuthProvider><SessionProbe /></AuthProvider>);
    await intentional.findByText('active');
    await fireEvent.press(intentional.getByText('Sign out intentionally'));
    await waitFor(() => expect(intentional.queryByText('expired')).toBeNull());
  });
});
