/**
 * Printr Agent OS — App.jsx  (v3 · Precision Terminal)
 * Full UI overhaul: IBM Plex Mono · Amber accent · Noise texture
 * SVG pipeline flow · Scanline log terminal · Sidebar nav
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Design system ────────────────────────────────────────────────────────────

const T = {
  // Backgrounds — warm dark, not pure black
  bg:       "#0c0c0a",
  surface:  "#111110",
  card:     "#181815",
  cardH:    "#1f1f1b",
  elevated: "#242420",

  // Borders — warm, not cold grey
  border:   "#28281f",
  borderL:  "#353529",
  rule:     "#222219",

  // Accent — amber/gold (unexpected for web3)
  amber:    "#c8a96e",
  amberD:   "#a8843e",
  amberGlow:"#c8a96e22",

  // Chain colors
  evm:      "#5b8ef0",
  sol:      "#9945ff",

  // Status
  green:    "#3dd68c",
  red:      "#e05c5c",
  yellow:   "#d4a53a",
  blue:     "#5b8ef0",

  // Text — warm off-white
  text:     "#e8e6de",
  sub:      "#7a7868",
  muted:    "#3d3d32",
  dim:      "#242420",

  // Typography — IBM Plex Mono for everything
  mono:     "'IBM Plex Mono', 'Fira Code', 'JetBrains Mono', monospace",
  sans:     "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif",
};

// Log level colors in terminal
const LC = {
  info:        T.sub,
  warn:        T.yellow,
  error:       T.red,
  tool:        T.amber,
  tool_result: T.green,
};
const LP = {
  info:        "   ",
  warn:        "!  ",
  error:       "×  ",
  tool:        "→  ",
  tool_result: "←  ",
};

// ─── Global styles ────────────────────────────────────────────────────────────

const injectGlobal = () => {
  if (document.getElementById("pos-v3")) return;
  const el = document.createElement("style");
  el.id = "pos-v3";
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
    }

    /* Subtle noise texture overlay */
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
      pointer-events: none;
      z-index: 9999;
      opacity: 0.4;
    }

    @keyframes spin        { to { transform: rotate(360deg); } }
    @keyframes pdot        { 0%,100%{opacity:1} 50%{opacity:.15} }
    @keyframes slideIn     { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:none} }
    @keyframes fadeUp      { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
    @keyframes tabSlide    { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
    @keyframes scanline {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(100vh); }
    }
    @keyframes glow {
      0%,100% { box-shadow: 0 0 6px ${T.amber}30; }
      50%      { box-shadow: 0 0 14px ${T.amber}55; }
    }
    @keyframes blink { 0%,100%{opacity:1} 49%{opacity:1} 50%{opacity:0} }

    input, textarea, select, button { font-family: ${T.mono}; }

    input::placeholder,
    textarea::placeholder { color: ${T.muted}; }

    input:focus,
    textarea:focus,
    select:focus {
      outline: none;
      border-color: ${T.amber}70 !important;
      box-shadow: 0 0 0 1px ${T.amber}20;
    }

    ::-webkit-scrollbar       { width: 3px; height: 3px; }
    ::-webkit-scrollbar-track { background: ${T.bg}; }
    ::-webkit-scrollbar-thumb { background: ${T.borderL}; border-radius: 0; }

    select option { background: ${T.card}; }

    .slide-in { animation: slideIn .18s ease both; }
    .fade-up  { animation: fadeUp  .22s ease both; }
    .tab-in   { animation: tabSlide .2s ease both; }

    /* Amber glow on active elements */
    .amber-glow { animation: glow 3s ease-in-out infinite; }

    /* Horizontal rule with tick marks — circuit board feel */
    .rule-line {
      height: 1px;
      background: linear-gradient(90deg, transparent, ${T.border} 15%, ${T.border} 85%, transparent);
      position: relative;
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
    primary: {
      background: T.amber,
      color:      "#0c0c0a",
      border:     `1px solid ${T.amber}`,
      fontWeight: "600",
    },
    ghost: {
      background: "transparent",
      color:      T.sub,
      border:     `1px solid ${T.border}`,
    },
    subtle: {
      background: T.card,
      color:      T.text,
      border:     `1px solid ${T.borderL}`,
    },
    danger: {
      background: "transparent",
      color:      T.red,
      border:     `1px solid ${T.red}35`,
    },
    amber: {
      background: T.amberGlow,
      color:      T.amber,
      border:     `1px solid ${T.amber}40`,
    },
  };

  const sizes = {
    xs: { fontSize: 10, padding: "3px 8px",  borderRadius: 2 },
    sm: { fontSize: 11, padding: "5px 11px", borderRadius: 2 },
    md: { fontSize: 12, padding: "8px 16px", borderRadius: 2 },
    lg: { fontSize: 13, padding: "11px 22px",borderRadius: 2 },
  };

  const v = variants[variant] ?? variants.ghost;
  const s = sizes[size]     ?? sizes.md;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           6,
        whiteSpace:    "nowrap",
        cursor:        disabled ? "not-allowed" : "pointer",
        opacity:       disabled ? 0.35 : 1,
        transition:    "opacity .1s, transform .08s",
        transform:     pressed && !disabled ? "translateY(1px)" : "none",
        letterSpacing: "0.02em",
        width:         full ? "100%" : "auto",
        justifyContent: full ? "center" : undefined,
        ...v, ...s, ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ value, onChange, placeholder, multiline, rows = 3, disabled, onKeyDown, style, mono = true }) {
  const base = {
    background:   T.card,
    border:       `1px solid ${T.border}`,
    borderRadius: 2,
    padding:      "8px 11px",
    color:        T.text,
    fontSize:     12,
    fontFamily:   mono ? T.mono : T.sans,
    width:        "100%",
    transition:   "border-color .12s, box-shadow .12s",
    resize:       multiline ? "vertical" : "none",
    lineHeight:   1.6,
    ...style,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} onKeyDown={onKeyDown} style={base} />
    : <input    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} onKeyDown={onKeyDown} style={base} />;
}

