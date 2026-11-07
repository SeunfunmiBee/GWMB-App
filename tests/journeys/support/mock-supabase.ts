type Row = Record<string, any>;
type AuthUser = { id: string; email: string; user_metadata: Record<string, any> };
type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'PASSWORD_RECOVERY';

const error = (message: string, code = 'TEST_BACKEND_ERROR') => ({ message, code });
const normalizeEmail = (value: string) => value.trim().replace(/[.,;:]+$/, '').toLowerCase();
const normalizeIdentifier = (value: string) => value.trim().toUpperCase();

class Query {
  action: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  filters: [string, unknown][] = [];
  orderBy: { field: string; ascending: boolean }[] = [];
  payload: Row | Row[] | null = null;
  conflict = '';
  returning = false;
  cardinality: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(readonly backend: MockGwmbBackend, readonly table: string) {}

  select() { this.returning = true; return this; }
  insert(payload: Row | Row[]) { this.action = 'insert'; this.payload = payload; return this; }
  upsert(payload: Row | Row[], options?: { onConflict?: string }) {
    this.action = 'upsert'; this.payload = payload; this.conflict = options?.onConflict ?? ''; return this;
  }
  update(payload: Row) { this.action = 'update'; this.payload = payload; return this; }
  delete() { this.action = 'delete'; return this; }
  eq(field: string, value: unknown) { this.filters.push([field, value]); return this; }
  order(field: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ field, ascending: options?.ascending !== false }); return this;
  }
  maybeSingle() { this.cardinality = 'maybeSingle'; return this.execute(); }
  single() { this.cardinality = 'single'; return this.execute(); }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) { return this.execute().then(onfulfilled, onrejected); }
  execute() { return this.backend.execute(this); }
}

export type TestRole = 'guest' | 'app_user' | 'member' | 'chapter_admin' | 'central_admin';

export class MockGwmbBackend {
  tables: Record<string, Row[]> = {};
  users = new Map<string, { user: AuthUser; password: string }>();
  currentUser: AuthUser | null = null;
  currentRole: TestRole = 'guest';
  chapterAccess: { chapter_id: string; chapter_name: string; chapter_kind: 'city' | 'campus' }[] = [];
  authListener: ((event: AuthEvent, session: any) => void) | null = null;
  now = new Date('2026-11-07T12:00:00.000Z');
  nextId = 1;
  otpCode = '246810';
  failNextRpcName: string | null = null;

  readonly auth = {
    signUp: jest.fn(async ({ email, password, options }: any) => {
      const normalized = normalizeEmail(email);
      if (this.users.has(normalized)) return { data: { user: null, session: null }, error: error('User already registered', 'user_already_exists') };
      const user: AuthUser = { id: this.id('user'), email: normalized, user_metadata: options?.data ?? {} };
      this.users.set(normalized, { user, password });
      this.tables.profiles.push({ id: user.id, full_name: user.user_metadata.full_name ?? null, email: normalized });
      return { data: { user, session: null }, error: null };
    }),
    signInWithPassword: jest.fn(async ({ email, password }: any) => {
      const record = this.users.get(normalizeEmail(email));
      if (!record || record.password !== password) return { data: { user: null, session: null }, error: error('Invalid login credentials', 'invalid_credentials') };
      this.currentUser = record.user;
      const session = this.session();
      this.authListener?.('SIGNED_IN', session);
      return { data: { user: record.user, session }, error: null };
    }),
    resetPasswordForEmail: jest.fn(async (email: string) => {
      this.tables.password_reset_requests.push({ email: normalizeEmail(email), requested_at: this.now.toISOString() });
      return { data: {}, error: null };
    }),
    updateUser: jest.fn(async (values: any) => {
      if (!this.currentUser) return { data: { user: null }, error: error('No active session', 'session_missing') };
      if (values.password) {
        const record = this.users.get(this.currentUser.email);
        if (record) record.password = values.password;
      }
      if (values.data) this.currentUser.user_metadata = { ...this.currentUser.user_metadata, ...values.data };
      return { data: { user: this.currentUser }, error: null };
    }),
    getSession: jest.fn(async () => ({ data: { session: this.session() }, error: null })),
    getUser: jest.fn(async () => ({ data: { user: this.currentUser }, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: { session: this.session() }, error: null })),
    setSession: jest.fn(async () => ({ data: { session: this.session() }, error: null })),
    onAuthStateChange: jest.fn((listener: (event: AuthEvent, session: any) => void) => {
      this.authListener = listener;
      return { data: { subscription: { unsubscribe: jest.fn(() => { this.authListener = null; }) } } };
    }),
    signOut: jest.fn(async () => {
      this.currentUser = null;
      this.currentRole = 'guest';
      this.authListener?.('SIGNED_OUT', null);
      return { error: null };
    }),
  };

