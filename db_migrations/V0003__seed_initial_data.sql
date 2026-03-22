INSERT INTO ig_users (username, display_name, avatar_letter, avatar_color, status) VALUES
  ('inkogram_bot', 'InkoGram Бот', 'I', 'blue', 'online'),
  ('maria_design', 'Мария Дизайнер', 'М', 'purple', 'online'),
  ('ivan_ux', 'Иван UX', 'И', 'green', 'online')
ON CONFLICT (username) DO NOTHING;

INSERT INTO ig_servers (name, owner_id, icon_letter)
SELECT 'InkoGram', id, 'I' FROM ig_users WHERE username = 'inkogram_bot';

INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'общий', 'text' FROM ig_servers s WHERE s.name = 'InkoGram';
INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'новости', 'text' FROM ig_servers s WHERE s.name = 'InkoGram';
INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'витрина', 'text' FROM ig_servers s WHERE s.name = 'InkoGram';
INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'помощь', 'text' FROM ig_servers s WHERE s.name = 'InkoGram';
INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'Общий', 'voice' FROM ig_servers s WHERE s.name = 'InkoGram';
INSERT INTO ig_channels (server_id, name, type)
SELECT s.id, 'Обзор дизайна', 'voice' FROM ig_servers s WHERE s.name = 'InkoGram';

INSERT INTO ig_server_members (server_id, user_id)
SELECT s.id, u.id FROM ig_servers s, ig_users u WHERE s.name = 'InkoGram'
ON CONFLICT DO NOTHING;

INSERT INTO ig_messages (channel_id, user_id, content)
SELECT ch.id, u.id, 'Добро пожаловать в InkoGram! Показывай свой прогресс в Figma прямо в Discord — пусть команда всегда знает, над чем ты работаешь.'
FROM ig_channels ch, ig_users u WHERE ch.name = 'витрина' AND u.username = 'inkogram_bot';

INSERT INTO ig_messages (channel_id, user_id, content)
SELECT ch.id, u.id, 'Только начала работу над новым дизайном лендинга! Всё обновляется в реальном времени'
FROM ig_channels ch, ig_users u WHERE ch.name = 'витрина' AND u.username = 'maria_design';

INSERT INTO ig_messages (channel_id, user_id, content)
SELECT ch.id, u.id, 'Обожаю видеть прогресс всех! InkoGram делает командное общение таким удобным'
FROM ig_channels ch, ig_users u WHERE ch.name = 'витрина' AND u.username = 'ivan_ux';
