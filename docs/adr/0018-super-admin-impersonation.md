# Super-admin impersonates Owner with full write access

Super-admin can enter an Owner's `/app/…` session to fix brochure, Batches, and Registrations on their behalf. Impersonation is full read/write, shows a persistent banner with exit, and logs actions as impersonated. Read-only impersonation would block support; emailing a magic link as the Owner is clunky and blurs audit. Super-admin accounts are seeded, not self-registered.
