-- Apply before deploying application code. Preserve legacy sync choices.
BEGIN;
ALTER TABLE "Activity" ADD COLUMN "googleSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Activity" ALTER COLUMN "googleSyncEnabled" SET DEFAULT false;
ALTER TABLE "CalendarEvent" ADD COLUMN "googleSyncEnabled" BOOLEAN NOT NULL DEFAULT true;
COMMIT;
