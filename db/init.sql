-- 1. THE TABLE ----------------------------------------------------------------
CREATE TABLE tasks (
    -- Auto number 1, 2, 3... SERIAL also creates the sequence "tasks_id_seq".
    id         SERIAL PRIMARY KEY,

    -- Task text: required, max 200 characters.
    title      VARCHAR(200) NOT NULL,

    -- Only 'todo' or 'done' allowed - the db refuses anything else.
    status     VARCHAR(10)  NOT NULL DEFAULT 'todo'
               CHECK (status IN ('todo', 'done')),

    -- Filled in automatically, with time zone.
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 2. LIMITED APPLICATION USER (least privilege) -------------------------------
-- The app connects as this user, never as the superuser.
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password';

-- By default every role (PUBLIC) may connect to a new database - remove that.
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;

-- Allow only our app user to connect.
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";

-- Allow it to see the tables in the public schema (but not create any).
GRANT USAGE ON SCHEMA public TO :"app_user";

-- Exactly the 4 operations the API needs, on exactly one table.
GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO :"app_user";

-- INSERT needs the next id from the sequence - without this every INSERT fails.
GRANT USAGE ON SEQUENCE tasks_id_seq TO :"app_user";

-- 3. DUMMY DATA ---------------------------------------------------------------
INSERT INTO tasks (title, status) VALUES
    ('Set up Docker Compose for TaskVault', 'done'),
    ('Generate self-signed TLS certificate', 'done'),
    ('Write the troubleshooting guide', 'todo'),
    ('Prepare demo for the team', 'todo');
