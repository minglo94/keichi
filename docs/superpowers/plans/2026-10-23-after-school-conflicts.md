# After-school conflict acknowledgement plan

Goal: allow authorized manual acceptance of activity overlaps, publish the same day's announcement/approved activities, and retain a note in 活動／錯誤. Other validation errors still block. Push timing and no-resend behavior unchanged.

- [x] Separate overlap warnings from errors. Include precise conflicts in preview hash.
- [x] Add strict acceptConflicts boolean default false to manual run. Checkbox binds to current preview and resets on date/preview changes.
- [x] Require matching preview to accept warnings. Save accepted warning text in existing run.lastError, rendered amber when READY. Scheduled reread retains acceptance only for same READY source hash and note. New conflicts need fresh confirmation. No schema change.
- [x] RED then GREEN integration: unaccepted blocked, accepted succeeds, notes persist on automatic reread, changed conflict denied, malformed source still blocked. Verify push no-resend regression suite.
- [x] Unit/type/lint/build and synthetic HTTP/DB verification; fresh review; merge under existing authorization.

Review: accepted notes originally blocked delivery via lastError; regression failed 0 vs 1 morning pushes, then shared note recognition fixed gate. Morning/afternoon sends once verified. Full production HTTP/PGlite suite green.
