import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "https://functions.poehali.dev/e6df4000-1128-4ae6-87f5-07ef06f36c43";

const COLORS = [
  { label: "Синий",      value: "blue",   from: "#5865f2", to: "#7c3aed" },
  { label: "Зелёный",    value: "green",  from: "#22c55e", to: "#06b6d4" },
  { label: "Фиолетовый", value: "purple", from: "#a855f7", to: "#ec4899" },
  { label: "Оранжевый",  value: "orange", from: "#f97316", to: "#eab308" },
  { label: "Красный",    value: "red",    from: "#ef4444", to: "#f97316" },
];

function colorStyle(color: string) {
  const c = COLORS.find((x) => x.value === color) || COLORS[0];
  return { background: `linear-gradient(135deg, ${c.from}, ${c.to})` };
}

type User = {
  id: number; username: string; display_name: string;
  avatar_letter: string; avatar_color: string; status: string;
  custom_status: string; is_admin?: boolean; is_banned?: boolean;
  is_muted?: boolean; ban_reason?: string; unique_tag?: string;
};
type Server   = { id: number; name: string; icon_letter: string };
type Channel  = { id: number; name: string; type: string };
type Message  = { id: number; content: string; created_at: string; channel_id: number; user_id: number; username: string; display_name: string; avatar_letter: string; avatar_color: string; status: string; is_muted?: boolean };
type Friend   = { id: number; status: string; direction: string; user_id: number; username: string; display_name: string; avatar_letter: string; avatar_color: string; online_status: string; custom_status: string; unique_tag: string };

type Tab = "chat" | "friends" | "admin";

function apiFn(action: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${API}?${qs}`;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// ─── Аватар ───────────────────────────────────────────────
function Avatar({ user, size = 8 }: { user: { avatar_letter: string; avatar_color: string; status?: string }; size?: number }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size * 4, height: size * 4 }}>
      <div className="w-full h-full rounded-full flex items-center justify-center font-bold text-white" style={{ ...colorStyle(user.avatar_color), fontSize: size * 1.8 }}>
        {user.avatar_letter}
      </div>
      {user.status && (
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-[#2f3136] rounded-full ${user.status === "online" ? "bg-[#3ba55c]" : "bg-[#747f8d]"}`} />
      )}
    </div>
  );
}

// ─── Бейдж ────────────────────────────────────────────────
function Badge({ type }: { type: "admin" | "muted" | "banned" | "bot" }) {
  const map = { admin: ["bg-red-500", "Адм"], muted: ["bg-yellow-600", "Мут"], banned: ["bg-gray-600", "Бан"], bot: ["bg-[#5865f2]", "БОТ"] };
  const [cls, label] = map[type];
  return <span className={`${cls} text-white text-[10px] font-bold px-1 py-0.5 rounded`}>{label}</span>;
}

