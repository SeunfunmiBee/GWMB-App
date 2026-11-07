import { mockBackend } from './support/mock-supabase';

jest.mock('@/lib/supabase', () => ({
  get supabase() { return jest.requireActual('./support/mock-supabase').mockBackend.supabase; },
  backendNetworkEnabled: true,
}));

import { requestMembershipLink, sendMembershipEmailCode, verifyMembershipEmailCode } from '@/lib/account';
import { completeCourseLesson, coursePercent, loadCourseProgress, startCourse } from '@/lib/course-progress';
import { cancelEventRegistration, loadRegisteredEventMeeting, registerForEvent } from '@/lib/event-store';
import { joinClique, loadJoinedCliques, saveCliqueSessionSeat } from '@/lib/clique-store';

const futureEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 'content-event-1', slug: 'career-clinic', area: 'events', content_type: 'event', title: 'Career Clinic',
  summary: 'Live recruiter guidance', body: 'A practical session.', image_url: 'https://images.test/event.jpg',
  route: '/event/career-clinic', access_level: 'open', status: 'published', visible: true,
  starts_at: '2026-11-08T12:00:00.000Z', ends_at: '2026-11-08T13:00:00.000Z',
  metadata: { capacity: 1, registration_deadline: '2026-11-08T10:00:00.000Z', meeting_url: 'https://meet.test/private' },
  ...overrides,
});

