-- Fine-grained editable inventory for every Home and Community module.

alter table public.content_items add column if not exists visible boolean not null default true;

insert into public.content_items(area,slug,content_type,title,eyebrow,summary,body,route,access_level,status,featured,sort_order,metadata)
values
('home','page-greeting','home_header','Hey, {firstName}','YOUR GWMB TODAY','You’re one step closer to the woman you’re becoming.',null,'/','open','published',true,1,'{"module":"header","icon":"sparkles"}'),
('home','guest-account-prompt','home_prompt','Make GWMB yours','GUEST','Create an account to save courses, events and opportunities.',null,'/welcome','open','published',true,2,'{"module":"guest_prompt","cta":"Create an account"}'),
('home','journey-prompt','home_prompt','Tell us where you’re trying to go.','MAKE HOME WORK FOR YOU','Choose your goal, career stage and interests. We’ll recommend the most useful thing to do next.',null,'/marketplace-journey','account','published',true,3,'{"module":"journey_prompt","meta":"3 QUICK STEPS","cta":"Find my next move"}'),
('home','today-section','home_section','Today in GWMB','TODAY IN GWMB','Fresh activities, resources and opportunities.',null,null,'open','published',true,10,'{"module":"today","badge":"FRESH"}'),
('home','today-planning','home_signal','The Weekly Planning Template','NEW FOR YOU','A practical 5-page resource.',null,'/resource/weekly-planning','open','published',true,11,'{"module":"today","icon":"document-text-outline","color":"#EFEDFF"}'),
('home','picked-section','home_section','What’s worth your time','PICKED FOR YOU','A rotating edit of useful GWMB experiences.',null,null,'open','published',true,20,'{"module":"picked"}'),
('home','picked-product','home_feature','Could product management be your next move?','LIVE CAREER SESSION','An honest conversation with Adeola Adeyemi.',null,'/event/product-manager','open','published',true,21,'{"module":"picked","action":"Reserve your seat","color":"#E62B7F","fallbackImage":"adeola"}'),
('home','picked-cv-course','home_feature','Build a CV that makes people pause.','START IN 42 MINUTES','Six practical lessons. One stronger application.',null,'/course/workplace-foundations','open','published',true,22,'{"module":"picked","action":"Start learning","color":"#111011","dynamicProgress":true}'),
('home','picked-mentor','home_feature','Build visibility with more intention.','MEET YOUR MENTORS','Meet Tosin Adeniran, Social Media Strategist.',null,'/mentor/tosin-adeniran','members','published',true,23,'{"module":"picked","action":"Meet Tosin","color":"#A81455","fallbackImage":"tosin"}'),
('home','activity-section','home_section','Pick up where you left off','YOUR ACTIVITY','Continue learning, reading, events and opportunities.',null,'/activity','account','published',true,30,'{"module":"activity","link":"View all"}'),
('home','benefits-section','home_section','Explore your benefits','YOUR GWMB BENEFITS','Discover the full GWMB experience.',null,null,'open','published',true,40,'{"module":"benefits","swipeLabel":"Swipe"}'),
('home','benefit-career','benefit_card','Career','BENEFIT','Get ready for internships, jobs and the workplace.',null,'/grow/career','open','published',true,41,'{"module":"benefits","icon":"briefcase-outline","color":"#E62B7F","dark":true}'),
('home','benefit-mentorship','benefit_card','Mentorship','BENEFIT','Get guidance from professionals who have walked the path.',null,'/grow/mentorship','open','published',true,42,'{"module":"benefits","icon":"people-outline","color":"#3150E8","dark":true}'),
('home','benefit-learning','benefit_card','Learning & Skills','BENEFIT','Build practical skills beyond the classroom.',null,'/grow/learning','open','published',true,43,'{"module":"benefits","icon":"play-circle-outline","color":"#111011","dark":true}'),
('home','benefit-money','benefit_card','Smart Money','BENEFIT','Make stronger, smarter money decisions.',null,'/grow/money','open','published',true,44,'{"module":"benefits","icon":"wallet-outline","color":"#FFC928","dark":false}'),
('home','benefit-leadership','benefit_card','Leadership','BENEFIT','Develop the confidence and skills to lead.',null,'/grow/leadership','open','published',true,45,'{"module":"benefits","icon":"sparkles-outline","color":"#7A35D1","dark":true}'),
('home','benefit-personal-growth','benefit_card','Personal Growth','BENEFIT','Set meaningful goals and follow through.',null,'/grow/personal-growth','open','published',true,46,'{"module":"benefits","icon":"trending-up-outline","color":"#FF6700","dark":true}'),
('home','benefit-sisterhood','benefit_card','Sisterhood','BENEFIT','Find your people and grow with them.',null,'/community','open','published',true,47,'{"module":"benefits","icon":"heart-outline","color":"#C91867","dark":true}'),
('home','benefit-opportunities','benefit_card','Opportunities','BENEFIT','Discover openings that can move you forward.',null,'/opportunities','open','published',true,48,'{"module":"benefits","icon":"telescope-outline","color":"#078765","dark":true}'),
('home','benefits-cta','home_cta','View full benefits','THE FULL GWMB EXPERIENCE','See everything your GWMB membership gives you.',null,'/membership','open','published',true,49,'{"module":"benefits_cta"}'),
('home','spotlight-section','home_section','GWMB Girls Making Moves','SPOTLIGHT','Wins from women across the GWMB community.',null,'/member-wins','open','published',true,50,'{"module":"spotlight","link":"See all wins"}'),
('home','opportunities-section','home_section','Opportunities Corner','CURATED FOR YOUR NEXT MOVE','Openings selected for the GWMB community.',null,'/opportunities','open','published',true,60,'{"module":"opportunities","link":"See all"}'),
('home','community-invite','home_section','There’s room for you here.','REAL WOMEN · REAL COMMUNITY','Meet women learning, building and becoming together.',null,'/community','open','published',true,70,'{"module":"community_invite","cta":"Join the community","color":"#A81455"}'),
('home','community-photo-01','community_photo','Community member 01','COMMUNITY',null,null,'/community','open','published',false,71,'{"module":"community_photos","fallbackIndex":0}'),
('home','community-photo-02','community_photo','Community member 02','COMMUNITY',null,null,'/community','open','published',false,72,'{"module":"community_photos","fallbackIndex":1}'),
('home','community-photo-03','community_photo','Community member 03','COMMUNITY',null,null,'/community','open','published',false,73,'{"module":"community_photos","fallbackIndex":2}'),
('home','community-photo-04','community_photo','Community member 04','COMMUNITY',null,null,'/community','open','published',false,74,'{"module":"community_photos","fallbackIndex":3}'),
('home','community-photo-05','community_photo','Community member 05','COMMUNITY',null,null,'/community','open','published',false,75,'{"module":"community_photos","fallbackIndex":4}'),
('home','community-photo-06','community_photo','Community member 06','COMMUNITY',null,null,'/community','open','published',false,76,'{"module":"community_photos","fallbackIndex":5}'),
('home','community-photo-07','community_photo','Community member 07','COMMUNITY',null,null,'/community','open','published',false,77,'{"module":"community_photos","fallbackIndex":6}'),
('home','community-photo-08','community_photo','Community member 08','COMMUNITY',null,null,'/community','open','published',false,78,'{"module":"community_photos","fallbackIndex":7}'),
('home','community-photo-09','community_photo','Community member 09','COMMUNITY',null,null,'/community','open','published',false,79,'{"module":"community_photos","fallbackIndex":8}'),
('home','community-photo-10','community_photo','Community member 10','COMMUNITY',null,null,'/community','open','published',false,80,'{"module":"community_photos","fallbackIndex":9}'),
('member-wins','fellowship-win','member_win','A GWMB girlie has secured a competitive fellowship.','FELLOWSHIP','A bold opportunity to learn, contribute and grow her professional network.',null,'/member-wins','open','published',true,20,'{"fallbackImageIndex":1,"cta":"Explore member wins"}'),
('member-wins','first-role-win','member_win','Celebrating a confident move from classroom to career.','FIRST ROLE','Her first graduate role marks the beginning of an exciting new chapter.',null,'/member-wins','open','published',true,30,'{"fallbackImageIndex":3,"cta":"Explore member wins"}'),
('member-wins','business-milestone-win','member_win','A brilliant idea has become a first paying client.','BUSINESS MILESTONE','We are celebrating the courage it takes to start, build and keep showing up.',null,'/member-wins','open','published',true,40,'{"fallbackImageIndex":7,"cta":"Explore member wins"}'),
('community','page-header','community_header','Community','COMMUNITY','Your people. Your city. Your next gathering.',null,null,'open','published',true,1,'{"module":"page_header"}'),
('community','guest-hero','community_hero','GWMB in Lagos','EXPLORE A COMMUNITY','Discover events, Sister Circles and local sisterhood.',null,null,'open','published',true,10,'{"module":"hero","audience":"guest","color":"#111011"}'),
('community','member-hero','community_hero','Lagos City Club','MY COMMUNITY','A community of ambitious women growing together.',null,null,'members','published',true,11,'{"module":"hero","audience":"member","color":"#111011"}'),
('community','coming-up-section','community_section','Coming up','COMMUNITY','Featured community event.',null,'/events','open','published',true,20,'{"module":"coming_up","link":"View all events"}'),
('community','featured-progress-circle','community_event','October Progress Circle','ACCOUNTABILITY CHECK-IN · MEMBERS ONLY','Reflect, reset and name your next committed action with the community.',null,'/event/progress-circle','members','published',true,21,'{"module":"featured_event","day":"31","month":"OCT","color":"#E62B7F","icon":"people"}'),
('community','latest-section','community_section','Latest update','COMMUNITY','News from GWMB.',null,null,'open','published',true,30,'{"module":"latest","link":"View all"}'),
('community','volunteer-update','community_update','Volunteer team applications are open','LATEST UPDATE','Help shape our October community outreach.',null,null,'account','published',true,31,'{"module":"latest_update","icon":"megaphone-outline"}'),
('community','involved-section','community_section','Get involved','YOUR COMMUNITY','Ways to participate in GWMB.',null,null,'open','published',true,40,'{"module":"involved"}'),
('community','my-events-tile','community_action','My Events','YOUR COMMUNITY','See your registrations and upcoming sessions.',null,'/events?tab=my','account','published',true,41,'{"module":"involved_action","icon":"calendar-outline","color":"#FCEBF3","dark":false}'),
('community','cliques-tile','community_action','Cliques','YOUR COMMUNITY','Join smaller circles around shared interests.',null,'/cliques','members','published',true,42,'{"module":"involved_action","icon":"chatbubbles-outline","color":"#111011","dark":true}'),
('community','volunteer-tile','community_action','Volunteer','YOUR COMMUNITY','Contribute your time and skills to GWMB.',null,null,'account','published',true,43,'{"module":"involved_action","icon":"heart-outline","color":"#FFF1C9","dark":false}')
on conflict (area,slug) do update set
  content_type=excluded.content_type,title=excluded.title,eyebrow=excluded.eyebrow,summary=excluded.summary,
  body=excluded.body,route=excluded.route,access_level=excluded.access_level,status=excluded.status,
  featured=excluded.featured,sort_order=excluded.sort_order,metadata=excluded.metadata;

update public.content_items set sort_order=9 where area='home' and slug='welcome-hero';
update public.content_items set sort_order=39 where area='home' and slug='benefits';
update public.content_items set sort_order=9 where area='community' and slug='sister-circle-home';
update public.content_items set sort_order=44 where area='community' and slug='cliques';
