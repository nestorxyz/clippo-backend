-- Optional: Create a dedicated table for escalated cases
-- This provides better tracking than storing in register_cases table

CREATE TABLE escalated_cases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Basic case information
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    student_name TEXT NOT NULL,
    
    -- Original risk information
    original_message TEXT NOT NULL,
    detected_emotions TEXT[] NOT NULL DEFAULT '{}',
    mentioned_topics TEXT[] NOT NULL DEFAULT '{}',
    
    -- Escalation details
    qualified_numbers_contacted TEXT[] NOT NULL DEFAULT '{}',
    successful_notifications INTEGER NOT NULL DEFAULT 0,
    failed_notifications INTEGER NOT NULL DEFAULT 0,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'resolved', 'closed')),
    resolved_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    
    -- Relationships
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_escalated_cases_session_id ON escalated_cases(session_id);
CREATE INDEX idx_escalated_cases_user_id ON escalated_cases(user_id);
CREATE INDEX idx_escalated_cases_created_at ON escalated_cases(created_at);
CREATE INDEX idx_escalated_cases_status ON escalated_cases(status);

-- Enable RLS (Row Level Security) if needed
ALTER TABLE escalated_cases ENABLE ROW LEVEL SECURITY;

-- Add RLS policy (adjust based on your auth setup)
-- CREATE POLICY "Users can view their own escalated cases" ON escalated_cases
--     FOR SELECT USING (auth.uid()::text = user_id);