function Select({ value, onChange, options, disabled, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background:   T.card,
        border:       `1px solid ${T.border}`,
        borderRadius: 2,
        padding:      "8px 11px",
        color:        T.text,
        fontSize:     12,
        fontFamily:   T.mono,
        width:        "100%",
        cursor:       disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Label({ children, style }) {
  return (
    <div style={{
      fontSize:      10,
      fontWeight:    500,
      color:         T.sub,
      textTransform: "uppercase",
      letterSpacing: "0.12em",
      marginBottom:  5,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Tag({ children, color = T.sub }) {
  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      fontSize:      10,
      fontWeight:    500,
      letterSpacing: "0.06em",
      padding:       "2px 6px",
      background:    color + "14",
      color,
      border:        `1px solid ${color}28`,
      borderRadius:  1,
    }}>
      {children}
    </span>
  );
}

function Dot({ color, pulse, size = 5 }) {
  return (
    <span style={{
      display:     "inline-block",
      width:       size,
      height:      size,
      borderRadius: "50%",
      background:  color,
      flexShrink:  0,
      boxShadow:   pulse ? `0 0 6px ${color}80` : "none",
      animation:   pulse ? "pdot 2.5s ease-in-out infinite" : "none",
    }} />
  );
}

function Spinner({ size = 14, color = T.amber }) {
  return (
    <span style={{
      display:      "inline-block",
      width:        size,
      height:       size,
      borderRadius: "50%",
      border:       `1.5px solid ${color}20`,
      borderTopColor: color,
      animation:    "spin .6s linear infinite",
      flexShrink:   0,
    }} />
  );
}

function Rule() {
  return <div className="rule-line" style={{ margin: "14px 0" }} />;
}

function Empty({ icon = "○", title, sub, action }) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      padding:        "56px 24px",
      textAlign:      "center",
      gap:            9,
    }}>
      <span style={{ fontSize: 22, color: T.muted, letterSpacing: "0.1em" }}>{icon}</span>
      {title && <div style={{ fontSize: 12, fontWeight: 500, color: T.sub, letterSpacing: "0.06em" }}>{title}</div>}
      {sub   && <div style={{ fontSize: 11, color: T.muted, maxWidth: 280, lineHeight: 1.7, letterSpacing: "0.03em" }}>{sub}</div>}
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}

function ErrBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background:   T.red + "0a",
      border:       `1px solid ${T.red}30`,
      borderRadius: 2,
      padding:      "9px 12px",
      fontSize:     11,
      color:        T.red,
      marginTop:    10,
      letterSpacing: "0.03em",
      lineHeight:   1.6,
    }}>
      ×  {msg}
    </div>
  );
}

// ─── Terminal Log Panel ───────────────────────────────────────────────────────

