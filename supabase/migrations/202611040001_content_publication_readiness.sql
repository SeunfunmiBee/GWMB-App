-- Content publication readiness and authoritative marketplace synchronisation.
--
-- This migration deliberately does not invent missing editorial or operational data.
-- Legacy values are only reshaped or copied from fields that already exist. Records
-- that still need real course lessons, dates, links, files, or speaker details remain
-- editable and are surfaced by list_content_publication_readiness().

-- The previous trigger applied one blanket rule to every content type. Remove it
-- before reshaping legacy published rows so those safe migrations are not blocked.
drop trigger if exists validate_content_before_publication on public.content_items;

-- Common publishing metadata can be derived without changing editorial meaning.
-- access_level and area are already the source fields for audience and surfaces.
update public.content_items
set metadata = metadata
  || case
    when nullif(trim(coalesce(metadata->>'audience','')),'') is null then
      jsonb_build_object(
        'audience',
        case access_level
          when 'members' then 'members-only'
          when 'account' then 'registered-users'
          when 'admin' then 'admins'
          else 'everyone'
        end
      )
    else '{}'::jsonb
  end
  || case
    when content_type in ('course','event','resource','opportunity','member_win','member_spotlight')
      and jsonb_array_length(
        case when jsonb_typeof(metadata->'surfaces') = 'array'
          then metadata->'surfaces' else '[]'::jsonb end
      ) = 0 then
      jsonb_build_object(
        'surfaces',
        jsonb_build_array(
          case
            when content_type in ('course','resource') then 'learn'
            when content_type = 'opportunity' then 'opportunities'
            when content_type = 'event' then 'events'
            else 'home'
          end
        )
      )
    else '{}'::jsonb
  end
where content_type in ('course','event','resource','opportunity','member_win','member_spotlight');

-- The old seed stored only one description. Reusing it as full details preserves
-- the exact existing copy while making the record editable in the current builder.
update public.content_items
set body = summary
where content_type in ('course','event','resource','opportunity')
  and nullif(trim(coalesce(body,'')),'') is null
  and nullif(trim(coalesce(summary,'')),'') is not null;

-- Preserve an old numeric lesson total, but replace the incompatible scalar with
-- an editable lesson array. No lesson titles, media, notes, or IDs are fabricated.
update public.content_items
set metadata = (metadata - 'lessons')
  || jsonb_build_object('legacy_lesson_count', metadata->'lessons', 'lessons', '[]'::jsonb)
where content_type = 'course'
  and metadata ? 'lessons'
  and jsonb_typeof(metadata->'lessons') in ('number','string');

-- Reuse a legacy course eyebrow as its category only when no category exists.
update public.content_items
set metadata = metadata || jsonb_build_object('category', eyebrow)
where content_type = 'course'
  and nullif(trim(coalesce(metadata->>'category','')),'') is null
  and nullif(trim(coalesce(eyebrow,'')),'') is not null;

-- Convert legacy instructor and speaker strings into the object shape expected by
-- the editors. Every populated property below comes from an existing stored field.
update public.content_items
set metadata = (metadata - 'instructor') || jsonb_build_object(
  'instructor',
  jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(trim(metadata->>'instructor'),''),
    'role', nullif(trim(coalesce(metadata->>'instructor_role',metadata->>'role','')),''),
    'bio', nullif(trim(coalesce(metadata->>'instructor_bio',metadata->>'instructorAbout','')),''),
    'image_url', nullif(trim(coalesce(metadata->>'instructor_image_url','')),'')
  ))
)
where content_type = 'course'
  and jsonb_typeof(metadata->'instructor') = 'string'
  and nullif(trim(metadata->>'instructor'),'') is not null;

update public.content_items
set metadata = (metadata - 'speaker') || jsonb_build_object(
  'speaker',
  jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(trim(metadata->>'speaker'),''),
    'role', nullif(trim(coalesce(metadata->>'speaker_role',metadata->>'role','')),''),
    'bio', nullif(trim(coalesce(metadata->>'speaker_bio',metadata->>'speakerAbout','')),''),
    'image_url', nullif(trim(coalesce(metadata->>'speaker_image_url','')),'')
  ))
)
where content_type = 'event'
  and jsonb_typeof(metadata->'speaker') = 'string'
  and nullif(trim(metadata->>'speaker'),'') is not null;

