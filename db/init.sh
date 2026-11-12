#!/bin/sh
# =============================================================================
# init.sh - runs db/init.sql with values from .env
# -----------------------------------------------------------------------------
# WHY does this file exist?
#   A plain .sql file cannot read environment variables, and we refuse to
#   hard-code passwords. This small wrapper reads the variables Docker Compose
#   puts into the db container and hands them to init.sql as psql variables.
#
# WHEN does it run?
#   It is mounted into /docker-entrypoint-initdb.d/. The official postgres image
#   runs every script in that folder ONCE - on the first start (empty volume).
#
# WHY is init.sql mounted at /sql/ and not in the init folder too?
#   Postgres would then ALSO run init.sql directly, without the variables,
#   and it would fail. So init.sql is only ever run through this script.
#
# NOTE: must keep LF line endings (see .gitattributes), or Linux can't run it.
# =============================================================================

# Stop immediately if any command fails, so a half-finished setup never
# looks like a success.
set -e

# psql = the PostgreSQL command-line client (already inside the postgres image).
#   -v ON_ERROR_STOP=1         psql normally continues after a SQL error; stop instead.
#   --username / --dbname      connect as the superuser to our database
#                              (both variables are set by docker-compose.yml).
#   -v name="value"            define the psql variables used in init.sql as :"name" / :'name'.
#   -f /sql/init.sql           the SQL file to execute.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v db_name="$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" \
  -v app_password="$APP_DB_PASSWORD" \
  -f /sql/init.sql
