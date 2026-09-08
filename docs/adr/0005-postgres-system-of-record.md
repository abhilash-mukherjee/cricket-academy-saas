# Postgres is the system of record

Academy, Registration, Player, Batch, Session, and staff identity data live in Postgres. A document store would fight the roster and session joins; SQLite is not the backup and tenancy story we want once more than one Academy exists. Neon is the host (see ADR 0007).
