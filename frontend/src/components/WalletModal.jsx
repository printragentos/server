import { useEffect } from "react";
import { T, CHAIN_NAMES } from "../theme.js";

function WalletIcon({ svgStr, size = 36 }) {
  return (
    <div
      style={{ width: size, height: size, flexShrink: 0 }}
      dangerouslySetInnerHTML={{ __html: svgStr }}
    />
  );
}

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

export function WalletModal({ wallet, onClose, onDisconnect, isMobile = false }) {
  const { isConnected, address, chainId, chainName, balance, chain, wallets,
          connect, disconnect, connecting, error, walletId } = wallet;

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const overlayStyle = {
    position:       "fixed",
    inset:          0,
    background:     "rgba(10,10,8,.85)",
    zIndex:         400,
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
    maxWidth:     isMobile ? "100%" : 480,
    maxHeight:    isMobile ? "90vh" : "85vh",
    display:      "flex",
    flexDirection:"column",
    overflow:     "hidden",
    animation:    "fadeUp .18s ease both",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding:      isMobile ? "18px 20px 14px" : "16px 20px 12px",
          borderBottom: `1px solid ${T.border}`,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          flexShrink:   0,
        }}>
          <div>
            <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em" }}>
              {isConnected ? "WALLET" : "CONNECT WALLET"}
            </div>
            {!isConnected && (
              <div style={{ fontSize: 11, color: T.sub, marginTop: 3 }}>
                Choose a wallet to connect
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background:   "none",
              border:       `1px solid ${T.border}`,
              color:        T.sub,
              cursor:       "pointer",
              fontSize:     16,
              width:        isMobile ? 36 : 28,
              height:       isMobile ? 36 : 28,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              borderRadius: 2,
              lineHeight:   1,
            }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "14px 16px" : "14px 18px" }}>

          {/* ── Connected state ── */}
          {isConnected ? (
            <div>
              {/* Address card */}
              <div style={{
                background:   T.card,
                border:       `1px solid ${T.borderL}`,
                borderTop:    `2px solid ${T.green}`,
                borderRadius: 2,
                padding:      isMobile ? "18px 16px" : "14px 16px",
                marginBottom: 16,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, boxShadow: `0 0 8px ${T.green}80`, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.green, letterSpacing: "0.1em" }}>CONNECTED</span>
                  {walletId && (
                    <span style={{ fontSize: 10, color: T.sub, marginLeft: "auto" }}>
                      {wallets.find(w => w.id === walletId)?.name ?? walletId}
                    </span>
                  )}
                </div>

                <div style={{
                  fontSize:    isMobile ? 13 : 12,
                  color:       T.amber,
                  fontFamily:  T.mono,
                  wordBreak:   "break-all",
                  lineHeight:  1.6,
                  marginBottom: 10,
                }}>
                  {address}
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {chainName && (
                    <span style={{ fontSize: 11, color: T.sub, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 1, padding: "3px 8px" }}>
                      {chainName}
                    </span>
                  )}
                  {balance && (
                    <span style={{ fontSize: 11, color: T.sub, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 1, padding: "3px 8px" }}>
                      {balance} {chain === "solana" ? "SOL" : "ETH"}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: T.sub, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 1, padding: "3px 8px" }}>
                    {chain?.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Copy address */}
              <button
                onClick={() => navigator.clipboard?.writeText(address)}
                style={{
                  width:        "100%",
                  padding:      isMobile ? "12px 16px" : "9px 14px",
                  background:   T.card,
                  border:       `1px solid ${T.border}`,
                  borderRadius: 2,
                  color:        T.sub,
                  fontSize:     12,
                  fontFamily:   T.mono,
                  cursor:       "pointer",
                  textAlign:    "left",
                  display:      "flex",
                  alignItems:   "center",
                  gap:          8,
                  marginBottom: 8,
                  minHeight:    isMobile ? 48 : "auto",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                  <rect x="5" y="5" width="9" height="9" rx="1" stroke={T.sub} strokeWidth="1.2"/>
                  <path d="M4 11H3C2.45 11 2 10.55 2 10V3C2 2.45 2.45 2 3 2H10C10.55 2 11 2.45 11 3V4" stroke={T.sub} strokeWidth="1.2"/>
                </svg>
                COPY ADDRESS
              </button>
            </div>
          ) : (
            /* ── Wallet list ── */
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 10 : 8 }}>
              {wallets.map(w => {
                const available = w.check();
                const isActive  = connecting;

                return (
                  <button
                    key={w.id}
                    disabled={isActive}
                    onClick={() => connect(w.id)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:          isMobile ? 14 : 12,
                      padding:      isMobile ? "14px 16px" : "11px 14px",
                      background:   T.card,
                      border:       `1px solid ${T.border}`,
                      borderRadius: 2,
                      cursor:       isActive ? "not-allowed" : "pointer",
                      opacity:      !available && w.id !== "walletconnect" ? 0.45 : 1,
                      textAlign:    "left",
                      width:        "100%",
                      minHeight:    isMobile ? 64 : 52,
                      transition:   "border-color .12s, background .12s",
                    }}
                  >
                    <WalletIcon svgStr={w.iconSvg} size={isMobile ? 36 : 32} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: isMobile ? 14 : 13, fontWeight: 500, color: T.text, marginBottom: 2 }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: isMobile ? 12 : 11, color: T.sub }}>
                        {!available && w.id !== "walletconnect"
                          ? "Not installed"
                          : w.description}
                      </div>
                    </div>

                    {available && w.id !== "walletconnect" && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M6 3L11 8L6 13" stroke={T.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}

                    {!available && w.id !== "walletconnect" && (
                      <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.06em" }}>INSTALL</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              marginTop:    14,
              padding:      "10px 13px",
              background:   T.red + "0a",
              border:       `1px solid ${T.red}30`,
              borderRadius: 2,
              fontSize:     isMobile ? 13 : 11,
              color:        T.red,
              lineHeight:   1.6,
            }}>
              ×  {error}
            </div>
          )}

          {/* Loading */}
          {connecting && (
            <div style={{
              marginTop:    14,
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              fontSize:     11,
              color:        T.amber,
            }}>
              <span style={{
                width: 14, height: 14,
                borderRadius: "50%",
                border: `1.5px solid ${T.amber}20`,
                borderTopColor: T.amber,
                animation: "spin .6s linear infinite",
                flexShrink: 0,
              }} />
              Connecting…
            </div>
          )}

          <div style={{
            marginTop:  16,
            fontSize:   isMobile ? 11 : 10,
            color:      T.muted,
            lineHeight: 1.7,
            paddingTop: 12,
            borderTop:  `1px solid ${T.rule}`,
          }}>
            Non-custodial — your keys never leave your wallet.
            Printr Agent OS only requests signing approval.
          </div>
        </div>

        {/* Sticky footer — disconnect button (connected state only) */}
        {isConnected && (
          <div style={{
            padding:    isMobile ? "14px 16px" : "12px 18px",
            borderTop:  `1px solid ${T.border}`,
            background: T.elevated,
            flexShrink: 0,
          }}>
            <button
              onClick={() => { (onDisconnect ?? disconnect)(); onClose(); }}
              style={{
                width:        "100%",
                padding:      isMobile ? "13px 16px" : "9px 14px",
                background:   "transparent",
                border:       `1px solid ${T.red}35`,
                borderRadius: 2,
                color:        T.red,
                fontSize:     isMobile ? 13 : 12,
                fontFamily:   T.mono,
                cursor:       "pointer",
                letterSpacing:"0.06em",
                minHeight:    isMobile ? 48 : "auto",
              }}
            >
              DISCONNECT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
