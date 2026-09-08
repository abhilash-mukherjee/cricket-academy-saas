# One Postgres schema; isolate by academy_id

Every Academy-scoped row carries `academy_id`, and the data layer must set and filter it. One shared schema matches multi-tenant Academies without schema-per-Academy ops or RLS in v1. RLS can be added later if a bug in the data layer is no longer an acceptable isolation failure.
