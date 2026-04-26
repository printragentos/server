/**
 * Printr Agent OS — App.jsx  (v4.0 · MOBILE + WALLET)
 * Changes from v3.1:
 *   - T tokens extracted to theme.js (imported here for backwards compat)
 *   - Full mobile responsiveness via useIsMobile hook
 *   - Hamburger drawer sidebar on mobile
 *   - WalletButton in header (always reachable)
 *   - DeployTokenForm tab added
 *   - injectGlobal extended with mobile CSS
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { T, LC, LP }              from "./theme.js";
import { useIsMobile }            from "./hooks/useIsMobile.js";
import { useWallet }              from "./hooks/useWallet.js";
import { WalletButton }           from "./components/WalletButton.jsx";
import { DeployTokenForm }        from "./components/DeployTokenForm.jsx";

// ─── Global styles ────────────────────────────────────────────────────────────

const injectGlobal = () => {
  if (document.getElementById("pos-v4")) return;
  const el = document.createElement("style");
  el.id = "pos-v4";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; }
    body {
      background: ${T.bg};
      color: ${T.text};
      font-family: ${T.mono};
      -webkit-font-smoothing: antialiased;
      font-size: 13px;
      /* Prevent rubber-band scroll on iOS from showing white */
      overscroll-behavior: none;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 9999;
      opacity: 0.4;
    }
    @keyframes spin    { to { transform: rotate(360deg); } }
    @keyframes pdot    { 0%,100%{opacity:1} 50%{opacity:.15} }
    @keyframes fadeUp  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    @keyframes blink   { 0%,100%{opacity:1} 49%{opacity:1} 50%{opacity:0} }
    @keyframes slideIn { from{transform:translateX(-100%)} to{transform:translateX(0)} }
    input, textarea, select, button { font-family: ${T.mono}; }
    input::placeholder, textarea::placeholder { color: ${T.muted}; }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: ${T.amber}70 !important;
      box-shadow: 0 0 0 1px ${T.amber}20;
    }
    ::-webkit-scrollbar { width: 3px; height: 3px; }
    ::-webkit-scrollbar-track { background: ${T.bg}; }
    ::-webkit-scrollbar-thumb { background: ${T.borderL}; }
    select option { background: ${T.card}; }
    .fade-up { animation: fadeUp .22s ease both; }
    .rule-line { height: 1px; background: linear-gradient(90deg, transparent, ${T.border} 15%, ${T.border} 85%, transparent); }

    /* ── Mobile drawer ── */
    .drawer-sidebar {
      animation: slideIn .2s ease both;
    }

    /* ── Mobile: prevent content overflow ── */
    @media (max-width: 767px) {
      /* iOS keyboard: push content up */
      html { height: -webkit-fill-available; }
      body { min-height: -webkit-fill-available; }

      /* Tap highlight off */
      * { -webkit-tap-highlight-color: transparent; }

      /* Inputs: prevent iOS auto-zoom (font-size < 16px triggers zoom) */
      input, textarea, select { font-size: 16px !important; }

      /* Smooth momentum scrolling */
      .scroll-area { -webkit-overflow-scrolling: touch; }
    }

    /* ── Landscape mobile ── */
    @media (max-width: 767px) and (orientation: landscape) {
      .modal-panel { max-height: 95vh; }
    }
  `;
  document.head.appendChild(el);
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Server returned non-JSON response (${res.status}). Check API routing.`);
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? d.message ?? `HTTP ${res.status}`);
  return d;
}

function openSSE(path, { onMsg, onClose }) {
  const es = new EventSource(`/api${path}`);
  es.onmessage = e => { try { onMsg(JSON.parse(e.data)); } catch {} };
  es.onerror   = () => { onClose?.(); es.close(); };
  return () => es.close();
}

// ─── Primitive components ─────────────────────────────────────────────────────

function Btn({ children, onClick, variant = "primary", size = "md", disabled, full, style }) {
  const [pressed, setPressed] = useState(false);
  const variants = {
    primary: { background: T.amber,       color: "#0c0c0a",  border: `1px solid ${T.amber}`,      fontWeight: "600" },
    ghost:   { background: "transparent", color: T.sub,      border: `1px solid ${T.border}` },
    subtle:  { background: T.card,        color: T.text,     border: `1px solid ${T.borderL}` },
    danger:  { background: "transparent", color: T.red,      border: `1px solid ${T.red}35` },
    amber:   { background: T.amberGlow,   color: T.amber,    border: `1px solid ${T.amber}40` },
  };
  const sizes = {
    xs: { fontSize: 10, padding: "3px 8px",   borderRadius: 2 },
    sm: { fontSize: 11, padding: "5px 11px",  borderRadius: 2 },
    md: { fontSize: 12, padding: "8px 16px",  borderRadius: 2 },
    lg: { fontSize: 13, padding: "11px 22px", borderRadius: 2 },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.35 : 1,
        transition: "opacity .1s, transform .08s",
        transform: pressed && !disabled ? "translateY(1px)" : "none",
        letterSpacing: "0.02em",
        width: full ? "100%" : "auto",
        justifyContent: full ? "center" : undefined,
        ...(variants[variant] ?? variants.ghost),
        ...(sizes[size] ?? sizes.md),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, multiline, rows = 3, disabled, onKeyDown, style, mono = true }) {
  const base = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 2,
    padding: "8px 11px", color: T.text, fontSize: 12,
    fontFamily: mono ? T.mono : T.sans, width: "100%",
    transition: "border-color .12s, box-shadow .12s",
    resize: multiline ? "vertical" : "none", lineHeight: 1.6, ...style,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} onKeyDown={onKeyDown} style={base} />
    : <input    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} onKeyDown={onKeyDown} style={base} />;
}

function Select({ value, onChange, options, disabled, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
      style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 2, padding: "8px 11px", color: T.text, fontSize: 12, fontFamily: T.mono, width: "100%", cursor: disabled ? "not-allowed" : "pointer", ...style }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Label({ children, style }) {
  return <div style={{ fontSize: 10, fontWeight: 500, color: T.sub, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5, ...style }}>{children}</div>;
}

function Tag({ children, color = T.sub }) {
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", padding: "2px 6px", background: color + "14", color, border: `1px solid ${color}28`, borderRadius: 1 }}>{children}</span>;
}

function Dot({ color, pulse, size = 5 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: pulse ? `0 0 6px ${color}80` : "none", animation: pulse ? "pdot 2.5s ease-in-out infinite" : "none" }} />;
}

function Spinner({ size = 14, color = T.amber }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", border: `1.5px solid ${color}20`, borderTopColor: color, animation: "spin .6s linear infinite", flexShrink: 0 }} />;
}

