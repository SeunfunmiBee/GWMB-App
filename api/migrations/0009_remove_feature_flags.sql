-- The app is live for everyone: no feature flags or beta-tester list.
drop trigger if exists feature_flags_updated_at;
drop table if exists feature_flags;
drop table if exists beta_testers;
