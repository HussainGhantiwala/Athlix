ALTER TABLE teams ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS registration_submission_id uuid REFERENCES registration_submissions(id);
