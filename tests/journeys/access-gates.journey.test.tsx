import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import { mockBackend } from './support/mock-supabase';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
let mockAuthState: any;

jest.mock('expo-router', () => {
  const ReactModule = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Stack = Object.assign(
    () => ReactModule.createElement(Text, null, 'Admin routes available'),
    { Screen: () => null },
  );
  return {
    __esModule: true,
    router: mockRouter,
    useRouter: () => mockRouter,
    useFocusEffect: (callback: () => void | (() => void)) => ReactModule.useEffect(callback, [callback]),
    Stack,
  };
});
jest.mock('@/providers/AuthProvider', () => ({ useAuth: () => mockAuthState }));
jest.mock('@/lib/supabase', () => ({
  get supabase() { return jest.requireActual('./support/mock-supabase').mockBackend.supabase; },
  backendNetworkEnabled: true,
}));
jest.mock('@/lib/content-runtime', () => ({ usePublishedContent: () => [] }));
jest.mock('@/lib/marketplace-journey', () => ({ loadMarketplaceJourney: jest.fn(async () => ({ journey: null })) }));
jest.mock('@/lib/notification-store', () => ({
  loadNotificationPreferences: jest.fn(async () => ({ preferences: {} })),
  scheduleLocalCliqueReminders: jest.fn(async () => undefined),
}));
jest.mock('@/components/motion/FadeIn', () => ({ FadeIn: ({ children }: { children: React.ReactNode }) => children }));

import CliquesScreen from '@/app/cliques';
import AdminLayout from '@/app/admin/_layout';

describe('member and administrator access gates', () => {
  beforeEach(() => {
    mockBackend.reset();
    mockRouter.push.mockReset();
    mockRouter.replace.mockReset();
  });

  test('lets an app user explore Cliques but routes joining to Membership', async () => {
    const user = mockBackend.createUser('community-user@example.com', 'app_user');
    mockAuthState = { user, membership: null };
    const screen = await render(<CliquesScreen />);

    expect(screen.getByText('Explore every clique')).toBeTruthy();
    expect(screen.getByText('UNLOCK THE FULL EXPERIENCE')).toBeTruthy();
    await fireEvent.press(screen.getByText('Explore Membership'));
    expect(mockRouter.push).toHaveBeenCalledWith('/membership');
  });

  test('lets a verified member join a Clique and updates the screen', async () => {
    const user = mockBackend.createUser('community-member@example.com', 'member');
    mockAuthState = { user, membership: { status: 'verified' } };
    const screen = await render(<CliquesScreen />);

    expect(screen.getByText('Choose your cliques')).toBeTruthy();
    expect(screen.queryByText('UNLOCK THE FULL EXPERIENCE')).toBeNull();
    await fireEvent.press(screen.getAllByText('Join this clique')[0]);
    await waitFor(() => expect(screen.getByText('Joined · Updates on')).toBeTruthy());
    expect(mockBackend.tables.clique_memberships).toHaveLength(1);
  });

  test('keeps central Admin routes hidden from every non-admin role', async () => {
    const appUser = mockBackend.createUser('ordinary@example.com', 'app_user');
    mockAuthState = { user: appUser, isAdmin: false, loading: false, accountLoading: false };
    const denied = await render(<AdminLayout />);
    expect(denied.getByText('This workspace is restricted.')).toBeTruthy();
    await fireEvent.press(denied.getByText('Return to My GWMB'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/profile');
    await denied.unmount();

    const admin = mockBackend.createUser('central@example.com', 'central_admin');
    mockAuthState = { user: admin, isAdmin: true, loading: false, accountLoading: false };
    const allowed = await render(<AdminLayout />);
    expect(allowed.getByText('Admin routes available')).toBeTruthy();
    expect(allowed.queryByText('This workspace is restricted.')).toBeNull();
  });
});
