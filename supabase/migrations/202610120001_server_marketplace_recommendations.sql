-- Server-side Marketplace Intelligence with an owner-visible decision audit.

create table if not exists public.marketplace_recommendation_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  marketplace_stage text not null check (marketplace_stage in ('explore', 'prepare', 'access')),
  primary_key text not null,
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  reason_codes text[] not null default '{}',
  recommendation jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists marketplace_recommendation_runs_user_created_idx
  on public.marketplace_recommendation_runs (user_id, created_at desc);

alter table public.marketplace_recommendation_runs enable row level security;
revoke all on table public.marketplace_recommendation_runs from anon, authenticated;
grant select on table public.marketplace_recommendation_runs to authenticated;

drop policy if exists "Recommendation runs are visible to their owner" on public.marketplace_recommendation_runs;
create policy "Recommendation runs are visible to their owner"
on public.marketplace_recommendation_runs for select
to authenticated
using ((select auth.uid()) = user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.marketplace_item_json(
  p_item public.marketplace_inventory,
  p_key text,
  p_eyebrow text,
  p_why text,
  p_icon text,
  p_addresses text
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select jsonb_build_object(
    'key', p_key,
    'eyebrow', p_eyebrow,
    'title', p_item.title,
    'shortExplanation', p_item.summary,
    'whyThisNow', p_why,
    'actionType', p_item.content_type,
    'linkedItemId', p_item.source_id,
    'cta', p_item.action_label,
    'route', p_item.route,
    'accessLevel', p_item.access_level,
    'icon', p_icon,
    'tone', p_item.tone,
    'addresses', p_addresses
  );
$function$;

create or replace function public.get_marketplace_recommendation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
  v_journey public.marketplace_journeys%rowtype;
  v_readiness public.marketplace_readiness_profiles%rowtype;
  v_cv_progress public.course_progress%rowtype;
  v_item public.marketplace_inventory%rowtype;
  v_primary jsonb;
  v_for_you jsonb := '[]'::jsonb;
  v_question jsonb;
  v_stage text := 'prepare';
  v_stage_explanation text := 'You’re currently preparing for opportunities.';
  v_confidence text := 'medium';
  v_primary_key text;
  v_reason_codes text[] := '{}';
  v_dismissed text[] := '{}';
  v_is_member boolean := false;
  v_application_count integer := 0;
  v_career_clarity text := 'unknown';
  v_skill_readiness text := 'unknown';
  v_foundational_knowledge text := 'unknown';
  v_evidence text := 'unknown';
  v_opportunity_readiness text := 'not_ready';
  v_has_cv boolean;
  v_cv_reviewed boolean;
  v_interview_prepared boolean;
  v_is_employment_goal boolean := false;
  v_is_business_goal boolean := false;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_journey
  from public.marketplace_journeys
  where user_id = v_user_id and onboarding_completed = true;

  if not found then
    return jsonb_build_object('configured', false, 'reason', 'marketplace_journey_required');
  end if;

  select * into v_readiness
  from public.marketplace_readiness_profiles
  where user_id = v_user_id;

  select * into v_cv_progress
  from public.course_progress
  where user_id = v_user_id and course_id = 'workplace-foundations';

  select exists(
    select 1 from public.memberships
    where user_id = v_user_id and status = 'verified'
  ) into v_is_member;

  select count(*)::integer into v_application_count
  from public.opportunity_applications
  where user_id = v_user_id and status in ('submitted', 'under_review', 'successful');

  select coalesce(array_agg(distinct recommendation_key), '{}') into v_dismissed
  from public.marketplace_recommendation_feedback
  where user_id = v_user_id and action in ('dismissed', 'alternate_requested');

  v_career_clarity := coalesce(v_readiness.career_clarity, 'unknown');
  v_skill_readiness := coalesce(v_readiness.skill_readiness, 'unknown');
  v_foundational_knowledge := coalesce(v_readiness.foundational_knowledge, 'unknown');
  v_evidence := coalesce(v_readiness.evidence_of_ability, 'unknown');
  v_opportunity_readiness := case when v_application_count > 0 then 'reasonably_ready' else coalesce(v_readiness.opportunity_readiness, 'not_ready') end;
  v_has_cv := v_readiness.has_cv;
  v_cv_reviewed := v_readiness.cv_reviewed;
  v_interview_prepared := v_readiness.interview_preparation_completed;

  if v_cv_progress.completed_at is not null or cardinality(coalesce(v_cv_progress.completed_lesson_ids, '{}')) >= 6 then
    v_has_cv := true;
  end if;

  v_is_employment_goal := v_journey.primary_goal in ('first-internship', 'first-job', 'break-into-career', 'improve-profile', 'grow-career');
  v_is_business_goal := v_journey.primary_goal in ('start-business', 'grow-business');

  if v_opportunity_readiness = 'reasonably_ready' or v_application_count > 0 then
    v_stage := 'access';
    v_stage_explanation := 'You’re ready to access and act on suitable opportunities.';
  elsif v_journey.primary_goal = 'discover-career' or v_career_clarity = 'exploring' then
    v_stage := 'explore';
    v_stage_explanation := 'You’re currently exploring your direction.';
  end if;

  if (v_journey.primary_goal = 'discover-career' or v_is_employment_goal) and v_career_clarity = 'unknown' then
    v_question := jsonb_build_object(
      'id', 'career_clarity',
      'prompt', case when v_journey.primary_goal = 'discover-career'
        then 'Do you already know the kind of career you want to explore?'
        else 'Do you already know the role or career you want to work towards?' end,
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Yes', 'patch', jsonb_build_object('career_clarity', 'selected')),
        jsonb_build_object('label', 'Still exploring', 'patch', jsonb_build_object('career_clarity', 'exploring', 'guidance_need', 'career_discovery'))
      )
    );
    v_confidence := 'low';
  elsif v_is_employment_goal and v_has_cv is null then
    v_question := jsonb_build_object(
      'id', 'has_cv',
      'prompt', 'Do you already have a CV you would confidently use for your target role?',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Yes', 'patch', jsonb_build_object('has_cv', true)),
        jsonb_build_object('label', 'Not yet', 'patch', jsonb_build_object('has_cv', false)),
        jsonb_build_object('label', 'I’m not sure', 'patch', jsonb_build_object('has_cv', true, 'cv_reviewed', false))
      )
    );
    v_confidence := 'low';
  elsif v_is_employment_goal and v_skill_readiness <> 'unknown' and v_evidence = 'unknown' then
    v_question := jsonb_build_object(
      'id', 'evidence_of_ability',
      'prompt', 'Have you completed a practical project or relevant piece of work yet?',
      'options', jsonb_build_array(
        jsonb_build_object('label', 'Yes', 'patch', jsonb_build_object('evidence_of_ability', 'limited')),
        jsonb_build_object('label', 'Not yet', 'patch', jsonb_build_object('evidence_of_ability', 'none'))
      )
    );
    v_confidence := 'low';
  end if;

  -- Priority 1: continue important unfinished work.
  if v_is_employment_goal
    and v_cv_progress.user_id is not null
    and v_cv_progress.completed_at is null
    and cardinality(coalesce(v_cv_progress.completed_lesson_ids, '{}')) < 6
    and not ('continue-cv' = any(v_dismissed)) then
    select * into v_item from public.marketplace_inventory
    where content_type = 'course' and source_id = 'workplace-foundations'
      and published and availability in ('available', 'scheduled')
    limit 1;
    if found then
      v_primary_key := 'continue-cv';
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'CONTINUE YOUR JOURNEY', 'Finishing an important action you have started is more useful than adding another activity.', 'play-circle-outline', 'professional_positioning')
        || jsonb_build_object('title', 'Finish ' || v_item.title, 'shortExplanation', 'You have completed ' || cardinality(coalesce(v_cv_progress.completed_lesson_ids, '{}')) || ' of 6 lessons. Complete the next one while the work is still fresh.', 'cta', 'Continue course');
      v_reason_codes := array['unfinished_relevant_action','verified_course_progress'];
      v_confidence := case when v_question is null then 'high' else v_confidence end;
    end if;
  end if;

  -- Priority 2: an approaching event the user has already committed to.
  if v_primary is null and not ('registered-event' = any(v_dismissed)) then
    select i.* into v_item
    from public.event_registrations r
    join public.marketplace_inventory i on i.content_type = 'event' and i.source_id = r.event_id
    where r.user_id = v_user_id and r.status <> 'cancelled'
      and i.published and i.availability in ('available', 'scheduled')
      and i.starts_at > v_now
    order by i.starts_at asc
    limit 1;
    if found and v_item.starts_at <= v_now + interval '7 days' then
      v_primary_key := 'registered-event';
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'YOUR NEXT COMMITMENT', 'The event is approaching and preparation will help you get more value from it.', 'calendar-outline', 'time_sensitive')
        || jsonb_build_object('title', 'Get ready for ' || v_item.title, 'shortExplanation', 'Your place is saved. Review the details and arrive prepared to participate.');
      v_reason_codes := array['time_sensitive','registered_event'];
      v_confidence := case when v_question is null then 'high' else v_confidence end;
    end if;
  end if;

  -- Priority 3: resolve the largest blocking readiness gap.
  if v_primary is null and v_is_business_goal then
    select * into v_item from public.marketplace_inventory
    where published and availability in ('available', 'scheduled')
      and (deadline_at is null or deadline_at >= v_now)
      and ('business_finance' = any(readiness_gaps) or 'business_growth' = any(readiness_gaps))
      and (access_level = 'Open Access' or v_is_member)
      and not ('business-' || source_id = any(v_dismissed))
    order by (access_level = 'Open Access') desc, priority desc
    limit 1;
    if found then
      v_primary_key := 'business-' || v_item.source_id;
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'BUILD YOUR BUSINESS', 'This is the strongest available match for the business capability you are building now.', case when v_item.content_type = 'course' then 'cash-outline' else 'calendar-outline' end, coalesce(v_item.readiness_gaps[1], 'business_growth'));
      v_reason_codes := array['business_path','inventory_match'];
    end if;
  elsif v_primary is null and (v_journey.primary_goal = 'discover-career' or v_career_clarity in ('unknown', 'exploring')) and not ('career-discovery' = any(v_dismissed)) then
    select * into v_item from public.marketplace_inventory
    where published and availability in ('available', 'scheduled')
      and (deadline_at is null or deadline_at >= v_now)
      and 'career_clarity' = any(readiness_gaps)
      and (access_level = 'Open Access' or v_is_member)
      and (cardinality(career_areas) = 0 or career_areas && v_journey.interests)
    order by (career_areas && v_journey.interests) desc, priority desc
    limit 1;
    v_primary_key := 'career-discovery';
    if found then
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'DISCOVER YOUR DIRECTION', 'A clearer direction will make every learning and opportunity decision more useful.', 'compass-outline', 'career_clarity');
      v_reason_codes := array['career_clarity_gap','inventory_match'];
    else
      v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','DISCOVER YOUR DIRECTION','title','Explore a career before you commit to it','shortExplanation','Explore guidance and resources that help you understand the work before choosing a path.','whyThisNow','A clearer direction will make every learning and opportunity decision more useful.','actionType','pathway','linkedItemId',null,'cta','Explore career guidance','route','/grow/mentorship','accessLevel','Open Access','icon','compass-outline','tone','#7A35D1','addresses','career_clarity');
      v_reason_codes := array['career_clarity_gap','generic_intervention_no_inventory_match'];
    end if;
  elsif v_primary is null and v_journey.primary_goal = 'learn-skill' and not ('foundational-learning' = any(v_dismissed)) then
    v_primary_key := 'foundational-learning';
    v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','BUILD THE FOUNDATION','title','Start building practical ' || coalesce(v_journey.interests[1], 'professional') || ' skills','shortExplanation','Choose focused beginner learning that helps you understand the work and practise the essentials.','whyThisNow','You have a direction. The next useful step is building the foundation required to act on it.','actionType','pathway','linkedItemId','learning','cta','Explore skill pathways','route','/grow/learning','accessLevel','Open Access','icon','play-circle-outline','tone','#3150E8','addresses','skill_readiness');
    v_reason_codes := array['skill_goal','foundational_learning'];
  elsif v_primary is null and v_evidence = 'none' and not ('practical-evidence' = any(v_dismissed)) then
    v_primary_key := 'practical-evidence';
    v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','SHOW WHAT YOU CAN DO','title','Create one practical piece of evidence','shortExplanation','Turn what you know into a project, portfolio sample or real piece of work you can discuss.','whyThisNow','Evidence makes your skills easier for an employer, client or mentor to understand.','actionType','pathway','linkedItemId','learning','cta','Find practical learning','route','/grow/learning','accessLevel','Open Access','icon','sparkles-outline','tone','#078765','addresses','evidence_of_ability');
    v_reason_codes := array['evidence_gap'];
  elsif v_primary is null and v_is_employment_goal and (v_has_cv is false or v_has_cv is null) and not ('build-cv' = any(v_dismissed)) then
    select * into v_item from public.marketplace_inventory
    where content_type = 'course' and source_id = 'workplace-foundations'
      and published and availability in ('available', 'scheduled')
    limit 1;
    if found then
      v_primary_key := 'build-cv';
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'POSITION YOUR EXPERIENCE', 'An appropriate CV is a core requirement for most internship and job applications.', 'document-text-outline', 'professional_positioning')
        || jsonb_build_object('title','Build a CV that is ready for applications');
      v_reason_codes := array['professional_positioning_gap','inventory_match'];
    end if;
  elsif v_primary is null and v_is_employment_goal and (v_cv_reviewed is false or v_cv_reviewed is null) and not ('cv-review' = any(v_dismissed)) then
    v_primary_key := 'cv-review';
    v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','REFINE YOUR POSITIONING','title','Get focused feedback on your CV','shortExplanation','Use GWMB career support to identify the changes that will make your CV clearer and more relevant.','whyThisNow','You already have a CV. Feedback is more useful now than starting it again.','actionType','pathway','linkedItemId','career','cta','Explore career support','route','/grow/career','accessLevel','Open Access','icon','person-outline','tone','#111011','addresses','cv_reviewed');
    v_reason_codes := array['cv_review_gap'];
  elsif v_primary is null and v_application_count > 0 and coalesce(v_interview_prepared, false) = false and not ('interview-prep' = any(v_dismissed)) then
    v_primary_key := 'interview-prep';
    v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','PREPARE FOR THE CONVERSATION','title','Practise telling your story with confidence','shortExplanation','Prepare examples that show how your skills, choices and experience connect to the role.','whyThisNow','You have started applying, so interview preparation is now more useful than another general course.','actionType','pathway','linkedItemId','career','cta','Prepare for interviews','route','/grow/career','accessLevel','Open Access','icon','person-outline','tone','#3150E8','addresses','interview_readiness');
    v_reason_codes := array['active_application','interview_readiness_gap'];
  end if;

  -- Priority 5: opportunity access. This is also the safe final fallback.
  if v_primary is null then
    select * into v_item from public.marketplace_inventory
    where content_type = 'opportunity' and published and availability in ('available', 'scheduled')
      and (deadline_at is null or deadline_at >= v_now)
      and (access_level = 'Open Access' or v_is_member)
      and (cardinality(career_stages) = 0 or v_journey.career_stage = any(career_stages))
      and not ('opportunity-' || source_id = any(v_dismissed))
    order by
      (career_areas && v_journey.interests) desc,
      (access_level = 'Open Access') desc,
      priority desc
    limit 1;
    if found then
      v_primary_key := 'opportunity-' || v_item.source_id;
      v_primary := private.marketplace_item_json(v_item, v_primary_key, 'A MATCH FOR YOUR NEXT STEP', 'More preparation should not delay a suitable application when you are reasonably ready.', 'briefcase-outline', 'opportunity_readiness');
      v_reason_codes := array['opportunity_access','eligibility_match','inventory_match'];
      v_confidence := case when v_question is null then 'high' else v_confidence end;
    else
      v_primary_key := 'explore-opportunities';
      v_primary := jsonb_build_object('key',v_primary_key,'eyebrow','KEEP EXPLORING','title','Explore current opportunities','shortExplanation','Review what is available and focus on opportunities whose requirements match your current stage.','whyThisNow','Seeing real requirements can help you choose the most useful preparation.','actionType','pathway','linkedItemId',null,'cta','Explore opportunities','route','/opportunities','accessLevel','Open Access','icon','briefcase-outline','tone','#078765','addresses','opportunity_readiness');
      v_reason_codes := array['no_live_eligible_inventory_match'];
    end if;
  end if;

  -- Supporting recommendations are live inventory only and never duplicate the primary route.
  select coalesce(jsonb_agg(recommendation order by score desc), '[]'::jsonb) into v_for_you
  from (
    select private.marketplace_item_json(
      i,
      'inventory-' || i.id,
      case i.content_type when 'opportunity' then 'MATCHED OPPORTUNITY' when 'event' then 'LIVE GUIDANCE' when 'mentorship' then 'GUIDANCE FOR YOU' when 'course' then 'RECOMMENDED LEARNING' else 'FOR YOUR JOURNEY' end,
      'This complements your primary next move without repeating it.',
      case i.content_type when 'opportunity' then 'briefcase-outline' when 'event' then 'calendar-outline' when 'mentorship' then 'person-outline' when 'course' then 'play-circle-outline' else 'sparkles-outline' end,
      coalesce(i.readiness_gaps[1], 'journey_support')
    ) as recommendation,
    i.priority
      + case when i.career_areas && v_journey.interests then 30 else 0 end
      + case when v_journey.career_stage = any(i.career_stages) or cardinality(i.career_stages) = 0 then 15 else -30 end
      + case when i.access_level = 'Open Access' or v_is_member then 15 else -5 end as score
    from public.marketplace_inventory i
    where i.published and i.availability in ('available', 'scheduled')
      and (i.deadline_at is null or i.deadline_at >= v_now)
      and i.route <> (v_primary->>'route')
      and not ('inventory-' || i.id = any(v_dismissed))
    order by score desc
    limit 2
  ) ranked;

  if not exists (
    select 1 from public.marketplace_recommendation_runs
    where user_id = v_user_id and primary_key = v_primary_key
      and recommendation = v_primary and created_at > v_now - interval '5 minutes'
  ) then
    insert into public.marketplace_recommendation_runs
      (user_id, marketplace_stage, primary_key, confidence, reason_codes, recommendation)
    values
      (v_user_id, v_stage, v_primary_key, v_confidence, v_reason_codes, v_primary);
  end if;

  return jsonb_build_object(
    'configured', true,
    'stage', v_stage,
    'stageExplanation', v_stage_explanation,
    'primary', v_primary,
    'forYou', v_for_you,
    'contextualQuestion', v_question,
    'confidence', v_confidence,
    'reasonCodes', to_jsonb(v_reason_codes),
    'generatedAt', v_now
  );
end;
$function$;

revoke all on function public.get_marketplace_recommendation() from public, anon;
grant execute on function public.get_marketplace_recommendation() to authenticated;