  readonly supabase = {
    from: (table: string) => new Query(this, table),
    rpc: jest.fn((name: string, args?: Row) => this.rpc(name, args ?? {})),
    auth: this.auth,
    functions: {
      invoke: jest.fn((name: string, input?: { body?: Row }) => this.invoke(name, input?.body ?? {})),
    },
    channel: jest.fn(() => ({ on() { return this; }, subscribe() { return this; } })),
    removeChannel: jest.fn(async () => undefined),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(async () => ({ data: {}, error: null })),
        getPublicUrl: jest.fn((path: string) => ({ data: { publicUrl: `https://files.test/${path}` } })),
        createSignedUrl: jest.fn(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null })),
      })),
    },
  };

  constructor() { this.reset(); }

  reset() {
    this.tables = {
      profiles: [], memberships: [], official_member_records: [], membership_verification_requests: [],
      password_reset_requests: [], course_progress: [], content_items: [], event_registrations: [],
      cv_records: [], opportunity_applications: [], clique_memberships: [], clique_session_seats: [],
      local_activities: [], admin_audit_logs: [],
    };
    this.users.clear();
    this.currentUser = null;
    this.currentRole = 'guest';
    this.chapterAccess = [];
    this.authListener = null;
    this.nextId = 1;
    this.failNextRpcName = null;
    this.now = new Date('2026-11-07T12:00:00.000Z');
  }

  id(prefix: string) { return `${prefix}-${this.nextId++}`; }
  session() { return this.currentUser ? { access_token: `token-${this.currentUser.id}`, user: this.currentUser } : null; }
  isMember() { return this.currentRole === 'member' || this.currentRole === 'chapter_admin' || this.currentRole === 'central_admin'; }
  isAdmin() { return this.currentRole === 'central_admin'; }

  createUser(email: string, role: TestRole = 'app_user', password = 'StrongPass123!') {
    const normalized = normalizeEmail(email);
    const user: AuthUser = { id: this.id('user'), email: normalized, user_metadata: {} };
    this.users.set(normalized, { user, password });
    this.tables.profiles.push({ id: user.id, email: normalized, full_name: 'Test Woman' });
    this.currentUser = user;
    this.currentRole = role;
    if (role === 'member' || role === 'chapter_admin' || role === 'central_admin') {
      this.tables.memberships.push({ id: this.id('membership'), user_id: user.id, status: 'verified', member_identifier: `GWMB-${user.id}` });
    }
    if (role === 'chapter_admin') {
      this.chapterAccess = [{ chapter_id: 'lagos', chapter_name: 'Lagos City Club', chapter_kind: 'city' }];
    }
    return user;
  }

  expireSession() {
    this.currentUser = null;
    this.currentRole = 'guest';
    this.authListener?.('SIGNED_OUT', null);
  }

  seed(table: string, ...rows: Row[]) {
    this.tables[table] ??= [];
    this.tables[table].push(...rows.map(row => ({ ...row })));
  }

  private matches(row: Row, filters: [string, unknown][]) {
    return filters.every(([field, value]) => row[field] === value);
  }

  private canRead(row: Row, table: string) {
    if (this.isAdmin()) return true;
    if (table === 'content_items') {
      if (row.status !== 'published' || row.visible !== true) return false;
      if (row.access_level === 'open') return true;
      if (row.access_level === 'account') return Boolean(this.currentUser);
      if (row.access_level === 'members') return this.isMember();
      return false;
    }
    return true;
  }

  private canWrite(table: string, row?: Row) {
    if (table === 'content_items') return this.isAdmin();
    if (table === 'clique_memberships' || table === 'clique_session_seats') return this.isMember();
    if (table === 'course_progress') return Boolean(this.currentUser && row?.user_id === this.currentUser.id);
    return true;
  }

  async execute(query: Query) {
    const rows = this.tables[query.table] ?? (this.tables[query.table] = []);
    if (query.action === 'select') {
      let data = rows.filter(row => this.matches(row, query.filters) && this.canRead(row, query.table));
      for (const order of [...query.orderBy].reverse()) {
        data = [...data].sort((a, b) => {
          const result = String(a[order.field] ?? '').localeCompare(String(b[order.field] ?? ''));
          return order.ascending ? result : -result;
        });
      }
      return this.cardinality(query, data.map(row => ({ ...row })));
    }

    const payloads = (Array.isArray(query.payload) ? query.payload : [query.payload ?? {}]) as Row[];
    if (!payloads.every(row => this.canWrite(query.table, row))) {
      return { data: null, error: error('Permission denied', '42501') };
    }

    const beforeRows = rows.map(row => ({ ...row, metadata: row.metadata ? structuredClone(row.metadata) : row.metadata }));
    let changed: Row[] = [];
    if (query.action === 'insert') {
      changed = payloads.map(payload => ({ id: payload.id ?? this.id(query.table), created_at: this.now.toISOString(), updated_at: this.now.toISOString(), ...payload }));
      rows.push(...changed);
    } else if (query.action === 'upsert') {
      const keys = (query.conflict || 'id').split(',').map(value => value.trim()).filter(Boolean);
      changed = payloads.map(payload => {
        const existing = rows.find(row => keys.every(key => row[key] === payload[key]));
        if (existing) { Object.assign(existing, payload, { updated_at: this.now.toISOString() }); return existing; }
        const created = { id: payload.id ?? this.id(query.table), created_at: this.now.toISOString(), updated_at: this.now.toISOString(), ...payload };
        rows.push(created); return created;
      });
    } else if (query.action === 'update') {
      changed = rows.filter(row => this.matches(row, query.filters));
      changed.forEach(row => Object.assign(row, query.payload, { updated_at: this.now.toISOString() }));
    } else if (query.action === 'delete') {
      changed = rows.filter(row => this.matches(row, query.filters));
      this.tables[query.table] = rows.filter(row => !this.matches(row, query.filters));
    }

    if (query.table === 'content_items' && changed.length) {
      const invalid = changed.find(row => ['published', 'scheduled'].includes(row.status) && !this.validPublishedContent(row));
      if (invalid) {
        this.tables[query.table] = beforeRows;
        return { data: null, error: error('Published content is incomplete', '23514') };
      }
      changed.forEach(row => this.tables.admin_audit_logs.push({ id: this.id('audit'), actor_id: this.currentUser?.id, record_id: row.id, action: query.action }));
    }

    return this.cardinality(query, query.returning ? changed.map(row => ({ ...row })) : []);
  }

  private cardinality(query: Query, data: Row[]) {
    if (query.cardinality === 'single') return data[0] ? { data: data[0], error: null } : { data: null, error: error('Row not found', 'PGRST116') };
    if (query.cardinality === 'maybeSingle') return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }

  private validPublishedContent(row: Row) {
    if (!row.title || !row.summary || !row.body || !row.route) return false;
    if (row.content_type === 'course') {
      const lessons = row.metadata?.lessons;
      return Boolean(row.image_url && row.metadata?.category && row.metadata?.duration && row.metadata?.instructor?.name && Array.isArray(lessons) && lessons.length);
    }
    if (row.content_type === 'event') return Boolean(row.image_url && row.starts_at && row.ends_at && Number(row.metadata?.capacity) > 0);
    if (row.content_type === 'resource') return Boolean(row.metadata?.resource_type && row.metadata?.url);
    return true;
  }

  async rpc(name: string, args: Row) {
    if (this.failNextRpcName === name) {
      this.failNextRpcName = null;
      return { data: null, error: error('Network request failed', '') };
    }
    if (name === 'is_app_admin') return { data: this.isAdmin(), error: null };
    if (name === 'get_my_chapter_admin_access') return { data: this.chapterAccess, error: null };
    if (name === 'submit_membership_link_request') return this.membershipLink(args);
    if (name === 'get_my_membership_details') {
      const membership = this.tables.memberships.find(row => row.user_id === this.currentUser?.id) ?? null;
      return { data: membership, error: null };
    }
    if (name === 'register_for_event') return this.registerEvent(args);
    if (name === 'get_registered_event_meeting') return this.meetingAccess(args.p_event_id);
    if (name === 'submit_opportunity_application') return this.submitOpportunity(args);
    if (name === 'get_opportunity_application_context') return this.opportunityContext(args.p_opportunity_id);
    if (name === 'create_local_activity') return this.createLocalActivity(args);
    return { data: null, error: error(`Unhandled RPC ${name}`) };
  }

  private membershipLink(args: Row) {
    if (!this.currentUser) return { data: null, error: error('Sign in required', '42501') };
    const email = normalizeEmail(args.p_membership_email ?? '');
    const identifier = normalizeIdentifier(args.p_member_identifier ?? '');
    const official = this.tables.official_member_records.find(row => normalizeIdentifier(row.member_identifier) === identifier);
    if (!official || normalizeEmail(official.membership_email) !== email || (args.p_chapter && official.chapter !== args.p_chapter)) {
      return { data: { result: 'needs_review', request_status: 'needs_review', message: 'No exact membership match was found.' }, error: null };
    }
    if (official.linked_user_id && official.linked_user_id !== this.currentUser.id) {
      return { data: { result: 'already_linked', request_status: 'rejected', message: 'This membership is already linked.' }, error: null };
    }
    if (official.record_status !== 'active') {
      return { data: { result: 'inactive', request_status: 'approved', message: 'Membership record is inactive.' }, error: null };
    }
    if (normalizeEmail(this.currentUser.email) !== email) {
      this.tables.membership_verification_requests.push({ user_id: this.currentUser.id, membership_email: email, member_identifier: identifier, status: 'pending_email' });
      return { data: { result: 'email_confirmation_required', request_status: 'pending', message: 'Confirm the membership email.' }, error: null };
    }
    this.verifyMember(official);
    return { data: { result: 'verified', request_status: 'approved', message: 'Membership verified.' }, error: null };
  }

  private verifyMember(official: Row) {
    official.linked_user_id = this.currentUser?.id;
    const membership = { id: this.id('membership'), user_id: this.currentUser?.id, status: 'verified', member_identifier: official.member_identifier, chapter: official.chapter, record_status: official.record_status, dues_status: official.dues_status ?? 'current' };
    this.tables.memberships = this.tables.memberships.filter(row => row.user_id !== this.currentUser?.id);
    this.tables.memberships.push(membership);
    if (this.currentRole === 'app_user') this.currentRole = 'member';
  }

  private registerEvent(args: Row) {
    if (!this.currentUser) return { data: null, error: error('Sign in required', '42501') };
    const event = this.tables.content_items.find(row => row.slug === args.p_event_id && row.content_type === 'event');
    if (!event || event.status !== 'published' || event.visible !== true) return { data: null, error: error('Event is unavailable', 'P0001') };
    if (event.access_level === 'members' && !this.isMember()) return { data: null, error: error('Verified membership required', '42501') };
    if (event.starts_at && new Date(event.starts_at) <= this.now) return { data: null, error: error('Event has started', 'P0001') };
    const deadline = event.metadata?.registration_deadline;
    if (deadline && new Date(deadline) <= this.now) return { data: null, error: error('Registration is closed', 'P0001') };
    const existing = this.tables.event_registrations.find(row => row.user_id === this.currentUser?.id && row.event_id === event.slug && row.status !== 'cancelled');
    if (existing) return { data: existing, error: null };
    const capacity = Number(event.metadata?.capacity ?? 0);
    const registered = this.tables.event_registrations.filter(row => row.event_id === event.slug && row.status === 'registered').length;
    const status = event.metadata?.bookingMode === 'waitlist' || registered >= capacity ? 'waitlisted' : 'registered';
    const registration = { id: this.id('registration'), user_id: this.currentUser.id, event_id: event.slug, event_title: event.title, event_starts_at: event.starts_at, event_route: event.route, full_name: args.p_full_name, email: args.p_email, learning_goal: args.p_learning_goal, status, registered_at: this.now.toISOString(), updated_at: this.now.toISOString() };
    this.tables.event_registrations.push(registration);
    return { data: registration, error: null };
  }

  private meetingAccess(eventId: string) {
    const event = this.tables.content_items.find(row => row.slug === eventId);
    const registration = this.tables.event_registrations.find(row => row.event_id === eventId && row.user_id === this.currentUser?.id && row.status === 'registered');
    if (!event || !registration) return { data: null, error: error('Registration required', '42501') };
    const start = new Date(event.starts_at);
    const end = new Date(event.ends_at);
    const available = new Date(start.getTime() - 30 * 60_000);
    const join = this.now >= available && this.now <= end;
    return { data: { meeting_url: join ? event.metadata?.meeting_url ?? null : null, starts_at: event.starts_at, available_at: available.toISOString(), closes_at: end.toISOString(), join_available: join, unavailable_reason: join ? null : 'Joining opens 30 minutes before the session.' }, error: null };
  }

  private opportunityContext(opportunityId: string) {
    const item = this.tables.content_items.find(row => row.slug === opportunityId && row.content_type === 'opportunity');
    if (!item || item.status !== 'published' || !item.visible) return { data: null, error: error('Opportunity unavailable', 'P0001') };
    const memberBlocked = item.access_level === 'members' && !this.isMember();
    return { data: { ...item, can_apply: !memberBlocked, blocked_reason: memberBlocked ? 'Verified membership required' : null }, error: null };
  }

  private submitOpportunity(args: Row) {
    if (!this.currentUser) return { data: null, error: error('Sign in required', '42501') };
    const item = this.tables.content_items.find(row => row.slug === args.p_opportunity_id && row.content_type === 'opportunity');
    if (!item || item.status !== 'published' || !item.visible) return { data: null, error: error('Opportunity unavailable', 'P0001') };
    if (item.access_level === 'members' && !this.isMember()) return { data: null, error: error('Verified membership required', '42501') };
    if (String(args.p_motivation ?? '').trim().length < 30 || String(args.p_motivation).length > 2000) return { data: null, error: error('Motivation must be between 30 and 2000 characters', '23514') };
    const duplicate = this.tables.opportunity_applications.find(row => row.user_id === this.currentUser?.id && row.opportunity_id === item.slug && !['draft', 'pending_sync'].includes(row.status));
    if (duplicate) return { data: null, error: error('Already applied', '23505') };
    let snapshot = args.p_cv_snapshot ?? null;
    if (args.p_cv_record_id) {
      const cv = this.tables.cv_records.find(row => row.id === args.p_cv_record_id && row.user_id === this.currentUser?.id);
      if (!cv) return { data: null, error: error('CV does not belong to the applicant', '42501') };
      snapshot = { ...cv };
    }
    const application = { id: this.id('application'), user_id: this.currentUser.id, opportunity_id: item.slug, opportunity_content_id: item.id, portfolio_url: args.p_portfolio_url, motivation: args.p_motivation, status: 'submitted', submitted_at: this.now.toISOString(), updated_at: this.now.toISOString(), cv_record_id: args.p_cv_record_id, cv_snapshot: snapshot, submission_reference: `GWMB-${this.nextId}` };
    this.tables.opportunity_applications = this.tables.opportunity_applications.filter(row => !(row.user_id === this.currentUser?.id && row.opportunity_id === item.slug && row.status === 'draft'));
    this.tables.opportunity_applications.push(application);
    return { data: application, error: null };
  }

  private createLocalActivity(args: Row) {
    const allowed = this.isAdmin() || (this.currentRole === 'chapter_admin' && this.chapterAccess.some(chapter => chapter.chapter_id === args.p_chapter_id));
    if (!allowed) return { data: null, error: error('Permission denied for this chapter', '42501') };
    const id = this.id('activity');
    this.tables.local_activities.push({ id, chapter_id: args.p_chapter_id, kind: args.p_kind, title: args.p_title, description: args.p_description, starts_at: args.p_starts_at, venue: args.p_venue, status: 'draft', members_only: true });
    return { data: id, error: null };
  }

  async invoke(name: string, body: Row) {
    if (name !== 'membership-email-otp') return { data: null, error: error(`Unhandled function ${name}`) };
    if (!this.currentUser) return { data: null, error: error('Sign in required', '42501') };
    if (body.action === 'send') return { data: { ok: true, message: 'Verification code sent.' }, error: null };
    if (body.action === 'verify') {
      if (body.code !== this.otpCode) return { data: { error: 'The verification code is invalid or expired.' }, error: null };
      const request = this.tables.membership_verification_requests.find(row => row.user_id === this.currentUser?.id);
      const official = request && this.tables.official_member_records.find(row => normalizeIdentifier(row.member_identifier) === normalizeIdentifier(request.member_identifier));
      if (!official) return { data: { error: 'Membership request not found.' }, error: null };
      this.verifyMember(official);
      return { data: { ok: true, status: 'verified', message: 'Membership linked.' }, error: null };
    }
    return { data: null, error: error('Unsupported membership action') };
  }
}

export const mockBackend = new MockGwmbBackend();
