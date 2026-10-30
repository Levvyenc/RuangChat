import React, { useCallback, useEffect, useRef, useState } from "react";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
const api = async (url, options = {}) => {
  const res = await fetch(`${API_BASE_URL}${url}`, { credentials: "include", headers: { "Content-Type": "application/json", ...(options.headers || {}) }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body;
};
const initials = name => String(name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]).join("").toUpperCase();
const time = value => value ? new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
const dateLabel = value => {
  const d = new Date(value.replace(" ", "T") + "Z");
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
};
function Avatar({ name, size = 44, online = false }) {
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * .32 }} aria-label={name}>{initials(name)}{online && <i />}</div>;
}
function Auth({ onAuth }) {
  const [mode, setMode] = useState("login"), [username, setUsername] = useState(""), [displayName, setDisplayName] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { const result = await api(`/api/auth/${mode}`, { method: "POST", body: JSON.stringify({ username, displayName, password }) }); onAuth(result.user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="auth-shell"><div className="auth-card"><div className="brand-mark"><span className="brand-glyph">r<span>✦</span></span></div><h1>RuangChat</h1><p className="muted">Tempat cerita menemukan ruang.</p><form onSubmit={submit}>
    {mode === "register" && <label>Nama tampilan<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength="50" placeholder="Nama kamu" required /></label>}
    <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" placeholder="@username" required minLength="3" /></label>
    <label>Password<input value={password} onChange={e=>setPassword(e.target.value)} type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength="8" placeholder="Minimal 8 karakter" required /></label>
    {error && <div className="error">{error}</div>}<button className="primary full" disabled={busy}>{busy ? "Memproses…" : mode==="login" ? "Masuk" : "Buat akun"}</button>
  </form><p className="switch-auth">{mode==="login"?"Belum punya akun?":"Sudah punya akun?"} <button className="link" onClick={()=>{setMode(mode==="login"?"register":"login");setError("");}}>{mode==="login"?"Daftar":"Masuk"}</button></p></div></div>;
}
function App() {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [conversations, setConversations] = useState([]), [active, setActive] = useState(null), [messages, setMessages] = useState([]), [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [users, setUsers] = useState([]), [searching, setSearching] = useState(false), [tab, setTab] = useState("chats"), [dark, setDark] = useState(false), [connected, setConnected] = useState(false), [error, setError] = useState(""), [showProfile, setShowProfile] = useState(false), [showMenu, setShowMenu] = useState(false), [showAbout, setShowAbout] = useState(false), [showSettings, setShowSettings] = useState(false), [chatType, setChatType] = useState("private");
  const ws = useRef(null), reconnect = useRef(1000), reconnectTimer = useRef(null), activeRef = useRef(null), userRef = useRef(null), drafts = useRef({}), bottomRef = useRef(null), typingTimer = useRef(null), seen = useRef(new Set()), deliveryTimers = useRef(new Map());
  activeRef.current = active; userRef.current = user;
  const loadConversations = useCallback(async () => { try { const d = await api("/api/conversations"); setConversations(d.conversations || []); } catch {} }, []);
  const loadMessages = useCallback(async id => {
    if (!id) return;
    try { const d = await api(`/api/conversations/${id}/messages`); setMessages(prev => {
      if (activeRef.current !== id) return prev;
      const merged = new Map();
      (d.messages||[]).forEach(m=>merged.set(String(m.id),m));
      // Keep optimistic messages until the server confirms them; failed messages must never vanish.
      prev.filter(m=>m.pending||m.failed).forEach(local=>{
        const serverCopy=[...merged.values()].find(m=>m.clientMessageId && m.clientMessageId===local.clientMessageId);
        if(serverCopy) merged.set(String(serverCopy.id), {...serverCopy,pending:false,failed:false});
        else merged.set(String(local.id),local);
      });
      return [...merged.values()].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    }); } catch(e) { setError(e.message); }
  }, []);
  useEffect(() => { api("/api/auth/me").then(d=>setUser(d.user)).catch(()=>{}).finally(()=>setLoading(false)); }, []);
  useEffect(() => { if(user) loadConversations(); }, [user, loadConversations]);
  useEffect(() => {
    if (!user) return;
    let closedByCleanup = false;
    const connect = () => {
      if (closedByCleanup) return;
      const endpoint = API_BASE_URL ? new URL(API_BASE_URL) : new URL(location.origin);
      const scheme = endpoint.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${endpoint.host}/ws`); ws.current = socket;
      socket.onopen = () => { setConnected(true); reconnect.current=1000; socket.send(JSON.stringify({event:"conversation:sync",data:{}})); };
      socket.onmessage = ev => {
        let packet; try { packet=JSON.parse(ev.data); } catch { return; }
        const {event,data={}}=packet;
        if(event==="connection:state") setConnected(data.state==="connected");
        if(event==="message:new" && data.message) {
          const m=data.message;
          if(!seen.current.has(String(m.id))) {
            seen.current.add(String(m.id));
            if(activeRef.current===m.conversationId) {
              setMessages(prev=>prev.some(x=>String(x.id)===String(m.id))?prev:[...prev,m]);
              socket.send(JSON.stringify({event:"message:read",data:{conversationId:m.conversationId}}));
            }
          }
          loadConversations();
        }
        if(event==="message:ack" && data.message) {
          clearTimeout(deliveryTimers.current.get(data.clientMessageId));
          deliveryTimers.current.delete(data.clientMessageId);
          setMessages(prev=>prev.map(m=>m.clientMessageId===data.clientMessageId?{...data.message,pending:false,failed:false}:m));
        }
        if(event==="message:error") {
          clearTimeout(deliveryTimers.current.get(data.clientMessageId));
          deliveryTimers.current.delete(data.clientMessageId);
          setMessages(prev=>prev.map(m=>m.clientMessageId===data.clientMessageId?{...m,pending:false,failed:true,errorText:data.error||"Pesan gagal dikirim"}:m));
          setError(data.error||"Pesan gagal dikirim");
        }
        if(event==="conversation:update" || event==="unread:update") loadConversations();
        if(event==="message:updated" || event==="message:deleted") loadMessages(activeRef.current);
      };
      socket.onclose = () => {
        setConnected(false);
        if(!closedByCleanup) { const delay=reconnect.current; reconnect.current=Math.min(delay*2,30000); reconnectTimer.current=setTimeout(connect,delay); }
      };
      socket.onerror = () => socket.close();
    };
    connect();
    const fallback=setInterval(()=>{if(!ws.current||ws.current.readyState!==WebSocket.OPEN) loadConversations();},60000);
    return ()=>{closedByCleanup=true;clearInterval(fallback);clearTimeout(reconnectTimer.current);ws.current?.close();};
  }, [user, loadConversations, loadMessages]);
  useEffect(() => {
    if(active) {
      setMessages([]); loadMessages(active); api(`/api/conversations/${active}/read`,{method:"POST",body:"{}"}).then(loadConversations).catch(()=>{});
      if(ws.current?.readyState===WebSocket.OPEN) ws.current.send(JSON.stringify({event:"message:read",data:{conversationId:active}}));
    }
  }, [active, loadMessages, loadConversations]);
  useEffect(() => { if(active) drafts.current[active]=draft; }, [draft, active]);
  useEffect(() => { const el=bottomRef.current; if(el) el.scrollIntoView({behavior:"smooth",block:"end"}); }, [messages.length, active]);
  useEffect(() => {
    const q=query.trim(); if(q.length<2){setUsers([]);return;}
    const timer=setTimeout(async()=>{setSearching(true);try{const d=await api(`/api/users/search?q=${encodeURIComponent(q)}`);setUsers(d.users||[]);}catch{}finally{setSearching(false);}},250);
    return ()=>clearTimeout(timer);
  }, [query]);
  const activeConversation = conversations.find(c=>c.id===active);
  async function openUser(person) {
    try {
      const d=await api("/api/conversations",{method:"POST",body:JSON.stringify({userId:person.id})});
      await loadConversations(); setActive(d.id); setDraft(drafts.current[d.id]||""); setQuery(""); setUsers([]); setTab("chats");
    } catch(e){setError(e.message);}
  }
  function openConversation(c) { setActive(c.id); setDraft(drafts.current[c.id]||""); setShowProfile(false); }
  function transmitMessage(conversationId, content, existingId) {
    const clientMessageId=existingId || (crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`);
    const optimistic={id:`tmp-${clientMessageId}`,conversationId,senderId:user.id,clientMessageId,content,type:"text",createdAt:new Date().toISOString(),displayName:user.displayName,pending:true,failed:false};
    setMessages(prev=>existingId
      ? prev.map(m=>m.clientMessageId===existingId?{...optimistic}:m)
      : [...prev,optimistic]);
    const markFailed=()=>setMessages(prev=>prev.map(m=>m.clientMessageId===clientMessageId?{...m,pending:false,failed:true}:m));
    if(ws.current?.readyState===WebSocket.OPEN) {
      try {
        ws.current.send(JSON.stringify({event:"message:send",data:{conversationId,clientMessageId,content}}));
        const timer=setTimeout(()=>{deliveryTimers.current.delete(clientMessageId);markFailed();},15000);
        deliveryTimers.current.set(clientMessageId,timer);
      } catch {
        markFailed();
      }
    } else {
      api(`/api/conversations/${conversationId}/messages`,{method:"POST",body:JSON.stringify({clientMessageId,content})})
        .then(d=>setMessages(prev=>prev.map(m=>m.clientMessageId===clientMessageId?{...d.message,pending:false,failed:false}:m)))
        .catch(()=>markFailed());
    }
    loadConversations();
  }
  function sendMessage(e) {
    e?.preventDefault();
    const content=draft.trim();
    if(!content||!active||content.length>5000)return;
    transmitMessage(active,content);
    setDraft(""); drafts.current[active]="";
  }
  function retryMessage(message) {
    if(!message?.content||!message.conversationId)return;
    transmitMessage(message.conversationId,message.content);
    setMessages(prev=>prev.filter(m=>m.clientMessageId!==message.clientMessageId));
  }
  function typeChange(value) {
    setDraft(value);
    if(active&&ws.current?.readyState===WebSocket.OPEN){
      ws.current.send(JSON.stringify({event:"typing:start",data:{conversationId:active}}));
      clearTimeout(typingTimer.current); typingTimer.current=setTimeout(()=>ws.current?.readyState===WebSocket.OPEN&&ws.current.send(JSON.stringify({event:"typing:stop",data:{conversationId:active}})),1200);
    }
  }
  async function logout(){try{await api("/api/auth/logout",{method:"POST",body:"{}"});}catch{}setUser(null);setConversations([]);setActive(null);setMessages([]);}
  if(loading)return <div className="boot"><div className="brand-mark"><span className="brand-glyph">r<span>✦</span></span></div><span>RuangChat</span></div>;
  if(!user)return <Auth onAuth={setUser}/>;
  return <div className={`app ${dark?"dark":""}`}>
    <aside className={`sidebar ${active?"mobile-hidden":""}`}>
      <header className="side-header"><div className="brand"><div className="brand-mark small"><span className="brand-glyph">r<span>✦</span></span></div><strong>RuangChat</strong></div><div className="head-actions menu-anchor"><button className="menu-trigger" title="Menu" aria-label="Buka menu" aria-expanded={showMenu} onClick={()=>setShowMenu(v=>!v)}>⋮</button>{showMenu&&<div className="overflow-menu"><button onClick={()=>{setShowProfile(true);setShowMenu(false);}}>♧ <span>Profil</span></button><button onClick={()=>{setShowAbout(true);setShowMenu(false);}}>✧ <span>Tentang</span></button><button onClick={()=>{setShowSettings(true);setShowMenu(false);}}>⚙ <span>Pengaturan</span></button><div className="menu-divider"/><button className="logout-menu" onClick={()=>{setShowMenu(false);logout();}}>↪ <span>Keluar</span></button></div>}</div></header>
      <div className="search-wrap"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari username untuk chat pribadi" className="new-chat-search"/></div>
      {query.trim().length>=2 && <div className="search-results">{searching?<p className="muted pad">Mencari…</p>:users.length?users.map(p=><button className="person-result" key={p.id} onClick={()=>openUser(p)}><Avatar name={p.displayName}/><span><b>{p.displayName}</b><small>@{p.username}</small></span></button>):<p className="muted pad">Username tidak ditemukan. Pastikan ejaannya benar.</p>}</div>}
      <div className="list-heading"><span>{tab==="chats"?"PESAN":tab==="status"?"STATUS":"SALURAN"}</span><span className={`connection ${connected?"online":""}`}>{connected?"Terhubung":"Menyambungkan"}</span></div>
      {tab==="chats" ? <>
        <div className="message-filters"><button className={chatType==="private"?"active-filter":""} onClick={()=>setChatType("private")}>Pribadi</button><button className={chatType==="group"?"active-filter":""} onClick={()=>setChatType("group")}>Grup</button></div>
        <div className="chat-list">{chatType==="group" ? <div className="empty-list"><div>♧</div><b>Pesan grup</b><p>Grup akan tampil di sini setelah fitur grup diaktifkan.</p></div> : conversations.filter(c=>!c.isGroup&&!c.groupId).length?conversations.filter(c=>!c.isGroup&&!c.groupId).map(c=><button key={c.id} className={`chat-row ${active===c.id?"active":""}`} onClick={()=>openConversation(c)}><Avatar name={c.name}/><span className="chat-row-body"><span className="row-title"><b>{c.name}</b><time>{time(c.lastMessageAt)}</time></span><span className="row-preview"><span>{c.lastMessage||"Mulai percakapan"}</span>{c.unreadCount>0&&<i>{c.unreadCount}</i>}</span></span></button>):<div className="empty-list"><div>☏</div><b>Belum ada pesan pribadi</b><p>Cari username di atas untuk memulai chat.</p></div>}</div>
      </> : tab==="status" ? <div className="section-empty"><div className="section-empty-icon">◉</div><b>Status</b><p>Pembaruan status akan muncul di sini.</p><small>Fitur status belum tersedia di server saat ini.</small></div> : <div className="section-empty"><div className="section-empty-icon">▤</div><b>Saluran</b><p>Ikuti saluran untuk melihat kabar terbaru.</p><small>Fitur saluran belum tersedia di server saat ini.</small></div>}
      {tab === "chats" && <button className="new-chat-fab" title="Mulai chat baru" aria-label="Mulai chat baru" onClick={()=>{setQuery("");setUsers([]);document.querySelector(".new-chat-search")?.focus();}}><span className="fab-plus">＋</span><span className="fab-label">Chat baru</span></button>}
      <footer className="side-footer"><button className={`footer-nav ${tab==="chats"?"footer-selected":""}`} onClick={()=>{setTab("chats");setActive(null);}}><span className="footer-icon" aria-hidden="true">▱</span><span>Pesan</span></button><button className={`footer-nav ${tab==="status"?"footer-selected":""}`} onClick={()=>{setTab("status");setActive(null);}}><span className="footer-icon" aria-hidden="true">◌</span><span>Status</span></button><button className={`footer-nav ${tab==="channels"?"footer-selected":""}`} onClick={()=>{setTab("channels");setActive(null);}}><span className="footer-icon" aria-hidden="true">▧</span><span>Saluran</span></button></footer>
    </aside>
    <main className={`conversation ${!active?"mobile-hidden":""}`}>
      {activeConversation ? <>
        <header className="chat-header"><button className="back-button" onClick={()=>setActive(null)} aria-label="Kembali">‹</button><Avatar name={activeConversation.name} size={40}/><div className="chat-header-info"><b>{activeConversation.name}</b><span>{connected?"terhubung":"menyambungkan…"}</span></div><button title="Profil chat" onClick={()=>setShowProfile(v=>!v)}>ⓘ</button></header>
        <section className="message-area">
          <div className="encryption-note"><span>🔒</span> Pesan tersimpan di server RuangChat. Jangan kirim informasi sensitif.</div>
          {messages.map((m,i)=>{
            const own=m.senderId===user.id;
            const previous=messages[i-1];
            const showDate=!previous||dateLabel(previous.createdAt)!==dateLabel(m.createdAt);
            return <React.Fragment key={m.id}>{showDate&&<div className="date-separator"><span>{dateLabel(m.createdAt)}</span></div>}<div className={`message-line ${own?"outgoing":"incoming"}`}><div className="bubble"><div className="message-content">{m.content}</div><div className="message-meta">{m.editedAt&&<span>diedit </span>}{time(m.createdAt)} {own&&<span className={`checks ${m.pending?"pending":m.failed?"failed":""}`}>{m.pending?"◷":m.failed?"!":"✓"}</span>}</div>{m.failed&&<div className="failed-actions"><span>Belum terkirim</span><button className="retry" onClick={()=>retryMessage(m)}>Kirim ulang</button></div>}</div></div></React.Fragment>;
          })}
          <div ref={bottomRef}/>{messages.length===0&&<div className="first-message"><div>👋</div><b>Mulai percakapan</b><p>Kirim pesan pertama kamu.</p></div>}
        </section>
        <form className="composer" onSubmit={sendMessage}><button type="button" title="Emoji" onClick={()=>setDraft(v=>v+"😊")}>☺</button><textarea rows="1" value={draft} onChange={e=>typeChange(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} placeholder="Ketik pesan" maxLength="5000"/><button type="submit" className="send-button" disabled={!draft.trim()} title="Kirim">➤</button></form>
      </> : <div className="welcome"><div className="welcome-illustration"><div className="welcome-bubble">•••</div><span>✦</span></div><h1>Chat jadi lebih dekat.</h1><p>Pilih percakapan atau cari username untuk mulai berkirim pesan.</p><div className="secure-note">▣ &nbsp; RuangChat · sederhana, cepat, real-time</div></div>}
    </main>
    {showProfile&&<div className="modal-backdrop" onClick={()=>setShowProfile(false)}><section className="profile-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowProfile(false)}>×</button><Avatar name={user.displayName} size={88}/><h2>{user.displayName}</h2><p className="muted">@{user.username}</p><p className="about">{user.about||"Hai! Saya menggunakan RuangChat."}</p><button className="secondary" onClick={()=>{setDark(v=>!v);}}> {dark?"Gunakan tema terang":"Gunakan tema gelap"}</button></section></div>}
    {showAbout&&<div className="modal-backdrop" onClick={()=>setShowAbout(false)}><section className="profile-modal info-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowAbout(false)}>×</button><div className="brand-mark about-mark">r</div><h2>About RuangChat</h2><p className="about">RuangChat adalah ruang untuk terhubung dan berbagi pesan.</p><p className="muted">Versi 2.0.0</p><button className="primary full" onClick={()=>setShowAbout(false)}>Tutup</button></section></div>}
    {showSettings&&<div className="modal-backdrop" onClick={()=>setShowSettings(false)}><section className="profile-modal settings-modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setShowSettings(false)}>×</button><h2>Settings</h2><p className="muted settings-subtitle">Atur tampilan RuangChat</p><div className="setting-row"><span><b>Tema gelap</b><small>Gunakan tampilan gelap</small></span><button className={`toggle ${dark?"toggle-on":""}`} aria-label="Ubah tema" onClick={()=>setDark(v=>!v)}><i/></button></div><button className="secondary" onClick={()=>{setShowSettings(false);setShowProfile(true);}}>Lihat profile</button><button className="secondary" onClick={()=>{setShowSettings(false);logout();}}>Logout</button></section></div>}
    {error&&<button className="toast" onClick={()=>setError("")}>{error}　×</button>}
  </div>;
}
export default App;
