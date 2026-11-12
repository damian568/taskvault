-- =============================================================================
-- init.sql - TaskVault database setup
-- -----------------------------------------------------------------------------
-- WHEN does it run?  Only ONCE: on the db container's first start, when the
--                    data volume is still empty. Later edits to this file have
--                    NO effect unless the volume is recreated (= data loss).
-- WHO runs it?       db/init.sh, as the PostgreSQL superuser.
-- WHY the :"x" / :'x' syntax?  They are psql variables passed in by init.sh
--                    from .env, so no username/password is hard-coded here.
--                    :"x" -> inserted as an identifier (e.g. a user name)
--                    :'x' -> inserted as a quoted, escaped string (a password)
-- =============================================================================


-- 1. THE TABLE ----------------------------------------------------------------
CREATE TABLE tasks (
    -- Auto-incrementing number (1, 2, 3...). SERIAL also creates a sequence
    -- object named "tasks_id_seq" that hands out the next number.
    id         SERIAL PRIMARY KEY,

    -- Task text. Required, max 200 characters - enforced by the database itself.
    title      VARCHAR(200) NOT NULL,

    -- Only 'todo' or 'done' are allowed. Even if the app has a bug, the DB
    -- refuses invalid values (defense in depth). New tasks start as 'todo'.
    status     VARCHAR(10)  NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'done')),

    -- Filled in automatically when a row is inserted. TIMESTAMPTZ stores the
    -- time zone too, which avoids confusion between servers in different zones.
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- 2. LIMITED APPLICATION USER (least privilege) -------------------------------
-- The app connects as this user, NOT as the superuser. If the app is ever
-- compromised, the attacker can only touch rows in "tasks" - they cannot drop
-- tables, create users or read other databases.

-- Create a role that is allowed to log in (in PostgreSQL a "user" is a role with LOGIN).
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';

-- By default EVERY role ("PUBLIC") may connect to a new database. Remove that,
-- so only roles we explicitly allow can connect.
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;

-- Allow the app user to connect to THIS database.
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";

-- Allow it to "look inside" the public schema (where tables live). This does
-- NOT allow creating anything there.
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Exactly the four operations the API needs, on exactly one table.
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO :"app_user";

-- INSERT asks the sequence for the next id. Without this grant every INSERT
-- fails with "permission denied for sequence tasks_id_seq".
GRANT USAGE ON SEQUENCE tasks_id_seq TO :"app_user";


-- 3. DUMMY DATA ---------------------------------------------------------------
-- A few example tasks so the page is not empty on first start. Fake data only.
INSERT INTO tasks (title, status) VALUES
    ('Set up Docker Compose for TaskVault', 'done'),
    ('Generate self-signed TLS certificate', 'done'),
    ('Write the troubleshooting guide', 'todo'),
    ('Prepare demo for the team', 'todo');