-- Resource formats and URLs were stored under several historical keys. Normalize
-- only values that are actually present; absent uploads/links remain absent.
update public.content_items
set metadata = metadata || jsonb_build_object('resource_type', lower(trim(metadata->>'format')))
where content_type = 'resource'
  and nullif(trim(coalesce(metadata->>'resource_type','')),'') is null
  and nullif(trim(coalesce(metadata->>'format','')),'') is not null;

update public.content_items
set metadata = metadata || jsonb_build_object(
  'url',
  coalesce(
    nullif(trim(metadata->>'resource_url'),''),
    nullif(trim(metadata->>'download_url'),''),
    nullif(trim(metadata->>'external_url'),''),
    nullif(trim(metadata->>'file_url'),'')
  )
)
where content_type = 'resource'
  and nullif(trim(coalesce(metadata->>'url','')),'') is null
  and coalesce(
    nullif(trim(metadata->>'resource_url'),''),
    nullif(trim(metadata->>'download_url'),''),
    nullif(trim(metadata->>'external_url'),''),
    nullif(trim(metadata->>'file_url'),'')
  ) is not null;

-- Return a structured list so the same readiness contract powers both the trigger
-- and Admin reporting. "error" blocks a new publication; "warning" is operational
-- follow-up that may legitimately be completed after registration opens.
create or replace function public.content_publication_issues(p_item public.content_items)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_meta jsonb := coalesce(p_item.metadata,'{}'::jsonb);
  v_lesson jsonb;
  v_lesson_index integer := 0;
  v_sections jsonb;
  v_format text := lower(trim(coalesce(v_meta->>'format','')));
  v_capacity integer;
  v_deadline timestamptz;
  v_audience text := trim(coalesce(v_meta->>'audience',''));
  v_has_career_fields boolean := false;