function TerminalPanel({ logs, done, running, label = "EXEC", taskId }) {
  const ref      = useRef(null);
  const lineNum  = useRef(1);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);

  // reset line counter on new session
  useEffect(() => { lineNum.current = 1; }, [taskId]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Terminal chrome bar */}
      <div style={{
        padding:         "0 16px",
        height:          36,
        borderBottom:    `1px solid ${T.border}`,
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        background:      T.surface,
        flexShrink:      0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Traffic light dots */}
          <div style={{ display: "flex", gap: 5 }}>
            {["#3d3d32","#3d3d32","#3d3d32"].map((c, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
            ))}
          </div>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em" }}>
            {label}
            {taskId ? ` · ${taskId.slice(0, 8)}` : ""}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {running && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={T.amber} pulse size={5} />
              <span style={{ fontSize: 10, color: T.amber, letterSpacing: "0.1em" }}>RUNNING</span>
            </div>
          )}
          {done && (
            <Tag color={done.status === "done" ? T.green : T.red}>
              {done.status.toUpperCase()}
            </Tag>
          )}
        </div>
      </div>

      {/* Log body */}
      <div
        ref={ref}
        style={{
          flex:       1,
          overflow:   "auto",
          padding:    "14px 0",
          background: T.bg,
          position:   "relative",
        }}
      >
        {/* Scanline overlay */}
        <div style={{
          position:       "absolute",
          inset:          0,
          background:     `repeating-linear-gradient(0deg, transparent, transparent 2px, ${T.rule}08 2px, ${T.rule}08 4px)`,
          pointerEvents:  "none",
          zIndex:         1,
        }} />

        {logs.length === 0 && !running ? (
          <Empty icon="▷" title="awaiting execution" sub="Run an agent or pipeline to stream logs here." />
        ) : (
          <div style={{ position: "relative", zIndex: 2 }}>
            {logs.map((log, i) => <TermLine key={i} log={log} num={i + 1} />)}

            {/* Blinking cursor while running */}
            {running && (
              <div style={{
                display:    "flex",
                padding:    "2px 16px",
                alignItems: "center",
                gap:        40,
              }}>
                <span style={{ fontSize: 10, color: T.muted, minWidth: 28 }}>
                  {String(logs.length + 1).padStart(3, "0")}
                </span>
                <span style={{
                  fontSize:  12,
                  color:     T.amber,
                  animation: "blink 1s step-end infinite",
                }}>▮</span>
              </div>
            )}

            {/* Final output block */}
            {done?.result?.output && (
              <div style={{ margin: "16px 16px 0", borderTop: `1px solid ${T.green}30`, paddingTop: 14 }}>
                <div style={{ fontSize: 10, color: T.green, letterSpacing: "0.12em", marginBottom: 10 }}>
                  ◉  OUTPUT
                </div>
                <div style={{
                  fontSize:  12,
                  color:     T.text,
                  lineHeight: 1.85,
                  whiteSpace: "pre-wrap",
                  wordBreak:  "break-word",
                  paddingLeft: 16,
                  borderLeft: `2px solid ${T.green}40`,
                }}>
                  {done.result.output}
                </div>
              </div>
            )}

            {done?.status === "error" && (
              <div style={{
                margin:        "16px 16px 0",
                padding:       "10px 12px",
                background:    T.red + "0a",
                border:        `1px solid ${T.red}25`,
                fontSize:      11,
                color:         T.red,
                letterSpacing: "0.04em",
              }}>
                ×  Task failed — see error logs above
              </div>
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
    <div style={{
      display:    "flex",
      gap:        0,
      padding:    "1px 0",
      alignItems: "flex-start",
    }}>
      {/* Line number */}
      <span style={{
        fontSize:  10,
        color:     T.muted,
        minWidth:  44,
        textAlign: "right",
        paddingRight: 14,
        paddingTop: 1,
        userSelect: "none",
        flexShrink: 0,
        borderRight: `1px solid ${T.rule}`,
        marginRight: 14,
      }}>
        {String(num).padStart(3, "0")}
      </span>

      {/* Timestamp */}
      <span style={{
        fontSize:  10,
        color:     T.muted,
        minWidth:  58,
        flexShrink: 0,
        paddingTop: 1,
        letterSpacing: "0.03em",
      }}>
        {new Date(log.ts).toLocaleTimeString("en", {
          hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
        })}
      </span>

      {/* Step badge for pipeline */}
      {log.step !== undefined && (
        <span style={{
          fontSize:  9,
          color:     T.amber,
          minWidth:  20,
          flexShrink: 0,
          paddingTop: 2,
          letterSpacing: "0.06em",
        }}>
          S{log.step + 1}
        </span>
      )}

      {/* Message */}
      <span style={{
        fontSize:      11,
        color,
        lineHeight:    1.65,
        wordBreak:     "break-word",
        flex:          1,
        paddingRight:  16,
      }}>
        <span style={{ color: T.muted, userSelect: "none" }}>{prefix}</span>
        {log.message}
        {log.tool && (
          <span style={{ fontSize: 10, color: T.border + "ff", marginLeft: 10 }}>
            [{log.tool}]
          </span>
        )}
        {log.agentName && log.step !== undefined && (
          <span style={{ fontSize: 10, color: T.amber + "99", marginLeft: 8 }}>
            {log.agentName}
          </span>
        )}
      </span>
    </div>
  );
}

// ─── Sidebar navigation ───────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "run",       label: "RUN",       icon: "▷" },
  { id: "pipelines", label: "PIPELINES", icon: "◈" },
  { id: "agents",    label: "AGENTS",    icon: "◎" },
  { id: "tools",     label: "TOOLS",     icon: "◇" },
];

function Sidebar({ active, onNav, agentCount, toolCount }) {
  return (
    <aside style={{
      width:        200,
      flexShrink:   0,
      background:   T.surface,
      borderRight:  `1px solid ${T.border}`,
      display:      "flex",
      flexDirection: "column",
      overflow:     "hidden",
    }}>
      {/* Logo */}
      <div style={{
        height:      52,
        borderBottom: `1px solid ${T.border}`,
        display:     "flex",
        alignItems:  "center",
        padding:     "0 18px",
        gap:         10,
        flexShrink:  0,
      }}>
        <div style={{
          width:        24,
          height:       24,
          background:   T.amber,
          borderRadius: 2,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          flexShrink:   0,
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="0" width="5" height="5" fill="#0c0c0a" />
            <rect x="7" y="0" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
            <rect x="0" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.6" />
            <rect x="7" y="7" width="5" height="5" fill="#0c0c0a" opacity="0.3" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>PRINTR</div>
          <div style={{ fontSize: 9,  color: T.sub,  letterSpacing: "0.1em" }}>AGENT OS</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNav(item.id)}
              style={{
                display:       "flex",
                alignItems:    "center",
                gap:           10,
                padding:       "9px 10px",
                borderRadius:  2,
                border:        "none",
                background:    isActive ? T.amberGlow : "transparent",
                color:         isActive ? T.amber     : T.muted,
                cursor:        "pointer",
                fontSize:      11,
                letterSpacing: "0.1em",
                fontFamily:    T.mono,
                fontWeight:    isActive ? 500 : 400,
                textAlign:     "left",
                width:         "100%",
                transition:    "all .12s",
                borderLeft:    isActive ? `2px solid ${T.amber}` : "2px solid transparent",
              }}
            >
              <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer stats */}
      <div style={{
        padding:     "12px 18px",
        borderTop:   `1px solid ${T.border}`,
        display:     "flex",
        flexDirection: "column",
        gap:         4,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em" }}>AGENTS</span>
          <span style={{ fontSize: 10, color: T.sub,   fontWeight: 500 }}>{agentCount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em" }}>TOOLS</span>
          <span style={{ fontSize: 10, color: T.sub,   fontWeight: 500 }}>{toolCount}</span>
        </div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 5 }}>
          <Dot color={T.green} pulse size={4} />
          <span style={{ fontSize: 9, color: T.muted, letterSpacing: "0.08em" }}>LIVE</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Run tab ──────────────────────────────────────────────────────────────────

function RunTab({ agents, onAgentsChange }) {
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Config pane */}
      <div style={{
        width:        280,
        flexShrink:   0,
        borderRight:  `1px solid ${T.border}`,
        background:   T.surface,
        padding:      "20px 18px",
        display:      "flex",
        flexDirection: "column",
        gap:          18,
        overflow:     "auto",
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: "0.08em", marginBottom: 4 }}>
            EXECUTE AGENT
          </div>
          <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.7 }}>
            Select agent, write task, execute via Printr MCP.
          </div>
        </div>

        <div>
          <Label>AGENT</Label>
          {agents.length === 0 ? (
            <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic" }}>No agents — create one first</div>
          ) : (
            <Select
              value={agentId}
              onChange={setAgentId}
              options={agents.map(a => ({ value: a.id, label: `${a.name}  [${a.chain.toUpperCase()}]` }))}
              disabled={running}
            />
          )}

          {sel && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Tag color={sel.chain === "solana" ? T.sol : T.evm}>{sel.chain.toUpperCase()}</Tag>
              <Tag color={T.sub}>{sel.status}</Tag>
              <Tag color={T.sub}>{sel.config?.maxSteps ?? 10} steps</Tag>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <Label>TASK PROMPT</Label>
          <Input
            value={prompt}
            onChange={setPrompt}
            placeholder={sel ? `What should ${sel.name} do?` : "Select agent first…"}
            multiline
            rows={8}
            disabled={running || !agentId}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
          />
          <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.04em" }}>⌘ ENTER TO EXECUTE</div>
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

// ─── Agents tab ───────────────────────────────────────────────────────────────

function AgentsTab({ agents, onRefresh }) {
  const [sel,      setSel]      = useState(null);
  const [creating, setCreating] = useState(false);

  const selectedAgent = agents.find(a => a.id === sel?.id);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* List */}
      <div style={{
        width:        220,
        flexShrink:   0,
        borderRight:  `1px solid ${T.border}`,
        background:   T.surface,
        display:      "flex",
        flexDirection: "column",
        overflow:     "hidden",
      }}>
        <div style={{
          padding:      "12px 14px 10px",
          borderBottom: `1px solid ${T.border}`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.12em" }}>
            AGENTS ({agents.length})
          </span>
          <Btn size="xs" onClick={() => setCreating(true)}>+ NEW</Btn>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {agents.length === 0 && <Empty icon="◎" title="NO AGENTS" sub="Create your first agent." />}
          {agents.map(a => <AgentRow key={a.id} agent={a} active={sel?.id === a.id} onClick={() => setSel(a)} />)}
        </div>
      </div>

      {/* Detail */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {creating ? (
          <AgentCreateForm onClose={() => setCreating(false)} onCreate={async p => { await api("/agents/create", { method: "POST", body: p }); setCreating(false); onRefresh(); }} />
        ) : selectedAgent ? (
          <AgentDetailPane agent={selectedAgent} onDelete={async () => { await api(`/agents/${selectedAgent.id}`, { method: "DELETE" }); setSel(null); onRefresh(); }} onRefresh={onRefresh} />
        ) : (
          <Empty icon="◎" title="SELECT AN AGENT" sub="Click an agent to view details, schedule, and task history." />
        )}
      </div>
    </div>
  );
}

function AgentRow({ agent, active, onClick }) {
  const sc = { idle: T.muted, running: T.amber, error: T.red }[agent.status] ?? T.muted;
  return (
    <div
      onClick={onClick}
      className={active ? "" : ""}
      style={{
        padding:    "9px 10px",
        borderRadius: 2,
        cursor:     "pointer",
        background: active ? T.card : "transparent",
        borderLeft: active ? `2px solid ${T.amber}` : "2px solid transparent",
        marginBottom: 2,
        transition: "all .1s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: active ? T.text : T.sub }}>{agent.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Dot color={sc} pulse={agent.status === "running"} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 5 }}>
        <Tag color={agent.chain === "solana" ? T.sol : T.evm}>{agent.chain.toUpperCase()}</Tag>
        <span style={{ fontSize: 10, color: T.muted }}>{agent.tasksRun ?? 0} runs</span>
      </div>
    </div>
  );
}

function AgentDetailPane({ agent, onDelete, onRefresh }) {
  const [sched,    setSched]    = useState(null);
  const [exp,      setExp]      = useState("");
  const [input,    setInput]    = useState("");
  const [tasks,    setTasks]    = useState([]);
  const [schedErr, setSchedErr] = useState(null);
  const [schedBusy,setSchedBusy]= useState(false);

  useEffect(() => {
    api(`/agents/${agent.id}/schedule`).then(d => {
      setSched(d.schedule);
      if (d.schedule) { setExp(d.schedule.expression); setInput(d.schedule.input); }
    });
    api(`/agents/${agent.id}/tasks`).then(d => setTasks(d.tasks ?? []));
  }, [agent.id]);

  const saveSchedule = async () => {
    if (!exp.trim() || !input.trim()) return setSchedErr("Both fields required.");
    setSchedBusy(true); setSchedErr(null);
    try { const d = await api(`/agents/${agent.id}/schedule`, { method: "POST", body: { expression: exp.trim(), input: input.trim() } }); setSched(d.schedule); }
    catch (e) { setSchedErr(e.message); }
    setSchedBusy(false);
  };

  const sc = { idle: T.muted, running: T.amber, error: T.red }[agent.status] ?? T.muted;

  return (
    <div className="tab-in" style={{ padding: "24px 28px", maxWidth: 700 }}>
      {/* Header */}
      <div style={{
        background:   T.card,
        border:       `1px solid ${T.border}`,
        borderTop:    `2px solid ${T.amber}`,
        padding:      "18px 20px",
        marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: "0.04em" }}>{agent.name}</span>
              <Dot color={sc} pulse={agent.status === "running"} size={6} />
              <span style={{ fontSize: 10, color: sc, letterSpacing: "0.1em" }}>{agent.status.toUpperCase()}</span>
            </div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.06em" }}>{agent.id}</div>
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

      {/* Inbound webhook */}
      <SectionBlock label="INBOUND WEBHOOK">
        <div style={{ background: T.card, border: `1px solid ${T.border}`, padding: "12px 14px" }}>
          <div style={{ fontSize: 11, color: T.sub, marginBottom: 10, lineHeight: 1.7 }}>
            POST to trigger this agent from any external system.
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{
              flex:       1,
              fontSize:   10,
              color:      T.amber,
              background: T.bg,
              border:     `1px solid ${T.border}`,
              padding:    "6px 10px",
              letterSpacing: "0.04em",
              fontFamily: T.mono,
            }}>
              POST /api/webhooks/{agent.id}
            </code>
            <Btn size="xs" variant="ghost" onClick={() => navigator.clipboard?.writeText(`/api/webhooks/${agent.id}`)}>
              COPY
            </Btn>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 8 }}>
            Body: <code style={{ color: T.sub }}>{"{ \"input\": \"your prompt\" }"}</code>
          </div>
        </div>
      </SectionBlock>

      {/* Schedule */}
      <SectionBlock label="SCHEDULE" action={sched && <Btn size="xs" variant="danger" onClick={async () => { await api(`/agents/${agent.id}/schedule`, { method: "DELETE" }).catch(() => {}); setSched(null); }}>REMOVE</Btn>}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, padding: "14px" }}>
          {sched ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Dot color={T.green} pulse size={5} />
                <code style={{ fontSize: 12, color: T.amber, letterSpacing: "0.06em" }}>{sched.expression}</code>
                <Tag color={T.green}>ACTIVE</Tag>
              </div>
              <div style={{ fontSize: 11, color: T.sub }}>
                Prompt: <em style={{ color: T.text }}>{sched.input}</em>
              </div>
              {sched.lastRun && (
                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                  Last run: {new Date(sched.lastRun).toLocaleString()}
                </div>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <Label>CRON EXPRESSION</Label>
                  <Input value={exp} onChange={setExp} placeholder="*/30 * * * *" />
                  <div style={{ fontSize: 9, color: T.muted, marginTop: 3, letterSpacing: "0.04em" }}>
                    every 30 min · hourly: 0 * * * *
                  </div>
                </div>
                <div>
                  <Label>PROMPT (runs on each tick)</Label>
                  <Input value={input} onChange={setInput} placeholder="Run portfolio check and report…" />
                </div>
              </div>
              <ErrBox msg={schedErr} />
              <Btn onClick={saveSchedule} disabled={schedBusy} style={{ marginTop: schedErr ? 10 : 0 }}>
                {schedBusy ? <><Spinner size={12} /> SAVING…</> : "SET SCHEDULE"}
              </Btn>
            </div>
          )}
        </div>
      </SectionBlock>

      {/* Task history */}
      <SectionBlock label={`TASK HISTORY (${tasks.length})`}>
        {tasks.length === 0 ? (
          <div style={{ fontSize: 11, color: T.muted, fontStyle: "italic", padding: "10px 0" }}>No tasks yet.</div>
        ) : (
          <div style={{ border: `1px solid ${T.border}`, background: T.card, overflow: "hidden" }}>
            {tasks.slice(0, 12).map((t, i) => {
              const sc2 = { done: T.green, error: T.red, running: T.amber, queued: T.muted }[t.status] ?? T.muted;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderBottom: i < Math.min(tasks.length, 12) - 1 ? `1px solid ${T.rule}` : "none" }}>
                  <Dot color={sc2} pulse={t.status === "running"} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.input}</div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2, letterSpacing: "0.03em" }}>{new Date(t.createdAt).toLocaleString()}</div>
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

function AgentCreateForm({ onClose, onCreate }) {
  const [name,    setName]    = useState("");
  const [chain,   setChain]   = useState("evm");
  const [prompt,  setPrompt]  = useState("");
  const [steps,   setSteps]   = useState("10");
  const [webhook, setWebhook] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [err,     setErr]     = useState(null);

  const save = async () => {
    if (!name.trim()) return setErr("Name is required.");
    setBusy(true); setErr(null);
    try {
      await onCreate({ name: name.trim(), chain, config: { systemPrompt: prompt.trim() || undefined, maxSteps: parseInt(steps) || 10, webhookUrl: webhook.trim() || null } });
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="tab-in" style={{ padding: "24px 28px", maxWidth: 560 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: T.text, marginBottom: 20 }}>
        CREATE AGENT
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <Label>NAME *</Label>
            <Input value={name} onChange={setName} placeholder="e.g. DeFi Scout" />
          </div>
          <div>
            <Label>CHAIN</Label>
            <Select value={chain} onChange={setChain} options={[{ value: "evm", label: "EVM  (Ethereum / Base)" }, { value: "solana", label: "Solana" }]} />
          </div>
        </div>

        <div>
          <Label>SYSTEM PROMPT</Label>
          <Input value={prompt} onChange={setPrompt} placeholder="You are a helpful on-chain agent…" multiline rows={3} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div>
            <Label>MAX STEPS</Label>
            <Input value={steps} onChange={setSteps} placeholder="10" />
          </div>
          <div>
            <Label>OUTBOUND WEBHOOK URL</Label>
            <Input value={webhook} onChange={setWebhook} placeholder="https://…" />
          </div>
        </div>
      </div>

      <ErrBox msg={err} />
      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <Btn onClick={save} disabled={busy}>{busy ? <><Spinner size={12} /> CREATING…</> : "CREATE AGENT"}</Btn>
        <Btn variant="ghost" onClick={onClose}>CANCEL</Btn>
      </div>
    </div>
  );
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

// ─── Pipelines tab ────────────────────────────────────────────────────────────

function PipelinesTab({ agents }) {
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

  const load = useCallback(async () => {
    const d = await api("/pipelines").catch(() => ({ pipelines: [] }));
    setPipelines(d.pipelines ?? []);
  }, []);

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
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left: list + run */}
      <div style={{
        width:        280,
        flexShrink:   0,
        borderRight:  `1px solid ${T.border}`,
        background:   T.surface,
        display:      "flex",
        flexDirection: "column",
        overflow:     "hidden",
      }}>
        <div style={{ padding: "12px 14px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: T.sub, letterSpacing: "0.12em" }}>PIPELINES ({pipelines.length})</span>
          <Btn size="xs" onClick={() => setCreating(true)}>+ NEW</Btn>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
          {pipelines.length === 0 && (
            <Empty icon="◈" title="NO PIPELINES" sub="Chain multiple agents into a sequential workflow." action={<Btn size="xs" onClick={() => setCreating(true)}>+ CREATE</Btn>} />
          )}
          {pipelines.map(pl => {
            const isSel = selPipe?.id === pl.id;
            const names = pl.steps.map(s => agents.find(a => a.id === s.agentId)?.name ?? "?");
            return (
              <div key={pl.id} onClick={() => { setSelPipe(pl); setDone(null); setLogs([]); setActiveRun(null); setStepState(pl.steps.map(s => ({ ...s, status: "pending", agentName: agents.find(a => a.id === s.agentId)?.name ?? "?", output: null }))); }} style={{ padding: "9px 10px", borderRadius: 2, cursor: "pointer", background: isSel ? T.card : "transparent", borderLeft: isSel ? `2px solid ${T.amber}` : "2px solid transparent", marginBottom: 2, transition: "all .1s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: isSel ? T.text : T.sub }}>{pl.name}</span>
                  <button onClick={e => { e.stopPropagation(); del(pl.id); }} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14, padding: 2, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ fontSize: 10, color: T.muted, marginTop: 3, letterSpacing: "0.03em" }}>
                  {names.join(" → ")}
                </div>
              </div>
            );
          })}
        </div>

        {/* Run control */}
        {selPipe && (
          <div style={{ borderTop: `1px solid ${T.border}`, padding: "14px" }}>
            <Label>INITIAL PROMPT</Label>
            <Input value={runInput} onChange={setRunInput} placeholder={`Start "${selPipe.name}"…`} multiline rows={3} disabled={running} onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") execute(); }} />
            <div style={{ fontSize: 9, color: T.muted, marginTop: 3, letterSpacing: "0.04em", marginBottom: 10 }}>
              Output of each step feeds the next agent.
            </div>
            <ErrBox msg={err} />
            <Btn onClick={execute} disabled={running || !runInput.trim()} full style={{ marginTop: err ? 10 : 0 }}>
              {running ? <><Spinner size={13} /> RUNNING…</> : "▷ RUN PIPELINE"}
            </Btn>
          </div>
        )}
      </div>

      {/* Right: flow + terminal */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selPipe ? (
          <>
            {/* Pipeline flow visualizer */}
            <PipelineFlow steps={stepState.length > 0 ? stepState : selPipe.steps.map(s => ({ ...s, status: "pending", agentName: agents.find(a => a.id === s.agentId)?.name ?? "?" }))} />
            <TerminalPanel logs={logs} done={done} running={running} label="PIPELINE" taskId={activeRun?.id} />
          </>
        ) : (
          <Empty icon="◈" title="SELECT A PIPELINE" sub="Choose a pipeline to see the flow diagram and run it." />
        )}
      </div>

      {creating && (
        <CreatePipelineModal agents={agents} onClose={() => setCreating(false)} onCreate={async () => { await load(); setCreating(false); }} />
      )}
    </div>
  );
}

// ─── SVG Pipeline Flow Diagram ────────────────────────────────────────────────

function PipelineFlow({ steps }) {
  const statusColor = {
    pending: T.muted,
    running: T.amber,
    done:    T.green,
    error:   T.red,
  };

  const STEP_W = 120;
  const STEP_H = 52;
  const ARROW  = 36;
  const PAD_X  = 20;
  const PAD_Y  = 18;
  const totalW = PAD_X * 2 + steps.length * STEP_W + (steps.length - 1) * ARROW;
  const totalH = STEP_H + PAD_Y * 2;

  return (
    <div style={{
      borderBottom: `1px solid ${T.border}`,
      background:   T.surface,
      padding:      "0 16px",
      overflowX:    "auto",
      flexShrink:   0,
    }}>
      <svg
        width={Math.max(totalW, 600)}
        height={totalH}
        viewBox={`0 0 ${Math.max(totalW, 600)} ${totalH}`}
        style={{ display: "block", minHeight: totalH }}
      >
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke={T.rule} strokeWidth="0.5" opacity="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />

        {steps.map((step, i) => {
          const x    = PAD_X + i * (STEP_W + ARROW);
          const y    = PAD_Y;
          const sc   = statusColor[step.status] ?? T.muted;
          const name = step.agentName ?? step.agentId ?? "Agent";

          return (
            <g key={i}>
              {/* Arrow connector */}
              {i > 0 && (
                <g>
                  <line
                    x1={x - ARROW}
                    y1={y + STEP_H / 2}
                    x2={x - 4}
                    y2={y + STEP_H / 2}
                    stroke={statusColor[steps[i - 1]?.status] ?? T.border}
                    strokeWidth="1.5"
                    strokeDasharray={step.status === "pending" ? "4 3" : "none"}
                    opacity={step.status === "pending" ? 0.4 : 1}
                  />
                  <polygon
                    points={`${x - 4},${y + STEP_H / 2 - 4} ${x + 2},${y + STEP_H / 2} ${x - 4},${y + STEP_H / 2 + 4}`}
                    fill={statusColor[steps[i - 1]?.status] ?? T.border}
                    opacity={step.status === "pending" ? 0.4 : 1}
                  />
                </g>
              )}

              {/* Step box */}
              <rect
                x={x}
                y={y}
                width={STEP_W}
                height={STEP_H}
                fill={T.card}
                stroke={sc}
                strokeWidth={step.status === "running" ? 1.5 : 1}
                opacity={step.status === "pending" ? 0.5 : 1}
                rx={1}
              />

              {/* Amber top border if running */}
              {step.status === "running" && (
                <rect x={x} y={y} width={STEP_W} height={2} fill={T.amber} />
              )}
              {step.status === "done" && (
                <rect x={x} y={y} width={STEP_W} height={2} fill={T.green} />
              )}

              {/* Step number */}
              <text x={x + 8} y={y + 14} fill={T.muted} fontSize={9} fontFamily={T.mono} letterSpacing="0.08em">
                S{i + 1}
              </text>

              {/* Status dot */}
              <circle
                cx={x + STEP_W - 10}
                cy={y + 14}
                r={3.5}
                fill={sc}
                opacity={step.status === "pending" ? 0.4 : 1}
              />

              {/* Agent name */}
              <text
                x={x + STEP_W / 2}
                y={y + STEP_H / 2 + 2}
                fill={step.status === "pending" ? T.muted : T.text}
                fontSize={11}
                fontFamily={T.mono}
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight={step.status === "running" ? "600" : "400"}
              >
                {name.length > 13 ? name.slice(0, 13) + "…" : name}
              </text>

              {/* Status label */}
              <text
                x={x + STEP_W / 2}
                y={y + STEP_H - 9}
                fill={sc}
                fontSize={9}
                fontFamily={T.mono}
                textAnchor="middle"
                letterSpacing="0.08em"
                opacity={0.9}
              >
                {step.status.toUpperCase()}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Create Pipeline Modal ────────────────────────────────────────────────────

function CreatePipelineModal({ agents, onClose, onCreate }) {
  const [name,  setName]  = useState("");
  const [steps, setSteps] = useState([{ agentId: agents[0]?.id ?? "", promptTemplate: "" }]);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState(null);

  const addStep    = ()    => setSteps(p => [...p, { agentId: agents[0]?.id ?? "", promptTemplate: "" }]);
  const removeStep = i     => setSteps(p => p.filter((_, j) => j !== i));
  const setField   = (i, k, v) => setSteps(p => p.map((s, j) => j === i ? { ...s, [k]: v } : s));
  const move       = (i, d)    => {
    const n = [...steps]; const j = i + d;
    if (j < 0 || j >= n.length) return;
    [n[i], n[j]] = [n[j], n[i]]; setSteps(n);
  };

  const save = async () => {
    if (!name.trim()) return setErr("Pipeline name required.");
    if (steps.some(s => !s.agentId)) return setErr("All steps need an agent.");
    setBusy(true); setErr(null);
    try {
      await api("/pipelines/create", { method: "POST", body: { name: name.trim(), steps: steps.map(s => ({ agentId: s.agentId, promptTemplate: s.promptTemplate.trim() || null })) } });
      await onCreate();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,8,.82)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, backdropFilter: "blur(3px)" }}>
      <div onClick={e => e.stopPropagation()} className="fade-up" style={{ background: T.elevated, border: `1px solid ${T.borderL}`, borderTop: `2px solid ${T.amber}`, width: "100%", maxWidth: 600, maxHeight: "88vh", overflow: "auto", padding: "22px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", color: T.text, marginBottom: 20 }}>
          NEW PIPELINE
        </div>

        <div style={{ marginBottom: 16 }}>
          <Label>PIPELINE NAME *</Label>
          <Input value={name} onChange={setName} placeholder="e.g. Research → Summarise → Post" />
        </div>

        <Label>AGENT STEPS (executed in order)</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, padding: "12px 14px", borderLeft: `2px solid ${T.amber}40` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: i > 0 ? 10 : 0 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: T.amber, minWidth: 18, letterSpacing: "0.1em" }}>S{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <Select value={step.agentId} onChange={v => setField(i, "agentId", v)} options={agents.map(a => ({ value: a.id, label: `${a.name}  [${a.chain.toUpperCase()}]` }))} />
                </div>
                <button onClick={() => move(i, -1)} disabled={i === 0}                  style={{ background: "none", border: "none", color: i === 0 ? T.muted : T.sub, cursor: i === 0 ? "default" : "pointer", fontSize: 13, padding: "2px 4px" }}>▲</button>
                <button onClick={() => move(i, 1)}  disabled={i === steps.length - 1}   style={{ background: "none", border: "none", color: i === steps.length - 1 ? T.muted : T.sub, cursor: i === steps.length - 1 ? "default" : "pointer", fontSize: 13, padding: "2px 4px" }}>▼</button>
                {steps.length > 1 && <button onClick={() => removeStep(i)} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}>×</button>}
              </div>
              {i > 0 && (
                <div>
                  <Label style={{ marginTop: 10 }}>PROMPT TEMPLATE (optional)</Label>
                  <Input value={step.promptTemplate} onChange={v => setField(i, "promptTemplate", v)} placeholder="Use {prev_output} and {input}. Now do: …" style={{ fontSize: 11 }} />
                  <div style={{ fontSize: 9, color: T.muted, marginTop: 3, letterSpacing: "0.04em" }}>
                    {"{prev_output}"} = previous result  ·  {"{input}"} = initial prompt
                  </div>
                </div>
              )}
            </div>
          ))}
          <Btn variant="ghost" size="sm" onClick={addStep} style={{ alignSelf: "flex-start" }}>+ ADD STEP</Btn>
        </div>

        <ErrBox msg={err} />
        <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
          <Btn onClick={save} disabled={busy}>{busy ? <><Spinner size={12} /> SAVING…</> : "CREATE PIPELINE"}</Btn>
          <Btn variant="ghost" onClick={onClose}>CANCEL</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Tools tab ────────────────────────────────────────────────────────────────

function ToolsTab({ mcp, native, loading, mcpError }) {
  const [filter, setFilter] = useState("all");
  const [q,      setQ]      = useState("");
  const [open,   setOpen]   = useState(null);

  const all = [
    ...(native?.evm    ?? []).map(t => ({ ...t, src: "native", chainKey: "evm"    })),
    ...(native?.solana ?? []).map(t => ({ ...t, src: "native", chainKey: "solana" })),
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
    { id: "mcp",    label: `MCP (${(mcp ?? []).length})` },
  ];

  return (
    <div style={{ padding: "22px 26px", overflow: "auto", height: "100%" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, letterSpacing: "0.08em" }}>TOOL REGISTRY</div>
          <div style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>
            {(mcp ?? []).length} Printr MCP  ·  {(native?.evm ?? []).length} EVM native  ·  {(native?.solana ?? []).length} Solana native
          </div>
        </div>
        <Input value={q} onChange={setQ} placeholder="SEARCH TOOLS…" style={{ width: 200, fontSize: 11 }} />
      </div>

      {/* Filter strip */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 12 }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding:       "5px 12px",
            border:        `1px solid ${filter === f.id ? T.amber + "55" : T.border}`,
            background:    filter === f.id ? T.amberGlow : "transparent",
            color:         filter === f.id ? T.amber : T.muted,
            fontSize:      10,
            fontWeight:    500,
            cursor:        "pointer",
            fontFamily:    T.mono,
            letterSpacing: "0.1em",
            borderRadius:  1,
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {mcpError && (
        <div style={{ background: T.yellow + "08", border: `1px solid ${T.yellow}22`, padding: "10px 14px", fontSize: 11, color: T.yellow, marginBottom: 16, lineHeight: 1.7 }}>
          !  Printr MCP unavailable — {mcpError}<br />
          <span style={{ color: T.sub }}>Native chain tools are still active.</span>
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.sub, fontSize: 11, padding: "20px 0" }}>
          <Spinner /> LOADING TOOL REGISTRY…
        </div>
      )}

      {/* Tool table */}
      {!loading && (
        <div style={{ border: `1px solid ${T.border}`, background: T.card, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display:       "grid",
            gridTemplateColumns: "2fr 4fr 1fr 1fr",
            gap:           0,
            padding:       "8px 16px",
            borderBottom:  `1px solid ${T.border}`,
            background:    T.surface,
          }}>
            {["TOOL NAME", "DESCRIPTION", "CHAIN", "TYPE"].map(h => (
              <div key={h} style={{ fontSize: 9, color: T.muted, letterSpacing: "0.14em" }}>{h}</div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ padding: "24px", fontSize: 11, color: T.muted, textAlign: "center" }}>
              No tools match filter.
            </div>
          )}

          {filtered.map((t, i) => {
            const isOpen  = open === `${t.name}-${i}`;
            const cc      = t.chainKey === "solana" ? T.sol : t.chainKey === "mcp" ? T.green : T.evm;
            const props   = Object.entries(t.inputSchema?.properties ?? {});

            return (
              <div key={`${t.name}-${i}`}>
                <div
                  onClick={() => setOpen(isOpen ? null : `${t.name}-${i}`)}
                  style={{
                    display:       "grid",
                    gridTemplateColumns: "2fr 4fr 1fr 1fr",
                    gap:           0,
                    padding:       "10px 16px",
                    borderBottom:  `1px solid ${T.rule}`,
                    cursor:        "pointer",
                    background:    isOpen ? T.elevated : "transparent",
                    transition:    "background .1s",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 500, color: isOpen ? T.amber : T.text, fontFamily: T.mono }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: T.sub, paddingRight: 16, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description ?? "—"}</div>
                  <div><Tag color={cc}>{t.chainKey === "mcp" ? "MCP" : t.chainKey.toUpperCase()}</Tag></div>
                  <div><Tag color={T.sub}>{t.src.toUpperCase()}</Tag></div>
                </div>

                {/* Expanded schema */}
                {isOpen && props.length > 0 && (
                  <div style={{ borderBottom: `1px solid ${T.border}`, background: T.bg, padding: "12px 16px 12px 48px" }}>
                    <div style={{ fontSize: 9, color: T.muted, letterSpacing: "0.12em", marginBottom: 8 }}>INPUT SCHEMA</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {props.map(([k, def]) => {
                        const req = (t.inputSchema?.required ?? []).includes(k);
                        return (
                          <div key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 11 }}>
                            <code style={{ color: T.amber, minWidth: 140, fontFamily: T.mono }}>{k}</code>
                            <code style={{ color: T.muted, fontFamily: T.mono, minWidth: 60 }}>{def.type ?? "any"}</code>
                            {req && <Tag color={T.yellow}>REQ</Tag>}
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
  const [tools,        setTools]       = useState({ mcp: [], native: { evm: [], solana: [] }, mcpError: null });
  const [toolsLoading, setToolsLoading]= useState(true);

  useEffect(() => { injectGlobal(); }, []);

  const loadAgents = useCallback(async () => {
    const d = await api("/agents").catch(() => ({ agents: [] }));
    setAgents(d.agents ?? []);
  }, []);

  const loadTools = useCallback(async () => {
    setToolsLoading(true);
    const d = await api("/tools/list").catch(e => ({ mcp: [], native: { evm: [], solana: [] }, mcpError: e.message }));
    setTools({ mcp: d.mcp ?? [], native: d.native ?? { evm: [], solana: [] }, mcpError: d.mcpError ?? null });
    setToolsLoading(false);
  }, []);

  useEffect(() => { loadAgents(); loadTools(); }, []);

  const totalTools = (tools.mcp?.length ?? 0) + (tools.native?.evm?.length ?? 0) + (tools.native?.solana?.length ?? 0);

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden", background: T.bg }}>
      <Sidebar active={tab} onNav={setTab} agentCount={agents.length} toolCount={totalTools} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{
          height:      52,
          borderBottom: `1px solid ${T.border}`,
          background:  T.surface,
          display:     "flex",
          alignItems:  "center",
          padding:     "0 22px",
          justifyContent: "space-between",
          flexShrink:  0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.12em" }}>PRINTR</span>
            <span style={{ color: T.rule }}>/</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.text, letterSpacing: "0.08em" }}>
              {({ run: "EXECUTE", agents: "AGENTS", pipelines: "PIPELINES", tools: "TOOLS" })[tab] ?? tab.toUpperCase()}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", fontFamily: T.mono }}>
              {new Date().toLocaleTimeString("en", { hour12: false, hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Dot color={T.green} pulse size={5} />
              <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em" }}>CONNECTED</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <main style={{ flex: 1, overflow: "hidden" }} key={tab}>
          {tab === "run"       && <RunTab       agents={agents} onAgentsChange={loadAgents} />}
          {tab === "agents"    && <AgentsTab    agents={agents} onRefresh={loadAgents} />}
          {tab === "pipelines" && <PipelinesTab agents={agents} />}
          {tab === "tools"     && <ToolsTab     mcp={tools.mcp} native={tools.native} loading={toolsLoading} mcpError={tools.mcpError} />}
        </main>
      </div>
    </div>
  );
}