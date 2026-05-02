-- Add seeding columns to teams table
ALTER TABLE teams ADD COLUMN IF NOT EXISTS seed_position INTEGER;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_previous_winner BOOLEAN DEFAULT FALSE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_previous_runner_up BOOLEAN DEFAULT FALSE;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_previous_second_runner_up BOOLEAN DEFAULT FALSE;

-- Create an index for seed_position since we'll query by it
CREATE INDEX IF NOT EXISTS teams_seed_position_idx ON teams(seed_position);
