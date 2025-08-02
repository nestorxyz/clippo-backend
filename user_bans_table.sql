-- User Bans Table for Sunqu Inappropriate Message Handling
CREATE TABLE user_bans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  ban_reason TEXT NOT NULL,
  banned_at TIMESTAMP DEFAULT NOW(),
  banned_until TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX idx_user_bans_user_id ON user_bans(user_id);
CREATE INDEX idx_user_bans_active ON user_bans(user_id, is_active);
CREATE INDEX idx_user_bans_banned_until ON user_bans(banned_until);
CREATE INDEX idx_user_bans_created_at ON user_bans(created_at);

-- Comments for table documentation
COMMENT ON TABLE user_bans IS 'Stores 2-hour bans applied to users after 3 inappropriate message warnings';
COMMENT ON COLUMN user_bans.ban_reason IS 'Reason for the ban, typically "uso inapropiado repetitivo"';
COMMENT ON COLUMN user_bans.banned_at IS 'Timestamp when the ban was applied';
COMMENT ON COLUMN user_bans.banned_until IS 'Timestamp when the ban expires (2 hours after banned_at)';
COMMENT ON COLUMN user_bans.is_active IS 'Whether this ban is currently active';
