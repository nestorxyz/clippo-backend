-- User Warnings Table for Sunqu Inappropriate Message Handling
CREATE TABLE user_warnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  session_id TEXT NOT NULL,
  warning_level INTEGER NOT NULL CHECK (warning_level IN (1, 2, 3)),
  inappropriate_message TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Index for quick lookups
CREATE INDEX idx_user_warnings_user_id ON user_warnings(user_id);
CREATE INDEX idx_user_warnings_active ON user_warnings(user_id, is_active);
CREATE INDEX idx_user_warnings_created_at ON user_warnings(created_at);

-- Comments for table documentation
COMMENT ON TABLE user_warnings IS 'Stores warnings issued to users for inappropriate usage of Sunqu chatbot';
COMMENT ON COLUMN user_warnings.warning_level IS 'Warning level: 1, 2, or 3. After 3 warnings, user gets banned';
COMMENT ON COLUMN user_warnings.inappropriate_message IS 'The actual inappropriate message that triggered the warning';
COMMENT ON COLUMN user_warnings.reason IS 'Categorized reason: tarea, contenido sexual, broma, etc.';
COMMENT ON COLUMN user_warnings.is_active IS 'Whether this warning is currently active. Reset when user returns to appropriate usage';