export default function Index() {
  const [me, setMe]                   = useState<User | null>(null);
  const [servers, setServers]         = useState<Server[]>([]);
  const [channels, setChannels]       = useState<Channel[]>([]);
  const [messages, setMessages]       = useState<Message[]>([]);
  const [members, setMembers]         = useState<User[]>([]);
  const [friends, setFriends]         = useState<Friend[]>([]);
  const [adminUsers, setAdminUsers]   = useState<User[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [tab, setTab]                 = useState<Tab>("chat");
  const [input, setInput]             = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Модалы
  const [showProfile, setShowProfile]       = useState(false);
  const [showSearch, setShowSearch]         = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [showUserCard, setShowUserCard]     = useState<User | null>(null);

  // Формы
  const [editForm, setEditForm] = useState({ display_name: "", custom_status: "", avatar_color: "blue", username: "" });
  const [usernameError, setUsernameError]   = useState("");
  const [newServerName, setNewServerName]   = useState("");
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<User[]>([]);
  const [friendQuery, setFriendQuery]       = useState("");
  const [friendResults, setFriendResults]   = useState<User[]>([]);
  const [adminBanReason, setAdminBanReason] = useState("");
  const [adminNewUsername, setAdminNewUsername] = useState("");
  const [adminMsg, setAdminMsg]             = useState("");

  const lastMsgId  = useRef(0);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Init user ──────────────────────────────────────────
  useEffect(() => {
    const savedId = localStorage.getItem("ig_user_id");
    if (savedId) {
      fetch(apiFn("users", { id: savedId })).then(r => r.json()).then(d => { if (d.user) setMe(d.user); });
    } else {
      const names = ["Дизайнер", "Аниматор", "Разработчик", "Менеджер", "Иллюстратор"];
      const rname = names[Math.floor(Math.random() * names.length)];
      const username = `user_${Math.random().toString(36).slice(2, 8)}`;
      const display_name = `${rname} ${Math.floor(Math.random() * 999)}`;
      fetch(apiFn("users"), { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, display_name, avatar_letter: display_name[0].toUpperCase(), avatar_color: "blue" }) })
        .then(r => r.json()).then(d => {
          localStorage.setItem("ig_user_id", d.user_id);
          fetch(apiFn("users", { id: d.user_id })).then(r => r.json()).then(dd => setMe(dd.user));
        });
    }
  }, []);

  // ── Servers ────────────────────────────────────────────
  useEffect(() => {
    fetch(apiFn("servers")).then(r => r.json()).then(d => {
      setServers(d.servers || []);
      if (d.servers?.length) setActiveServer(d.servers[0]);
    });
  }, []);

  // ── Channels + Members ────────────────────────────────
  useEffect(() => {
    if (!activeServer) return;
    fetch(apiFn("channels", { server_id: activeServer.id })).then(r => r.json()).then(d => {
      const chs = d.channels || [];
      setChannels(chs);
      const first = chs.find((c: Channel) => c.type === "text");
      if (first) setActiveChannel(first);
    });
    fetch(apiFn("members", { server_id: activeServer.id })).then(r => r.json()).then(d => setMembers(d.members || []));
  }, [activeServer]);

  // ── Messages ──────────────────────────────────────────
  useEffect(() => {
    if (!activeChannel) return;
    lastMsgId.current = 0;
    setMessages([]);
    fetch(apiFn("messages", { channel_id: activeChannel.id, after: 0 })).then(r => r.json()).then(d => {
      const msgs = d.messages || [];
      setMessages(msgs);
      if (msgs.length) lastMsgId.current = msgs[msgs.length - 1].id;
    });
  }, [activeChannel]);

  // ── Poll ──────────────────────────────────────────────
  const poll = useCallback(() => {
    if (!activeChannel) return;
    fetch(apiFn("messages", { channel_id: activeChannel.id, after: lastMsgId.current })).then(r => r.json()).then(d => {
      const newMsgs = d.messages || [];
      if (newMsgs.length) {
        setMessages(prev => [...prev, ...newMsgs]);
        lastMsgId.current = newMsgs[newMsgs.length - 1].id;
      }
    });
  }, [activeChannel]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // ── Friends load ──────────────────────────────────────
  const loadFriends = useCallback(() => {
    if (!me) return;
    fetch(apiFn("friends", { user_id: me.id })).then(r => r.json()).then(d => setFriends(d.friends || []));
  }, [me]);

  useEffect(() => { if (tab === "friends" && me) loadFriends(); }, [tab, me, loadFriends]);

  // ── Admin users load ──────────────────────────────────
  const loadAdminUsers = useCallback(() => {
    if (!me?.is_admin) return;
    fetch(apiFn("admin_users", { admin_id: me.id })).then(r => r.json()).then(d => setAdminUsers(d.users || []));
  }, [me]);

  useEffect(() => { if (tab === "admin" && me?.is_admin) loadAdminUsers(); }, [tab, me, loadAdminUsers]);

  // ── Search (global) ───────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      fetch(apiFn("search", { q: searchQuery })).then(r => r.json()).then(d => setSearchResults(d.users || []));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Friend search ─────────────────────────────────────
  useEffect(() => {
    if (!friendQuery.trim()) { setFriendResults([]); return; }
    const t = setTimeout(() => {
      fetch(apiFn("search", { q: friendQuery })).then(r => r.json()).then(d => setFriendResults(d.users || []));
    }, 300);
    return () => clearTimeout(t);
  }, [friendQuery]);

  // ── Send message ──────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !me || !activeChannel) return;
    if (me.is_muted) return;
    const content = input.trim();
    setInput("");
    const r = await fetch(apiFn("messages"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: activeChannel.id, user_id: me.id, content }) });
    const d = await r.json();
    if (d.error === "muted") { setMe(prev => prev ? { ...prev, is_muted: true } : prev); return; }
    poll();
  };

  // ── Save profile ──────────────────────────────────────
  const saveProfile = async () => {
    if (!me) return;
    setUsernameError("");
    const uname = editForm.username.trim();
    const body: Record<string, string | number> = {
      id: me.id,
      display_name: editForm.display_name,
      custom_status: editForm.custom_status,
      avatar_color: editForm.avatar_color,
      avatar_letter: editForm.display_name[0]?.toUpperCase() || me.avatar_letter,
    };
    if (uname && uname !== me.username) body.username = uname;
    const r = await fetch(apiFn("users"), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json();
    if (d.error) { setUsernameError(d.error); return; }
    setMe({ ...me, ...body, username: uname || me.username });
    setShowProfile(false);
  };

  const openProfile = () => {
    if (!me) return;
    setEditForm({ display_name: me.display_name, custom_status: me.custom_status || "", avatar_color: me.avatar_color, username: me.username });
    setUsernameError("");
    setShowProfile(true);
  };

  // ── Create server ─────────────────────────────────────
  const createServer = async () => {
    if (!newServerName.trim() || !me) return;
    const r = await fetch(apiFn("servers"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newServerName.trim(), owner_id: me.id }) });
    const d = await r.json();
    setNewServerName(""); setShowCreateServer(false);
    fetch(apiFn("servers")).then(r => r.json()).then(dd => {
      setServers(dd.servers || []);
      const s = dd.servers?.find((s: Server) => s.id === d.server_id);
      if (s) setActiveServer(s);
    });
  };

  // ── Friend actions ────────────────────────────────────
  const sendFriendRequest = async (fid: number) => {
    if (!me) return;
    await fetch(apiFn("friends"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: me.id, friend_id: fid }) });
    loadFriends();
    setFriendQuery(""); setFriendResults([]);
  };

  const respondFriend = async (fid: number, status: "accepted" | "rejected") => {
    await fetch(apiFn("friends"), { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: fid, status }) });
    loadFriends();
  };

  const removeFriend = async (fuid: number) => {
    if (!me) return;
    await fetch(apiFn("friends"), { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: me.id, friend_id: fuid }) });
    loadFriends();
  };

  // ── Admin actions ─────────────────────────────────────
  const adminAction = async (cmd: string, targetId: number, extra: Record<string, string | boolean> = {}) => {
    if (!me) return;
    setAdminMsg("");
    const r = await fetch(apiFn("admin"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_id: me.id, cmd, target_id: targetId, ...extra }) });
    const d = await r.json();
    if (d.error) { setAdminMsg("Ошибка: " + d.error); return; }
    setAdminMsg("Готово!");
    setAdminBanReason(""); setAdminNewUsername("");
    loadAdminUsers();
  };

  // ── Pending friends count ─────────────────────────────
  const pendingCount = friends.filter(f => f.status === "pending" && f.direction === "incoming").length;

  return (
    <div className="h-screen bg-[#36393f] text-white flex flex-col overflow-hidden">

      {/* ══════════ МОДАЛ: Профиль ══════════ */}
      {showProfile && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowProfile(false)}>
          <div className="bg-[#2f3136] rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white text-xl font-bold">Редактировать профиль</h2>
              <button onClick={() => setShowProfile(false)} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            {/* Аватар + цвета */}
            <div className="flex items-center gap-4 mb-5">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white flex-shrink-0" style={colorStyle(editForm.avatar_color)}>
                {editForm.display_name?.[0]?.toUpperCase() || me?.avatar_letter}
              </div>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c.value} onClick={() => setEditForm(p => ({ ...p, avatar_color: c.value }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${editForm.avatar_color === c.value ? "border-white scale-110" : "border-transparent"}`}
                    style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }} />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Отображаемое имя</label>
                <Input value={editForm.display_name} onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))}
                  className="bg-[#202225] border-[#40444b] text-white focus:border-[#5865f2]" />
              </div>
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Username (латиница, цифры, _)</label>
                <Input value={editForm.username} onChange={e => setEditForm(p => ({ ...p, username: e.target.value }))}
                  className={`bg-[#202225] border-[#40444b] text-white focus:border-[#5865f2] ${usernameError ? "border-red-500" : ""}`}
                  placeholder="my_username" />
                {usernameError && <p className="text-red-400 text-xs mt-1">{usernameError}</p>}
              </div>
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Статус</label>
                <Input value={editForm.custom_status} onChange={e => setEditForm(p => ({ ...p, custom_status: e.target.value }))}
                  className="bg-[#202225] border-[#40444b] text-white focus:border-[#5865f2]" placeholder="Чем занимаетесь?" />
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={() => setShowProfile(false)} variant="ghost" className="flex-1 text-[#b9bbbe] hover:bg-[#40444b]">Отмена</Button>
                <Button onClick={saveProfile} className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white">Сохранить</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ МОДАЛ: Поиск ══════════ */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
          <div className="bg-[#2f3136] rounded-xl w-full max-w-md p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold">Поиск пользователей</h2>
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus
              className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2] mb-4" placeholder="Поиск по имени или @username..." />
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {searchResults.length === 0 && searchQuery && <p className="text-[#72767d] text-sm text-center py-4">Ничего не найдено</p>}
              {searchResults.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#393c43] cursor-pointer"
                  onClick={() => { setShowUserCard(u); setShowSearch(false); }}>
                  <Avatar user={u} size={10} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{u.display_name}</span>
                      {u.is_admin && <Badge type="admin" />}
                    </div>
                    <div className="text-[#72767d] text-sm">@{u.username}{u.unique_tag && <span className="text-[#5865f2]"> #{u.unique_tag}</span>}</div>
                    {u.custom_status && <div className="text-[#b9bbbe] text-xs truncate">{u.custom_status}</div>}
                  </div>
                  {me && u.id !== me.id && (
                    <button onClick={e => { e.stopPropagation(); sendFriendRequest(u.id); }}
                      className="text-[#5865f2] hover:text-white p-1"><Icon name="UserPlus" size={16} /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ МОДАЛ: Карточка пользователя ══════════ */}
      {showUserCard && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowUserCard(null)}>
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-16 relative" style={colorStyle(showUserCard.avatar_color)} />
            <div className="px-4 pb-4">
              <div className="flex items-end justify-between -mt-8 mb-3">
                <div className="w-16 h-16 rounded-full border-4 border-[#2f3136] flex items-center justify-center text-2xl font-bold text-white" style={colorStyle(showUserCard.avatar_color)}>
                  {showUserCard.avatar_letter}
                </div>
                {me && showUserCard.id !== me.id && (
                  <button onClick={() => { sendFriendRequest(showUserCard.id); setShowUserCard(null); }}
                    className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-3 py-1.5 rounded font-medium">
                    Добавить в друзья
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-white text-xl font-bold">{showUserCard.display_name}</h3>
                {showUserCard.is_admin && <Badge type="admin" />}
              </div>
              <p className="text-[#b9bbbe] text-sm mb-2">@{showUserCard.username}{showUserCard.unique_tag && <span className="text-[#5865f2]"> #{showUserCard.unique_tag}</span>}</p>
              {showUserCard.custom_status && <p className="text-[#dcddde] text-sm border-t border-[#40444b] pt-2">{showUserCard.custom_status}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ МОДАЛ: Создать сервер ══════════ */}
      {showCreateServer && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowCreateServer(false)}>
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold">Создать сервер</h2>
              <button onClick={() => setShowCreateServer(false)} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <p className="text-[#b9bbbe] text-sm mb-4">Каналы «общий» и «новости» создадутся автоматически.</p>
            <Input value={newServerName} onChange={e => setNewServerName(e.target.value)} onKeyDown={e => e.key === "Enter" && createServer()}
              className="bg-[#202225] border-[#40444b] text-white focus:border-[#5865f2] mb-4" placeholder="Название сервера" autoFocus />
            <div className="flex gap-3">
              <Button onClick={() => setShowCreateServer(false)} variant="ghost" className="flex-1 text-[#b9bbbe] hover:bg-[#40444b]">Отмена</Button>
              <Button onClick={createServer} disabled={!newServerName.trim()} className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white">Создать</Button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          ОСНОВНОЙ LAYOUT
      ════════════════════════════════════════ */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Панель серверов ── */}
        <div className="hidden lg:flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 overflow-y-auto flex-shrink-0">
          {servers.map(s => (
            <button key={s.id} onClick={() => { setActiveServer(s); setTab("chat"); }}
              className={`w-12 h-12 flex-shrink-0 font-bold text-lg text-white transition-all duration-150 ${activeServer?.id === s.id && tab === "chat" ? "rounded-xl" : "rounded-3xl hover:rounded-xl"}`}
              style={colorStyle("blue")} title={s.name}>
              {s.icon_letter}
            </button>
          ))}
          <div className="w-8 h-[2px] bg-[#36393f] rounded-full my-1" />
          <button onClick={() => setShowCreateServer(true)} title="Создать сервер"
            className="w-12 h-12 bg-[#36393f] hover:bg-[#3ba55c] rounded-3xl hover:rounded-xl transition-all flex-shrink-0 flex items-center justify-center text-[#3ba55c] hover:text-white">
            <Icon name="Plus" size={20} />
          </button>
        </div>

        {/* ── Каналы / меню ── */}
        <div className={`${mobileSidebarOpen ? "flex" : "hidden"} lg:flex w-60 bg-[#2f3136] flex-col flex-shrink-0`}>
          <div className="p-4 border-b border-[#202225] flex items-center justify-between">
            <h2 className="text-white font-semibold truncate">{activeServer?.name || "InkoGram"}</h2>
            <button className="lg:hidden text-[#b9bbbe] hover:text-white" onClick={() => setMobileSidebarOpen(false)}><Icon name="X" size={16} /></button>
          </div>

          {/* Навигация вкладок */}
          <div className="flex px-2 pt-2 gap-1">
            {[
              { id: "chat",    icon: "MessageSquare", label: "Чат" },
              { id: "friends", icon: "Users",         label: "Друзья", badge: pendingCount },
              ...(me?.is_admin ? [{ id: "admin", icon: "Shield", label: "Адмка", badge: 0 }] : []),
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as Tab)}
                className={`relative flex-1 flex flex-col items-center gap-0.5 py-2 rounded text-xs transition-colors ${tab === t.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:bg-[#393c43] hover:text-[#dcddde]"}`}>
                <Icon name={t.icon} size={16} />
                <span>{t.label}</span>
                {!!t.badge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">{t.badge}</span>}
              </button>
            ))}
          </div>

          {/* Каналы (только в режиме чата) */}
          {tab === "chat" && (
            <div className="flex-1 p-2 overflow-y-auto">
              <div className="mb-2">
                <p className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                  <Icon name="ChevronDown" size={12} />Текстовые каналы
                </p>
                {channels.filter(c => c.type === "text").map(ch => (
                  <button key={ch.id} onClick={() => { setActiveChannel(ch); setMobileSidebarOpen(false); }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${activeChannel?.id === ch.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43]"}`}>
                    <Icon name="Hash" size={16} />{ch.name}
                  </button>
                ))}
              </div>
              <div>
                <p className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                  <Icon name="ChevronDown" size={12} />Голосовые каналы
                </p>
                {channels.filter(c => c.type === "voice").map(ch => (
                  <div key={ch.id} className="flex items-center gap-1.5 px-2 py-1 rounded text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43] cursor-pointer text-sm">
                    <Icon name="Mic" size={16} />{ch.name}
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab !== "chat" && <div className="flex-1" />}

          {/* Пользователь внизу */}
          {me && (
            <div className="p-2 bg-[#292b2f] flex items-center gap-2">
              <Avatar user={{ ...me, status: "online" }} size={8} />
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate flex items-center gap-1">
                  {me.display_name}
                  {me.is_admin && <Badge type="admin" />}
                  {me.is_muted && <Badge type="muted" />}
                </div>
                <div className="text-[#b9bbbe] text-xs truncate">@{me.username}</div>
              </div>
              <button onClick={openProfile} className="w-8 h-8 flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-[#40444b] rounded">
                <Icon name="Settings" size={16} />
              </button>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════
            ГЛАВНАЯ ОБЛАСТЬ
        ══════════════════════════════════ */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Шапка */}
          <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-2 flex-shrink-0">
            <button className="lg:hidden text-[#8e9297] hover:text-white mr-2" onClick={() => setMobileSidebarOpen(true)}>
              <Icon name="Menu" size={20} />
            </button>
            {tab === "chat" && <><Icon name="Hash" size={20} className="text-[#8e9297]" /><span className="text-white font-semibold">{activeChannel?.name || "витрина"}</span></>}
            {tab === "friends" && <><Icon name="Users" size={20} className="text-[#8e9297]" /><span className="text-white font-semibold">Друзья</span></>}
            {tab === "admin" && <><Icon name="Shield" size={20} className="text-red-400" /><span className="text-white font-semibold">Панель администратора</span></>}
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setShowSearch(true)} className="text-[#b9bbbe] hover:text-white"><Icon name="Search" size={18} /></button>
              <Icon name="Bell" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
            </div>
          </div>

          {/* ── ВВ ЧАТ ── */}
          {tab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
                {messages.map((msg, i) => {
                  const isFirst = i === 0 || messages[i - 1].user_id !== msg.user_id;
                  return (
                    <div key={msg.id} className={`flex gap-3 group hover:bg-[#32353b] px-2 py-0.5 rounded ${isFirst ? "mt-4" : ""}`}>
                      {isFirst ? (
                        <div className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5 cursor-pointer" onClick={() => setShowUserCard(members.find(m => m.id === msg.user_id) || null)}>
                          <Avatar user={msg} size={10} />
                        </div>
                      ) : (
                        <div className="w-10 flex-shrink-0 flex items-center justify-center">
                          <span className="text-[#72767d] text-xs opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(msg.created_at)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {isFirst && (
                          <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                            <span className="text-white font-medium text-sm cursor-pointer hover:underline" onClick={() => setShowUserCard(members.find(m => m.id === msg.user_id) || null)}>{msg.display_name}</span>
                            {msg.is_muted && <Badge type="muted" />}
                            <span className="text-[#72767d] text-xs">{formatTime(msg.created_at)}</span>
                          </div>
                        )}
                        <p className="text-[#dcddde] text-sm leading-relaxed break-words">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEnd} />
              </div>
              <div className="p-4 flex-shrink-0">
                {me?.is_muted && (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg px-4 py-2 mb-2 text-yellow-300 text-sm flex items-center gap-2">
                    <Icon name="MicOff" size={16} />Вы в муте — отправка сообщений недоступна
                  </div>
                )}
                {me?.is_banned && (
                  <div className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-2 mb-2 text-red-300 text-sm flex items-center gap-2">
                    <Icon name="Ban" size={16} />Вы заблокированы{me.ban_reason ? `: ${me.ban_reason}` : ""}
                  </div>
                )}
                <div className="bg-[#40444b] rounded-lg flex items-center gap-2 px-4 py-2">
                  <button className="text-[#b9bbbe] hover:text-white flex-shrink-0"><Icon name="Plus" size={20} /></button>
                  <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                    placeholder={activeChannel ? `Сообщение #${activeChannel.name}` : "Выберите канал..."}
                    disabled={!activeChannel || !me || !!me.is_muted || !!me.is_banned}
                    className="flex-1 bg-transparent text-[#dcddde] placeholder:text-[#72767d] outline-none text-sm" />
                  <button onClick={sendMessage} disabled={!input.trim() || !!me?.is_muted} className="text-[#b9bbbe] hover:text-[#5865f2] disabled:opacity-40 flex-shrink-0">
                    <Icon name="Send" size={18} />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── ДРУЗЬЯ ── */}
          {tab === "friends" && (
            <div className="flex-1 overflow-y-auto p-6">
              {/* Добавить друга */}
              <div className="bg-[#2f3136] rounded-xl p-4 mb-6">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2"><Icon name="UserPlus" size={18} />Добавить друга</h3>
                <div className="flex gap-2">
                  <Input value={friendQuery} onChange={e => setFriendQuery(e.target.value)}
                    className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2]"
                    placeholder="Поиск по имени или @username" />
                </div>
                {friendResults.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {friendResults.filter(u => u.id !== me?.id).map(u => (
                      <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#393c43]">
                        <Avatar user={u} size={8} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white text-sm font-medium">{u.display_name}</div>
                          <div className="text-[#72767d] text-xs">@{u.username}</div>
                        </div>
                        <button onClick={() => sendFriendRequest(u.id)} className="bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs px-3 py-1.5 rounded font-medium">
                          Добавить
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Входящие заявки */}
              {friends.filter(f => f.status === "pending" && f.direction === "incoming").length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-2">Входящие заявки — {friends.filter(f => f.status === "pending" && f.direction === "incoming").length}</h3>
                  <div className="space-y-1">
                    {friends.filter(f => f.status === "pending" && f.direction === "incoming").map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-3 bg-[#2f3136] rounded-xl hover:bg-[#393c43]">
                        <Avatar user={{ avatar_letter: f.avatar_letter, avatar_color: f.avatar_color, status: f.online_status }} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium">{f.display_name}</div>
                          <div className="text-[#72767d] text-sm">@{f.username}</div>
                        </div>
                        <button onClick={() => respondFriend(f.id, "accepted")} className="w-8 h-8 bg-[#3ba55c] hover:bg-[#2d7d4a] rounded-full flex items-center justify-center text-white" title="Принять">
                          <Icon name="Check" size={16} />
                        </button>
                        <button onClick={() => respondFriend(f.id, "rejected")} className="w-8 h-8 bg-[#ed4245] hover:bg-[#c03537] rounded-full flex items-center justify-center text-white" title="Отклонить">
                          <Icon name="X" size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Исходящие заявки */}
              {friends.filter(f => f.status === "pending" && f.direction === "outgoing").length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-2">Ожидают ответа</h3>
                  <div className="space-y-1">
                    {friends.filter(f => f.status === "pending" && f.direction === "outgoing").map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-3 bg-[#2f3136] rounded-xl opacity-70">
                        <Avatar user={{ avatar_letter: f.avatar_letter, avatar_color: f.avatar_color }} size={10} />
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium">{f.display_name}</div>
                          <div className="text-[#72767d] text-sm">Запрос отправлен</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Друзья */}
              <div>
                <h3 className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide mb-2">
                  Друзья — {friends.filter(f => f.status === "accepted").length}
                </h3>
                {friends.filter(f => f.status === "accepted").length === 0 && (
                  <p className="text-[#72767d] text-sm text-center py-8">Пока нет друзей — найди кого-нибудь выше!</p>
                )}
                <div className="space-y-1">
                  {friends.filter(f => f.status === "accepted").map(f => (
                    <div key={f.id} className="flex items-center gap-3 p-3 bg-[#2f3136] rounded-xl hover:bg-[#393c43] group cursor-pointer" onClick={() => setShowUserCard({ id: f.user_id, username: f.username, display_name: f.display_name, avatar_letter: f.avatar_letter, avatar_color: f.avatar_color, status: f.online_status, custom_status: f.custom_status, unique_tag: f.unique_tag })}>
                      <Avatar user={{ avatar_letter: f.avatar_letter, avatar_color: f.avatar_color, status: f.online_status }} size={10} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-medium">{f.display_name}</div>
                        <div className="text-[#72767d] text-sm">{f.online_status === "online" ? "В сети" : "Не в сети"}</div>
                        {f.custom_status && <div className="text-[#b9bbbe] text-xs truncate">{f.custom_status}</div>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeFriend(f.user_id); }}
                        className="opacity-0 group-hover:opacity-100 text-[#b9bbbe] hover:text-[#ed4245] transition-all p-1" title="Удалить из друзей">
                        <Icon name="UserMinus" size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── АДМИН ПАНЕЛЬ ── */}
          {tab === "admin" && me?.is_admin && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-white text-xl font-bold flex items-center gap-2">
                  <Icon name="Shield" size={22} className="text-red-400" />Панель администратора
                </h2>
                <button onClick={loadAdminUsers} className="text-[#b9bbbe] hover:text-white text-sm flex items-center gap-1">
                  <Icon name="RefreshCw" size={14} />Обновить
                </button>
              </div>
              {adminMsg && (
                <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${adminMsg.startsWith("Ошибка") ? "bg-red-900/30 border border-red-700 text-red-300" : "bg-green-900/30 border border-green-700 text-green-300"}`}>
                  {adminMsg}
                </div>
              )}
              <div className="space-y-3">
                {adminUsers.map(u => (
                  <div key={u.id} className={`bg-[#2f3136] rounded-xl p-4 ${u.is_banned ? "border border-red-800/50" : u.is_muted ? "border border-yellow-800/50" : ""}`}>
                    <div className="flex items-start gap-3">
                      <Avatar user={u} size={10} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="text-white font-semibold">{u.display_name}</span>
                          {u.is_admin && <Badge type="admin" />}
                          {u.is_muted && <Badge type="muted" />}
                          {u.is_banned && <Badge type="banned" />}
                        </div>
                        <div className="text-[#72767d] text-sm">@{u.username}{u.unique_tag && <span className="text-[#5865f2]"> #{u.unique_tag}</span>} · ID: {u.id}</div>
                        {u.is_banned && u.ban_reason && <div className="text-red-400 text-xs mt-1">Причина бана: {u.ban_reason}</div>}
                      </div>
                    </div>

                    {/* Действия (не для самого себя и не для других админов) */}
                    {u.id !== me.id && (
                      <div className="mt-3 pt-3 border-t border-[#40444b] space-y-2">
                        {/* Мут/Анмут */}
                        <div className="flex gap-2 flex-wrap">
                          {!u.is_muted ? (
                            <button onClick={() => adminAction("mute", u.id)}
                              className="bg-yellow-700 hover:bg-yellow-600 text-white text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1">
                              <Icon name="MicOff" size={12} />Мут
                            </button>
                          ) : (
                            <button onClick={() => adminAction("unmute", u.id)}
                              className="bg-[#40444b] hover:bg-[#4f545c] text-white text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1">
                              <Icon name="Mic" size={12} />Снять мут
                            </button>
                          )}
                          {!u.is_banned ? (
                            <div className="flex gap-1 flex-1">
                              <Input value={adminBanReason} onChange={e => setAdminBanReason(e.target.value)}
                                className="bg-[#202225] border-[#40444b] text-white text-xs h-7 px-2 focus:border-red-500 flex-1" placeholder="Причина бана..." />
                              <button onClick={() => adminAction("ban", u.id, { reason: adminBanReason })}
                                className="bg-red-700 hover:bg-red-600 text-white text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1 whitespace-nowrap">
                                <Icon name="Ban" size={12} />Бан
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => adminAction("unban", u.id)}
                              className="bg-[#3ba55c] hover:bg-[#2d7d4a] text-white text-xs px-3 py-1.5 rounded font-medium flex items-center gap-1">
                              <Icon name="CheckCircle" size={12} />Разбанить
                            </button>
                          )}
                        </div>
                        {/* Смена username + unique tag */}
                        <div className="flex gap-1">
                          <Input value={adminNewUsername} onChange={e => setAdminNewUsername(e.target.value)}
                            className="bg-[#202225] border-[#40444b] text-white text-xs h-7 px-2 focus:border-[#5865f2] flex-1" placeholder="Новый username..." />
                          <button onClick={() => adminAction("set_username", u.id, { new_username: adminNewUsername, unique_tag: adminNewUsername ? `${u.id}` : "" })}
                            disabled={!adminNewUsername.trim()}
                            className="bg-[#5865f2] hover:bg-[#4752c4] disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded font-medium whitespace-nowrap">
                            Задать username
                          </button>
                        </div>
                      </div>
                    )}
                    {u.id === me.id && <p className="text-[#72767d] text-xs mt-2">— это вы</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Участники (только в чате) ── */}
        {tab === "chat" && (
          <div className="hidden xl:flex w-60 bg-[#2f3136] flex-col flex-shrink-0">
            <div className="p-4 border-b border-[#202225]">
              <h3 className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                В сети — {members.filter(m => m.status === "online").length}
              </h3>
            </div>
            <div className="flex-1 p-3 overflow-y-auto space-y-1">
              {members.map(u => (
                <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#393c43] cursor-pointer group" onClick={() => setShowUserCard(u)}>
                  <Avatar user={u} size={8} />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate flex items-center gap-1 ${u.id === me?.id ? "text-white" : "text-[#b9bbbe] group-hover:text-white"}`}>
                      {u.display_name}
                      {u.is_admin && <Badge type="admin" />}
                      {u.is_muted && <Badge type="muted" />}
                    </div>
                    {u.custom_status && <div className="text-[#72767d] text-xs truncate">{u.custom_status}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
