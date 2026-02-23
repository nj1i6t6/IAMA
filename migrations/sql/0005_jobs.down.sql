ALTER TABLE quota_reservations DROP CONSTRAINT IF EXISTS fk_quota_reservations_job;
ALTER TABLE usage_ledger DROP CONSTRAINT IF EXISTS fk_usage_ledger_job;
DROP TABLE IF EXISTS job_artifacts;
DROP TABLE IF EXISTS refactor_jobs;
DROP TABLE IF EXISTS projects;
