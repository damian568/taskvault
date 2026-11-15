#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v db_name="$POSTGRES_DB" \
  -v app_user="$APP_DB_USER" \
  -v app_password="$APP_DB_PASSWORD" \
  -f /sql/init.sql
