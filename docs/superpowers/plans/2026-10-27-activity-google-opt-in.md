# Activity Google opt-in implementation

Approved design: approval remains independent of Google publishing. New activities default not to Google; a creation checkbox opts important activities in. Existing Google events are preserved, not bulk removed. User approved direct execution.

- [x] Add Activity.googleSyncEnabled default false and CalendarEvent.googleSyncEnabled default true; reviewed SQL preserves legacy activity behavior. Requires DB migration before deploying application code.
- [x] Carry checkbox through strict create input and approved calendar creation. Notice/automatic after-school calendars default off. Pending activities retain choice until approval.
- [x] Enforce disabled events at author create/update, committee fan-out, manual backfill and incremental pull. Retain regular school/manual calendar behavior.
- [x] Regression tests for opted-out immediate/backfill, explicit opt-in, pending approval and legacy/manual records. Do not delete existing Google copies.
- [ ] Verify, create reviewable PR. No production credentials available, so do not claim migration/deployment completed.

Fresh review found legacy after-school updates overwrote enabled flags; fixed by preserving group.activity choice and copying it to CalendarEvent. Helper tests green; route/migration/full-build checks remain unexecuted, documented.