begin
  if nullif(trim(coalesce(p_item.slug,'')),'') is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','slug','label','Add a content slug','severity','error'));
  end if;
  if nullif(trim(coalesce(p_item.title,'')),'') is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','title','label','Add a title','severity','error'));
  end if;
  if p_item.status = 'scheduled' and (p_item.publish_at is null or p_item.publish_at <= now()) then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','publish_at','label','Choose a future publish date','severity','error'));
  end if;

  -- Only inventory-backed content needs audience and surface distribution metadata.
  if p_item.content_type in ('course','event','resource','opportunity','member_win','member_spotlight') then
    if v_audience = '' then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.audience','label','Choose an audience','severity','error'));
    end if;
    if jsonb_array_length(
         case when jsonb_typeof(v_meta->'surfaces') = 'array'
           then v_meta->'surfaces' else '[]'::jsonb end
       ) = 0 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.surfaces','label','Choose at least one app surface','severity','error'));
    end if;
    if jsonb_typeof(v_meta->'career_fields') = 'array' then
      v_has_career_fields := jsonb_array_length(v_meta->'career_fields') > 0;
    elsif nullif(trim(coalesce(v_meta->>'career_fields','')),'') is not null then
      v_has_career_fields := true;
    elsif jsonb_typeof(v_meta->'careerFields') = 'array' then
      v_has_career_fields := jsonb_array_length(v_meta->'careerFields') > 0;
    elsif nullif(trim(coalesce(v_meta->>'careerFields','')),'') is not null then
      v_has_career_fields := true;
    end if;
    if v_audience = 'specific-career-fields' and not v_has_career_fields then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.career_fields','label','Choose career fields for this audience','severity','error'));
    end if;
  end if;

  if p_item.content_type in ('course','event','opportunity') then
    if nullif(trim(coalesce(p_item.summary,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','summary','label','Add a short description','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.body,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','body','label','Add full details','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.route,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','route','label','Add an app route','severity','error'));
    end if;
  elsif p_item.content_type = 'resource' then
    if nullif(trim(coalesce(p_item.summary,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','summary','label','Add a short description','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.route,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','route','label','Add an app route','severity','error'));
    end if;
  elsif p_item.content_type in ('member_win','member_spotlight') then
    if nullif(trim(coalesce(p_item.summary,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','summary','label','Add the spotlight summary','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.route,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','route','label','Add the spotlight route','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.image_url,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','image_url','label','Add the member spotlight image','severity','error'));
    end if;
  end if;

  -- Headers and section labels intentionally need only their title/slug. Tappable
  -- cards need summary copy and a destination, but not an arbitrary cover image.
  if p_item.content_type in (
    'home_prompt','home_signal','home_feature','home_cta','benefit_card',
    'community_event','community_action','community_feature','grow_category'
  ) then
    if nullif(trim(coalesce(p_item.summary,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','summary','label','Add the card description','severity','error'));
    end if;
    if nullif(trim(coalesce(p_item.route,'')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','route','label','Add the card destination','severity','error'));
    end if;
  elsif p_item.content_type = 'community_photo'
    and nullif(trim(coalesce(p_item.image_url,'')),'') is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','image_url','label','Upload the community photo','severity','error'));
  end if;

  if p_item.content_type = 'course' then
    if nullif(trim(coalesce(v_meta->>'category','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.category','label','Choose a course category','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'duration','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.duration','label','Add the total course duration','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{instructor,name}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.instructor.name','label','Add the lecturer name','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{instructor,role}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.instructor.role','label','Add the lecturer role or organisation','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{instructor,bio}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.instructor.bio','label','Add the lecturer biography','severity','warning'));
    end if;
    if jsonb_array_length(
         case when jsonb_typeof(v_meta->'lessons') = 'array'
           then v_meta->'lessons' else '[]'::jsonb end
       ) = 0 then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.lessons','label','Add at least one complete lesson','severity','error'));
    else
      for v_lesson in select value from jsonb_array_elements(v_meta->'lessons') loop
        v_lesson_index := v_lesson_index + 1;
        if nullif(trim(coalesce(v_lesson->>'id','')),'') is null then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code',format('metadata.lessons.%s.id',v_lesson_index),'label',format('Add an ID to lesson %s',v_lesson_index),'severity','error'));
        end if;
        if nullif(trim(coalesce(v_lesson->>'title','')),'') is null then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code',format('metadata.lessons.%s.title',v_lesson_index),'label',format('Add a title to lesson %s',v_lesson_index),'severity','error'));
        end if;
        if nullif(trim(coalesce(v_lesson->>'summary','')),'') is null then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code',format('metadata.lessons.%s.summary',v_lesson_index),'label',format('Add a summary to lesson %s',v_lesson_index),'severity','error'));
        end if;
        if nullif(trim(coalesce(v_lesson->>'duration','')),'') is null then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code',format('metadata.lessons.%s.duration',v_lesson_index),'label',format('Add a duration to lesson %s',v_lesson_index),'severity','error'));
        end if;
        v_sections := case
          when jsonb_typeof(v_lesson->'sections') = 'array' then v_lesson->'sections'
          else '[]'::jsonb
        end;
        if not exists (
          select 1
          from jsonb_array_elements(v_sections) section(value)
          where nullif(trim(coalesce(section.value->>'heading','')),'') is not null
            and nullif(trim(coalesce(section.value->>'body','')),'') is not null
        ) and nullif(trim(coalesce(v_lesson->>'media_url','')),'') is null then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code',format('metadata.lessons.%s.content',v_lesson_index),'label',format('Add notes or media to lesson %s',v_lesson_index),'severity','error'));
        end if;
      end loop;
    end if;

  elsif p_item.content_type = 'event' then
    if p_item.starts_at is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','starts_at','label','Choose the event start date and time','severity','error'));
    end if;
    if p_item.ends_at is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','ends_at','label','Choose the event end date and time','severity','error'));
    elsif p_item.starts_at is not null and p_item.ends_at <= p_item.starts_at then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','ends_at.order','label','Set the event end after its start','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'timezone','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.timezone','label','Choose the event time zone','severity','error'));
    end if;
    if v_format not in ('online','physical','hybrid','live','in_person') then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.format','label','Choose online, physical, or hybrid format','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{speaker,name}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.speaker.name','label','Add the facilitator name','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{speaker,role}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.speaker.role','label','Add the facilitator role or organisation','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta#>>'{speaker,bio}','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.speaker.bio','label','Add the facilitator biography','severity','warning'));
    end if;
    if nullif(trim(coalesce(v_meta->>'capacity','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.capacity','label','Add event capacity','severity','error'));
    else
      begin
        v_capacity := (v_meta->>'capacity')::integer;
        if v_capacity <= 0 then raise invalid_parameter_value; end if;
      exception when others then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.capacity','label','Use a whole-number capacity above zero','severity','error'));
      end;
    end if;
    if nullif(trim(coalesce(v_meta->>'registration_deadline','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.registration_deadline','label','Choose a registration deadline','severity','error'));
    else
      begin
        v_deadline := (v_meta->>'registration_deadline')::timestamptz;
        if p_item.starts_at is not null and v_deadline >= p_item.starts_at then
          v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.registration_deadline.order','label','Set registration to close before the event starts','severity','error'));
        end if;
      exception when others then
        v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.registration_deadline.format','label','Use a valid registration deadline','severity','error'));
      end;
    end if;
    if v_format in ('physical','in_person','hybrid')
       and nullif(trim(coalesce(v_meta->>'venue','')),'') is null
       and nullif(trim(coalesce(v_meta->>'location','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.venue','label','Add the physical venue','severity','error'));
    end if;
    if v_format in ('online','live','hybrid')
       and nullif(trim(coalesce(v_meta->>'meeting_url','')),'') is null
       and nullif(trim(coalesce(v_meta->>'registration_url','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.meeting_url','label','Add the private meeting or external registration link before the event','severity','warning'));
    end if;

  elsif p_item.content_type = 'resource' then
    if nullif(trim(coalesce(v_meta->>'resource_type','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.resource_type','label','Choose the resource format','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'url','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.url','label','Upload the resource or add its link','severity','error'));
    end if;

  elsif p_item.content_type = 'opportunity' then
    if nullif(trim(coalesce(v_meta->>'organisation',v_meta->>'organization','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.organisation','label','Add the organisation','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'type',v_meta->>'opportunity_type','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.type','label','Choose the opportunity type','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'location','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.location','label','Add the opportunity location or remote status','severity','error'));
    end if;
    if nullif(trim(coalesce(v_meta->>'deadline','')),'') is null then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object('code','metadata.deadline','label','Add a deadline or mark the opportunity as rolling','severity','error'));
    end if;
  end if;

  return v_issues;
end;
$$;

revoke execute on function public.content_publication_issues(public.content_items) from public, anon, authenticated;

-- Do not leave legacy rows publicly visible when the safe reshaping above could not
-- supply real operational/editorial data. The record and its prior state are retained
-- for Admin repair; nothing is deleted and no placeholder content is fabricated.
update public.content_items c
set status = 'draft',
    visible = false,
    publish_at = null,
    metadata = coalesce(c.metadata,'{}'::jsonb) || jsonb_build_object(
      'publication_migration',
      jsonb_build_object(
        'previous_status', c.status,
        'previously_visible', c.visible,
        'needs_review', true
      )
    )
where c.status in ('published','scheduled')
  and c.visible
  and exists (
    select 1
    from jsonb_array_elements(public.content_publication_issues(c)) issue
    where issue->>'severity' = 'error'
  );

-- New publication attempts must be complete. Already-public legacy records remain
-- editable while they are repaired, but an edit may not introduce a new blocking
-- issue. Hiding or drafting a record is always allowed.
create or replace function public.validate_content_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_issues jsonb;
  v_old_issues jsonb := '[]'::jsonb;
  v_new_blocking_codes text[] := '{}'::text[];
  v_old_blocking_codes text[] := '{}'::text[];
  v_introduced_codes text[] := '{}'::text[];
  v_labels text;
begin
  if new.status not in ('published','scheduled') or not new.visible then
    return new;
  end if;

  v_new_issues := public.content_publication_issues(new);
  select array(
    select issue->>'code'
    from jsonb_array_elements(v_new_issues) issue
    where issue->>'severity' = 'error'
  ) into v_new_blocking_codes;

  if tg_op = 'INSERT' then
    if cardinality(v_new_blocking_codes) > 0 then
      select string_agg(issue->>'label','; ' order by issue->>'code')
      into v_labels
      from jsonb_array_elements(v_new_issues) issue
      where issue->>'severity' = 'error';
      raise exception using
        errcode = '23514',
        message = 'Content is not ready to publish',
        detail = v_labels;
    end if;
    return new;
  end if;

  if old.status not in ('published','scheduled')
     or not old.visible
     or new.status is distinct from old.status then
    if cardinality(v_new_blocking_codes) > 0 then
      select string_agg(issue->>'label','; ' order by issue->>'code')
      into v_labels
      from jsonb_array_elements(v_new_issues) issue
      where issue->>'severity' = 'error';
      raise exception using
        errcode = '23514',
        message = 'Content is not ready to publish',
        detail = v_labels;
    end if;
    return new;
  end if;

  v_old_issues := public.content_publication_issues(old);
  select array(
    select issue->>'code'
    from jsonb_array_elements(v_old_issues) issue
    where issue->>'severity' = 'error'
  ) into v_old_blocking_codes;
  select array(
    select code
    from unnest(v_new_blocking_codes) code
    where not (code = any(v_old_blocking_codes))
  ) into v_introduced_codes;

  if cardinality(v_introduced_codes) > 0 then
    select string_agg(issue->>'label','; ' order by issue->>'code')
    into v_labels
    from jsonb_array_elements(v_new_issues) issue
    where issue->>'severity' = 'error'
      and issue->>'code' = any(v_introduced_codes);
    raise exception using
      errcode = '23514',
      message = 'This edit would make published content less complete',
      detail = v_labels;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_content_publication() from public, anon, authenticated;
create trigger validate_content_before_publication
before insert or update on public.content_items
for each row execute function public.validate_content_publication();

-- Admin-only readiness report. The function intentionally returns structured issue
-- objects so Admin can group them by field without parsing database error strings.
create or replace function public.list_content_publication_readiness(
  p_area text default null,
  p_only_incomplete boolean default true
)
returns table(
  id uuid,
  area text,
  slug text,
  content_type text,
  title text,
  status text,
  visible boolean,
  issues jsonb,
  blocking_issue_count bigint,
  warning_count bigint,
  ready boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception using errcode = '42501', message = 'Admin access required';
  end if;

  return query
  with readiness as (
    select c.*, public.content_publication_issues(c) as issue_list
    from public.content_items c
    where p_area is null or c.area = p_area
  ), counted as (
    select r.*,
      (select count(*) from jsonb_array_elements(r.issue_list) issue where issue->>'severity' = 'error') as blocker_count,
      (select count(*) from jsonb_array_elements(r.issue_list) issue where issue->>'severity' = 'warning') as warn_count
    from readiness r
  )
  select c.id, c.area, c.slug, c.content_type, c.title, c.status, c.visible,
    c.issue_list, c.blocker_count, c.warn_count, c.blocker_count = 0, c.updated_at
  from counted c
  where not coalesce(p_only_incomplete,true) or c.blocker_count > 0 or c.warn_count > 0
  order by
    case when c.status in ('published','scheduled') and c.visible then 0 else 1 end,
    c.blocker_count desc,
    c.warn_count desc,
    c.updated_at desc;
end;
$$;

revoke execute on function public.list_content_publication_readiness(text,boolean) from public, anon;
grant execute on function public.list_content_publication_readiness(text,boolean) to authenticated;

-- Helpers used by the marketplace sync stay private to database triggers.
create or replace function public.content_jsonb_text_array(p_value jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(item.value #>> '{}'), array[]::text[])
  from jsonb_array_elements(
    case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
  ) item(value)
  where jsonb_typeof(item.value) = 'string';
$$;

create or replace function public.content_try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(p_value,'')),'') is null then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end;
$$;

revoke execute on function public.content_jsonb_text_array(jsonb) from public, anon, authenticated;
revoke execute on function public.content_try_timestamptz(text) from public, anon, authenticated;

create or replace function public.upsert_content_marketplace_inventory(p_item public.content_items)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(p_item.metadata,'{}'::jsonb);
  v_career_areas text[] := '{}'::text[];
  v_skills text[] := '{}'::text[];
  v_journey_stages text[] := '{}'::text[];
  v_readiness_gaps text[] := '{}'::text[];
  v_career_stages text[] := '{}'::text[];
  v_prerequisites text[] := '{}'::text[];
  v_deadline timestamptz;
  v_location text;
  v_availability text;
  v_action_label text;
  v_tone text;
  v_priority integer;
begin
  if p_item.content_type not in ('course','event','resource','opportunity') then
    return;
  end if;

  -- No parallel inventory record may outlive, precede, or override Admin content.
  if p_item.status <> 'published'
     or not p_item.visible
     or p_item.access_level in ('account','admin')
     or (p_item.publish_at is not null and p_item.publish_at > now())
     or nullif(trim(coalesce(p_item.route,'')),'') is null then
    delete from public.marketplace_inventory
    where content_type = p_item.content_type and source_id = p_item.slug;
    return;
  end if;

  v_career_areas := public.content_jsonb_text_array(
    case
      when jsonb_typeof(v_meta->'career_areas') = 'array' then v_meta->'career_areas'
      when jsonb_typeof(v_meta->'careerAreas') = 'array' then v_meta->'careerAreas'
      when jsonb_typeof(v_meta->'career_fields') = 'array' then v_meta->'career_fields'
      when jsonb_typeof(v_meta->'careerFields') = 'array' then v_meta->'careerFields'
      when jsonb_typeof(v_meta->'fields') = 'array' then v_meta->'fields'
      else '[]'::jsonb
    end
  );
  v_skills := public.content_jsonb_text_array(coalesce(v_meta->'skills','[]'::jsonb));
  v_journey_stages := public.content_jsonb_text_array(coalesce(v_meta->'journey_stages',v_meta->'journeyStages','[]'::jsonb));
  v_readiness_gaps := public.content_jsonb_text_array(coalesce(v_meta->'readiness_gaps',v_meta->'readinessGaps','[]'::jsonb));
  v_career_stages := public.content_jsonb_text_array(coalesce(v_meta->'career_stages',v_meta->'careerStages','[]'::jsonb));
  v_prerequisites := public.content_jsonb_text_array(coalesce(v_meta->'prerequisites','[]'::jsonb));
  v_deadline := public.content_try_timestamptz(coalesce(v_meta->>'deadline_at',v_meta->>'deadlineAt',v_meta->>'deadline'));
  v_location := coalesce(
    nullif(trim(v_meta->>'location'),''),
    nullif(trim(v_meta->>'venue'),''),
    case when p_item.content_type in ('course','resource') then 'Online' else null end
  );

  if p_item.content_type = 'event' then
    v_availability := case
      when p_item.starts_at is null then 'draft'
      when p_item.ends_at is not null and p_item.ends_at < now() then 'archived'
      when p_item.starts_at > now() then 'scheduled'
      else 'available'
    end;
  elsif p_item.content_type = 'opportunity' and v_deadline is not null and v_deadline < now() then
    v_availability := 'closed';
  else
    v_availability := 'available';
  end if;

  v_action_label := coalesce(
    nullif(trim(v_meta->>'action_label'),''),
    nullif(trim(v_meta->>'actionLabel'),''),
    case p_item.content_type
      when 'course' then 'Start learning'
      when 'event' then 'View session'
      when 'resource' then 'Open resource'
      else 'View opportunity'
    end
  );
  v_tone := coalesce(nullif(trim(v_meta->>'color'),''),nullif(trim(v_meta->>'tone'),''),'#A81455');
  v_priority := case
    when coalesce(v_meta->>'priority','') ~ '^\d+$' then (v_meta->>'priority')::integer
    when p_item.featured then 95
    else greatest(0,70 - greatest(p_item.sort_order,0))
  end;

  insert into public.marketplace_inventory as inventory(
    id,source_id,content_type,title,summary,route,career_areas,skills,journey_stages,
    readiness_gaps,career_stages,access_level,location,starts_at,deadline_at,
    availability,prerequisites,action_label,tone,priority,metadata,published
  ) values (
    'content-' || p_item.id::text,p_item.slug,p_item.content_type,p_item.title,
    coalesce(p_item.summary,''),p_item.route,v_career_areas,v_skills,v_journey_stages,
    v_readiness_gaps,v_career_stages,
    case when p_item.access_level = 'members' then 'Members Only' else 'Open Access' end,
    v_location,p_item.starts_at,v_deadline,v_availability,v_prerequisites,v_action_label,
    v_tone,v_priority,
    v_meta || jsonb_build_object(
      'source','content_items','content_id',p_item.id,'area',p_item.area,
      'image_url',p_item.image_url
    ),true
  )
  on conflict (content_type,source_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    route = excluded.route,
    career_areas = excluded.career_areas,
    skills = excluded.skills,
    journey_stages = excluded.journey_stages,
    readiness_gaps = excluded.readiness_gaps,
    career_stages = excluded.career_stages,
    access_level = excluded.access_level,
    location = excluded.location,
    starts_at = excluded.starts_at,
    deadline_at = excluded.deadline_at,
    availability = excluded.availability,
    prerequisites = excluded.prerequisites,
    action_label = excluded.action_label,
    tone = excluded.tone,
    priority = excluded.priority,
    metadata = excluded.metadata,
    published = true;
end;
$$;

revoke execute on function public.upsert_content_marketplace_inventory(public.content_items) from public, anon, authenticated;

create or replace function public.sync_content_item_marketplace_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.content_type in ('course','event','resource','opportunity') then
      delete from public.marketplace_inventory
      where content_type = old.content_type and source_id = old.slug;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.content_type in ('course','event','resource','opportunity')
     and (old.content_type is distinct from new.content_type or old.slug is distinct from new.slug) then
    delete from public.marketplace_inventory
    where content_type = old.content_type and source_id = old.slug;
  end if;

  perform public.upsert_content_marketplace_inventory(new);
  return new;
end;
$$;

revoke execute on function public.sync_content_item_marketplace_inventory() from public, anon, authenticated;
drop trigger if exists sync_content_item_marketplace_inventory on public.content_items;
create trigger sync_content_item_marketplace_inventory
after insert or update or delete on public.content_items
for each row execute function public.sync_content_item_marketplace_inventory();

-- Bring matching live Admin records across first, preserving any existing curated
-- recommendation tags where the content item does not yet carry replacements.
do $$
declare
  v_item public.content_items%rowtype;
begin
  for v_item in
    select * from public.content_items
    where content_type in ('course','event','resource','opportunity')
  loop
    perform public.upsert_content_marketplace_inventory(v_item);
  end loop;
end;
$$;

-- Core catalogue rows without a live Admin record are legacy/demo orphans. Remove
-- them so recommendation RPCs cannot surface deleted, hidden, draft, or future
-- content. Mentorship/pathway inventory is owned by its dedicated source and remains.
delete from public.marketplace_inventory inventory
where inventory.content_type in ('course','event','resource','opportunity')
  and not exists (
    select 1
    from public.content_items content
    where content.content_type = inventory.content_type
      and content.slug = inventory.source_id
      and content.status = 'published'
      and content.visible
      and content.access_level not in ('account','admin')
      and (content.publish_at is null or content.publish_at <= now())
      and nullif(trim(coalesce(content.route,'')),'') is not null
  );
