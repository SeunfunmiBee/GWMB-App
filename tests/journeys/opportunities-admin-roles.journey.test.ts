import { mockBackend } from './support/mock-supabase';

jest.mock('@/lib/supabase', () => ({
  get supabase() { return jest.requireActual('./support/mock-supabase').mockBackend.supabase; },
  backendNetworkEnabled: true,
}));

import {
  archiveContentItem,
  isAppAdmin,
  listPublishedContent,
  loadContentItem,
  saveContentItem,
  type ContentDraft,
} from '@/lib/admin-content';
import { publicationIssues } from '@/lib/admin-content-validation';
import { createLocalActivity, loadChapterAccess } from '@/lib/chapter-admin';
import {
  loadOpportunityApplications,
  retryPendingOpportunityApplications,
  submitOpportunityApplication,
} from '@/lib/opportunity-store';

const motivation = 'I am applying because this role closely matches my skills and the next step in my career.';

const opportunity = (overrides: Record<string, unknown> = {}) => ({
  id: 'content-opportunity-1', slug: 'graduate-programme', area: 'opportunities', content_type: 'opportunity',
  title: 'Graduate Programme', summary: 'Launch your career', body: 'A structured graduate opportunity.',
  image_url: 'https://images.test/opportunity.jpg', route: '/opportunity/graduate-programme',
  access_level: 'open', status: 'published', visible: true,
  metadata: { organisation: 'GWMB Partner', deadline: '2026-12-31T23:59:59.000Z' },
  ...overrides,
});

const fullCourse = (overrides: Partial<ContentDraft> = {}): ContentDraft => ({
  slug: 'career-confidence', area: 'courses', content_type: 'course', title: 'Career Confidence',
  eyebrow: 'GWMB LEARNING', summary: 'Build confidence for your next move.', body: 'A complete guided course.',
  image_url: 'https://images.test/course.jpg', route: '/course/career-confidence', access_level: 'open',
  status: 'published', featured: false, visible: true, sort_order: 1, publish_at: null,
  starts_at: null, ends_at: null,
  metadata: {
    category: 'professional', duration: '45 min', audience: 'everyone', surfaces: ['learn'],
    instructor: { name: 'Ada Recruiter', role: 'Talent Lead', bio: 'Experienced hiring professional.' },
    lessons: [{
      id: 'lesson-1', title: 'Your career story', summary: 'Build a clear story.', duration: '8 min',
      media_type: 'none', media_url: '', sections: [{ heading: 'Your story', body: 'Use evidence and outcomes.' }],
    }],
  },
  ...overrides,
});

describe('opportunity application journeys', () => {
  beforeEach(() => mockBackend.reset());

  test('submits against the canonical opportunity with an owned immutable CV snapshot', async () => {
    mockBackend.seed('content_items', opportunity());
    const user = mockBackend.createUser('applicant@example.com', 'app_user');
    mockBackend.seed('cv_records', { id: 'cv-owned', user_id: user.id, name: 'Graduate CV', target_role: 'Product Associate', structured_data: { skills: ['Research'] } });

    const result = await submitOpportunityApplication({
      userId: user.id, opportunityId: 'graduate-programme', portfolioUrl: 'https://portfolio.test',
      motivation, cvRecordId: 'cv-owned',
    });
    expect(result).toEqual(expect.objectContaining({ ok: true, duplicate: false, pending: false }));
    expect(result.application).toEqual(expect.objectContaining({
      opportunity_id: 'graduate-programme', opportunity_content_id: 'content-opportunity-1', cv_record_id: 'cv-owned',
      cv_snapshot: expect.objectContaining({ id: 'cv-owned', user_id: user.id }),
    }));

    const duplicate = await submitOpportunityApplication({
      userId: user.id, opportunityId: 'graduate-programme', portfolioUrl: '', motivation, cvRecordId: 'cv-owned',
    });
    expect(duplicate.duplicate).toBe(true);
  });

  test('rejects another user’s CV and preserves the correct opportunity during offline retry', async () => {
    mockBackend.seed('content_items', opportunity());
    const owner = mockBackend.createUser('cv-owner@example.com', 'app_user');
    mockBackend.seed('cv_records', { id: 'cv-private', user_id: owner.id, name: 'Private CV' });
    const applicant = mockBackend.createUser('different-applicant@example.com', 'app_user');

    const forbidden = await submitOpportunityApplication({
      userId: applicant.id, opportunityId: 'graduate-programme', portfolioUrl: '', motivation, cvRecordId: 'cv-private',
    });
    expect(forbidden).toEqual(expect.objectContaining({ ok: false, pending: false, duplicate: false }));
    expect(mockBackend.tables.opportunity_applications).toHaveLength(0);

    mockBackend.failNextRpcName = 'submit_opportunity_application';
    const queued = await submitOpportunityApplication({
      userId: applicant.id, opportunityId: 'graduate-programme', portfolioUrl: '', motivation,
    });
    expect(queued).toEqual(expect.objectContaining({ pending: true }));
    expect(queued.application?.opportunity_id).toBe('graduate-programme');

    await retryPendingOpportunityApplications(applicant.id);
    const loaded = await loadOpportunityApplications(applicant.id);
    expect(loaded.applications).toHaveLength(1);
    expect(loaded.applications[0]).toEqual(expect.objectContaining({ opportunity_id: 'graduate-programme', status: 'submitted' }));
  });

  test('blocks unpublished and members-only opportunities for the wrong audience', async () => {
    const user = mockBackend.createUser('open-user@example.com', 'app_user');
    mockBackend.seed('content_items', opportunity({ status: 'draft' }));
    const unpublished = await submitOpportunityApplication({ userId: user.id, opportunityId: 'graduate-programme', portfolioUrl: '', motivation });
    expect(unpublished).toEqual(expect.objectContaining({ ok: false, pending: false }));

    mockBackend.tables.content_items[0].status = 'published';
    mockBackend.tables.content_items[0].access_level = 'members';
    const memberOnly = await submitOpportunityApplication({ userId: user.id, opportunityId: 'graduate-programme', portfolioUrl: '', motivation });
    expect(memberOnly).toEqual(expect.objectContaining({ ok: false, pending: false }));
  });
});

