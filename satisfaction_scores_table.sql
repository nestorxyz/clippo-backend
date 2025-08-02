-- Create satisfaction_scores table
CREATE TABLE satisfaction_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Basic information
    session_id UUID NOT NULL,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    
    -- Satisfaction data
    score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
    feedback_message TEXT,
    
    -- Relationships
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_satisfaction_scores_session_id ON satisfaction_scores(session_id);
CREATE INDEX idx_satisfaction_scores_user_id ON satisfaction_scores(user_id);
CREATE INDEX idx_satisfaction_scores_created_at ON satisfaction_scores(created_at);
CREATE INDEX idx_satisfaction_scores_score ON satisfaction_scores(score);
