import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const source = (file) => readFile(path.join(root, file), 'utf8');

async function filesBelow(directory, extension = '') {
  const result = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (!extension || entry.name.endsWith(extension)) result.push(absolute);
    }
  }
  await visit(path.join(root, directory));
  return result;
}

function routePatternFromFile(file) {
  let relative = path.relative(path.join(root, 'src/app'), file).replaceAll(path.sep, '/');
  if (!relative.endsWith('.tsx') || relative.endsWith('/_layout.tsx') || relative === '_layout.tsx') return null;
  relative = relative.slice(0, -4).replace(/(^|\/)\([^/]+\)(?=\/|$)/g, '$1');
  relative = relative.replace(/\/index$/, '');
  return `/${relative}`.replace(/\/{2,}/g, '/') || '/';
}

function routeRegex(routePattern) {
  const escaped = routePattern
    .split('/')
    .map((segment) => {
      if (/^\[\.\.\..+\]$/.test(segment)) return '.+';
      if (/^\[.+\]$/.test(segment)) return '[^/]+';
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return new RegExp(`^${escaped}/?$`);
}

function cleanHref(raw) {
  const incompleteTemplate = raw.includes('${') && !raw.includes('}');
  const safeRaw = incompleteTemplate
    ? `${raw.slice(0, raw.indexOf('${'))}${raw.slice(0, raw.indexOf('${')).endsWith('/') ? '__value__' : ''}`
    : raw;
  const withoutTemplateValues = safeRaw.replace(/\$\{[^}]+\}/g, '__value__');
  const [pathname] = withoutTemplateValues.split(/[?#]/, 1);
  return pathname.length > 1 ? pathname.replace(/\/$/, '') : pathname;
}

function expectAll(sourceText, expected, context) {
  const compact = sourceText.replace(/\s+/g, '');
  for (const value of expected) {
    assert.ok(
      sourceText.includes(value) || compact.includes(value.replace(/\s+/g, '')),
      `${context} is missing ${JSON.stringify(value)}`,
    );
  }
}

test('the release-critical Expo routes exist', async () => {
  const routeFiles = await filesBelow('src/app', '.tsx');
  const routes = new Set(routeFiles.map(routePatternFromFile).filter(Boolean));
  const required = [
    '/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password',
    '/verify-membership', '/membership', '/learn', '/mentorship', '/opportunities', '/community',
    '/course/[id]', '/course/[id]/lesson/[lessonId]', '/event/[id]', '/registration/[id]',
    '/opportunity/[id]', '/application/opportunity', '/cliques', '/privacy-center', '/support',
    '/admin', '/admin/create', '/admin/content', '/admin/education', '/admin/mentorship',
    '/admin/career-readiness', '/admin/integrations',
  ];
  for (const route of required) assert.ok(routes.has(route), `Missing critical route ${route}`);
});

test('literal internal navigation destinations resolve to an app route', async () => {
  const routeFiles = await filesBelow('src/app', '.tsx');
  const sourceFiles = [...routeFiles, ...(await filesBelow('src/components', '.tsx'))];
  const patterns = routeFiles.map(routePatternFromFile).filter(Boolean);
  const matchers = patterns.map((route) => [route, routeRegex(route)]);
  const failures = [];
  // Deliberately restrict this to navigation APIs and declarative admin route fields.
  const hrefPattern = /(?:router\.(?:push|replace)|expoRouter\.(?:push|replace))\s*\(\s*(["'`])([^"'`]+)\1|\broute\s*:\s*(["'`])([^"'`]+)\3|\bhref\s*=\s*(["'`])([^"'`]+)\5/g;

  for (const file of sourceFiles) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(hrefPattern)) {
      const raw = match[2] ?? match[4] ?? match[6];
      if (!raw?.startsWith('/') || raw.startsWith('//')) continue;
      const href = cleanHref(raw);
      if (href.includes(':') || href === '/_sitemap') continue;
      if (!matchers.some(([, matcher]) => matcher.test(href))) {
        failures.push(`${path.relative(root, file)} -> ${raw}`);
      }
    }
  }
  assert.deepEqual(failures, [], `Unresolved internal links:\n${failures.join('\n')}`);
});

test('authentication owns session restoration, expiry and account-state clearing', async () => {
  const auth = await source('src/providers/AuthProvider.tsx');
  expectAll(auth, [
    'supabase.auth.getSession()',
    'supabase.auth.onAuthStateChange',
    "event === 'SIGNED_OUT'",
    'setSessionExpired(true)',
    'setProfile(null)',
    'setMembership(null)',
    'setIsAdmin(false)',
    'deactivate_my_push_devices',
    'listener.subscription.unsubscribe()',
  ], 'AuthProvider');

  const signIn = await source('src/app/(auth)/sign-in.tsx');
  const signUp = await source('src/app/(auth)/sign-up.tsx');
  const forgot = await source('src/app/(auth)/forgot-password.tsx');
  expectAll(signIn, ['signInWithPassword', 'email', 'password'], 'sign-in flow');
  expectAll(signUp, ['supabase.auth.signUp', 'email', 'password'], 'sign-up flow');
  expectAll(forgot, ['resetPasswordForEmail', 'redirectTo'], 'password-reset flow');
});

test('member-only access is enforced in both app flows and database policies', async () => {
  const appContracts = [
    ['src/app/event/[id].tsx', ["event.access === 'Members Only'", "membership?.status !== 'verified'", "router.push('/membership')"]],
    ['src/app/opportunity/[id].tsx', ["item.access==='Members Only'", "membership?.status!=='verified'", "router.push('/membership')"]],
    ['src/app/course/[id].tsx', ["course.access==='MEMBERS ONLY'", "membership?.status!=='verified'", "router.push(membershipRoute)"]],
    ['src/app/cliques.tsx', ["membership?.status==='verified'", "if(!member){router.push('/membership');return}"]],
  ];
  for (const [file, values] of appContracts) expectAll(await source(file), values, file);

  const security = await source('supabase/migrations/202610290001_release_blocker_security_and_registration.sql');
  expectAll(security, [
    'Published open content is publicly readable',
    "access_level='open'",
    "m.status='verified'",
    'Verified members manage own clique seats',
    'register_for_event',
    'get_registered_mentorship_meeting',
    'revoke execute on function public.get_registered_mentorship_meeting(text) from public, anon',
  ], 'member-access migration');

  const applications = await source('supabase/migrations/202610290004_critical_application_event_integrity.sql');
  expectAll(applications, [
    'get_opportunity_application_context',
    'submit_opportunity_application',
    "m.status='verified'",
    'get_registered_event_meeting',
    "r.status='registered'",
  ], 'application and event integrity migration');
});

test('membership verification uses server-owned matching and short-lived email proof', async () => {
  const account = await source('src/lib/account.ts');
  expectAll(account, [
    "supabase.rpc('submit_membership_link_request'",
    "supabase.rpc('get_my_membership_details')",
    "supabase.functions.invoke('membership-email-otp'",
    "body:{ action:'send' }",
    "body:{ action:'verify', code }",
  ], 'membership account service');
  assert.doesNotMatch(
    account,
    /from\(['"]memberships['"]\)\.(?:insert|upsert|update)/,
    'The client must not grant or change its own membership status',
  );

  const verification = await source('src/app/verify-membership.tsx');
  expectAll(verification, [
    'otpCode.trim().length!==6',
    'verifyMembershipEmailCode(otpCode)',
    "membership?.status==='verified'",
  ], 'membership verification screen');
  const otpSchema = await source('supabase/migrations/202610150003_membership_email_otp.sql');
  expectAll(otpSchema, [
    'membership_email_challenges',
    'expires_at',
    'revoke all on table public.membership_email_challenges from anon, authenticated',
  ], 'membership email challenge schema');
});

test('publication is validated in Admin and again at the database boundary', async () => {
  const builder = await source('src/app/admin/builder.tsx');
  expectAll(builder, [
    'function publicationIssues(',
    'const issues = publicationIssues(type, readyDraft, meta)',
    'Complete before publishing',
    'At least one app surface',
    'At least one lesson',
    'Registration deadline',
    'Resource format',
  ], 'Admin builder');

  const migration = await source('supabase/migrations/202610290006_high_priority_release_integrity.sql');
  expectAll(migration, [
    'validate_content_publication()',
    "new.status not in ('published','scheduled')",
    'validate_content_before_publication',
    'before insert or update on public.content_items',
    "new.content_type='course'",
    "new.content_type='event'",
    "new.content_type='resource'",
    'Every lesson needs complete notes or media',
    'Registration deadline must be before the event starts',
  ], 'publication-integrity migration');

  const content = await source('src/lib/admin-content.ts');
  expectAll(content, [".eq('area', area).eq('status', 'published')", "order('sort_order')"], 'published content query');
});

test('detail pages never substitute an unrelated record for an unknown ID', async () => {
  const contracts = [
    ['src/app/course/[id].tsx', /courseCatalog\s*\[\s*id\s*\]\s*\?\?\s*courseCatalog\s*\[/],
    ['src/app/event/[id].tsx', /eventById\s*\[\s*id\s*\]\s*\?\?\s*eventById\s*\[/],
    ['src/app/registration/[id].tsx', /eventById\s*\[\s*id\s*\]\s*\?\?\s*eventById\s*\[/],
    ['src/app/opportunity/[id].tsx', /opportunityById\s*\[\s*id\s*\]\s*\?\?\s*opportunityById(?:\.|\s*\[)/],
    ['src/app/resource/[id].tsx', /resources\s*\[\s*id\s*\]\s*\?\?\s*resources\s*\[/],
  ];
  for (const [file, forbidden] of contracts) {
    const text = await source(file);
    assert.ok(!forbidden.test(text), `${file} can silently display the wrong record`);
  }
});

test('the course catalogue only exposes records published by Admin', async () => {
  const runtime = await source('src/lib/course-runtime.ts');
  assert.ok(
    !/const\s+catalog\s*:\s*Record<string\s*,\s*Course>\s*=\s*\{\s*\.\.\.staticCourses\s*\}/.test(runtime),
    'Bundled courses must not be treated as published catalogue records',
  );
  expectAll(runtime, [
    'const catalog:Record<string,Course>={};',
    'items.forEach',
    'courseFromContent(item)',
  ], 'course catalogue');
});

test('public content journeys never repopulate from bundled demo or static inventories', async () => {
  const contracts = [
    {
      file: 'src/data/courses.ts',
      forbidden: [/export\s+const\s+courses\b/],
      reason: 'The app bundle must not contain a shadow course catalogue',
    },
    {
      file: 'src/data/events.ts',
      forbidden: [/export\s+const\s+events\b/, /\beventById\b/],
      reason: 'The app bundle must not contain a shadow event catalogue',
    },
    {
      file: 'src/data/opportunities.ts',
      forbidden: [/export\s+const\s+opportunities\b/, /\bopportunityById\b/],
      reason: 'The app bundle must not contain a shadow opportunity catalogue',
    },
    {
      file: 'src/data/mentorship.ts',
      forbidden: [/\bdemoMentors\b/, /\bdemoMentorshipSessions\b/],
      reason: 'The app bundle must not contain demo mentor or session records',
    },
    {
      file: 'src/lib/course-runtime.ts',
      forbidden: [/\bstaticCourses\b/],
      reason: 'Course cards and detail pages must be built only from published Admin course records',
    },
    {
      file: 'src/lib/content-runtime.ts',
      forbidden: [/cmsEvent\([^)]*fallback\??\s*:/, /cmsOpportunity\([^)]*fallback\??\s*:/],
      reason: 'CMS event and opportunity adapters must not accept bundled-record fallbacks',
    },
    {
      file: 'src/app/events.tsx',
      forbidden: [/\beventById\b/],
      reason: 'The public event list must be empty when Admin has no published events',
    },
    {
      file: 'src/app/event/[id].tsx',
      forbidden: [/\beventById\b/],
      reason: 'Event detail must render only the requested published Admin event',
    },
    {
      file: 'src/app/registration/[id].tsx',
      forbidden: [/\beventById\b/],
      reason: 'Event registration must not resurrect an unpublished bundled event',
    },
    {
      file: 'src/app/(tabs)/opportunities.tsx',
      forbidden: [/\bopportunityById\b/],
      reason: 'The opportunity list must be empty when Admin has no published opportunities',
    },
    {
      file: 'src/app/opportunity/[id].tsx',
      forbidden: [/\bopportunityById\b/],
      reason: 'Opportunity detail must render only the requested published Admin opportunity',
    },
    {
      file: 'src/app/resource/[id].tsx',
      forbidden: [/const\s+resources\s*:\s*Record\s*</, /fallback\s*=\s*resources\s*\[/],
      reason: 'Resource detail must not be completed from a bundled resource catalogue',
    },
    {
      file: 'src/lib/mentorship-store.ts',
      forbidden: [/\bdemoMentors\b/, /\bdemoMentorshipSessions\b/],
      reason: 'Published mentor and mentorship queries must return an empty or not-found result instead of demo people or sessions',
    },
    {
      file: 'src/app/mentorship/[area].tsx',
      forbidden: [/\bdemoMentorshipSessions\b/],
      reason: 'Mentorship lists must start empty and wait for the published network',
    },
    {
      file: 'src/components/LearnOverview.tsx',
      forbidden: [/\bdemoMentorshipSessions\b/, /\bupcomingEvents\b/, /const\s+resources\s*=\s*\[/],
      reason: 'Learn must not show bundled sessions or resources when the published inventory is empty',
    },
    {
      file: 'src/app/member-wins.tsx',
      forbidden: [/\bmoreWins\b/, /Celebrating Matilda Yakubo/],
      reason: 'The Member Spotlight page must be driven by the published member-wins collection',
    },
    {
      file: 'src/app/(tabs)/index.tsx',
      forbidden: [
        /\bdefaultBenefits\b/,
        /\bdefaultCommunityPhotos\b/,
        /\bdefaultMemberWins\b/,
        /\bdemoMentorshipSessions\b/,
        /\beventById\b/,
        /\bupcomingEvents\b/,
        /import\s*\{\s*courses\s*\}\s*from\s*['"]@\/data\/courses['"]/,
        /import\s*\{\s*opportunities\s*\}\s*from\s*['"]@\/data\/opportunities['"]/,
      ],
      reason: 'Home must not surface bundled courses, opportunities, spotlights, mentors, sessions or events when Admin content is absent',
    },
    {
      file: 'src/components/HomeDiscoverySections.tsx',
      forbidden: [/\bdefaultBenefits\b/, /\bdefaultWins\b/],
      reason: 'Home discovery must not replace empty Admin collections with static benefit cards or stories',
    },
    {
      file: 'src/components/PersonalizedHome.tsx',
      forbidden: [
        /\bfallbackMarketplaceInventory\b/,
        /\beventById\b/,
        /\bopportunityById\b/,
        /\bupcomingEvents\b/,
        /import\s*\{\s*courses\s*\}\s*from\s*['"]@\/data\/courses['"]/,
      ],
      reason: 'Personalized Home must aggregate published records and user-owned snapshots only',
    },
    {
      file: 'src/lib/marketplace-inventory.ts',
      forbidden: [/\bfallbackMarketplaceInventory\b/],
      reason: 'Marketplace recommendations must not gain inventory from a bundled catalogue',
    },
    {
      file: 'src/lib/marketplace-intelligence.ts',
      forbidden: [
        /\bfallbackMarketplaceInventory\b/,
        /\beventById\b/,
        /import\s*\{\s*courses\s*\}\s*from\s*['"]@\/data\/courses['"]/,
      ],
      reason: 'The recommendation engine must not silently substitute static content',
    },
    {
      file: 'src/app/(tabs)/_layout.tsx',
      forbidden: [/import\s*\{\s*opportunities\s*\}\s*from\s*['"]@\/data\/opportunities['"]/],
      reason: 'The Opportunities badge must reflect only the current Admin-published inventory',
    },
    {
      file: 'src/app/activity.tsx',
      forbidden: [/import\s*\{\s*courses\s*\}\s*from\s*['"]@\/data\/courses['"]/],
      reason: 'User activity must not resurrect a bundled course that Admin unpublished',
    },
    {
      file: 'src/app/(tabs)/grow.tsx',
      forbidden: [/import\s*\{\s*courses\s*\}\s*from\s*['"]@\/data\/courses['"]/, /\/resource\/weekly-planning/, /\/mentor\/tosin-adeniran/],
      reason: 'Grow must not link to bundled course, resource or mentor records that are absent from Admin',
    },
    {
      file: 'src/components/GrowCategoryScreen.tsx',
      forbidden: [/features:\s*baseCategory\.features\.map\s*\(/],
      reason: 'Grow category content lists must come from published Admin records rather than bundled feature inventories',
    },
    {
      file: 'src/lib/career-readiness.ts',
      forbidden: [/export\s+const\s+interviewQuestions\b/, /questions:\s*interviewQuestions/],
      reason: 'Deleting all Admin practice questions must leave an honest empty state instead of demo questions',
    },
    {
      file: 'src/data/cliques.ts',
      forbidden: [/export\s+const\s+cliqueSessions\b/, /\bmeeting\s*:/],
      reason: 'Clique taxonomy must not carry operational meeting dates or session records',
    },
    {
      file: 'src/app/admin/applications.tsx',
      forbidden: [/\bopportunityById\b/],
      reason: 'Admin application history must use the canonical linked opportunity record',
    },
  ];

  const violations = [];
  for (const { file, forbidden, reason } of contracts) {
    const text = await source(file);
    for (const pattern of forbidden) {
      if (pattern.test(text)) violations.push(`${file}: ${reason} [${pattern}]`);
    }
  }
  assert.deepEqual(violations, [], `Static content fallbacks remain:\n${violations.join('\n')}`);
});

test('the public Member Spotlight surface reads the same published records managed by Admin', async () => {
  const spotlight = await source('src/app/member-wins.tsx');
  expectAll(spotlight, [
    "usePublishedContentState('member-wins')",
    'content.items',
    'content.loading',
    'content.error',
  ], 'Member Spotlight page');
});

test('Clique sessions and Admin application labels use canonical published records', async () => {
  const cliqueEvents = await source('src/lib/clique-events.ts');
  const cliques = await source('src/app/cliques.tsx');
  const myCliques = await source('src/components/MyCliquesPanel.tsx');
  expectAll(cliqueEvents, [
    "item.content_type === 'event'",
    'item.visible',
    'item.starts_at',
    'metadata.program',
  ], 'Clique event adapter');
  expectAll(cliques, ["usePublishedContent('events')", 'publishedCliqueSessions(eventContent)'], 'Cliques page');
  expectAll(myCliques, ["usePublishedContent('events')", 'nextCliqueSession(sessions,clique.id)'], 'My Cliques panel');

  const opportunityStore = await source('src/lib/opportunity-store.ts');
  expectAll(opportunityStore, [
    'opportunity_content_id',
    'opportunity:content_items!opportunity_applications_opportunity_content_id_fkey',
  ], 'Admin opportunity application query');
});

test('the latest migration makes publication validation type-aware and repairs legacy published content', async () => {
  const migration = await source('supabase/migrations/202611040001_content_publication_readiness.sql');
  expectAll(migration, [
    'create or replace function public.content_publication_issues(',
    'create or replace function public.list_content_publication_readiness(',
    'create or replace function public.validate_content_publication()',
    "'course'",
    "'event'",
    "'resource'",
    "'opportunity'",
    'blocking_issue_count',
    'warning_count',
    'ready',
    'update public.content_items',
    "'member_spotlight'",
    "set status = 'draft'",
    'visible = false',
    'metadata = excluded.metadata',
    "p_item.access_level in ('account','admin')",
  ], 'content publication readiness migration');

  const functionStart = migration.indexOf('create or replace function public.content_publication_issues(');
  const functionBody = migration.indexOf('as $$', functionStart);
  const functionEnd = migration.indexOf('$$;', functionBody);
  assert.ok(functionStart >= 0 && functionBody > functionStart && functionEnd > functionBody, 'Could not isolate content_publication_issues()');
  const validator = migration.slice(functionBody, functionEnd);
  const firstTypeBranch = validator.search(/(?:if|elsif)\s+(?:v_[a-z0-9_]+|p_item\.content_type)\s*(?:=|in)|case\s+(?:v_[a-z0-9_]+|p_item\.content_type)/i);
  assert.ok(firstTypeBranch >= 0, 'Publication issue detection must branch by content type');
  const universalRules = validator.slice(0, firstTypeBranch);
  assert.doesNotMatch(
    universalRules,
    /p_item\.(?:summary|body|image_url|route)/i,
    'Simple published records must not inherit course/event image, body, summary or route requirements',
  );

  assert.doesNotMatch(
    migration,
    /Complete the title, description, full details, cover image and app route before publishing/i,
    'The old one-size-fits-all publication requirement must be replaced',
  );
});

test('course, event and opportunity actions preserve the canonical record identity', async () => {
  const course = await source('src/app/course/[id].tsx');
  expectAll(course, [
    'loadCourseProgress(user.id,course.id)',
    '`/course/${course.id}/lesson/${course.lessons[index].id}',
    '`/certificate/${course.id}`',
  ], 'course detail');

  const event = await source('src/app/event/[id].tsx');
  expectAll(event, [
    "const registrationId=cmsItem?.id??''",
    'loadEventRegistration(userId, registrationId)',
    'loadRegisteredEventMeeting(registrationId)',
  ], 'event detail');
  const eventStore = await source('src/lib/event-store.ts');
  expectAll(eventStore, ["supabase.rpc('register_for_event'", 'p_event_id: input.eventId'], 'event store');

  const application = await source('src/app/application/opportunity.tsx');
  expectAll(application, [
    'useLocalSearchParams<{opportunityId:string}>()',
    'loadOpportunityApplicationContext(opportunityId)',
    'opportunityId:item.id',
    'context?.canApply',
  ], 'opportunity application');
  const opportunityStore = await source('src/lib/opportunity-store.ts');
  expectAll(opportunityStore, [
    "supabase.rpc('get_opportunity_application_context'",
    "supabase.rpc('submit_opportunity_application'",
    'p_opportunity_id:input.opportunityId',
  ], 'opportunity store');
});

test('server mutations bind applications and registrations to canonical published content', async () => {
  const applicationIntegrity = await source('supabase/migrations/202610290004_critical_application_event_integrity.sql');
  expectAll(applicationIntegrity, [
    'opportunity_content_id uuid references public.content_items(id) on delete restrict',
    "where area='opportunities' and (id::text=p_opportunity_id or slug=p_opportunity_id)",
    "v_item.status<>'published'",
    'for update',
    'where c.id=p_cv_record_id and c.user_id=(select auth.uid())',
    'unique index if not exists opportunity_applications_submission_reference_idx',
  ], 'canonical opportunity submission');

  const registrationIntegrity = await source('supabase/migrations/202610290001_release_blocker_security_and_registration.sql');
  expectAll(registrationIntegrity, [
    "where area='events' and (id::text=p_event_id or slug=p_event_id)",
    "v_event.status<>'published'",
    'for update',
    "where event_id=v_event.id::text and status='registered'",
    "v_capacity is not null and v_registered>=v_capacity",
    "v_event.id::text,v_event.title,v_event.starts_at,'/event/'||v_event.slug",
  ], 'canonical event registration');
});

test('every application table created by migrations enables row-level security', async () => {
  const migrationFiles = await filesBelow('supabase/migrations', '.sql');
  const sql = (await Promise.all(migrationFiles.map((file) => readFile(file, 'utf8')))).join('\n').toLowerCase();
  const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/g)].map((match) => match[1]);
  assert.ok(tables.length >= 30, `Expected a meaningful schema inventory, found only ${tables.length} tables`);
  const missing = [...new Set(tables)].filter((table) => !new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`).test(sql));
  assert.deepEqual(missing, [], `Tables without row-level security: ${missing.join(', ')}`);
});

test('Admin navigation reuses guarded management surfaces instead of dead or parallel pages', async () => {
  const layout = await source('src/app/admin/_layout.tsx');
  expectAll(layout, ['!user || !isAdmin', 'permission-denied', "router.replace(user?'/profile':'/sign-in')"], 'Admin layout');

  const dashboard = await source('src/app/admin/index.tsx');
  const create = await source('src/app/admin/create.tsx');
  expectAll(dashboard, [
    "route:'/admin/mentorship'",
    "route:'/admin/career-readiness'",
    "route:'/admin/notifications'",
    "route:'/admin/integrations'",
    "router.push('/admin/education'",
    "'/admin/content?area=member-wins'",
  ], 'Admin dashboard');
  expectAll(create, [
    "route:'/admin/education?type=course'",
    "route:'/admin/education?type=event'",
    "route:'/admin/education?type=resource'",
    "route:'/admin/notifications'",
    "route:'/admin/content?area=member-wins'",
  ], 'Admin Create menu');
});

test('account export inventory includes the app personal-data domains', async () => {
  const processor = await source('supabase/functions/account-request-process/index.ts');
  const requiredTables = [
    'profiles', 'memberships', 'membership_records', 'membership_applications',
    'membership_verification_requests', 'marketplace_journeys', 'marketplace_readiness_profiles',
    'marketplace_recommendation_feedback', 'marketplace_recommendation_runs', 'marketplace_activity',
    'course_progress', 'event_registrations', 'mentorship_registrations', 'mentorship_applications',
    'mentorship_industry_interests', 'clique_memberships', 'clique_session_seats', 'community_preferences',
    'saved_opportunities', 'opportunity_applications', 'application_profiles', 'application_reminders',
    'cv_records', 'notification_preferences', 'user_notifications', 'notification_outbox', 'push_devices',
    'support_requests', 'volunteer_applications', 'local_activity_attendance', 'local_attendance_requests',
    'membership_participation_status', 'career_review_submissions', 'career_practice_responses',
    'career_saved_resources', 'advanced_program_claims',
  ];
  for (const table of requiredTables) {
    assert.ok(processor.includes(`'${table}'`) || processor.includes(`"${table}"`), `Account export omits ${table}`);
  }
  expectAll(processor, [
    "request.user_id!==user.id",
    "request.request_type!=='data_export'",
    'createSignedUrl(path,60*10)',
    'service.auth.admin.deleteUser(request.user_id)',
  ], 'account request processor');
});

test('startup network outages degrade safely instead of opening the Expo error overlay', async () => {
  const client = await source('src/lib/supabase.ts');
  expectAll(client, [
    'const supabaseFetch:typeof fetch',
    "status:503",
    "code:'NETWORK_UNAVAILABLE'",
    'global:{fetch:supabaseFetch}',
  ], 'resilient Supabase client');

  const auth = await source('src/providers/AuthProvider.tsx');
  expectAll(auth, [
    'const{data,error}=await supabase.auth.getSession()',
    'if(error)throw error',
    'if(mounted)setLoading(false)',
  ], 'auth bootstrap');

  const flags = await source('src/providers/FeatureFlagProvider.tsx');
  expectAll(flags, [
    'if(!user){setLoading(false);return;}',
    'if(active)setLoading(false)',
  ], 'signed-out feature flags');

  const operations = await source('src/lib/launch-operations.ts');
  expectAll(operations, [
    'if(isNetworkFailure(error)',
    'errorReportInFlight',
    'errorReportingBlockedUntil',
  ], 'operational error reporting');
});

