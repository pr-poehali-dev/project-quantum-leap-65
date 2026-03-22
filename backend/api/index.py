"""InkoGram API — messages, servers, users, search (action-based routing)"""
import json
import os
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
        # GET ?action=messages&channel_id=X&after=Y
        if method == "GET" and action == "messages":
            channel_id = int(qs.get("channel_id", 0))
            after = int(qs.get("after", 0))
            cur.execute("""
                SELECT m.id, m.content, m.created_at, m.channel_id,
                       u.id as user_id, u.username, u.display_name, u.avatar_letter, u.avatar_color, u.status
                FROM ig_messages m
                JOIN ig_users u ON u.id = m.user_id
                WHERE m.channel_id = %s AND m.id > %s
                ORDER BY m.created_at ASC
                LIMIT 100
            """ % (channel_id, after))
            return resp({"messages": [dict(r) for r in cur.fetchall()]})

        # POST ?action=messages  {channel_id, user_id, content}
        if method == "POST" and action == "messages":
            cur.execute(
                "INSERT INTO ig_messages (channel_id, user_id, content) VALUES (%s, %s, %s) RETURNING id, created_at",
                (body["channel_id"], body["user_id"], body["content"])
            )
            row = cur.fetchone()
            conn.commit()
            return resp({"id": row["id"], "created_at": str(row["created_at"])})

        # GET ?action=servers&user_id=X
        if method == "GET" and action == "servers":
            user_id = qs.get("user_id")
            if user_id:
                cur.execute("""
                    SELECT s.id, s.name, s.icon_letter
                    FROM ig_servers s
                    JOIN ig_server_members sm ON sm.server_id = s.id
                    WHERE sm.user_id = %s
                    ORDER BY s.id ASC
                """ % int(user_id))
            else:
                cur.execute("SELECT id, name, icon_letter FROM ig_servers ORDER BY id")
            return resp({"servers": [dict(r) for r in cur.fetchall()]})

        # POST ?action=servers  {name, owner_id}
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

        # GET ?action=channels&server_id=X
        if method == "GET" and action == "channels":
            server_id = int(qs.get("server_id", 1))
            cur.execute("SELECT id, name, type FROM ig_channels WHERE server_id = %s ORDER BY id", (server_id,))
            return resp({"channels": [dict(r) for r in cur.fetchall()]})

        # GET ?action=search&q=X
        if method == "GET" and action == "search":
            q = qs.get("q", "")
            cur.execute("""
                SELECT id, username, display_name, avatar_letter, avatar_color, status, custom_status
                FROM ig_users
                WHERE username ILIKE %s OR display_name ILIKE %s
                LIMIT 20
            """, (f"%{q}%", f"%{q}%"))
            return resp({"users": [dict(r) for r in cur.fetchall()]})

        # GET ?action=users&id=X  or all
        if method == "GET" and action == "users":
            user_id = qs.get("id")
            if user_id:
                cur.execute("SELECT id, username, display_name, avatar_letter, avatar_color, status, custom_status FROM ig_users WHERE id = %s", (int(user_id),))
                row = cur.fetchone()
                return resp({"user": dict(row) if row else None})
            cur.execute("SELECT id, username, display_name, avatar_letter, avatar_color, status, custom_status FROM ig_users ORDER BY id")
            return resp({"users": [dict(r) for r in cur.fetchall()]})

        # POST ?action=users  {username, display_name}
        if method == "POST" and action == "users":
            letter = body.get("avatar_letter", body["display_name"][0].upper())
            cur.execute("""
                INSERT INTO ig_users (username, display_name, avatar_letter, avatar_color)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (username) DO NOTHING
                RETURNING id
            """, (body["username"], body["display_name"], letter, body.get("avatar_color", "blue")))
            row = cur.fetchone()
            conn.commit()
            if row:
                return resp({"user_id": row["id"]})
            cur.execute("SELECT id FROM ig_users WHERE username = %s", (body["username"],))
            row = cur.fetchone()
            return resp({"user_id": row["id"]})

        # PUT ?action=users  {id, display_name?, custom_status?, avatar_letter?, avatar_color?, status?}
        if method == "PUT" and action == "users":
            uid = body.get("id")
            fields = []
            vals = []
            for f in ["display_name", "custom_status", "avatar_letter", "avatar_color", "status"]:
                if f in body:
                    fields.append(f"{f} = %s")
                    vals.append(body[f])
            if fields:
                vals.append(uid)
                cur.execute(f"UPDATE ig_users SET {', '.join(fields)} WHERE id = %s", vals)
                conn.commit()
            return resp({"ok": True})

        # GET ?action=members&server_id=X
        if method == "GET" and action == "members":
            server_id = int(qs.get("server_id", 1))
            cur.execute("""
                SELECT u.id, u.username, u.display_name, u.avatar_letter, u.avatar_color, u.status, u.custom_status
                FROM ig_users u
                JOIN ig_server_members sm ON sm.user_id = u.id
                WHERE sm.server_id = %s
            """ % server_id)
            return resp({"members": [dict(r) for r in cur.fetchall()]})

        return resp({"error": "not found", "action": action, "method": method}, 404)

    finally:
        cur.close()
        conn.close()
