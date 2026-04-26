import { useState } from "react";
import { T } from "../theme.js";
import { WalletModal } from "./WalletModal.jsx";

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletButton({ wallet, isMobile = false }) {
  const [open, setOpen] = useState(false);

  const { isConnected, address, chainName, balance, chain, disconnect } = wallet;

  if (isConnected) {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 6 : 8 }}>
          {/* Chain + balance badge — hidden on smallest mobile to save space */}
          {!isMobile && chainName && (
            <div style={{
              fontSize: 10,
              color:    T.sub,
              background: T.card,
              border:   `1px solid ${T.border}`,
              borderRadius: 2,
              padding:  "3px 8px",
              letterSpacing: "0.06em",
              fontFamily: T.mono,
            }}>
              {chainName}
              {balance && ` · ${balance} ${chain === "solana" ? "SOL" : "ETH"}`}
            </div>
          )}

          {/* Address button */}
          <button
            onClick={() => setOpen(true)}
            style={{
              display:     "inline-flex",
              alignItems:  "center",
              gap:         6,
              background:  T.amberGlow,
              border:      `1px solid ${T.amber}40`,
              borderRadius: 2,
              color:       T.amber,
              fontSize:    isMobile ? 11 : 11,
              fontFamily:  T.mono,
              padding:     isMobile ? "10px 14px" : "7px 13px",
              cursor:      "pointer",
              letterSpacing: "0.04em",
              minHeight:   isMobile ? 44 : "auto",
              whiteSpace:  "nowrap",
            }}
          >
            <span style={{
              width: 7, height: 7,
              borderRadius: "50%",
              background: T.green,
              flexShrink: 0,
              boxShadow: `0 0 6px ${T.green}80`,
            }} />
            {shortAddr(address)}
          </button>
        </div>

        {open && (
          <WalletModal
            wallet={wallet}
            onClose={() => setOpen(false)}
            onDisconnect={() => { disconnect(); setOpen(false); }}
            isMobile={isMobile}
          />
        )}
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display:      "inline-flex",
          alignItems:   "center",
          gap:          7,
          background:   T.amber,
          color:        "#0c0c0a",
          border:       `1px solid ${T.amber}`,
          borderRadius: 2,
          fontSize:     isMobile ? 12 : 11,
          fontFamily:   T.mono,
          fontWeight:   600,
          padding:      isMobile ? "11px 18px" : "7px 15px",
          cursor:       "pointer",
          letterSpacing: "0.06em",
          minHeight:    isMobile ? 44 : "auto",
          whiteSpace:   "nowrap",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="4" width="14" height="10" rx="1.5" stroke="#0c0c0a" strokeWidth="1.5"/>
          <path d="M1 7h14" stroke="#0c0c0a" strokeWidth="1.5"/>
          <circle cx="11.5" cy="10.5" r="1.5" fill="#0c0c0a"/>
        </svg>
        {isMobile ? "CONNECT" : "CONNECT WALLET"}
      </button>

      {open && (
        <WalletModal
          wallet={wallet}
          onClose={() => setOpen(false)}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
