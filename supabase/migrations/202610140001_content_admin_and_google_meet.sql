-- Unified admin content system for every user-facing GWMB app surface.

create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  area text not null check (area in (
    'home','grow-career','grow-mentorship','grow-learning','grow-money',
    'grow-personal-growth','grow-leadership','community','opportunities',
    'events','courses','resources','member-wins'
  )),
  content_type text not null,
  title text not null,
  eyebrow text,
  summary text,
  body text,
  image_url text,
  route text,
  access_level text not null default 'open' check (access_level in ('open','account','members','admin')),
  status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
  featured boolean not null default false,
  sort_order integer not null default 0,
  publish_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (area, slug)
);

create index if not exists content_items_public_feed_idx
  on public.content_items (area, status, featured, sort_order, starts_at);

create table if not exists public.content_audit_log (
  id bigint generated always as identity primary key,
  content_id uuid references public.content_items(id) on delete set null,
  action text not null,
  actor_id uuid references auth.users(id) on delete set null,
  snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- OAuth tokens are written only by server-side functions. No client role receives table privileges.
create table if not exists public.admin_integrations (
  provider text primary key,
  connected_email text,
  encrypted_refresh_token text,
  scopes text[] not null default '{}',
  status text not null default 'disconnected' check (status in ('disconnected','connected','error')),
  last_error text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.content_meetings (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  provider text not null default 'google_meet' check (provider in ('google_meet','zoom','other')),
  provider_event_id text,
  meeting_url text,
  host_url text,
  status text not null default 'not_created' check (status in ('not_created','creating','ready','error','cancelled')),
  error_message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.google_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.content_items enable row level security;
alter table public.content_audit_log enable row level security;
alter table public.app_settings enable row level security;
alter table public.admin_integrations enable row level security;
alter table public.content_meetings enable row level security;
alter table public.google_oauth_states enable row level security;

revoke all on table public.content_items, public.content_audit_log, public.app_settings,
  public.admin_integrations, public.content_meetings from anon, authenticated;
revoke all on table public.google_oauth_states from anon, authenticated;
grant select on table public.content_items, public.app_settings to anon, authenticated;
grant insert, update, delete on table public.content_items, public.app_settings to authenticated;
grant select on table public.content_audit_log, public.content_meetings to authenticated;
grant insert, update, delete on table public.content_meetings to authenticated;

drop policy if exists "Published content is publicly readable" on public.content_items;
create policy "Published content is publicly readable" on public.content_items
  for select using (
    public.is_app_admin() or
    (status = 'published' and (publish_at is null or publish_at <= now()))
  );
drop policy if exists "Admins manage content" on public.content_items;
create policy "Admins manage content" on public.content_items for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Settings are publicly readable" on public.app_settings;
create policy "Settings are publicly readable" on public.app_settings for select
  using (true);
drop policy if exists "Admins manage settings" on public.app_settings;
create policy "Admins manage settings" on public.app_settings for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Admins read audit log" on public.content_audit_log;
create policy "Admins read audit log" on public.content_audit_log for select to authenticated
  using (public.is_app_admin());
drop policy if exists "Admins manage meetings" on public.content_meetings;
create policy "Admins manage meetings" on public.content_meetings for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- Extend existing application records into the protected operations dashboard.
grant select, update on table public.membership_applications to authenticated;
grant select, update on table public.membership_verification_requests to authenticated;
grant select, update on table public.memberships to authenticated;
drop policy if exists "Admins review membership applications" on public.membership_applications;
create policy "Admins review membership applications" on public.membership_applications for select to authenticated
  using (public.is_app_admin());
drop policy if exists "Admins update membership applications" on public.membership_applications;
create policy "Admins update membership applications" on public.membership_applications for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Admins review verification requests" on public.membership_verification_requests;
create policy "Admins review verification requests" on public.membership_verification_requests for select to authenticated
  using (public.is_app_admin());
drop policy if exists "Admins update verification requests" on public.membership_verification_requests;
create policy "Admins update verification requests" on public.membership_verification_requests for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
drop policy if exists "Admins review memberships" on public.memberships;
create policy "Admins review memberships" on public.memberships for select to authenticated
  using (public.is_app_admin());
drop policy if exists "Admins update memberships" on public.memberships;
create policy "Admins update memberships" on public.memberships for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create or replace function public.log_content_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.content_audit_log(content_id, action, actor_id, snapshot)
  values (
    coalesce(new.id, old.id), lower(tg_op), (select auth.uid()),
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;
revoke execute on function public.log_content_change() from public, anon, authenticated;
drop trigger if exists content_items_audit on public.content_items;
create trigger content_items_audit after insert or update or delete on public.content_items
  for each row execute function public.log_content_change();
drop trigger if exists content_items_set_updated_at on public.content_items;
create trigger content_items_set_updated_at before update on public.content_items
  for each row execute procedure public.set_updated_at();
drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at before update on public.app_settings
  for each row execute procedure public.set_updated_at();
drop trigger if exists content_meetings_set_updated_at on public.content_meetings;
create trigger content_meetings_set_updated_at before update on public.content_meetings
  for each row execute procedure public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-media', 'content-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Public content media is readable" on storage.objects;
create policy "Public content media is readable" on storage.objects for select
  using (bucket_id = 'content-media');
drop policy if exists "Admins upload content media" on storage.objects;
create policy "Admins upload content media" on storage.objects for insert to authenticated
  with check (bucket_id = 'content-media' and public.is_app_admin());
drop policy if exists "Admins update content media" on storage.objects;
create policy "Admins update content media" on storage.objects for update to authenticated
  using (bucket_id = 'content-media' and public.is_app_admin())
  with check (bucket_id = 'content-media' and public.is_app_admin());
drop policy if exists "Admins delete content media" on storage.objects;
create policy "Admins delete content media" on storage.objects for delete to authenticated
  using (bucket_id = 'content-media' and public.is_app_admin());

-- Registered users can retrieve only the public attendee link for their own event.
create or replace function public.get_registered_event_meeting(p_event_slug text)
returns table(meeting_url text, starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.meeting_url, c.starts_at
  from public.content_items c
  join public.content_meetings m on m.content_id = c.id and m.status = 'ready'
  where c.area = 'events' and c.slug = p_event_slug
    and exists (
      select 1 from public.event_registrations r
      where r.event_id = p_event_slug and r.user_id = (select auth.uid()) and r.status = 'registered'
    );
$$;
revoke execute on function public.get_registered_event_meeting(text) from public, anon;
grant execute on function public.get_registered_event_meeting(text) to authenticated;

-- Seed editable equivalents for the current app inventory. Existing static content remains a fallback.
insert into public.content_items(area,slug,content_type,title,eyebrow,summary,route,access_level,status,featured,sort_order,starts_at,metadata)
values
('events','product-manager','event','Should You Become a Product Manager?','CAREER MENTORSHIP SESSION','An honest look at product management, the skills you need and how to position yourself early.','/event/product-manager','open','published',true,10,'2027-04-16T19:30:00+01:00','{"speaker":"Adeola Adeyemi","role":"Senior Product Manager, Fintech","location":"Live on Google Meet","bookingMode":"register"}'),
('events','cv-clinic','event','Live CV Review','LIVE CAREER CLINIC','See what recruiters notice, get focused feedback and leave with practical improvements.','/event/cv-clinic','members','published',true,20,'2026-10-05T18:30:00+01:00','{"speaker":"GWMB Career Team","location":"Live online","bookingMode":"waitlist"}'),
('events','side-hustle','event','From Side Hustle to Real Income','SMART MONEY GIRL LIVE','Honest lessons from women turning practical skills into sustainable income.','/event/side-hustle','members','published',false,30,'2026-10-19T18:00:00+01:00','{"speaker":"Smart Money Girl Panel","location":"Live on Google Meet","bookingMode":"register"}'),
('events','progress-circle','event','October Progress Circle','ACCOUNTABILITY CHECK-IN','Reflect, reset and name the next action that will move your goal forward.','/event/progress-circle','members','published',false,40,'2026-10-31T19:00:00+01:00','{"speaker":"GWMB Growth Team","location":"Live online","bookingMode":"register"}'),
('events','sister-circle','event','September Sister Circle','COMMUNITY EXPERIENCE','Peer learning, reflection and connection with the Lagos City Club.','/event/sister-circle','members','published',false,50,'2026-09-28T15:00:00+01:00','{"speaker":"Lagos City Club","location":"Victoria Island, Lagos","bookingMode":"closed"}'),
('opportunities','flutterwave','opportunity','Graduate Internship Programme','FLUTTERWAVE','Build practical experience on meaningful fintech projects.','/opportunity/flutterwave','members','published',true,10,null,'{"organisation":"Flutterwave","type":"Internship","location":"Lagos · Hybrid","deadline":"2026-10-04T23:59:00+01:00"}'),
('opportunities','women-tech','opportunity','Women in Tech Scholarship','FUTURE SKILLS AFRICA','Access supported digital-skills training and build a portfolio.','/opportunity/women-tech','open','published',true,20,null,'{"organisation":"Future Skills Africa","type":"Scholarship","location":"Remote","deadline":"2026-10-12T23:59:00+01:00"}'),
('opportunities','gwmb-fund','opportunity','Emerging Leaders Fellowship','GIRLS WHO MEAN BUSINESS','Grow your leadership confidence through guided learning and projects.','/opportunity/gwmb-fund','members','published',true,30,null,'{"organisation":"Girls Who Mean Business","type":"Fellowship","location":"Nigeria","deadline":"Rolling"}'),
('courses','workplace-foundations','course','Build a CV that gets noticed','CAREER ESSENTIALS','Turn your experience into a clear, confident CV that opens doors.','/course/workplace-foundations','open','published',true,10,null,'{"duration":"42 min","rating":"4.9","lessons":6}'),
('courses','public-speaking','course','Confident Public Speaking','COMMUNICATION SKILLS','Structure your message and speak with greater clarity and calm.','/course/public-speaking','members','published',false,20,null,'{"duration":"58 min","rating":"4.8","lessons":7}'),
('courses','budgeting','course','Budgeting Without the Stress','SMART MONEY GIRL','Build a realistic budget that fits your actual life.','/course/budgeting','open','published',false,30,null,'{"duration":"36 min","rating":"4.9","lessons":4}'),
('courses','self-leadership','course','Leading Yourself First','LEADERSHIP DEVELOPMENT','Build ownership, self-awareness and dependable habits.','/course/self-leadership','open','published',false,40,null,'{"duration":"48 min","rating":"4.8","lessons":5}'),
('grow-career','career','grow_category','Career & Marketplace Preparation','GROW','Get prepared for opportunities and the workplace.','/grow/career','open','published',true,10,null,'{"color":"#E62B7F","heroTitle":"Show up ready."}'),
('grow-mentorship','mentorship','grow_category','Mentorship & Guidance','GROW','Discover careers and learn from professionals.','/grow/mentorship','open','published',true,20,null,'{"color":"#3150E8","heroTitle":"Clarity grows in conversation."}'),
('grow-learning','learning','grow_category','Learning & Skill Development','GROW','Build practical skills beyond the classroom.','/grow/learning','open','published',true,30,null,'{"color":"#111011","heroTitle":"Learn it. Practise it. Use it."}'),
('grow-money','money','grow_category','Smart Money Girl','GROW','Learn to earn, manage, save and grow money.','/grow/money','open','published',true,40,null,'{"color":"#FFC928","heroTitle":"Make money make sense."}'),
('grow-personal-growth','personal-growth','grow_category','Personal Growth & Accountability','GROW','Set goals and follow through on your development.','/grow/personal-growth','open','published',true,50,null,'{"color":"#FF6700","heroTitle":"Small actions. Real momentum."}'),
('grow-leadership','leadership','grow_category','Leadership Development','GROW','Build the confidence and skills to lead.','/grow/leadership','open','published',true,60,null,'{"color":"#7A35D1","heroTitle":"Lead from where you are."}'),
('resources','weekly-planning','resource','The Weekly Planning Template','PLANNING TOOL','Turn priorities into a focused plan you can follow.','/resource/weekly-planning','open','published',false,10,null,'{"format":"PDF","length":"5 pages"}'),
('resources','better-goals','resource','A Better Way to Set Goals','PERSONAL GROWTH','Make goals specific, useful and workable.','/resource/better-goals','open','published',false,20,null,'{"format":"Article","length":"8 min"}'),
('resources','conflict-guide','resource','Communicating Through Conflict','LEADERSHIP','A practical guide to direct, respectful conversations.','/resource/conflict-guide','members','published',false,30,null,'{"format":"Guide","length":"12 min"}'),
('community','sister-circle-home','community_feature','Find your people','COMMUNITY','Connect through city clubs, cliques and shared experiences.','/community','open','published',true,10,null,'{"module":"hero"}'),
('community','cliques','community_feature','Join a clique','COMMUNITY','Smaller interest-based circles for deeper connection.','/cliques','members','published',true,20,null,'{"module":"cliques"}'),
('member-wins','matilda-internship','member_win','Matilda Yakubo landed a paid internship','GWMB GIRLS MAKING MOVES','Celebrating a brilliant next step in Matilda’s marketplace journey.','/member-wins','open','published',true,10,null,'{"member":"Matilda Yakubo","winType":"Internship"}'),
('home','welcome-hero','home_section','You’re one step closer','WELCOME','You’re one step closer to the woman you’re becoming.','/','open','published',true,10,null,'{"module":"hero"}'),
('home','continue-growth','home_section','Continue where you left off','YOUR ACTIVITY','Pick up your learning, reading and registrations.','/activity','account','published',true,20,null,'{"module":"activity"}'),
('home','benefits','home_section','Explore your benefits','YOUR GWMB','Career, mentorship, learning, money, growth and leadership.','/membership','open','published',true,30,null,'{"module":"benefits"}')
on conflict (area,slug) do nothing;

insert into public.app_settings(key,value,description)
values
('home.sections','{"order":["hero","activity","spotlight","benefits","opportunities","community"]}','Home section order and visibility'),
('google_calendar','{"defaultDurationMinutes":60,"defaultTimezone":"Africa/Lagos","sendUpdates":"all"}','Defaults used when creating Google Calendar and Meet sessions')
on conflict (key) do nothing;
