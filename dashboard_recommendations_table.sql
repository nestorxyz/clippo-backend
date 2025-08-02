-- Create the dashboard_recommendations table for storing AI-generated recommendations
CREATE TABLE dashboard_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Context data used to generate recommendations
  context_summary JSONB NOT NULL,
  dashboard_data JSONB NOT NULL,
  
  -- Generated recommendations
  recommendations JSONB NOT NULL,
  
  -- Metadata
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Optional: Link to user who generated (if implementing user auth later)
  generated_by UUID REFERENCES auth.users(id) DEFAULT NULL,
  
  -- Hash of the input data to avoid duplicates
  input_hash TEXT NOT NULL
);

-- Add indexes for common query patterns
CREATE INDEX idx_dashboard_recommendations_generated_at ON dashboard_recommendations(generated_at);
CREATE INDEX idx_dashboard_recommendations_created_at ON dashboard_recommendations(created_at);
CREATE INDEX idx_dashboard_recommendations_input_hash ON dashboard_recommendations(input_hash);
CREATE INDEX idx_dashboard_recommendations_generated_by ON dashboard_recommendations(generated_by);

-- Add unique constraint to prevent duplicate recommendations for same input
CREATE UNIQUE INDEX idx_dashboard_recommendations_unique_input 
ON dashboard_recommendations(input_hash);

-- Add helpful comments
COMMENT ON TABLE dashboard_recommendations IS 'Stores AI-generated recommendations based on dashboard analytics data';
COMMENT ON COLUMN dashboard_recommendations.context_summary IS 'Human-readable summary of the dashboard context used for generation';
COMMENT ON COLUMN dashboard_recommendations.dashboard_data IS 'Raw dashboard data used as input for AI generation';
COMMENT ON COLUMN dashboard_recommendations.recommendations IS 'Array of generated recommendations with id, title, description, and color';
COMMENT ON COLUMN dashboard_recommendations.input_hash IS 'Hash of input data to prevent duplicate generation for same context';