function Empty({ icon = "○", title, sub, action }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 24px", textAlign: "center", gap: 9 }}>
      <span style={{ fontSize: 22, color: T.muted, letterSpacing: "0.1em" }}>{icon}</span>
      {title  && <div style={{ fontSize: 12, fontWeight: 500, color: T.sub, letterSpacing: "0.06em" }}>{title}</div>}
      {sub    && <div style={{ fontSize: 11, color: T.muted, maxWidth: 280, lineHeight: 1.7 }}>{sub}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return <div style={{ background: T.red + "0a", border: `1px solid ${T.red}30`, borderRadius: 2, padding: "9px 12px", fontSize: 11, color: T.red, marginTop: 10, letterSpacing: "0.03em", lineHeight: 1.6 }}>×  {msg}</div>;
}

function SectionBlock({ label, children, action }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em" }}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Terminal Log Panel ───────────────────────────────────────────────────────

function TerminalPanel({ logs, done, running, label = "EXEC", taskId }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [logs]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "0 16px", height: 36, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 5 }}>
            {["#3d3d32","#3d3d32","#3d3d32"].map((c, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />)}
          </div>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em" }}>{label}{taskId ? ` · ${taskId.slice(0, 8)}` : ""}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {running && <><Dot color={T.amber} pulse size={5} /><span style={{ fontSize: 10, color: T.amber, letterSpacing: "0.1em" }}>RUNNING</span></>}
          {done    && <Tag color={done.status === "done" ? T.green : T.red}>{done.status.toUpperCase()}</Tag>}
        </div>
      </div>

      <div ref={ref} className="scroll-area" style={{ flex: 1, overflow: "auto", padding: "14px 0", background: T.bg, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(0deg, transparent, transparent 2px, ${T.rule}08 2px, ${T.rule}08 4px)`, pointerEvents: "none", zIndex: 1 }} />
        {logs.length === 0 && !running ? (
          <Empty icon="▷" title="awaiting execution" sub="Run an agent or pipeline to stream logs here." />
        ) : (
          <div style={{ position: "relative", zIndex: 2 }}>
            {logs.map((log, i) => <TermLine key={i} log={log} num={i + 1} />)}
            {running && (
              <div style={{ display: "flex", padding: "2px 16px", alignItems: "center", gap: 40 }}>
                <span style={{ fontSize: 10, color: T.muted, minWidth: 28 }}>{String(logs.length + 1).padStart(3, "0")}</span>
                <span style={{ fontSize: 12, color: T.amber, animation: "blink 1s step-end infinite" }}>▮</span>
              </div>
            )}
            {done?.result?.output && (
              <div style={{ margin: "16px 16px 0", borderTop: `1px solid ${T.green}30`, paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: T.green, letterSpacing: "0.12em", marginBottom: 10 }}>◉  OUTPUT</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.85, whiteSpace: "pre-wrap", wordBreak: "break-word", paddingLeft: 16, borderLeft: `2px solid ${T.green}40` }}>{done.result.output}</div>
              </div>
            )}
            {done?.status === "error" && (
              <div style={{ margin: "16px 16px 0", padding: "10px 12px", background: T.red + "0a", border: `1px solid ${T.red}25`, fontSize: 11, color: T.red }}>×  Task failed — see error logs above</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TermLine({ log, num }) {
  const color  = LC[log.level] ?? T.sub;
  const prefix = LP[log.level] ?? "   ";
  return (
    <div style={{ display: "flex", gap: 0, padding: "1px 0", alignItems: "flex-start" }}>
      <span style={{ fontSize: 10, color: T.muted, minWidth: 44, textAlign: "right", paddingRight: 14, paddingTop: 1, userSelect: "none", flexShrink: 0, borderRight: `1px solid ${T.rule}`, marginRight: 14 }}>{String(num).padStart(3, "0")}</span>
      <span style={{ fontSize: 10, color: T.muted, minWidth: 58, flexShrink: 0, paddingTop: 1, letterSpacing: "0.03em" }}>{new Date(log.ts).toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      {log.step !== undefined && <span style={{ fontSize: 9, color: T.amber, minWidth: 20, flexShrink: 0, paddingTop: 2, letterSpacing: "0.06em" }}>S{log.step + 1}</span>}
      <span style={{ fontSize: 11, color, lineHeight: 1.65, wordBreak: "break-word", flex: 1, paddingRight: 16 }}>
        <span style={{ color: T.muted, userSelect: "none" }}>{prefix}</span>
        {log.message}
        {log.tool && <span style={{ fontSize: 10, color: T.border + "ff", marginLeft: 10 }}>[{log.tool}]</span>}
        {log.agentName && log.step !== undefined && <span style={{ fontSize: 10, color: T.amber + "99", marginLeft: 8 }}>{log.agentName}</span>}
      </span>
    </div>
  );
}

// ─── Hamburger button ─────────────────────────────────────────────────────────

function HamburgerBtn({ open, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}
      style={{
        background:   "none",
        border:       `1px solid ${T.border}`,
        borderRadius: 2,
        color:        T.sub,
        cursor:       "pointer",
        width:        40,
        height:       40,
        display:      "flex",
        flexDirection:"column",
        alignItems:   "center",
        justifyContent: "center",
        gap:          5,
        flexShrink:   0,
        padding:      0,
      }}
    >
      {open ? (
        <span style={{ fontSize: 18, color: T.amber, lineHeight: 1 }}>×</span>
      ) : (
        <>
          <span style={{ width: 18, height: 1.5, background: T.sub, display: "block", borderRadius: 1 }} />
          <span style={{ width: 18, height: 1.5, background: T.sub, display: "block", borderRadius: 1 }} />
          <span style={{ width: 12, height: 1.5, background: T.sub, display: "block", borderRadius: 1, alignSelf: "flex-start", marginLeft: 3 }} />
        </>
      )}
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "run",       label: "RUN",       icon: "▷" },
  { id: "pipelines", label: "PIPELINES", icon: "◈" },
  { id: "agents",    label: "AGENTS",    icon: "◎" },
  { id: "tools",     label: "TOOLS",     icon: "◇" },
  { id: "deploy",    label: "DEPLOY",    icon: "◈" },
];

function Sidebar({ active, onNav, agentCount, toolCount, isMobile, drawerOpen, onClose }) {
  if (isMobile && !drawerOpen) return null;

  const inner = (
    <aside style={{
      width:           200,
      flexShrink:      0,
      background:      T.surface,
      borderRight:     `1px solid ${T.border}`,
      display:         "flex",
      flexDirection:   "column",
      overflow:        "hidden",
      height:          isMobile ? "100%" : "auto",
    }}>
      {/* Logo */}
      <div style={{ height: 52, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 18px", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 24, height: 24, background: T.amber, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="0" width="5" height="5" fill="#0c0c0a" />
            <rect x="7" y="0" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
            <rect x="0" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
            <rect x="7" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.3" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>PRINTR</div>
          <div style={{ fontSize: 9, color: T.sub, letterSpacing: "0.1em" }}>AGENT OS</div>
        </div>
        {isMobile && (
          <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 20, padding: 4, lineHeight: 1 }}>×</button>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onNav(item.id); if (isMobile) onClose(); }}
              style={{
                display:      "flex",
                alignItems:   "center",
                gap:          10,
                padding:      isMobile ? "13px 10px" : "9px 10px",
                borderRadius: 2,
                border:       "none",
                background:   isActive ? T.amberGlow : "transparent",
                color:        isActive ? T.amber : T.muted,
                cursor:       "pointer",
                fontSize:     11,
                letterSpacing:"0.1em",
                fontFamily:   T.mono,
                fontWeight:   isActive ? 500 : 400,
                textAlign:    "left",
                width:        "100%",
                transition:   "all .12s",
                borderLeft:   isActive ? `2px solid ${T.amber}` : "2px solid transparent",
                minHeight:    isMobile ? 48 : "auto",
              }}
            >
              <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em" }}>AGENTS</span><span style={{ fontSize: 10, color: T.sub, fontWeight: 500 }}>{agentCount}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em" }}>TOOLS</span><span style={{ fontSize: 10, color: T.sub, fontWeight: 500 }}>{toolCount}</span></div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}><Dot color={T.green} pulse size={4} /><span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.08em" }}>LIVE</span></div>
      </div>
    </aside>
  );

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,.7)", zIndex: 200, backdropFilter: "blur(2px)" }}
        />
        {/* Drawer */}
        <div
          className="drawer-sidebar"
          style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 201, width: 220 }}
        >
          {inner}
        </div>
      </>
    );
  }

  return inner;
}

// ─── Run tab ──────────────────────────────────────────────────────────────────

function RunTab({ agents, onAgentsChange, isMobile }) {
  const [agentId, setAgentId] = useState("");
  const [prompt,  setPrompt]  = useState("");
  const [running, setRunning] = useState(false);
  const [logs,    setLogs]    = useState([]);
  const [done,    setDone]    = useState(null);
  const [err,     setErr]     = useState(null);
  const [taskId,  setTaskId]  = useState(null);
  const unsubRef              = useRef(null);

  useEffect(() => { if (agents.length > 0 && !agentId) setAgentId(agents[0].id); }, [agents]);
  useEffect(() => () => unsubRef.current?.(), []);

  const run = async () => {
    if (!agentId || !prompt.trim() || running) return;
    setRunning(true); setLogs([]); setDone(null); setErr(null); setTaskId(null);
    unsubRef.current?.();
    try {
      const { task } = await api("/agents/run", { method: "POST", body: { agentId, input: prompt.trim() } });
      setTaskId(task.id);
      unsubRef.current = openSSE(`/tasks/${task.id}/stream`, {
        onMsg: m => {
          if (m.type === "log")  setLogs(p => [...p, m.log]);
          if (m.type === "done") { setDone(m); setRunning(false); onAgentsChange(); }
        },
        onClose: () => { setErr("Stream disconnected."); setRunning(false); },
      });
    } catch (e) { setErr(e.message); setRunning(false); }
  };

  const sel = agents.find(a => a.id === agentId);

  if (isMobile) {
    // Mobile: stacked layout (controls on top, terminal below)
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
        {/* Control panel */}
        <div className="scroll-area" style={{ flexShrink: 0, background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "16px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "45vh", overflowY: "auto" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text, letterSpacing: "0.08em", marginBottom: 4 }}>EXECUTE AGENT</div>
            <div style={{ fontSize: 12, color: T.sub, lineHeight: 1.7 }}>Select agent, write task, execute via Printr MCP.</div>
          </div>
          <div>
            <Label>AGENT</Label>
            {agents.length === 0
              ? <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No agents — create one first</div>
              : <Select value={agentId} onChange={setAgentId} options={agents.map(a => ({ value: a.id, label: `${a.name}  [${a.chain.toUpperCase()}]` }))} disabled={running} />
            }
            {sel && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><Tag color={sel.chain === "solana" ? T.sol : T.evm}>{sel.chain.toUpperCase()}</Tag><Tag color={T.sub}>{sel.status}</Tag><Tag color={T.sub}>{sel.config?.maxSteps ?? 10} steps</Tag></div>}
          </div>
          <div>
            <Label>TASK PROMPT</Label>
            <Input value={prompt} onChange={setPrompt} placeholder={sel ? `What should ${sel.name} do?` : "Select agent first…"} multiline rows={4} disabled={running || !agentId} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }} />
          </div>
          <ErrBox msg={err} />
          <Btn onClick={run} disabled={running || !agentId || !prompt.trim()} full size="lg">
            {running ? <><Spinner size={13} /> RUNNING…</> : "▷  EXECUTE"}
          </Btn>
        </div>
        {/* Terminal */}
        <TerminalPanel logs={logs} done={done} running={running} taskId={taskId} />
      </div>
    );
  }

  // Desktop: side-by-side
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, padding: "20px 18px", display: "flex", flexDirection: "column", gap: 18, overflow: "auto" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: "0.08em", marginBottom: 4 }}>EXECUTE AGENT</div>
          <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.7 }}>Select agent, write task, execute via Printr MCP.</div>
        </div>
        <div>
          <Label>AGENT</Label>
          {agents.length === 0
            ? <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>No agents — create one first</div>
            : <>
                <Select value={agentId} onChange={setAgentId} options={agents.map(a => ({ value: a.id, label: `${a.name}  [${a.chain.toUpperCase()}]` }))} disabled={running} />
                {sel && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><Tag color={sel.chain === "solana" ? T.sol : T.evm}>{sel.chain.toUpperCase()}</Tag><Tag color={T.sub}>{sel.status}</Tag><Tag color={T.sub}>{sel.config?.maxSteps ?? 10} steps</Tag></div>}
              </>
          }
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>TASK PROMPT</Label>
          <Input value={prompt} onChange={setPrompt} placeholder={sel ? `What should ${sel.name} do?` : "Select agent first…"} multiline rows={8} disabled={running || !agentId} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }} />
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.04em" }}>⌘ ENTER TO EXECUTE</div>
        </div>
        <ErrBox msg={err} />
        <Btn onClick={run} disabled={running || !agentId || !prompt.trim()} full size="lg">
          {running ? <><Spinner size={13} /> RUNNING…</> : "▷  EXECUTE"}
        </Btn>
      </div>
      <TerminalPanel logs={logs} done={done} running={running} taskId={taskId} />
    </div>
  );
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({ agents, onRefresh, isMobile }) {
  const [sel,      setSel]      = useState(null);
  const [creating, setCreating] = useState(false);

  const selectedAgent = agents.find(a => a.id === sel?.id);

  // On mobile: show list OR detail (not side by side)
  if (isMobile) {
    if (creating) {
      return (
        <div className="scroll-area" style={{ height: "100%", overflowY: "auto" }}>
          <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setCreating(false)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 18, padding: "4px 8px 4px 0", lineHeight: 1 }}>←</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>CREATE AGENT</span>
          </div>
          <AgentCreateForm onClose={() => setCreating(false)} onCreate={async (payload) => { const data = await api("/agents", { method: "POST", body: payload }); setCreating(false); onRefresh(); setSel(data.agent); }} isMobile />
        </div>
      );
    }
    if (selectedAgent) {
      return (
        <div className="scroll-area" style={{ height: "100%", overflowY: "auto" }}>
          <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => setSel(null)} style={{ background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 18, padding: "4px 8px 4px 0", lineHeight: 1 }}>←</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>{selectedAgent.name}</span>
          </div>
          <AgentDetailPane agent={selectedAgent} onDelete={async () => { await api(`/agents/${selectedAgent.id}`, { method: "DELETE" }); setSel(null); onRefresh(); }} onRefresh={onRefresh} isMobile />
        </div>
      );
    }
    // List view
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: T.sub, letterSpacing: "0.12em" }}>AGENTS ({agents.length})</span>
          <Btn size="sm" onClick={() => setCreating(true)}>+ NEW</Btn>
        </div>
        <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
          {agents.length === 0 && <Empty icon="◎" title="NO AGENTS" sub="Create your first agent." action={<Btn size="sm" onClick={() => setCreating(true)}>+ CREATE</Btn>} />}
          {agents.map(a => (
            <div key={a.id} onClick={() => setSel(a)} style={{ padding: "13px 12px", borderRadius: 2, cursor: "pointer", background: T.card, borderLeft: `2px solid ${T.border}`, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: T.text, marginBottom: 4 }}>{a.name}</div>
                <div style={{ display: "flex", gap: 5 }}><Tag color={a.chain === "solana" ? T.sol : T.evm}>{a.chain.toUpperCase()}</Tag><span style={{ fontSize: 11, color: T.muted }}>{a.tasksRun ?? 0} runs</span></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Dot color={{ idle: T.muted, running: T.amber, error: T.red }[a.status] ?? T.muted} pulse={a.status === "running"} />
                <span style={{ color: T.muted, fontSize: 16 }}>›</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.12em" }}>AGENTS ({agents.length})</span>
          <Btn size="xs" onClick={() => setCreating(true)}>+ NEW</Btn>
        </div>
        <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {agents.length === 0 && <Empty icon="◎" title="NO AGENTS" sub="Create your first agent." />}
          {agents.map(a => (
            <div key={a.id} onClick={() => { setSel(a); setCreating(false); }} style={{ padding: "9px 10px", borderRadius: 2, cursor: "pointer", background: sel?.id === a.id ? T.card : "transparent", borderLeft: sel?.id === a.id ? `2px solid ${T.amber}` : "2px solid transparent", marginBottom: 2, transition: "all .1s" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: sel?.id === a.id ? T.text : T.sub }}>{a.name}</span>
                <Dot color={{ idle: T.muted, running: T.amber, error: T.red }[a.status] ?? T.muted} pulse={a.status === "running"} />
              </div>
              <div style={{ display: "flex", gap: 5 }}><Tag color={a.chain === "solana" ? T.sol : T.evm}>{a.chain.toUpperCase()}</Tag><span style={{ fontSize: 10, color: T.muted }}>{a.tasksRun ?? 0} runs</span></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {creating ? (
          <AgentCreateForm onClose={() => setCreating(false)} onCreate={async (payload) => { const data = await api("/agents", { method: "POST", body: payload }); setCreating(false); onRefresh(); setSel(data.agent); }} />
        ) : selectedAgent ? (
          <AgentDetailPane agent={selectedAgent} onDelete={async () => { await api(`/agents/${selectedAgent.id}`, { method: "DELETE" }); setSel(null); onRefresh(); }} onRefresh={onRefresh} />
        ) : (
          <Empty icon="◎" title="SELECT AN AGENT" sub="Click an agent to view details, configure scheduling, and see task history." />
        )}
      </div>
    </div>
  );
}

function AgentCreateForm({ onClose, onCreate, isMobile }) {
  const [name,    setName]    = useState("");
  const [chain,   setChain]   = useState("evm");
  const [prompt,  setPrompt]  = useState("");
  const [steps,   setSteps]   = useState("10");
  const [webhook, setWebhook] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState(null);

  const save = async () => {
    if (!name.trim()) return setErr("Agent name is required.");
    setBusy(true); setErr(null);
    try {
      await onCreate({ name: name.trim(), chain, config: { systemPrompt: prompt.trim() || undefined, maxSteps: parseInt(steps, 10) || 10, webhookUrl: webhook.trim() || null } });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="fade-up" style={{ padding: isMobile ? "16px" : "24px 28px", maxWidth: 560 }}>
      {!isMobile && <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: T.text, marginBottom: 20 }}>CREATE AGENT</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div><Label>NAME *</Label><Input value={name} onChange={setName} placeholder="e.g. DeFi Scout" onKeyDown={e => e.key === "Enter" && save()} /></div>
          <div><Label>CHAIN</Label><Select value={chain} onChange={setChain} options={[{ value: "evm", label: "EVM  (Ethereum / Base)" }, { value: "solana", label: "Solana" }]} /></div>
        </div>
        <div><Label>SYSTEM PROMPT</Label><Input value={prompt} onChange={setPrompt} placeholder="You are a helpful on-chain agent…" multiline rows={isMobile ? 4 : 3} /></div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: 12 }}>
          <div><Label>MAX STEPS</Label><Input value={steps} onChange={setSteps} placeholder="10" /></div>
          <div><Label>OUTBOUND WEBHOOK URL</Label><Input value={webhook} onChange={setWebhook} placeholder="https://…" /></div>
        </div>
      </div>
      <ErrBox msg={err} />
      <div style={{ display: "flex", gap: 8, marginTop: 20, flexDirection: isMobile ? "column" : "row" }}>
        <Btn onClick={save} disabled={busy} full={isMobile} size={isMobile ? "lg" : "md"}>{busy ? <><Spinner size={12} /> CREATING…</> : "CREATE AGENT"}</Btn>
        <Btn variant="ghost" onClick={onClose} full={isMobile} size={isMobile ? "lg" : "md"}>CANCEL</Btn>
      </div>
    </div>
  );
}

function AgentDetailPane({ agent, onDelete, onRefresh, isMobile }) {
  const [sched,     setSched]     = useState(null);
  const [exp,       setExp]       = useState("");
  const [schedIn,   setSchedIn]   = useState("");
  const [tasks,     setTasks]     = useState([]);
  const [schedErr,  setSchedErr]  = useState(null);
  const [schedBusy, setSchedBusy] = useState(false);

  useEffect(() => {
    api(`/agents/${agent.id}/schedule`).then(d => { setSched(d.schedule); if (d.schedule) { setExp(d.schedule.expression); setSchedIn(d.schedule.input); } }).catch(() => {});
    api(`/agents/${agent.id}/tasks`).then(d => setTasks(d.tasks ?? [])).catch(() => {});
  }, [agent.id]);

  const saveSchedule = async () => {
    if (!exp.trim() || !schedIn.trim()) return setSchedErr("Both fields required.");
    setSchedBusy(true); setSchedErr(null);
    try { const d = await api(`/agents/${agent.id}/schedule`, { method: "POST", body: { expression: exp.trim(), input: schedIn.trim() } }); setSched(d.schedule); } catch (e) { setSchedErr(e.message); }
    setSchedBusy(false);
  };

  const sc = { idle: T.muted, running: T.amber, error: T.red }[agent.status] ?? T.muted;

  return (
    <div className="fade-up" style={{ padding: isMobile ? "16px" : "24px 28px", maxWidth: 700 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderTop: `2px solid ${T.amber}`, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: isMobile ? 16 : 16, fontWeight: 600, color: T.text, letterSpacing: "0.04em" }}>{agent.name}</span>
              <Dot color={sc} pulse={agent.status === "running"} size={6} />
              <span style={{ fontSize: 10, color: sc, letterSpacing: "0.1em" }}>{agent.status.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.06em", wordBreak: "break-all" }}>{agent.id}</div>
          </div>
          <Btn variant="danger" size="sm" onClick={onDelete}>DELETE</Btn>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Tag color={agent.chain === "solana" ? T.sol : T.evm}>{agent.chain.toUpperCase()}</Tag>
          <Tag color={T.sub}>{agent.tasksRun ?? 0} TASKS</Tag>
          <Tag color={T.sub}>{agent.config?.maxSteps ?? 10} MAX STEPS</Tag>
          <Tag color={T.sub}>{(agent.tools?.length ?? 0)} TOOLS</Tag>
          {agent.config?.webhookUrl && <Tag color={T.green}>WEBHOOK ✓</Tag>}
        </div>
      </div>

      <SectionBlock label="INBOUND WEBHOOK">
        <div style={{ background: T.card, border: `1px solid ${T.border}`, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 10, lineHeight: 1.7 }}>POST to trigger this agent from any external system.</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <code style={{ flex: 1, fontSize: 10, color: T.amber, background: T.bg, border: `1px solid ${T.border}`, padding: "6px 10px", letterSpacing: "0.04em", fontFamily: T.mono, wordBreak: "break-all" }}>POST /api/webhooks/{agent.id}</code>
            <Btn size="xs" variant="ghost" onClick={() => navigator.clipboard?.writeText(`/api/webhooks/${agent.id}`)}>COPY</Btn>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8 }}>Body: <code style={{ color: T.sub }}>{"{ \"input\": \"your prompt\" }"}</code></div>
        </div>
      </SectionBlock>

      <SectionBlock label="SCHEDULE" action={sched && <Btn size="xs" variant="danger" onClick={async () => { await api(`/agents/${agent.id}/schedule`, { method: "DELETE" }).catch(() => {}); setSched(null); }}>REMOVE</Btn>}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, padding: "14px" }}>
          {sched ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><Dot color={T.green} pulse size={5} /><code style={{ fontSize: 12, color: T.amber, letterSpacing: "0.06em" }}>{sched.expression}</code><Tag color={T.green}>ACTIVE</Tag></div>
              <div style={{ fontSize: 11, color: T.sub }}>Prompt: <em style={{ color: T.text }}>{sched.input}</em></div>
              {sched.lastRun && <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Last run: {new Date(sched.lastRun).toLocaleString()}</div>}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: 10, marginBottom: 10 }}>
                <div><Label>CRON EXPRESSION</Label><Input value={exp} onChange={setExp} placeholder="*/30 * * * *" /><div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>every 30 min · hourly: 0 * * * *</div></div>
                <div><Label>PROMPT (runs on each tick)</Label><Input value={schedIn} onChange={setSchedIn} placeholder="Run portfolio check…" /></div>
              </div>
              <ErrBox msg={schedErr} />
              <Btn onClick={saveSchedule} disabled={schedBusy} style={{ marginTop: schedErr ? 10 : 0 }}>{schedBusy ? <><Spinner size={12} /> SAVING…</> : "SET SCHEDULE"}</Btn>
            </div>
          )}
        </div>
      </SectionBlock>

      <SectionBlock label={`TASK HISTORY (${tasks.length})`}>
        {tasks.length === 0 ? (
          <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic", padding: "10px 0" }}>No tasks yet.</div>
        ) : (
          <div style={{ border: `1px solid ${T.border}`, background: T.card, overflow: "hidden" }}>
            {tasks.slice(0, 12).map((t, i) => {
              const sc2 = { done: T.green, error: T.red, running: T.amber, queued: T.muted }[t.status] ?? T.muted;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 13px" : "9px 13px", borderBottom: i < Math.min(tasks.length, 12) - 1 ? `1px solid ${T.rule}` : "none" }}>
                  <Dot color={sc2} pulse={t.status === "running"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: isMobile ? 12 : 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.input}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{new Date(t.createdAt).toLocaleString()}</div>
                  </div>
                  <Tag color={sc2}>{t.status.toUpperCase()}</Tag>
                </div>
              );
            })}
          </div>
        )}
      </SectionBlock>
    </div>
  );
}

// ─── Pipelines tab ────────────────────────────────────────────────────────────

function PipelinesTab({ agents, isMobile }) {
  const [pipelines, setPipelines] = useState([]);
  const [selPipe,   setSelPipe]   = useState(null);
  const [creating,  setCreating]  = useState(false);
  const [runInput,  setRunInput]  = useState("");
  const [running,   setRunning]   = useState(false);
  const [logs,      setLogs]      = useState([]);
  const [stepState, setStepState] = useState([]);
  const [done,      setDone]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const unsubRef                  = useRef(null);

  const load = useCallback(async () => { const d = await api("/pipelines").catch(() => ({ pipelines: [] })); setPipelines(d.pipelines ?? []); }, []);
  useEffect(() => { load(); }, []);
  useEffect(() => () => unsubRef.current?.(), []);

  const execute = async () => {
    if (!selPipe || !runInput.trim() || running) return;
    setRunning(true); setLogs([]); setDone(null); setErr(null);
    setStepState(selPipe.steps.map(s => ({ ...s, status: "pending", agentName: agents.find(a => a.id === s.agentId)?.name ?? "?", output: null })));
    unsubRef.current?.();
    try {
      const { run } = await api(`/pipelines/${selPipe.id}/run`, { method: "POST", body: { input: runInput.trim() } });
      setActiveRun(run);
      unsubRef.current = openSSE(`/pipeline-runs/${run.id}/stream`, {
        onMsg: m => {
          if (m.type === "log")       setLogs(p => [...p, m.log]);
          if (m.type === "state")     setStepState(m.steps ?? []);
          if (m.type === "step_done") setStepState(p => p.map((s, i) => i === m.stepIndex ? m.step : s));
          if (m.type === "done")      { setDone(m); setRunning(false); }
        },
        onClose: () => { setErr("Stream closed."); setRunning(false); },
      });
    } catch (e) { setErr(e.message); setRunning(false); }
  };

  const del = async (id) => {
    if (!confirm("Delete pipeline?")) return;
    await api(`/pipelines/${id}`, { method: "DELETE" });
    if (selPipe?.id === id) setSelPipe(null);
    load();
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: isMobile ? "column" : "row" }}>
      <div style={{ width: isMobile ? "100%" : 280, flexShrink: 0, borderRight: isMobile ? "none" : `1px solid ${T.border}`, borderBottom: isMobile ? `1px solid ${T.border}` : "none", background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: isMobile ? "45%" : "none" }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.12em" }}>PIPELINES ({pipelines.length})</span>
          <Btn size="xs" onClick={() => setCreating(true)}>+ NEW</Btn>
        </div>
        <div className="scroll-area" style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {pipelines.length === 0 && <Empty icon="◈" title="NO PIPELINES" sub="Chain multiple agents." action={<Btn size="xs" onClick={() => setCreating(true)}>+ CREATE</Btn>} />}
          {pipelines.map(pl => {
            const isSel = selPipe?.id === pl.id;
            const names = pl.steps.map(s => agents.find(a => a.id === s.agentId)?.name ?? "?");
            return (
              <div key={pl.id} onClick={() => { setSelPipe(pl); setDone(null); setLogs([]); setActiveRun(null); setStepState(pl.steps.map(s => ({ ...s, status: "pending", agentName: agents.find(a => a.id === s.agentId)?.name ?? "?" }))); }} style={{ padding: isMobile ? "11px 10px" : "9px 10px", borderRadius: 2, cursor: "pointer", background: isSel ? T.card : "transparent", borderLeft: isSel ? `2px solid ${T.amber}` : "2px solid transparent", marginBottom: 2, transition: "all .1s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: isMobile ? 13 : 12, fontWeight: 500, color: isSel ? T.text : T.sub }}>{pl.name}</span>
                  <button onClick={e => { e.stopPropagation(); del(pl.id); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16, padding: 4, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{names.join(" → ")}</div>
              </div>
            );
          })}
        </div>
        {selPipe && (
          <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px" }}>
            <Label>INITIAL PROMPT</Label>
            <Input value={runInput} onChange={setRunInput} placeholder={`Start "${selPipe.name}"…`} multiline rows={isMobile ? 2 : 3} disabled={running} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") execute(); }} />
            <div style={{ fontSize: 9, color: T.muted, marginTop: 3, marginBottom: 10 }}>Output of each step feeds the next.</div>
            <ErrBox msg={err} />
            <Btn onClick={execute} disabled={running || !runInput.trim()} full style={{ marginTop: err ? 10 : 0 }}>
              {running ? <><Spinner size={13} /> RUNNING…</> : "▷ RUN PIPELINE"}
            </Btn>
          </div>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selPipe ? (
          <>
            <PipelineFlow steps={stepState.length > 0 ? stepState : selPipe.steps.map(s => ({ ...s, status: "pending", agentName: agents.find(a => a.id === s.agentId)?.name ?? "?" }))} />
            <TerminalPanel logs={logs} done={done} running={running} label="PIPELINE" taskId={activeRun?.id} />
          </>
        ) : (
          <Empty icon="◈" title="SELECT A PIPELINE" sub="Choose a pipeline to see the flow diagram and run it." />
        )}
      </div>
      {creating && <CreatePipelineModal agents={agents} onClose={() => setCreating(false)} onCreate={async () => { await load(); setCreating(false); }} isMobile={isMobile} />}
    </div>
  );
}

// ─── SVG Pipeline Flow ────────────────────────────────────────────────────────

function PipelineFlow({ steps }) {
  const STATUS_COLOR = { pending: T.muted, running: T.amber, done: T.green, error: T.red };
  const STEP_W = 120, STEP_H = 52, ARROW = 36, PAD_X = 20, PAD_Y = 18;
  const totalW = PAD_X * 2 + steps.length * STEP_W + (steps.length - 1) * ARROW;
  return (
    <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface, padding: "0 16px", overflowX: "auto", flexShrink: 0 }}>
      <svg width={Math.max(totalW, 600)} height={STEP_H + PAD_Y * 2} viewBox={`0 0 ${Math.max(totalW, 600)} ${STEP_H + PAD_Y * 2}`} style={{ display: "block" }}>
        <defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke={T.rule} strokeWidth="0.5" opacity="0.5" /></pattern></defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        {steps.map((step, i) => {
          const x = PAD_X + i * (STEP_W + ARROW), y = PAD_Y;
          const sc = STATUS_COLOR[step.status] ?? T.muted;
          const nm = (step.agentName ?? step.agentId ?? "Agent").slice(0, 13);
          return (
            <g key={i}>
              {i > 0 && (<g><line x1={x - ARROW} y1={y + STEP_H / 2} x2={x - 4} y2={y + STEP_H / 2} stroke={STATUS_COLOR[steps[i - 1]?.status] ?? T.border} strokeWidth="1.5" strokeDasharray={step.status === "pending" ? "4 3" : "none"} opacity={step.status === "pending" ? 0.4 : 1} /><polygon points={`${x - 4},${y + STEP_H / 2 - 4} ${x + 2},${y + STEP_H / 2} ${x - 4},${y + STEP_H / 2 + 4}`} fill={STATUS_COLOR[steps[i - 1]?.status] ?? T.border} opacity={step.status === "pending" ? 0.4 : 1} /></g>)}
              <rect x={x} y={y} width={STEP_W} height={STEP_H} fill={T.card} stroke={sc} strokeWidth={step.status === "running" ? 1.5 : 1} opacity={step.status === "pending" ? 0.5 : 1} rx={1} />
              {step.status === "running" && <rect x={x} y={y} width={STEP_W} height={2} fill={T.amber} />}
              {step.status === "done"    && <rect x={x} y={y} width={STEP_W} height={2} fill={T.green} />}
              <text x={x + 8} y={y + 14} fill={T.muted} fontSize={9} fontFamily={T.mono} letterSpacing="0.08em">S{i + 1}</text>
              <circle cx={x + STEP_W - 10} cy={y + 14} r={3.5} fill={sc} opacity={step.status === "pending" ? 0.4 : 1} />
              <text x={x + STEP_W / 2} y={y + STEP_H / 2 + 2} fill={step.status === "pending" ? T.muted : T.text} fontSize={11} fontFamily={T.mono} textAnchor="middle" dominantBaseline="middle" fontWeight={step.status === "running" ? "600" : "400"}>{nm}</text>
              <text x={x + STEP_W / 2} y={y + STEP_H - 9} fill={sc} fontSize={9} fontFamily={T.mono} textAnchor="middle" letterSpacing="0.08em" opacity={0.9}>{step.status.toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Create Pipeline Modal ────────────────────────────────────────────────────

function CreatePipelineModal({ agents, onClose, onCreate, isMobile }) {
  const [name,  setName]  = useState("");
  const [steps, setSteps] = useState([{ agentId: agents[0]?.id ?? "", promptTemplate: "" }]);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(null);

  const addStep    = () => setSteps(p => [...p, { agentId: agents[0]?.id ?? "", promptTemplate: "" }]);
  const removeStep = i => setSteps(p => p.filter((_, j) => j !== i));
  const setField   = (i, k, v) => setSteps(p => p.map((s, j) => j === i ? { ...s, [k]: v } : s));
  const move       = (i, d) => { const n = [...steps]; const j = i + d; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; setSteps(n); };

  const save = async () => {
    if (!name.trim()) return setErr("Pipeline name required.");
    if (steps.some(s => !s.agentId)) return setErr("All steps need an agent.");
    setBusy(true); setErr(null);
    try { await api("/pipelines", { method: "POST", body: { name: name.trim(), steps: steps.map(s => ({ agentId: s.agentId, promptTemplate: s.promptTemplate.trim() || null })) } }); await onCreate(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,.82)", zIndex: 300, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24, backdropFilter: "blur(3px)" }}>
      <div onClick={e => e.stopPropagation()} className="fade-up" style={{ background: T.elevated, border: isMobile ? "none" : `1px solid ${T.borderL}`, borderTop: `2px solid ${T.amber}`, borderRadius: isMobile ? "12px 12px 0 0" : 2, width: "100%", maxWidth: isMobile ? "100%" : 600, maxHeight: "88vh", overflow: "auto", padding: isMobile ? "20px 16px" : "22px 24px" }}>
        <div style={{ fontSize: isMobile ? 14 : 12, fontWeight: 600, letterSpacing: "0.08em", color: T.text, marginBottom: 20 }}>NEW PIPELINE</div>
        <div style={{ marginBottom: 16 }}><Label>PIPELINE NAME *</Label><Input value={name} onChange={setName} placeholder="e.g. Research → Summarise → Post" /></div>
        <Label>AGENT STEPS (executed in order)</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, padding: "12px 14px", borderLeft: `2px solid ${T.amber}40` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i > 0 ? 10 : 0 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: T.amber, minWidth: 18, letterSpacing: "0.1em" }}>S{i + 1}</span>
                <div style={{ flex: 1 }}><Select value={step.agentId} onChange={v => setField(i, "agentId", v)} options={agents.map(a => ({ value: a.id, label: `${a.name}  [${a.chain.toUpperCase()}]` }))} /></div>
                <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? T.muted : T.sub, cursor: i === 0 ? "default" : "pointer", fontSize: 13, padding: "2px 4px" }}>▲</button>
                <button onClick={() => move(i, 1)} disabled={i === steps.length - 1} style={{ background: "none", border: "none", color: i === steps.length - 1 ? T.muted : T.sub, cursor: i === steps.length - 1 ? "default" : "pointer", fontSize: 13, padding: "2px 4px" }}>▼</button>
                {steps.length > 1 && <button onClick={() => removeStep(i)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}>×</button>}
              </div>
              {i > 0 && (
                <div>
                  <Label style={{ marginTop: 10 }}>PROMPT TEMPLATE (optional)</Label>
                  <Input value={step.promptTemplate} onChange={v => setField(i, "promptTemplate", v)} placeholder="Use {prev_output} and {input}. Now do: …" style={{ fontSize: 11 }} />
                  <div style={{ fontSize: 9, color: T.muted, marginTop: 3, letterSpacing: "0.04em" }}>{"{prev_output}"} = previous result  ·  {"{input}"} = initial prompt</div>
                </div>
              )}
            </div>
          ))}
          <Btn variant="ghost" size="sm" onClick={addStep} style={{ alignSelf: "flex-start" }}>+ ADD STEP</Btn>
        </div>
        <ErrBox msg={err} />
        <div style={{ display: "flex", gap: 8, marginTop: 18, flexDirection: isMobile ? "column" : "row" }}>
          <Btn onClick={save} disabled={busy} full={isMobile}>{busy ? <><Spinner size={12} /> SAVING…</> : "CREATE PIPELINE"}</Btn>
          <Btn variant="ghost" onClick={onClose} full={isMobile}>CANCEL</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({ mcp, native, printr, loading, mcpError, isMobile }) {
  const [filter, setFilter] = useState("all");
  const [q,      setQ]      = useState("");
  const [open,   setOpen]   = useState(null);

  const all = [
    ...(native?.evm    ?? []).map(t => ({ ...t, src: "native", chainKey: "evm"    })),
    ...(native?.solana ?? []).map(t => ({ ...t, src: "native", chainKey: "solana" })),
    ...(printr         ?? []).map(t => ({ ...t, src: "printr", chainKey: "printr" })),
    ...(mcp            ?? []).map(t => ({ ...t, src: "mcp",    chainKey: "mcp"    })),
  ];

  const filtered = all.filter(t => {
    const mc = filter === "all" || t.chainKey === filter;
    const mq = !q || t.name?.toLowerCase().includes(q.toLowerCase()) || t.description?.toLowerCase().includes(q.toLowerCase());
    return mc && mq;
  });

  const filters = [
    { id: "all",    label: `ALL (${all.length})` },
    { id: "evm",    label: `EVM (${(native?.evm ?? []).length})` },
    { id: "solana", label: `SOL (${(native?.solana ?? []).length})` },
    { id: "printr", label: `PRINTR (${(printr ?? []).length})` },
    { id: "mcp",    label: `MCP (${(mcp ?? []).length})` },
  ];

  const CHAIN_COLORS = { evm: T.evm, solana: T.sol, printr: T.amber, mcp: T.green };
  const CHAIN_LABELS = { evm: "EVM", solana: "Solana", printr: "Printr", mcp: "MCP" };

  return (
    <div className="scroll-area" style={{ padding: isMobile ? "14px 14px" : "22px 26px", overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 16, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 10 : 0 }}>
        <div>
          <div style={{ fontSize: isMobile ? 14 : 12, fontWeight: 600, color: T.text, letterSpacing: "0.08em" }}>TOOL REGISTRY</div>
          <div style={{ fontSize: isMobile ? 12 : 11, color: T.sub, marginTop: 3 }}>
            {(mcp ?? []).length} MCP  ·  {(native?.evm ?? []).length} EVM  ·  {(native?.solana ?? []).length} Solana  ·  {(printr ?? []).length} Printr
          </div>
        </div>
        <Input value={q} onChange={setQ} placeholder="SEARCH TOOLS…" style={{ width: isMobile ? "100%" : 200, fontSize: 11 }} />
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12, flexWrap: "wrap" }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: isMobile ? "7px 12px" : "5px 12px", border: `1px solid ${filter === f.id ? T.amber + "55" : T.border}`, background: filter === f.id ? T.amberGlow : "transparent", color: filter === f.id ? T.amber : T.muted, fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: T.mono, letterSpacing: "0.1em", borderRadius: 1 }}>
            {f.label}
          </button>
        ))}
      </div>

      {mcpError && <div style={{ background: T.yellow + "08", border: `1px solid ${T.yellow}22`, padding: "10px 14px", fontSize: isMobile ? 12 : 11, color: T.yellow, marginBottom: 16, lineHeight: 1.7 }}>!  Printr MCP unavailable — {mcpError}<br /><span style={{ color: T.sub }}>Native chain tools and Printr API tools are still active.</span></div>}
      {loading && <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.sub, fontSize: 11, padding: "20px 0" }}><Spinner /> LOADING…</div>}

      {!loading && (
        <div style={{ border: `1px solid ${T.border}`, background: T.card, overflow: "hidden" }}>
          {!isMobile && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 4fr 1fr 1fr", gap: 0, padding: "8px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {["TOOL NAME","DESCRIPTION","SOURCE","TYPE"].map(h => <div key={h} style={{ fontSize: 9, color: T.muted, letterSpacing: "0.14em" }}>{h}</div>)}
            </div>
          )}
          {filtered.length === 0 && <div style={{ padding: "24px", fontSize: 11, color: T.muted, textAlign: "center" }}>No tools match filter.</div>}
          {filtered.map((t, i) => {
            const isOpen = open === `${t.name}-${i}`;
            const cc = CHAIN_COLORS[t.chainKey] ?? T.sub;
            const cl = CHAIN_LABELS[t.chainKey] ?? t.chainKey;
            const props = Object.entries(t.inputSchema?.properties ?? {});
            return (
              <div key={`${t.name}-${i}`}>
                <div onClick={() => setOpen(isOpen ? null : `${t.name}-${i}`)} style={{ display: isMobile ? "flex" : "grid", gridTemplateColumns: isMobile ? undefined : "2fr 4fr 1fr 1fr", flexDirection: isMobile ? "column" : undefined, gap: isMobile ? 6 : 0, padding: isMobile ? "12px 14px" : "10px 16px", borderBottom: `1px solid ${T.rule}`, cursor: "pointer", background: isOpen ? T.elevated : "transparent", transition: "background .1s" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: isMobile ? 13 : 11, fontWeight: 500, color: isOpen ? T.amber : T.text, fontFamily: T.mono }}>{t.name}</div>
                    {isMobile && <div style={{ display: "flex", gap: 5 }}><Tag color={cc}>{cl}</Tag><Tag color={T.sub}>{t.src.toUpperCase()}</Tag></div>}
                  </div>
                  <div style={{ fontSize: isMobile ? 12 : 11, color: T.sub, lineHeight: 1.5, overflow: isMobile ? "visible" : "hidden", textOverflow: isMobile ? undefined : "ellipsis", whiteSpace: isMobile ? "normal" : "nowrap", paddingRight: isMobile ? 0 : 16 }}>{t.description ?? "—"}</div>
                  {!isMobile && <><div><Tag color={cc}>{cl}</Tag></div><div><Tag color={T.sub}>{t.src.toUpperCase()}</Tag></div></>}
                </div>
                {isOpen && props.length > 0 && (
                  <div style={{ borderBottom: `1px solid ${T.border}`, background: T.bg, padding: "12px 16px 12px 48px" }}>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", marginBottom: 8 }}>INPUT SCHEMA</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {props.map(([k, def]) => {
                        const req = (t.inputSchema?.required ?? []).includes(k);
                        return (
                          <div key={k} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 2 : 12, alignItems: "flex-start", fontSize: 11 }}>
                            <code style={{ color: T.amber, minWidth: isMobile ? undefined : 160, fontFamily: T.mono }}>{k}</code>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <code style={{ color: T.muted, fontFamily: T.mono, minWidth: 60 }}>{def.type ?? "any"}</code>
                              {req && <Tag color={T.yellow}>REQ</Tag>}
                            </div>
                            <span style={{ color: T.sub }}>{def.description}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,          setTab]         = useState("run");
  const [agents,       setAgents]      = useState([]);
  const [tools,        setTools]       = useState({ mcp: [], native: { evm: [], solana: [] }, printr: [], mcpError: null });
  const [toolsLoading, setToolsLoading]= useState(true);
  const [drawerOpen,   setDrawerOpen]  = useState(false);
  const [clock,        setClock]       = useState(() => new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit" }));

  const isMobile = useIsMobile(768);
  const wallet   = useWallet();

  useEffect(() => { injectGlobal(); }, []);
  useEffect(() => { const t = setInterval(() => setClock(new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit" })), 30000); return () => clearInterval(t); }, []);

  // Close drawer on desktop resize
  useEffect(() => { if (!isMobile && drawerOpen) setDrawerOpen(false); }, [isMobile]);

  const loadAgents = useCallback(async () => {
    const d = await api("/agents").catch(() => ({ agents: [] }));
    setAgents(d.agents ?? []);
  }, []);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    const d = await api("/tools/list").catch(e => ({ mcp: [], native: { evm: [], solana: [] }, printr: [], mcpError: e.message }));
    setTools({ mcp: d.mcp ?? [], native: d.native ?? { evm: [], solana: [] }, printr: d.printr ?? [], mcpError: d.mcpError ?? null });
    setToolsLoading(false);
  }, []);

  useEffect(() => { loadAgents(); loadTools(); }, []);

  const totalTools = (tools.mcp?.length ?? 0) + (tools.native?.evm?.length ?? 0) + (tools.native?.solana?.length ?? 0) + (tools.printr?.length ?? 0);

  const TAB_LABELS = { run: "EXECUTE", agents: "AGENTS", pipelines: "PIPELINES", tools: "TOOLS", deploy: "DEPLOY" };

  return (
    <div style={{ height: "100dvh", display: "flex", overflow: "hidden", background: T.bg, flexDirection: "row" }}>

      {/* Desktop sidebar (always visible) */}
      {!isMobile && (
        <Sidebar
          active={tab}
          onNav={setTab}
          agentCount={agents.length}
          toolCount={totalTools}
          isMobile={false}
        />
      )}

      {/* Mobile drawer sidebar */}
      {isMobile && (
        <Sidebar
          active={tab}
          onNav={setTab}
          agentCount={agents.length}
          toolCount={totalTools}
          isMobile={true}
          drawerOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* Main content area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Top header bar */}
        <div style={{
          height:         isMobile ? 56 : 52,
          borderBottom:   `1px solid ${T.border}`,
          background:     T.surface,
          display:        "flex",
          alignItems:     "center",
          padding:        isMobile ? "0 12px" : "0 22px",
          justifyContent: "space-between",
          flexShrink:     0,
          gap:            isMobile ? 8 : 16,
        }}>
          {/* Left side */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 8, minWidth: 0 }}>
            {isMobile && (
              <HamburgerBtn open={drawerOpen} onClick={() => setDrawerOpen(v => !v)} />
            )}

            {isMobile ? (
              /* Mobile: show logo mark + current tab */
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <div style={{ width: 20, height: 20, background: T.amber, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <rect x="0" y="0" width="5" height="5" fill="#0c0c0a" />
                    <rect x="7" y="0" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
                    <rect x="0" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
                    <rect x="7" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.3" />
                  </svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {TAB_LABELS[tab] ?? tab.toUpperCase()}
                </span>
              </div>
            ) : (
              /* Desktop: breadcrumb */
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.12em" }}>PRINTR</span>
                <span style={{ color: T.rule }}>/</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: T.text, letterSpacing: "0.08em" }}>
                  {TAB_LABELS[tab] ?? tab.toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 16, flexShrink: 0 }}>
            {!isMobile && (
              <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", fontFamily: T.mono }}>{clock}</div>
            )}
            {!isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: T.green, boxShadow: `0 0 6px ${T.green}80`, animation: "pdot 2.5s ease-in-out infinite" }} />
                <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em" }}>CONNECTED</span>
              </div>
            )}
            {/* Wallet button — always visible, primary mobile action */}
            <WalletButton wallet={wallet} isMobile={isMobile} />
          </div>
        </div>

        {/* Tab content */}
        <main style={{ flex: 1, overflow: "hidden" }} key={tab}>
          {tab === "run"       && <RunTab       agents={agents} onAgentsChange={loadAgents} isMobile={isMobile} />}
          {tab === "agents"    && <AgentsTab    agents={agents} onRefresh={loadAgents}      isMobile={isMobile} />}
          {tab === "pipelines" && <PipelinesTab agents={agents}                             isMobile={isMobile} />}
          {tab === "tools"     && <ToolsTab     mcp={tools.mcp} native={tools.native} printr={tools.printr} loading={toolsLoading} mcpError={tools.mcpError} isMobile={isMobile} />}
          {tab === "deploy"    && <DeployTokenForm wallet={wallet}                          isMobile={isMobile} />}
        </main>
      </div>
    </div>
  );
}