describe('membership, learning, events and Community journeys', () => {
  beforeEach(() => mockBackend.reset());

  test('matches an official membership and requires OTP when the account email differs', async () => {
    mockBackend.seed('official_member_records', {
      id: 'official-1', membership_email: 'member@gwmb.org', member_identifier: 'GWMB-LAG-0001',
      chapter: 'Lagos City Club', record_status: 'active', dues_status: 'current', linked_user_id: null,
    });
    mockBackend.createUser('member@gwmb.org', 'app_user');

    const exact = await requestMembershipLink({
      email: ' MEMBER@GWMB.ORG, ', memberIdentifier: ' gwmb-lag-0001 ', chapter: 'Lagos City Club',
    });
    expect(exact.result).toBe('verified');
    expect(mockBackend.tables.memberships[0]).toEqual(expect.objectContaining({ status: 'verified' }));

    mockBackend.reset();
    mockBackend.seed('official_member_records', {
      id: 'official-2', membership_email: 'membership@gwmb.org', member_identifier: 'GWMB-ABJ-0002',
      chapter: 'Abuja City Club', record_status: 'active', linked_user_id: null,
    });
    mockBackend.createUser('app-account@example.com', 'app_user');
    const differentEmail = await requestMembershipLink({
      email: 'membership@gwmb.org', memberIdentifier: 'gwmb-abj-0002', chapter: 'Abuja City Club',
    });
    expect(differentEmail.result).toBe('email_confirmation_required');
    await sendMembershipEmailCode();
    await expect(verifyMembershipEmailCode('111111')).rejects.toThrow('invalid or expired');
    await expect(verifyMembershipEmailCode(mockBackend.otpCode)).resolves.toEqual(expect.objectContaining({ status: 'verified' }));
    expect(mockBackend.tables.memberships[0].user_id).toBe(mockBackend.currentUser?.id);
  });

  test('starts a course, unlocks lessons in sequence, remains idempotent and completes at 100%', async () => {
    const user = mockBackend.createUser('learner@example.com', 'app_user');
    const lessonIds = ['lesson-1', 'lesson-2', 'lesson-3'];

    const started = await startCourse(user.id, 'career-course', lessonIds[0]);
    expect(started.current_lesson_id).toBe('lesson-1');
    expect(coursePercent(started, lessonIds.length)).toBe(0);

    const first = await completeCourseLesson({ userId: user.id, courseId: 'career-course', lessonId: 'lesson-1', lessonIds });
    expect(first.progress.current_lesson_id).toBe('lesson-2');
    expect(coursePercent(first.progress, lessonIds.length)).toBe(33);

    const duplicate = await completeCourseLesson({ userId: user.id, courseId: 'career-course', lessonId: 'lesson-1', lessonIds });
    expect(duplicate.progress.completed_lesson_ids).toEqual(['lesson-1']);

    await completeCourseLesson({ userId: user.id, courseId: 'career-course', lessonId: 'lesson-2', lessonIds });
    const finished = await completeCourseLesson({ userId: user.id, courseId: 'career-course', lessonId: 'lesson-3', lessonIds });
    expect(finished.progress.current_lesson_id).toBeNull();
    expect(finished.progress.completed_at).toBeTruthy();
    expect(coursePercent(finished.progress, lessonIds.length)).toBe(100);
    await expect(loadCourseProgress(user.id, 'career-course')).resolves.toEqual(expect.objectContaining({ cloud: true }));
  });

  test('registers, enforces capacity, prevents duplicates, cancels and re-registers', async () => {
    mockBackend.seed('content_items', futureEvent());
    const firstUser = mockBackend.createUser('first@example.com', 'app_user');
    const first = await registerForEvent({
      userId: firstUser.id, eventId: 'career-clinic', fullName: 'First User', email: firstUser.email,
      learningGoal: 'Prepare for interviews', status: 'registered',
    });
    expect(first.registration?.status).toBe('registered');

    const secondUser = mockBackend.createUser('second@example.com', 'app_user');
    const second = await registerForEvent({
      userId: secondUser.id, eventId: 'career-clinic', fullName: 'Second User', email: secondUser.email,
      learningGoal: '', status: 'registered',
    });
    expect(second.registration?.status).toBe('waitlisted');

    mockBackend.currentUser = firstUser;
    mockBackend.currentRole = 'app_user';
    const duplicate = await registerForEvent({
      userId: firstUser.id, eventId: 'career-clinic', fullName: 'First User', email: firstUser.email,
      learningGoal: '', status: 'registered',
    });
    expect(duplicate.duplicate).toBe(true);

    const cancelled = await cancelEventRegistration(firstUser.id, 'career-clinic');
    expect(cancelled.registration?.status).toBe('cancelled');
    const again = await registerForEvent({
      userId: firstUser.id, eventId: 'career-clinic', fullName: 'First User', email: firstUser.email,
      learningGoal: '', status: 'registered',
    });
    expect(again.registration?.status).toBe('registered');
  });

  test('reveals the private join link only to a registered user inside the join window', async () => {
    mockBackend.seed('content_items', futureEvent());
    const user = mockBackend.createUser('attendee@example.com', 'app_user');
    await registerForEvent({ userId: user.id, eventId: 'career-clinic', fullName: 'Attendee', email: user.email, learningGoal: '', status: 'registered' });

    mockBackend.now = new Date('2026-11-08T10:00:00.000Z');
    const early = await loadRegisteredEventMeeting('career-clinic');
    expect(early.access).toEqual(expect.objectContaining({ join_available: false, meeting_url: null }));

    mockBackend.now = new Date('2026-11-08T11:45:00.000Z');
    const live = await loadRegisteredEventMeeting('career-clinic');
    expect(live.access).toEqual(expect.objectContaining({ join_available: true, meeting_url: 'https://meet.test/private' }));
  });

  test('keeps Cliques member-only and lets verified members join multiple communities idempotently', async () => {
    const appUser = mockBackend.createUser('open-user@example.com', 'app_user');
    const denied = await joinClique(appUser.id, 'tech-sistas');
    expect(denied).toEqual(expect.objectContaining({ cloud: false, ids: [] }));
    expect(await loadJoinedCliques(appUser.id)).toEqual([]);

    const member = mockBackend.createUser('verified-member@example.com', 'member');
    await joinClique(member.id, 'tech-sistas');
    await joinClique(member.id, 'career-builders');
    await joinClique(member.id, 'tech-sistas');
    expect(await loadJoinedCliques(member.id)).toEqual(expect.arrayContaining(['tech-sistas', 'career-builders']));
    expect(mockBackend.tables.clique_memberships.filter(row => row.user_id === member.id)).toHaveLength(2);

    expect(await saveCliqueSessionSeat(member.id, 'fireside-1')).toEqual(['fireside-1']);
    expect(await saveCliqueSessionSeat(member.id, 'fireside-1')).toEqual(['fireside-1']);
    expect(mockBackend.tables.clique_session_seats.filter(row => row.user_id === member.id)).toHaveLength(1);
  });
});
