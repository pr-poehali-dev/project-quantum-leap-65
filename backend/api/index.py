"""InkoGram API — messages, servers, users, friends, admin panel"""
import json
import os
import re
import psycopg2
from psycopg2.extras import RealDictCursor

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
}

def get_conn():
    return psycopg2.connect(os.environ["DATABASE_URL"])

def resp(data, code=200):
    return {"statusCode": code, "headers": {**CORS, "Content-Type": "application/json"}, "body": json.dumps(data, default=str)}

def handler(event: dict, context) -> dict:
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": CORS, "body": ""}

    method = event.get("httpMethod", "GET")
    qs = event.get("queryStringParameters") or {}
    action = qs.get("action", "")
    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            pass

    conn = get_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # ───── MESSAGES ─────
        if method == "GET" and action == "messages":
            channel_id = int(qs.get("channel_id", 0))
            after = int(qs.get("after", 0))
            cur.execute("""
                SELECT m.id, m.content, m.created_at, m.channel_id,
                       u.id as user_id, u.username, u.display_name,
                       u.avatar_letter, u.avatar_color, u.status,
                       u.is_muted, u.unique_tag
                FROM ig_messages m
                JOIN ig_users u ON u.id = m.user_id
                WHERE m.channel_id = %s AND m.id > %s
                ORDER BY m.created_at ASC LIMIT 100
            """ % (channel_id, after))
            return resp({"messages": [dict(r) for r in cur.fetchall()]})

        if method == "POST" and action == "messages":
            uid = body["user_id"]
            cur.execute("SELECT is_banned, is_muted FROM ig_users WHERE id = %s", (uid,))
            u = cur.fetchone()
            if u and u["is_banned"]:
                return resp({"error": "banned"}, 403)
            if u and u["is_muted"]:
                return resp({"error": "muted"}, 403)
            cur.execute(
                "INSERT INTO ig_messages (channel_id, user_id, content) VALUES (%s, %s, %s) RETURNING id, created_at",
                (body["channel_id"], uid, body["content"])
            )
            row = cur.fetchone()
            conn.commit()
            return resp({"id": row["id"], "created_at": str(row["created_at"])})

        # ───── SERVERS ─────
        if method == "GET" and action == "servers":
            user_id = qs.get("user_id")
            if user_id:
                cur.execute("""
                    SELECT s.id, s.name, s.icon_letter FROM ig_servers s
                    JOIN ig_server_members sm ON sm.server_id = s.id
                    WHERE sm.user_id = %s ORDER BY s.id
                """ % int(user_id))
            else:
                cur.execute("SELECT id, name, icon_letter FROM ig_servers ORDER BY id")
            return resp({"servers": [dict(r) for r in cur.fetchall()]})

        if method == "POST" and action == "servers":
            icon = body.get("icon_letter", body["name"][0].upper())
            cur.execute(
                "INSERT INTO ig_servers (name, owner_id, icon_letter) VALUES (%s, %s, %s) RETURNING id",
                (body["name"], body["owner_id"], icon)
            )
            server_id = cur.fetchone()["id"]
            for ch in ["общий", "новости"]:
                cur.execute("INSERT INTO ig_channels (server_id, name, type) VALUES (%s, %s, 'text')", (server_id, ch))
            cur.execute("INSERT INTO ig_server_members (server_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (server_id, body["owner_id"]))
            conn.commit()
            return resp({"server_id": server_id})

        # ───── CHANNELS ─────
        if method == "GET" and action == "channels":
            server_id = int(qs.get("server_id", 1))
            cur.execute("SELECT id, name, type FROM ig_channels WHERE server_id = %s ORDER BY id", (server_id,))
            return resp({"channels": [dict(r) for r in cur.fetchall()]})

        # ───── SEARCH ─────
        if method == "GET" and action == "search":
            q = qs.get("q", "")
            cur.execute("""
                SELECT id, username, display_name, avatar_letter, avatar_color,
                       status, custom_status, is_admin, unique_tag
                FROM ig_users
                WHERE (username ILIKE %s OR display_name ILIKE %s) AND is_banned = FALSE
                LIMIT 20
            """, (f"%{q}%", f"%{q}%"))
            return resp({"users": [dict(r) for r in cur.fetchall()]})

        # ───── USERS ─────
        if method == "GET" and action == "users":
            user_id = qs.get("id")
            if user_id:
                cur.execute("""
                    SELECT id, username, display_name, avatar_letter, avatar_color,
                           status, custom_status, is_admin, is_banned, is_muted,
                           ban_reason, unique_tag
                    FROM ig_users WHERE id = %s
                """, (int(user_id),))
                row = cur.fetchone()
                return resp({"user": dict(row) if row else None})
            cur.execute("""
                SELECT id, username, display_name, avatar_letter, avatar_color,
                       status, custom_status, is_admin, is_banned, is_muted, unique_tag
                FROM ig_users ORDER BY id
            """)
            return resp({"users": [dict(r) for r in cur.fetchall()]})

        if method == "POST" and action == "users":
            letter = body.get("avatar_letter", body["display_name"][0].upper())
            cur.execute("""
                INSERT INTO ig_users (username, display_name, avatar_letter, avatar_color)
                VALUES (%s, %s, %s, %s) ON CONFLICT (username) DO NOTHING RETURNING id
            """, (body["username"], body["display_name"], letter, body.get("avatar_color", "blue")))
            row = cur.fetchone()
            conn.commit()
            if row:
                return resp({"user_id": row["id"]})
            cur.execute("SELECT id FROM ig_users WHERE username = %s", (body["username"],))
            return resp({"user_id": cur.fetchone()["id"]})

        if method == "PUT" and action == "users":
            uid = body.get("id")
            fields, vals = [], []

            # Смена username — проверяем уникальность
            if "username" in body:
                new_uname = body["username"].strip().lower()
                if not re.match(r'^[a-z0-9_]{3,32}$', new_uname):
                    return resp({"error": "Только латинские буквы, цифры и _ (3-32 символа)"}, 400)
                cur.execute("SELECT id FROM ig_users WHERE username = %s AND id != %s", (new_uname, uid))
                if cur.fetchone():
                    return resp({"error": "Этот username уже занят"}, 409)
                fields.append("username = %s")
                vals.append(new_uname)

            for f in ["display_name", "custom_status", "avatar_letter", "avatar_color", "status"]:
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])

            if fields:
                vals.append(uid)
                cur.execute(f"UPDATE ig_users SET {', '.join(fields)} WHERE id = %s", vals)
                conn.commit()
            return resp({"ok": True})

        # ───── MEMBERS ─────
        if method == "GET" and action == "members":
            server_id = int(qs.get("server_id", 1))
            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_letter,
                       u.avatar_color, u.status, u.custom_status,
                       u.is_admin, u.is_muted, u.is_banned, u.unique_tag
                FROM ig_users u
                JOIN ig_server_members sm ON sm.user_id = u.id
                WHERE sm.server_id = %s
            """ % server_id)
            return resp({"members": [dict(r) for r in cur.fetchall()]})

        # ───── FRIENDS ─────
        if method == "GET" and action == "friends":
            uid = int(qs.get("user_id", 0))
            cur.execute("""
                SELECT f.id, f.status, f.created_at,
                       u.id as user_id, u.username, u.display_name,
                       u.avatar_letter, u.avatar_color, u.status as online_status,
                       u.custom_status, u.unique_tag,
                       CASE WHEN f.user_id = %s THEN 'outgoing' ELSE 'incoming' END as direction
                FROM ig_friends f
                JOIN ig_users u ON u.id = CASE WHEN f.user_id = %s THEN f.friend_id ELSE f.user_id END
                WHERE f.user_id = %s OR f.friend_id = %s
                ORDER BY f.created_at DESC
            """ % (uid, uid, uid, uid))
            return resp({"friends": [dict(r) for r in cur.fetchall()]})

        # POST action=friends  {user_id, friend_id}  — отправить запрос
        if method == "POST" and action == "friends":
            uid = body["user_id"]
            fid = body["friend_id"]
            if uid == fid:
                return resp({"error": "Нельзя добавить себя"}, 400)
            # Если уже есть входящий запрос — принять
            cur.execute("SELECT id, status FROM ig_friends WHERE user_id = %s AND friend_id = %s", (fid, uid))
            existing = cur.fetchone()
            if existing:
                if existing["status"] == "pending":
                    cur.execute("UPDATE ig_friends SET status = 'accepted' WHERE id = %s", (existing["id"],))
                    conn.commit()
                    return resp({"ok": True, "accepted": True})
                return resp({"ok": True, "already": True})
            cur.execute("""
                INSERT INTO ig_friends (user_id, friend_id, status)
                VALUES (%s, %s, 'pending') ON CONFLICT (user_id, friend_id) DO NOTHING
            """, (uid, fid))
            conn.commit()
            return resp({"ok": True, "pending": True})

        # PUT action=friends  {id, status: accepted|rejected}
        if method == "PUT" and action == "friends":
            cur.execute("UPDATE ig_friends SET status = %s WHERE id = %s", (body["status"], body["id"]))
            conn.commit()
            return resp({"ok": True})

        # DELETE action=friends  {user_id, friend_id}
        if method == "DELETE" and action == "friends":
            uid = body["user_id"]
            fid = body["friend_id"]
            cur.execute("""
                UPDATE ig_friends SET status = 'removed'
                WHERE (user_id = %s AND friend_id = %s) OR (user_id = %s AND friend_id = %s)
            """, (uid, fid, fid, uid))
            conn.commit()
            return resp({"ok": True})

        # ───── ADMIN ─────
        if method == "POST" and action == "admin":
            admin_id = body.get("admin_id")
            cur.execute("SELECT is_admin FROM ig_users WHERE id = %s", (admin_id,))
            admin = cur.fetchone()
            if not admin or not admin["is_admin"]:
                return resp({"error": "Нет прав"}, 403)

            cmd = body.get("cmd")
            target_id = body.get("target_id")

            if cmd == "ban":
                cur.execute("UPDATE ig_users SET is_banned = TRUE, ban_reason = %s WHERE id = %s AND is_admin = FALSE",
                            (body.get("reason", ""), target_id))
            elif cmd == "unban":
                cur.execute("UPDATE ig_users SET is_banned = FALSE, ban_reason = '' WHERE id = %s", (target_id,))
            elif cmd == "mute":
                cur.execute("UPDATE ig_users SET is_muted = TRUE WHERE id = %s AND is_admin = FALSE", (target_id,))
            elif cmd == "unmute":
                cur.execute("UPDATE ig_users SET is_muted = FALSE WHERE id = %s", (target_id,))
            elif cmd == "set_username":
                new_uname = body.get("new_username", "").strip().lower()
                if not re.match(r'^[a-z0-9_]{3,32}$', new_uname):
                    return resp({"error": "Неверный формат username"}, 400)
                cur.execute("SELECT id FROM ig_users WHERE username = %s AND id != %s", (new_uname, target_id))
                if cur.fetchone():
                    return resp({"error": "Username уже занят"}, 409)
                cur.execute("UPDATE ig_users SET username = %s, unique_tag = %s WHERE id = %s",
                            (new_uname, body.get("unique_tag", ""), target_id))
            elif cmd == "set_admin":
                cur.execute("UPDATE ig_users SET is_admin = %s WHERE id = %s", (body.get("value", False), target_id))
            else:
                return resp({"error": "Unknown command"}, 400)

            conn.commit()
            return resp({"ok": True})

        # GET action=admin_users — список всех пользователей для панели
        if method == "GET" and action == "admin_users":
            admin_id = int(qs.get("admin_id", 0))
            cur.execute("SELECT is_admin FROM ig_users WHERE id = %s", (admin_id,))
            admin = cur.fetchone()
            if not admin or not admin["is_admin"]:
                return resp({"error": "Нет прав"}, 403)
            cur.execute("""
                SELECT id, username, display_name, avatar_letter, avatar_color,
                       status, is_admin, is_banned, is_muted, ban_reason, unique_tag, created_at
                FROM ig_users ORDER BY id
            """)
            return resp({"users": [dict(r) for r in cur.fetchall()]})

        return resp({"error": "not found", "action": action, "method": method}, 404)

    finally:
        cur.close()
        conn.close()
