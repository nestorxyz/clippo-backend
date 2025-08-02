-- Create the register_cases table for storing emotional conversation data
CREATE TABLE register_cases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  original_message TEXT NOT NULL,
  detected_emotions JSONB DEFAULT '[]'::jsonb,
  mentioned_topics JSONB DEFAULT '[]'::jsonb,
  alert BOOLEAN DEFAULT FALSE,
  usage_type TEXT CHECK (usage_type IN ('emocional', 'inapropiado', 'neutral')),
  reported_learnings JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for common query patterns
CREATE INDEX idx_register_cases_session_id ON register_cases(session_id);
CREATE INDEX idx_register_cases_user_id ON register_cases(user_id);
CREATE INDEX idx_register_cases_created_at ON register_cases(created_at);
CREATE INDEX idx_register_cases_alert ON register_cases(alert) WHERE alert = true;

-- Add RLS (Row Level Security) policies if needed
-- ALTER TABLE register_cases ENABLE ROW LEVEL SECURITY;

-- Create policy for users to only access their own data
-- CREATE POLICY "Users can view their own register_cases" ON register_cases
--   FOR SELECT USING (auth.uid() = user_id);

-- Create policy for service role to access all data
-- CREATE POLICY "Service role can access all register_cases" ON register_cases
--   FOR ALL USING (auth.role() = 'service_role');
