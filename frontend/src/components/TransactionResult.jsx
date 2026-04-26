import { T } from "../theme.js";

/**
 * TransactionResult
 *
 * Props:
 *   status   "success" | "error" | "pending"
 *   txHash   string
 *   chainId  number
 *   token    { name, symbol, address, chain }
 *   error    string
 *   onClose  () => void
 *   isMobile boolean
 */

const EXPLORERS = {
  1:        { name: "Etherscan",  url: "https://etherscan.io/tx/" },
  8453:     { name: "BaseScan",   url: "https://basescan.org/tx/" },
  42161:    { name: "Arbiscan",   url: "https://arbiscan.io/tx/" },
  137:      { name: "Polygonscan",url: "https://polygonscan.com/tx/" },
  10:       { name: "Optimistic", url: "https://optimistic.etherscan.io/tx/" },
  11155111: { name: "Sepolia",    url: "https://sepolia.etherscan.io/tx/" },
  84532:    { name: "BaseScan",   url: "https://sepolia.basescan.org/tx/" },
};

function shortHash(hash) {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function LinkButton({ href, icon, label, isMobile }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display:        "flex",
        alignItems:     "center",
        gap:            9,
        padding:        isMobile ? "13px 16px" : "8px 13px",
        background:     T.card,
        border:         `1px solid ${T.border}`,
        borderRadius:   2,
        color:          T.sub,
        fontSize:       isMobile ? 13 : 11,
        fontFamily:     T.mono,
        textDecoration: "none",
        width:          isMobile ? "100%" : "auto",
        minHeight:      isMobile ? 50 : "auto",
        letterSpacing:  "0.04em",
        transition:     "border-color .12s, color .12s",
      }}
    >
      <span style={{ fontSize: isMobile ? 16 : 14, flexShrink: 0 }}>{icon}</span>
      {label}
      <svg style={{ marginLeft: "auto" }} width="11" height="11" viewBox="0 0 12 12" fill="none">
        <path d="M2.5 2.5H9.5V9.5" stroke={T.muted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9.5 2.5L2.5 9.5" stroke={T.muted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  );
}

