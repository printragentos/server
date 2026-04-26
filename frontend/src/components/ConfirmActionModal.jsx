import { useEffect } from "react";
import { T } from "../theme.js";

/**
 * ConfirmActionModal
 *
 * Props:
 *   title       string
 *   summary     string | ReactNode   — shown in body
 *   details     [{label, value}]     — key-value rows
 *   warning     string               — optional red warning
 *   confirmText string               — default "CONFIRM"
 *   cancelText  string               — default "CANCEL"
 *   onConfirm   () => void
 *   onCancel    () => void
 *   busy        boolean              — disables buttons while processing
 *   isMobile    boolean
 */
export function ConfirmActionModal({
  title       = "CONFIRM ACTION",
  summary,
  details     = [],
  warning,
  confirmText = "CONFIRM",
  cancelText  = "CANCEL",
  onConfirm,
  onCancel,
  busy        = false,
  isMobile    = false,
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape" && !busy) onCancel?.(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onCancel, busy]);

  const overlayStyle = {
    position:       "fixed",
    inset:          0,
    background:     "rgba(10,10,8,.88)",
    zIndex:         500,
    display:        "flex",
    alignItems:     isMobile ? "flex-end" : "center",
    justifyContent: "center",
    backdropFilter: "blur(4px)",
    padding:        isMobile ? 0 : 24,
  };

  const panelStyle = {
    background:   T.elevated,
    border:       isMobile ? "none" : `1px solid ${T.borderL}`,
    borderTop:    `2px solid ${T.amber}`,
    borderRadius: isMobile ? "12px 12px 0 0" : 2,
    width:        "100%",
    maxWidth:     isMobile ? "100%" : 460,
    display:      "flex",
    flexDirection:"column",
    overflow:     "hidden",
    animation:    "fadeUp .18s ease both",
  };

  return (
    <div style={overlayStyle} onClick={!busy ? onCancel : undefined}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding:      isMobile ? "20px 20px 16px" : "16px 20px 12px",
          borderBottom: `1px solid ${T.border}`,
          flexShrink:   0,
        }}>
          <div style={{ fontSize: isMobile ? 15 : 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>
            {title}
          </div>
          {summary && (
            <div style={{ fontSize: isMobile ? 13 : 12, color: T.sub, marginTop: 5, lineHeight: 1.6 }}>
              {summary}
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: isMobile ? "16px 20px" : "14px 20px", overflowY: "auto" }}>

          {/* Details rows */}
          {details.length > 0 && (
            <div style={{
              background:   T.card,
              border:       `1px solid ${T.border}`,
              borderRadius: 2,
              overflow:     "hidden",
              marginBottom: warning ? 14 : 0,
            }}>
              {details.map(({ label, value }, i) => (
                <div
                  key={i}
                  style={{
                    display:      "flex",
                    alignItems:   "flex-start",
                    justifyContent: "space-between",
                    gap:          12,
                    padding:      isMobile ? "12px 14px" : "9px 12px",
                    borderBottom: i < details.length - 1 ? `1px solid ${T.rule}` : "none",
                  }}
                >
                  <span style={{ fontSize: isMobile ? 12 : 11, color: T.sub, flexShrink: 0 }}>{label}</span>
                  <span style={{
                    fontSize:   isMobile ? 12 : 11,
                    color:      T.text,
                    fontFamily: T.mono,
                    textAlign:  "right",
                    wordBreak:  "break-all",
                    maxWidth:   "65%",
                  }}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warning */}
          {warning && (
            <div style={{
              padding:      isMobile ? "12px 14px" : "10px 12px",
              background:   T.yellow + "08",
              border:       `1px solid ${T.yellow}28`,
              borderRadius: 2,
              fontSize:     isMobile ? 13 : 11,
              color:        T.yellow,
              lineHeight:   1.7,
              display:      "flex",
              gap:          8,
            }}>
              <span style={{ flexShrink: 0 }}>!</span>
              {warning}
            </div>
          )}
        </div>

        {/* Sticky bottom buttons */}
        <div style={{
          padding:       isMobile ? "14px 16px calc(14px + env(safe-area-inset-bottom))" : "12px 20px",
          borderTop:     `1px solid ${T.border}`,
          background:    T.elevated,
          display:       "flex",
          gap:           10,
          flexShrink:    0,
          flexDirection: isMobile ? "row" : "row",
        }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              flex:         1,
              padding:      isMobile ? "14px 16px" : "10px 16px",
              background:   "transparent",
              border:       `1px solid ${T.border}`,
              borderRadius: 2,
              color:        T.sub,
              fontSize:     isMobile ? 13 : 12,
              fontFamily:   T.mono,
              cursor:       busy ? "not-allowed" : "pointer",
              opacity:      busy ? 0.4 : 1,
              letterSpacing:"0.06em",
              minHeight:    isMobile ? 50 : 40,
            }}
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              flex:         1,
              padding:      isMobile ? "14px 16px" : "10px 16px",
              background:   busy ? T.amberGlow : T.amber,
              border:       `1px solid ${T.amber}`,
              borderRadius: 2,
              color:        busy ? T.amber : "#0c0c0a",
              fontSize:     isMobile ? 13 : 12,
              fontFamily:   T.mono,
              fontWeight:   600,
              cursor:       busy ? "not-allowed" : "pointer",
              letterSpacing:"0.06em",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              gap:          7,
              minHeight:    isMobile ? 50 : 40,
              transition:   "background .12s",
            }}
          >
            {busy ? (
              <>
                <span style={{
                  width: 13, height: 13,
                  borderRadius: "50%",
                  border: `1.5px solid ${T.amber}30`,
                  borderTopColor: T.amber,
                  animation: "spin .6s linear infinite",
                  flexShrink: 0,
                }} />
                PROCESSING…
              </>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