describe('Admin publishing and role journeys', () => {
  beforeEach(() => mockBackend.reset());

  test('validates complete publishing data rather than only checking that a screen exists', () => {
    const incomplete = fullCourse({ image_url: null, metadata: { audience: 'everyone', surfaces: ['learn'], lessons: [] } });
    expect(publicationIssues('course', incomplete, incomplete.metadata)).toEqual(expect.arrayContaining([
      'Cover image', 'Course category', 'Total duration', 'Lecturer name', 'At least one lesson',
    ]));
    const complete = fullCourse();
    expect(publicationIssues('course', complete, complete.metadata)).toEqual([]);
  });

  test('creates, edits, publishes and unpublishes one canonical content record', async () => {
    mockBackend.createUser('admin@gwmb.org', 'central_admin');
    const draft = fullCourse({ status: 'draft', title: 'Working title', image_url: null, metadata: {} });
    const created = await saveContentItem(draft);
    expect(created.error).toBeNull();
    const id = created.data.id as string;

    const invalidPublish = await saveContentItem({ ...draft, id, status: 'published' });
    expect(invalidPublish.error).toEqual(expect.objectContaining({ code: '23514' }));
    expect((await loadContentItem(id)).data?.status).toBe('draft');

    const published = await saveContentItem({ ...fullCourse(), id });
    expect(published.error).toBeNull();
    expect((await listPublishedContent('courses')).data.map(item => item.id)).toEqual([id]);

    const edited = await saveContentItem({ ...fullCourse(), id, title: 'Career Confidence — Updated' });
    expect(edited.data.title).toBe('Career Confidence — Updated');
    const unpublished = await saveContentItem({ ...fullCourse(), id, status: 'draft' });
    expect(unpublished.error).toBeNull();
    expect((await listPublishedContent('courses')).data).toEqual([]);

    await archiveContentItem(id);
    expect((await loadContentItem(id)).data?.status).toBe('archived');
    expect(mockBackend.tables.admin_audit_logs.length).toBeGreaterThanOrEqual(4);
  });

  test.each([
    ['app_user', false],
    ['member', false],
    ['chapter_admin', false],
    ['central_admin', true],
  ] as const)('%s central Admin permission is %s', async (role, expected) => {
    mockBackend.createUser(`${role}@example.com`, role);
    await expect(isAppAdmin()).resolves.toEqual(expect.objectContaining({ isAdmin: expected }));
    const result = await saveContentItem(fullCourse({ status: 'draft' }));
    expect(!result.error).toBe(expected);
  });

  test('limits chapter admins to their assigned chapter while central Admin can manage all', async () => {
    mockBackend.createUser('lagos-admin@example.com', 'chapter_admin');
    expect(await loadChapterAccess()).toEqual([expect.objectContaining({ chapter_id: 'lagos' })]);
    await expect(createLocalActivity({
      chapterId: 'lagos', kind: 'event', title: 'Lagos Sister Circle', description: 'Monthly gathering',
      startsAt: '2026-11-20T15:00:00.000Z', venue: 'Lagos',
    })).resolves.toMatch(/^activity-/);
    await expect(createLocalActivity({
      chapterId: 'abuja', kind: 'event', title: 'Abuja Sister Circle', description: '',
      startsAt: '2026-11-21T15:00:00.000Z', venue: 'Abuja',
    })).rejects.toMatchObject({ message: expect.stringContaining('Permission denied') });

    mockBackend.createUser('central-admin@example.com', 'central_admin');
    await expect(createLocalActivity({
      chapterId: 'abuja', kind: 'event', title: 'Abuja Sister Circle', description: '',
      startsAt: '2026-11-21T15:00:00.000Z', venue: 'Abuja',
    })).resolves.toMatch(/^activity-/);
  });
});
