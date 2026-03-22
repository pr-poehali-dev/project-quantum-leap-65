CREATE TABLE ig_servers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  owner_id INT REFERENCES ig_users(id),
  icon_letter VARCHAR(4) DEFAULT 'S',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ig_channels (
  id SERIAL PRIMARY KEY,
  server_id INT REFERENCES ig_servers(id),
  name VARCHAR(64) NOT NULL,
  type VARCHAR(10) DEFAULT 'text',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ig_messages (
  id SERIAL PRIMARY KEY,
  channel_id INT REFERENCES ig_channels(id),
  user_id INT REFERENCES ig_users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ig_server_members (
  server_id INT REFERENCES ig_servers(id),
  user_id INT REFERENCES ig_users(id),
  PRIMARY KEY (server_id, user_id)
);