export function TransactionResult({ status, txHash, chainId, token, error, onClose, onReset, isMobile = false }) {
  const isSuccess = status === "success";
  const isPending = status === "pending";

  const statusColor = isSuccess ? T.green : isPending ? T.amber : T.red;
  const statusLabel = isSuccess ? "SUCCESS" : isPending ? "PENDING" : "FAILED";

  const explorer = chainId ? EXPLORERS[chainId] : null;

  const container = {
    background:   T.card,
    border:       `1px solid ${T.borderL}`,
    borderTop:    `2px solid ${statusColor}`,
    borderRadius: 2,
    overflow:     "hidden",
    animation:    "fadeUp .2s ease both",
    maxWidth:     isMobile ? "100%" : 520,
    width:        "100%",
    margin:       isMobile ? 0 : "0 auto",
  };

  return (
    <div style={container}>
      {/* Status header */}
      <div style={{
        padding:       isMobile ? "20px 18px 16px" : "16px 18px 12px",
        borderBottom:  `1px solid ${T.border}`,
        display:       "flex",
        alignItems:    "center",
        gap:           10,
      }}>
        {/* Status icon */}
        <div style={{
          width:          isMobile ? 40 : 32,
          height:         isMobile ? 40 : 32,
          borderRadius:   "50%",
          background:     statusColor + "18",
          border:         `1.5px solid ${statusColor}40`,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          fontSize:       isMobile ? 18 : 14,
        }}>
          {isSuccess ? "✓" : isPending ? "◷" : "✕"}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isMobile ? 16 : 13, fontWeight: 600, color: T.text, letterSpacing: "0.06em", marginBottom: 2 }}>
            TRANSACTION {statusLabel}
          </div>
          {token?.name && (
            <div style={{ fontSize: isMobile ? 13 : 11, color: T.sub }}>
              {token.name} ({token.symbol})
            </div>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            style={{ background: "none", border: `1px solid ${T.border}`, color: T.sub, cursor: "pointer", fontSize: 16, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2 }}
          >×</button>
        )}
      </div>

      {/* Body — stacked on both mobile and desktop */}
      <div style={{ padding: isMobile ? "16px 18px" : "14px 18px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Error message */}
        {!isSuccess && error && (
          <div style={{
            padding:    isMobile ? "12px 14px" : "10px 12px",
            background: T.red + "0a",
            border:     `1px solid ${T.red}28`,
            borderRadius: 2,
            fontSize:   isMobile ? 13 : 11,
            color:      T.red,
            lineHeight: 1.6,
          }}>
            ×  {error}
          </div>
        )}

        {/* Token info */}
        {token && (
          <div style={{
            background:   T.bg,
            border:       `1px solid ${T.border}`,
            borderRadius: 2,
            overflow:     "hidden",
          }}>
            {[
              token.name    && ["TOKEN NAME",    token.name],
              token.symbol  && ["SYMBOL",        token.symbol],
              token.chain   && ["CHAIN",         token.chain.toUpperCase()],
              token.address && ["TOKEN ADDRESS", token.address],
            ].filter(Boolean).map(([label, value], i, arr) => (
              <div key={i} style={{
                display:      "flex",
                flexDirection: isMobile ? "column" : "row",
                alignItems:   isMobile ? "flex-start" : "center",
                justifyContent: "space-between",
                gap:          isMobile ? 2 : 12,
                padding:      isMobile ? "11px 14px" : "8px 12px",
                borderBottom: i < arr.length - 1 ? `1px solid ${T.rule}` : "none",
              }}>
                <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em" }}>{label}</span>
                <span style={{
                  fontSize:   isMobile ? 12 : 11,
                  color:      T.text,
                  fontFamily: T.mono,
                  wordBreak:  "break-all",
                  textAlign:  isMobile ? "left" : "right",
                  maxWidth:   isMobile ? "100%" : "70%",
                }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tx hash */}
        {txHash && (
          <div style={{
            background:   T.bg,
            border:       `1px solid ${T.border}`,
            borderRadius: 2,
            padding:      isMobile ? "12px 14px" : "10px 12px",
          }}>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", marginBottom: 6 }}>TRANSACTION HASH</div>
            <div style={{
              fontSize:   isMobile ? 13 : 11,
              color:      T.amber,
              fontFamily: T.mono,
              wordBreak:  "break-all",
              lineHeight: 1.6,
            }}>
              {isMobile ? txHash : shortHash(txHash)}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(txHash)}
              style={{
                marginTop:  8,
                background: "none",
                border:     `1px solid ${T.border}`,
                borderRadius: 1,
                color:      T.sub,
                fontSize:   10,
                fontFamily: T.mono,
                cursor:     "pointer",
                padding:    "3px 8px",
                letterSpacing: "0.06em",
              }}
            >
              COPY HASH
            </button>
          </div>
        )}

        {/* Links — vertical stack on mobile, inline row on desktop */}
        {(txHash || token?.address) && (
          <div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", marginBottom: 8 }}>LINKS</div>
            <div style={{
              display:       "flex",
              flexDirection: isMobile ? "column" : "row",
              gap:           isMobile ? 8 : 6,
              flexWrap:      "wrap",
            }}>
              {explorer && txHash && (
                <LinkButton
                  href={`${explorer.url}${txHash}`}
                  icon="🔍"
                  label={explorer.name}
                  isMobile={isMobile}
                />
              )}
              {token?.address && (
                <LinkButton
                  href={`https://dexscreener.com/search?q=${token.address}`}
                  icon="📊"
                  label="Dexscreener"
                  isMobile={isMobile}
                />
              )}
              {token?.address && (
                <LinkButton
                  href={`https://www.coingecko.com/en/coins/${token.address}`}
                  icon="🦎"
                  label="CoinGecko"
                  isMobile={isMobile}
                />
              )}
              {token?.address && (
                <LinkButton
                  href={`https://printr.money/token/${token.address}`}
                  icon="◈"
                  label="Printr"
                  isMobile={isMobile}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      {(onReset || onClose) && (
        <div style={{
          padding:    isMobile ? "12px 18px calc(12px + env(safe-area-inset-bottom))" : "12px 18px",
          borderTop:  `1px solid ${T.border}`,
          display:    "flex",
          gap:        10,
        }}>
          {onReset && (
            <button
              onClick={onReset}
              style={{
                flex:         1,
                padding:      isMobile ? "13px 16px" : "9px 14px",
                background:   T.amber,
                border:       `1px solid ${T.amber}`,
                borderRadius: 2,
                color:        "#0c0c0a",
                fontSize:     isMobile ? 13 : 12,
                fontFamily:   T.mono,
                fontWeight:   600,
                cursor:       "pointer",
                letterSpacing:"0.06em",
                minHeight:    isMobile ? 50 : 40,
              }}
            >
              DEPLOY ANOTHER
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                flex:         onReset ? 1 : undefined,
                padding:      isMobile ? "13px 16px" : "9px 14px",
                background:   "transparent",
                border:       `1px solid ${T.border}`,
                borderRadius: 2,
                color:        T.sub,
                fontSize:     isMobile ? 13 : 12,
                fontFamily:   T.mono,
                cursor:       "pointer",
                letterSpacing:"0.06em",
                minHeight:    isMobile ? 50 : 40,
              }}
            >
              CLOSE
            </button>
          )}
        </div>
      )}
    </div>
  );
}
