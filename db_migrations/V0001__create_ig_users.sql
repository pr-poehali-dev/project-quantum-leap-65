CREATE TABLE ig_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(32) UNIQUE NOT NULL,
  display_name VARCHAR(64) NOT NULL,
  avatar_letter VARCHAR(4) DEFAULT 'U',
  avatar_color VARCHAR(64) DEFAULT 'blue',
  status VARCHAR(20) DEFAULT 'online',
  custom_status VARCHAR(128) DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW()
);