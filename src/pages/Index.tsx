import { useState, useEffect, useRef, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const API = "https://functions.poehali.dev/e6df4000-1128-4ae6-87f5-07ef06f36c43";

const COLORS = [
  { label: "Синий", value: "blue", from: "#5865f2", to: "#7c3aed" },
  { label: "Зелёный", value: "green", from: "#22c55e", to: "#06b6d4" },
  { label: "Фиолетовый", value: "purple", from: "#a855f7", to: "#ec4899" },
  { label: "Оранжевый", value: "orange", from: "#f97316", to: "#eab308" },
  { label: "Красный", value: "red", from: "#ef4444", to: "#f97316" },
];

function colorStyle(color: string) {
  const c = COLORS.find((x) => x.value === color) || COLORS[0];
  return { background: `linear-gradient(135deg, ${c.from}, ${c.to})` };
}

type User = { id: number; username: string; display_name: string; avatar_letter: string; avatar_color: string; status: string; custom_status: string };
type Server = { id: number; name: string; icon_letter: string };
type Channel = { id: number; name: string; type: string };
type Message = { id: number; content: string; created_at: string; channel_id: number; user_id: number; username: string; display_name: string; avatar_letter: string; avatar_color: string; status: string };

function api(action: string, params: Record<string, string | number> = {}) {
  const qs = new URLSearchParams({ action, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `${API}?${qs}`;
}

export default function Index() {
  const [me, setMe] = useState<User | null>(null);
  const [servers, setServers] = useState<Server[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [activeServer, setActiveServer] = useState<Server | null>(null);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [input, setInput] = useState("");
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [editForm, setEditForm] = useState({ display_name: "", custom_status: "", avatar_color: "blue" });
  const [newServerName, setNewServerName] = useState("");
  const lastMsgId = useRef(0);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Инициализация — создаём/загружаем текущего пользователя
  useEffect(() => {
    const savedId = localStorage.getItem("ig_user_id");
    if (savedId) {
      fetch(api("users", { id: savedId }))
        .then((r) => r.json())
        .then((d) => { if (d.user) setMe(d.user); });
    } else {
      // Создаём нового пользователя
      const names = ["Дизайнер", "Аниматор", "Разработчик", "Менеджер", "Иллюстратор"];
      const rname = names[Math.floor(Math.random() * names.length)];
      const username = `user_${Math.random().toString(36).slice(2, 8)}`;
      const display_name = `${rname} ${Math.floor(Math.random() * 999)}`;
      fetch(api("users"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, display_name, avatar_letter: display_name[0].toUpperCase(), avatar_color: "blue" }),
      })
        .then((r) => r.json())
        .then((d) => {
          localStorage.setItem("ig_user_id", d.user_id);
          fetch(api("users", { id: d.user_id })).then((r) => r.json()).then((dd) => setMe(dd.user));
        });
    }
  }, []);

  // Загружаем серверы
  useEffect(() => {
    fetch(api("servers")).then((r) => r.json()).then((d) => {
      setServers(d.servers || []);
      if (d.servers?.length) setActiveServer(d.servers[0]);
    });
  }, []);

  // Каналы при смене сервера
  useEffect(() => {
    if (!activeServer) return;
    fetch(api("channels", { server_id: activeServer.id })).then((r) => r.json()).then((d) => {
      const chs = d.channels || [];
      setChannels(chs);
      const first = chs.find((c: Channel) => c.type === "text");
      if (first) setActiveChannel(first);
    });
    fetch(api("members", { server_id: activeServer.id })).then((r) => r.json()).then((d) => setMembers(d.members || []));
  }, [activeServer]);

  // Сообщения при смене канала
  useEffect(() => {
    if (!activeChannel) return;
    lastMsgId.current = 0;
    setMessages([]);
    fetch(api("messages", { channel_id: activeChannel.id, after: 0 })).then((r) => r.json()).then((d) => {
      const msgs = d.messages || [];
      setMessages(msgs);
      if (msgs.length) lastMsgId.current = msgs[msgs.length - 1].id;
    });
  }, [activeChannel]);

  // Автообновление сообщений
  const poll = useCallback(() => {
    if (!activeChannel) return;
    fetch(api("messages", { channel_id: activeChannel.id, after: lastMsgId.current })).then((r) => r.json()).then((d) => {
      const newMsgs = d.messages || [];
      if (newMsgs.length) {
        setMessages((prev) => [...prev, ...newMsgs]);
        lastMsgId.current = newMsgs[newMsgs.length - 1].id;
      }
    });
  }, [activeChannel]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  // Скролл к последнему сообщению
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Поиск пользователей
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(() => {
      fetch(api("search", { q: searchQuery })).then((r) => r.json()).then((d) => setSearchResults(d.users || []));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Отправка сообщения
  const sendMessage = async () => {
    if (!input.trim() || !me || !activeChannel) return;
    const content = input.trim();
    setInput("");
    await fetch(api("messages"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel_id: activeChannel.id, user_id: me.id, content }),
    });
    poll();
  };

  // Сохранение профиля
  const saveProfile = async () => {
    if (!me) return;
    await fetch(api("users"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: me.id, display_name: editForm.display_name, custom_status: editForm.custom_status, avatar_color: editForm.avatar_color, avatar_letter: editForm.display_name[0]?.toUpperCase() || me.avatar_letter }),
    });
    setMe({ ...me, display_name: editForm.display_name, custom_status: editForm.custom_status, avatar_color: editForm.avatar_color, avatar_letter: editForm.display_name[0]?.toUpperCase() || me.avatar_letter });
    setShowProfileEdit(false);
  };

  // Создание сервера
  const createServer = async () => {
    if (!newServerName.trim() || !me) return;
    const r = await fetch(api("servers"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newServerName.trim(), owner_id: me.id }),
    });
    const d = await r.json();
    setNewServerName("");
    setShowCreateServer(false);
    fetch(api("servers")).then((r) => r.json()).then((dd) => {
      setServers(dd.servers || []);
      const newS = dd.servers?.find((s: Server) => s.id === d.server_id);
      if (newS) setActiveServer(newS);
    });
  };

  function formatTime(ts: string) {
    return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  const openEdit = () => {
    if (!me) return;
    setEditForm({ display_name: me.display_name, custom_status: me.custom_status || "", avatar_color: me.avatar_color });
    setShowProfileEdit(true);
  };

  return (
    <div className="h-screen bg-[#36393f] text-white flex flex-col overflow-hidden">
      {/* Модал: редактирование профиля */}
      {showProfileEdit && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-xl font-bold">Редактировать профиль</h2>
              <button onClick={() => setShowProfileEdit(false)} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-white flex-shrink-0" style={colorStyle(editForm.avatar_color)}>
                {editForm.display_name?.[0]?.toUpperCase() || me?.avatar_letter}
              </div>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button key={c.value} onClick={() => setEditForm((p) => ({ ...p, avatar_color: c.value }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${editForm.avatar_color === c.value ? "border-white scale-110" : "border-transparent"}`}
                    style={{ background: `linear-gradient(135deg, ${c.from}, ${c.to})` }} title={c.label} />
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Имя пользователя</label>
                <Input value={editForm.display_name} onChange={(e) => setEditForm((p) => ({ ...p, display_name: e.target.value }))}
                  className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2]" placeholder="Ваше имя" />
              </div>
              <div>
                <label className="text-[#b9bbbe] text-xs font-semibold uppercase tracking-wide mb-1 block">Статус</label>
                <Input value={editForm.custom_status} onChange={(e) => setEditForm((p) => ({ ...p, custom_status: e.target.value }))}
                  className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2]" placeholder="Сейчас работаю над..." />
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={() => setShowProfileEdit(false)} variant="ghost" className="flex-1 text-[#b9bbbe] hover:bg-[#40444b]">Отмена</Button>
                <Button onClick={saveProfile} className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white">Сохранить</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модал: поиск пользователей */}
      {showSearch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white text-xl font-bold">Поиск пользователей</h2>
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus
              className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2] mb-4" placeholder="Поиск по имени или @username..." />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {searchResults.length === 0 && searchQuery && (
                <p className="text-[#72767d] text-sm text-center py-4">Ничего не найдено</p>
              )}
              {searchResults.map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#393c43]">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={colorStyle(u.avatar_color)}>
                    {u.avatar_letter}
                  </div>
                  <div>
                    <div className="text-white font-medium">{u.display_name}</div>
                    <div className="text-[#72767d] text-sm">@{u.username}</div>
                    {u.custom_status && <div className="text-[#b9bbbe] text-xs">{u.custom_status}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Модал: создание сервера */}
      {showCreateServer && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#2f3136] rounded-xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-white text-xl font-bold">Создать сервер</h2>
              <button onClick={() => setShowCreateServer(false)} className="text-[#b9bbbe] hover:text-white"><Icon name="X" size={20} /></button>
            </div>
            <p className="text-[#b9bbbe] text-sm mb-4">Придумайте название для вашего сервера. Каналы «общий» и «новости» создадутся автоматически.</p>
            <Input value={newServerName} onChange={(e) => setNewServerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createServer()}
              className="bg-[#202225] border-[#40444b] text-white placeholder:text-[#72767d] focus:border-[#5865f2] mb-4"
              placeholder="Название сервера" autoFocus />
            <div className="flex gap-3">
              <Button onClick={() => setShowCreateServer(false)} variant="ghost" className="flex-1 text-[#b9bbbe] hover:bg-[#40444b]">Отмена</Button>
              <Button onClick={createServer} disabled={!newServerName.trim()} className="flex-1 bg-[#5865f2] hover:bg-[#4752c4] text-white">Создать</Button>
            </div>
          </div>
        </div>
      )}

      {/* Основной layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Боковая панель серверов */}
        <div className="hidden lg:flex w-[72px] bg-[#202225] flex-col items-center py-3 gap-2 overflow-y-auto">
          {servers.map((s) => (
            <button key={s.id} onClick={() => setActiveServer(s)}
              className={`w-12 h-12 rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center text-white font-bold text-lg flex-shrink-0 ${activeServer?.id === s.id ? "rounded-xl" : ""}`}
              style={colorStyle(s.icon_letter === "I" ? "blue" : "purple")}
              title={s.name}>
              {s.icon_letter}
            </button>
          ))}
          <div className="w-8 h-[2px] bg-[#36393f] rounded-full my-1" />
          <button onClick={() => setShowCreateServer(true)}
            className="w-12 h-12 bg-[#36393f] hover:bg-[#3ba55c] rounded-3xl hover:rounded-xl transition-all duration-200 flex items-center justify-center text-[#3ba55c] hover:text-white"
            title="Создать сервер">
            <Icon name="Plus" size={20} />
          </button>
        </div>

        {/* Каналы */}
        <div className={`${mobileSidebarOpen ? "flex" : "hidden"} lg:flex w-60 bg-[#2f3136] flex-col flex-shrink-0`}>
          <div className="p-4 border-b border-[#202225] flex items-center justify-between">
            <h2 className="text-white font-semibold text-base truncate">{activeServer?.name || "InkoGram"}</h2>
            <button className="lg:hidden text-[#b9bbbe] hover:text-white" onClick={() => setMobileSidebarOpen(false)}><Icon name="X" size={16} /></button>
          </div>
          <div className="flex-1 p-2 overflow-y-auto">
            {/* Текстовые каналы */}
            <div className="mb-2">
              <div className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                <Icon name="ChevronDown" size={12} /><span>Текстовые каналы</span>
              </div>
              {channels.filter((c) => c.type === "text").map((ch) => (
                <button key={ch.id} onClick={() => { setActiveChannel(ch); setMobileSidebarOpen(false); }}
                  className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-sm transition-colors ${activeChannel?.id === ch.id ? "bg-[#393c43] text-white" : "text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43]"}`}>
                  <Icon name="Hash" size={16} />{ch.name}
                </button>
              ))}
            </div>
            {/* Голосовые каналы */}
            <div>
              <div className="flex items-center gap-1 px-2 py-1 text-[#8e9297] text-xs font-semibold uppercase tracking-wide">
                <Icon name="ChevronDown" size={12} /><span>Голосовые каналы</span>
              </div>
              {channels.filter((c) => c.type === "voice").map((ch) => (
                <div key={ch.id} className="flex items-center gap-1.5 px-2 py-1 rounded text-[#8e9297] hover:text-[#dcddde] hover:bg-[#393c43] cursor-pointer text-sm">
                  <Icon name="Mic" size={16} />{ch.name}
                </div>
              ))}
            </div>
          </div>
          {/* Пользователь */}
          {me && (
            <div className="p-2 bg-[#292b2f] flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 relative" style={colorStyle(me.avatar_color)}>
                {me.avatar_letter}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-[#3ba55c] border-2 border-[#292b2f] rounded-full" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-white text-sm font-medium truncate">{me.display_name}</div>
                <div className="text-[#b9bbbe] text-xs truncate">{me.custom_status || `@${me.username}`}</div>
              </div>
              <button onClick={openEdit} className="w-8 h-8 flex items-center justify-center text-[#b9bbbe] hover:text-white hover:bg-[#40444b] rounded">
                <Icon name="Settings" size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Область чата */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Шапка чата */}
          <div className="h-12 bg-[#36393f] border-b border-[#202225] flex items-center px-4 gap-2 flex-shrink-0">
            <button className="lg:hidden text-[#8e9297] hover:text-white mr-2" onClick={() => setMobileSidebarOpen(true)}>
              <Icon name="Menu" size={20} />
            </button>
            <Icon name="Hash" size={20} className="text-[#8e9297]" />
            <span className="text-white font-semibold">{activeChannel?.name || "витрина"}</span>
            <div className="w-px h-6 bg-[#40444b] mx-2 hidden sm:block" />
            <span className="text-[#8e9297] text-sm hidden sm:block">InkoGram — Rich Presence для Figma в Discord</span>
            <div className="ml-auto flex items-center gap-3">
              <button onClick={() => setShowSearch(true)} className="text-[#b9bbbe] hover:text-white transition-colors">
                <Icon name="Search" size={18} />
              </button>
              <Icon name="Bell" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
              <Icon name="Users" size={18} className="text-[#b9bbbe] cursor-pointer hover:text-white" />
            </div>
          </div>

          {/* Сообщения */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1">
            {messages.map((msg, i) => {
              const isFirst = i === 0 || messages[i - 1].user_id !== msg.user_id;
              return (
                <div key={msg.id} className={`flex gap-3 group hover:bg-[#32353b] px-2 py-0.5 rounded ${isFirst ? "mt-4" : ""}`}>
                  {isFirst ? (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 mt-0.5" style={colorStyle(msg.avatar_color)}>
                      {msg.avatar_letter}
                    </div>
                  ) : (
                    <div className="w-10 flex-shrink-0 flex items-center justify-center">
                      <span className="text-[#72767d] text-xs opacity-0 group-hover:opacity-100 transition-opacity">{formatTime(msg.created_at)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {isFirst && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-white font-medium text-sm">{msg.display_name}</span>
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

          {/* Ввод сообщения */}
          <div className="p-4 flex-shrink-0">
            <div className="bg-[#40444b] rounded-lg flex items-center gap-2 px-4 py-2">
              <button className="text-[#b9bbbe] hover:text-white flex-shrink-0">
                <Icon name="Plus" size={20} />
              </button>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder={activeChannel ? `Сообщение #${activeChannel.name}` : "Выберите канал..."}
                disabled={!activeChannel || !me}
                className="flex-1 bg-transparent text-[#dcddde] placeholder:text-[#72767d] outline-none text-sm"
              />
              <button onClick={sendMessage} disabled={!input.trim()} className="text-[#b9bbbe] hover:text-[#5865f2] disabled:opacity-40 transition-colors flex-shrink-0">
                <Icon name="Send" size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Участники */}
        <div className="hidden xl:flex w-60 bg-[#2f3136] flex-col flex-shrink-0">
          <div className="p-4 border-b border-[#202225]">
            <h3 className="text-[#8e9297] text-xs font-semibold uppercase tracking-wide">В сети — {members.filter((m) => m.status === "online").length}</h3>
          </div>
          <div className="flex-1 p-3 overflow-y-auto space-y-1">
            {members.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#393c43] cursor-pointer group">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm flex-shrink-0 relative" style={colorStyle(u.avatar_color)}>
                  {u.avatar_letter}
                  <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-[#2f3136] rounded-full ${u.status === "online" ? "bg-[#3ba55c]" : "bg-[#747f8d]"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${u.id === me?.id ? "text-white" : "text-[#b9bbbe] group-hover:text-white"}`}>
                    {u.display_name} {u.id === me?.id && <span className="text-[#5865f2] text-xs">(ты)</span>}
                  </div>
                  {u.custom_status && <div className="text-[#72767d] text-xs truncate">{u.custom_status}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
