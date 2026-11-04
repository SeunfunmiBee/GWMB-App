-- Make the three mentorship experiences available to Marketplace Intelligence.

insert into public.marketplace_inventory
  (id, source_id, content_type, title, summary, route, career_areas, skills, journey_stages, readiness_gaps, career_stages, access_level, location, availability, prerequisites, action_label, tone, priority, metadata)
values
  ('mentorship-discovery', 'discovery', 'mentorship', 'Explore careers through Discovery Mentorship', 'Join honest conversations that help you understand a career before choosing it.', '/mentorship/discovery', '{}', array['Career Discovery'], array['explore'], array['career_clarity'], array['student','nysc','recent-graduate','early-career'], 'Open Access', 'Online', 'available', '{}', 'Explore Discovery Mentorship', '#7A35D1', 92, '{"mentorship_type":"discovery"}'::jsonb),
  ('mentorship-industry', 'industry', 'mentorship', 'Grow through Industry Mentorship', 'Get deeper professional guidance in the field you have chosen.', '/mentorship/industry', '{}', array['Industry Understanding'], array['prepare'], array['industry_understanding','guidance'], array['student','nysc','recent-graduate','early-career'], 'Open Access', 'Online', 'available', '{}', 'Explore Industry Mentorship', '#3150E8', 78, '{"mentorship_type":"industry"}'::jsonb),
  ('mentorship-one-on-one', 'one-on-one', 'mentorship', 'Request focused one-on-one guidance', 'Apply for individual guidance on a specific career decision or challenge.', '/mentorship/one-on-one', '{}', array['Career Guidance'], array['prepare'], array['guidance'], array['student','nysc','recent-graduate','early-career','entrepreneur'], 'Members Only', 'Online', 'available', '{}', 'Explore One-on-One Mentorship', '#A81455', 70, '{"mentorship_type":"one_on_one"}'::jsonb)
on conflict (id) do update set
  title=excluded.title,
  summary=excluded.summary,
  route=excluded.route,
  journey_stages=excluded.journey_stages,
  readiness_gaps=excluded.readiness_gaps,
  access_level=excluded.access_level,
  availability=excluded.availability,
  action_label=excluded.action_label,
  tone=excluded.tone,
  priority=excluded.priority,
  metadata=excluded.metadata,
  published=true;
