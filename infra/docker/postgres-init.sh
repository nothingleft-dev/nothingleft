#!/bin/sh
# The application role must exist before the first migration: that migration narrows its grants
# on the audit log only if the role is already there.
set -eu
psql -v ON_ERROR_STOP=1 -v app_password="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE nothingleft_app LOGIN PASSWORD :'app_password' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO nothingleft_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nothingleft_app;
SQL
