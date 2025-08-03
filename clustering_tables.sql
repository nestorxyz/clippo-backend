-- Create the clustered_problems table for storing AI-clustered problem data
CREATE TABLE clustered_problems (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Original problems data used for clustering
  original_problems JSONB NOT NULL,
  
  -- Clustered results
  clustered_problems JSONB NOT NULL,
  
  -- Metadata
  clustered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Hash of the input data to avoid duplicates
  input_hash TEXT NOT NULL
);

-- Create the clustered_emotions table for storing AI-clustered emotion data
CREATE TABLE clustered_emotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Original emotions data used for clustering
  original_emotions JSONB NOT NULL,
  
  -- Clustered results
  clustered_emotions JSONB NOT NULL,
  
  -- Metadata
  clustered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Hash of the input data to avoid duplicates
  input_hash TEXT NOT NULL
);

-- Add indexes for common query patterns
CREATE INDEX idx_clustered_problems_clustered_at ON clustered_problems(clustered_at);
CREATE INDEX idx_clustered_problems_created_at ON clustered_problems(created_at);
CREATE INDEX idx_clustered_problems_input_hash ON clustered_problems(input_hash);

CREATE INDEX idx_clustered_emotions_clustered_at ON clustered_emotions(clustered_at);
CREATE INDEX idx_clustered_emotions_created_at ON clustered_emotions(created_at);
CREATE INDEX idx_clustered_emotions_input_hash ON clustered_emotions(input_hash);

-- Add unique constraints to prevent duplicate clustering for same input
CREATE UNIQUE INDEX idx_clustered_problems_unique_input 
ON clustered_problems(input_hash);

CREATE UNIQUE INDEX idx_clustered_emotions_unique_input 
ON clustered_emotions(input_hash);

-- Add helpful comments
COMMENT ON TABLE clustered_problems IS 'Stores AI-clustered problem data with grouped similar issues';
COMMENT ON COLUMN clustered_problems.original_problems IS 'Original problem data used as input for clustering';
COMMENT ON COLUMN clustered_problems.clustered_problems IS 'Array of clustered problems with combined percentages and original items';
COMMENT ON COLUMN clustered_problems.input_hash IS 'Hash of input data to prevent duplicate clustering for same problems';

COMMENT ON TABLE clustered_emotions IS 'Stores AI-clustered emotion data with grouped similar emotions';
COMMENT ON COLUMN clustered_emotions.original_emotions IS 'Original emotion data used as input for clustering';
COMMENT ON COLUMN clustered_emotions.clustered_emotions IS 'Array of clustered emotions with combined percentages and original items';
COMMENT ON COLUMN clustered_emotions.input_hash IS 'Hash of input data to prevent duplicate clustering for same emotions';
