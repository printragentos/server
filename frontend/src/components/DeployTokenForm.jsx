import { useState, useCallback, useEffect } from "react";
import { T } from "../theme.js";
import { ConfirmActionModal } from "./ConfirmActionModal.jsx";
import { TransactionResult } from "./TransactionResult.jsx";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new Error(`Server error (${res.status})`);
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error ?? d.message ?? `HTTP ${res.status}`);
  return d;
}

const CHAIN_OPTIONS = [
  { value: "eip155:8453",    label: "Base (EVM)"     },
  { value: "eip155:1",       label: "Ethereum (EVM)" },
  { value: "eip155:42161",   label: "Arbitrum (EVM)" },
  { value: "eip155:137",     label: "Polygon (EVM)"  },
  { value: "solana:mainnet", label: "Solana"         },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 10, fontWeight: 500, color: T.sub,
        textTransform: "uppercase", letterSpacing: "0.12em",
      }}>
        {label}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.03em" }}>{hint}</div>}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled, multiline, rows = 3, type = "text" }) {
  const base = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 2,
    padding: "10px 13px", color: T.text, fontSize: 13, fontFamily: T.mono,
    width: "100%", lineHeight: 1.6, resize: multiline ? "vertical" : "none",
    transition: "border-color .12s", minHeight: 44,
    opacity: disabled ? 0.55 : 1,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} style={base} />
    : <input    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} type={type} style={base} />;
}

function SelectInput({ value, onChange, options, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: T.card, border: `1px solid ${T.border}`, borderRadius: 2,
        padding: "10px 13px", color: T.text, fontSize: 13, fontFamily: T.mono,
        width: "100%", cursor: disabled ? "not-allowed" : "pointer", minHeight: 44,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Quote result card (shown inline after successful quote fetch) ─────────────

function QuoteCard({ quote, name, symbol, chain, supply, onEdit, onConfirm, deploying, deployLabel, walletMissing, networkMismatch, isMobile }) {
  const chainLabel = CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%", background: T.green,
          boxShadow: `0 0 6px ${T.green}80`, flexShrink: 0,
        }} />
        <span style={{ fontSize: isMobile ? 13 : 12, fontWeight: 600, color: T.green, letterSpacing: "0.08em" }}>
          QUOTE RECEIVED
        </span>
      </div>

      {/* Details table */}
      <div style={{
        background: T.bg, border: `1px solid ${T.borderL}`, borderTop: `2px solid ${T.amber}`,
        borderRadius: 2, overflow: "hidden",
      }}>
        {[
          ["Token Name",     name],
          ["Symbol",         symbol],
          ["Chain",          chainLabel],
          ["Supply %",       `${supply}%`],
          quote?.cost != null && ["Estimated Cost", `${quote.cost} ${quote.currency ?? ""}`.trim()],
          quote?.fee  != null && ["Protocol Fee",   `${quote.fee}  ${quote.feeCurrency ?? ""}`.trim()],
          quote?.ttl  != null && ["Quote Expires",  `${quote.ttl}s`],
        ].filter(Boolean).map(([label, value], i, arr) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            gap: 12, padding: isMobile ? "12px 14px" : "9px 13px",
            borderBottom: i < arr.length - 1 ? `1px solid ${T.rule}` : "none",
          }}>
            <span style={{ fontSize: 10, color: T.muted, letterSpacing: "0.1em", flexShrink: 0 }}>{label}</span>
            <span style={{
              fontSize: isMobile ? 13 : 12, color: T.text, fontFamily: T.mono,
              textAlign: "right", wordBreak: "break-all",
            }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Wallet missing — must connect before deploy */}
      {walletMissing && (
        <div style={{
          padding: isMobile ? "11px 14px" : "9px 12px",
          background: T.red + "0a", border: `1px solid ${T.red}30`, borderRadius: 2,
          fontSize: isMobile ? 13 : 11, color: T.red, lineHeight: 1.7,
          display: "flex", gap: 7,
        }}>
          <span style={{ flexShrink: 0 }}>×</span>
          Connect a wallet before deploying — <code style={{ fontFamily: T.mono }}>creator_address</code> is required.
        </div>
      )}

      {/* Network mismatch — wallet on wrong chain */}
      {!walletMissing && networkMismatch && (
        <div style={{
          padding: isMobile ? "11px 14px" : "9px 12px",
          background: T.red + "0a", border: `1px solid ${T.red}30`, borderRadius: 2,
          fontSize: isMobile ? 13 : 11, color: T.red, lineHeight: 1.7,
          display: "flex", gap: 7,
        }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          Your wallet is on the wrong network. Switch to{" "}
          <strong>{CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain}</strong>{" "}
          in your wallet before deploying.
        </div>
      )}

      {/* On-chain warning */}
      <div style={{
        padding: isMobile ? "11px 14px" : "9px 12px",
        background: T.yellow + "08", border: `1px solid ${T.yellow}25`, borderRadius: 2,
        fontSize: isMobile ? 13 : 11, color: T.yellow, lineHeight: 1.7,
        display: "flex", gap: 7,
      }}>
        <span style={{ flexShrink: 0 }}>!</span>
        This transaction will be submitted on-chain and cannot be reversed.
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
        <button
          onClick={onEdit}
          disabled={deploying}
          style={{
            flex: isMobile ? undefined : 1,
            padding: isMobile ? "13px 16px" : "10px 14px",
            background: "transparent", border: `1px solid ${T.border}`, borderRadius: 2,
            color: T.sub, fontSize: isMobile ? 13 : 12, fontFamily: T.mono,
            cursor: deploying ? "not-allowed" : "pointer", opacity: deploying ? 0.4 : 1,
            letterSpacing: "0.06em", minHeight: isMobile ? 50 : 40,
          }}
        >
          ← EDIT
        </button>

        <button
          onClick={onConfirm}
          disabled={deploying || walletMissing || networkMismatch}
          style={{
            flex: isMobile ? undefined : 2,
            padding: isMobile ? "13px 16px" : "10px 14px",
            background: deploying || walletMissing || networkMismatch ? T.amberGlow : T.amber,
            border: `1px solid ${T.amber}`, borderRadius: 2,
            color: deploying || walletMissing || networkMismatch ? T.amber : "#0c0c0a",
            fontSize: isMobile ? 13 : 12, fontFamily: T.mono, fontWeight: 600,
            cursor: deploying || walletMissing || networkMismatch ? "not-allowed" : "pointer",
            letterSpacing: "0.06em", minHeight: isMobile ? 50 : 40,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          }}
        >
          {deploying ? (
            <>
              <span style={{
                width: 13, height: 13, borderRadius: "50%",
                border: `1.5px solid ${T.amber}30`, borderTopColor: T.amber,
                animation: "spin .6s linear infinite", flexShrink: 0,
              }} />
              {deployLabel ? deployLabel() : "DEPLOYING…"}
            </>
          ) : "CONFIRM & DEPLOY"}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeployTokenForm({ wallet, isMobile = false }) {
  const [name,        setName]        = useState("");
  const [symbol,      setSymbol]      = useState("");
  const [chain,       setChain]       = useState("eip155:8453");
  // FIX: supply state added — required by backend as supplyPercent
  const [supply,      setSupply]      = useState(5);
  const [description, setDescription] = useState("");
  const [imageUrl,    setImageUrl]    = useState("");
  const [website,     setWebsite]     = useState("");
  const [twitter,     setTwitter]     = useState("");

  const [quote,       setQuote]       = useState(null);   // null → no quote yet
  const [quoting,     setQuoting]     = useState(false);
  const [quoteErr,    setQuoteErr]    = useState(null);
  const [confirming,  setConfirming]  = useState(false);
  const [deploying,   setDeploying]   = useState(false);
  // "idle" | "creating" | "waiting_wallet" | "broadcasting"
  const [txStatus,    setTxStatus]    = useState("idle");
  const [result,      setResult]      = useState(null);

  // Auto-select chain when wallet connects (if no quote in progress)
  useEffect(() => {
    if (wallet?.caip2 && !quote) {
      const known = CHAIN_OPTIONS.find(c => c.value === wallet.caip2);
      if (known) setChain(wallet.caip2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.caip2]);

  // FIX: strict validation — name, symbol, chain, supply > 0
  const validate = () => {
    if (!name.trim())        return "Token name is required.";
    if (!symbol.trim())      return "Token symbol is required.";
    if (!chain)              return "Chain is required.";
    if (Number(supply) <= 0) return "Supply percent must be greater than 0.";
    return null;
  };

  // Step 1: fetch quote, show inline result — DO NOT open deploy modal yet
  const getQuote = useCallback(async () => {
    const err = validate();
    if (err) { setQuoteErr(err); return; }
    setQuoting(true);
    setQuoteErr(null);
    setQuote(null);
    try {
      // FIX: chains must be array; supplyPercent (not supply_percent); no name/symbol
      const data = await apiFetch("/printr/quote", {
        method: "POST",
        body: {
          chains:         [chain],
          supply_percent: Number(supply),  // backend expects snake_case
        },
      });
      setQuote(data);
      // Do NOT open ConfirmModal here — show quote inline first (Part 4 UX flow)
    } catch (e) {
      // FIX: surface backend error message clearly
      setQuoteErr(
        e?.message ||
        e?.response?.data?.error ||
        "Failed to get quote. Check your inputs and try again."
      );
    } finally {
      setQuoting(false);
    }
  }, [name, symbol, chain, supply]);

  // Step 2: user reviewed quote inline, now opens confirmation modal
  const openConfirm = useCallback(() => {
    setConfirming(true);
  }, []);

  // Step 3: user confirmed in modal — register token, get payload, sign with wallet
  const deploy = useCallback(async () => {
    if (!wallet?.isConnected || !wallet?.address) {
      throw new Error("Connect a wallet before deploying.");
    }

    setDeploying(true);
    setTxStatus("creating");

    try {
      // ── Phase 1: register with Printr API, get signing payload ──────────────
      const body = {
        name:            name.trim(),
        symbol:          symbol.trim().toUpperCase(),
        chains:          [chain],
        supply_percent:  Number(supply),
        creator_address: wallet.address,
        description:     description.trim() || "",
        ...(imageUrl.trim() && { image_url: imageUrl.trim() }),
        ...(website.trim()  && { website:   website.trim() }),
        ...(twitter.trim()  && { twitter:   twitter.trim() }),
      };

      const data = await apiFetch("/printr/token", { method: "POST", body });

      if (!data.payload) {
        throw new Error(
          "Server did not return a signing payload. Cannot broadcast transaction."
        );
      }

      // ── Phase 2: prompt wallet ───────────────────────────────────────────────
      setTxStatus("waiting_wallet");
      setConfirming(false);   // close modal so wallet popup is visible

      let txHash;
      try {
        txHash = await wallet.signEvmPayload(data.payload);
      } catch (walletErr) {
        const msg = walletErr?.message ?? "";
        if (walletErr?.code === 4001 || msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("denied")) {
          throw new Error("Transaction rejected in wallet.");
        }
        throw walletErr;
      }

      // ── Phase 3: confirmed → show result ────────────────────────────────────
      setTxStatus("broadcasting");

      setResult({
        status:  "success",
        txHash,
        chainId: chain.startsWith("solana") ? null : parseInt(chain.split(":")[1], 10),
        token: {
          name:    name.trim(),
          symbol:  symbol.trim().toUpperCase(),
          address: data.token_address ?? data.address ?? null,
          chain,
        },
      });
    } catch (e) {
      setResult({
        status: "error",
        error:  e?.message || "Deployment failed.",
      });
      setConfirming(false);
    } finally {
      setDeploying(false);
      setTxStatus("idle");
    }
  }, [name, symbol, chain, supply, description, imageUrl, website, twitter, wallet]);

  const reset = () => {
    setName(""); setSymbol(""); setChain("eip155:8453");
    setSupply(5);
    setDescription(""); setImageUrl(""); setWebsite(""); setTwitter("");
    setQuote(null); setQuoteErr(null); setResult(null);
    setConfirming(false); setTxStatus("idle");
  };

  // Network mismatch: wallet is on a different EVM chain than the selected chain
  const networkMismatch =
    wallet?.isConnected &&
    wallet?.caip2 &&
    !chain.startsWith("solana") &&
    wallet.caip2 !== chain;

  // Human-readable deploy status label
  const deployLabel = () => {
    if (txStatus === "creating")       return "REGISTERING…";
    if (txStatus === "waiting_wallet") return "CONFIRM IN WALLET…";
    if (txStatus === "broadcasting")   return "BROADCASTING…";
    return "DEPLOYING…";
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      // FIX: mobile scroll — use min-height + overflow-y auto, not fixed height
      <div style={{
        overflowY: "auto", overflowX: "hidden",
        // FIX: padding-bottom so content clears mobile nav bars
        paddingBottom: isMobile ? "env(safe-area-inset-bottom, 24px)" : 0,
      }}>
        <div style={{ padding: isMobile ? "16px" : "24px 28px" }}>
          <TransactionResult
            status={result.status}
            txHash={result.txHash}
            chainId={result.chainId}
            token={result.token}
            error={result.error}
            onReset={reset}
            isMobile={isMobile}
          />
        </div>
      </div>
    );
  }

  const twoCol = {
    display:             "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap:                 isMobile ? 14 : 12,
  };

  const isGetQuoteDisabled = quoting || !name.trim() || !symbol.trim() || Number(supply) <= 0;

  return (
    <>
      {/*
        FIX: mobile scroll — this wrapper must scroll, not clip.
        Remove any overflow:hidden from parent <main> when on deploy tab
        (handled in App.jsx). Here we ensure the inner container scrolls.
      */}
      <div style={{
        overflowY:     "auto",
        overflowX:     "hidden",
        height:        "100%",
        // FIX: padding-bottom keeps last element above mobile keyboard/nav
        paddingBottom: isMobile ? 32 : 0,
      }}>
        <div style={{
          padding:       isMobile ? "16px" : "24px 28px",
          maxWidth:      isMobile ? "100%" : 640,
          display:       "flex",
          flexDirection: "column",
          gap:           20,
        }}>

          {/* Title */}
          <div>
            <div style={{ fontSize: isMobile ? 16 : 13, fontWeight: 600, color: T.text, letterSpacing: "0.08em", marginBottom: 4 }}>
              DEPLOY TOKEN
            </div>
            <div style={{ fontSize: isMobile ? 13 : 11, color: T.sub, lineHeight: 1.7 }}>
              Deploy an omni-chain token via Printr.{" "}
              {quote ? "Review the quote below before confirming." : "Get a quote first, then confirm."}
            </div>
          </div>

          {/* Wallet warning */}
          {!wallet?.isConnected && (
            <div style={{
              padding: isMobile ? "12px 14px" : "10px 13px",
              background: T.yellow + "08", border: `1px solid ${T.yellow}25`, borderRadius: 2,
              fontSize: isMobile ? 13 : 11, color: T.yellow, lineHeight: 1.7,
            }}>
              !  Connect a wallet to sign the deployment transaction.
            </div>
          )}

          {/* Network mismatch warning */}
          {networkMismatch && (
            <div style={{
              padding: isMobile ? "12px 14px" : "10px 13px",
              background: T.red + "0a", border: `1px solid ${T.red}30`, borderRadius: 2,
              fontSize: isMobile ? 13 : 11, color: T.red, lineHeight: 1.7,
              display: "flex", gap: 7,
            }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>
                Wallet is on <strong>{wallet.chainName ?? wallet.caip2}</strong> but selected chain is{" "}
                <strong>{CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain}</strong>.
                Switch your wallet network or change the chain above.
              </span>
            </div>
          )}

          {/* ── FORM FIELDS (always shown unless result) ── */}

          {/* Token basics */}
          <div>
            <div style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
              TOKEN BASICS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 12 }}>
              <div style={twoCol}>
                <Field label="TOKEN NAME *">
                  <TextInput value={name} onChange={setName} placeholder="e.g. My Token" disabled={quoting || !!quote} />
                </Field>
                <Field label="SYMBOL *" hint="3–5 characters recommended">
                  <TextInput
                    value={symbol}
                    onChange={v => setSymbol(v.toUpperCase().slice(0, 8))}
                    placeholder="e.g. MTK"
                    disabled={quoting || !!quote}
                  />
                </Field>
              </div>

              <div style={twoCol}>
                <Field label="CHAIN *">
                  <SelectInput value={chain} onChange={v => { setChain(v); setQuote(null); }} options={CHAIN_OPTIONS} disabled={quoting || !!quote} />
                </Field>
                {/* FIX: supply percent field added */}
                <Field label="SUPPLY %" hint="Percentage of total supply (1–100)">
                  <TextInput
                    value={String(supply)}
                    onChange={v => {
                      const n = parseInt(v, 10);
                      setSupply(isNaN(n) ? "" : Math.min(100, Math.max(0, n)));
                      setQuote(null);
                    }}
                    placeholder="5"
                    type="number"
                    disabled={quoting || !!quote}
                  />
                </Field>
              </div>

              <Field label="DESCRIPTION (OPTIONAL)">
                <TextInput value={description} onChange={setDescription} placeholder="Describe your token…" multiline rows={isMobile ? 4 : 3} disabled={quoting} />
              </Field>
            </div>
          </div>

          {/* Media + socials */}
          <div>
            <div style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
              MEDIA & SOCIALS (OPTIONAL)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 12 }}>
              <Field label="IMAGE URL">
                <TextInput value={imageUrl} onChange={setImageUrl} placeholder="https://…" disabled={quoting} />
              </Field>
              <div style={twoCol}>
                <Field label="WEBSITE">
                  <TextInput value={website} onChange={setWebsite} placeholder="https://…" disabled={quoting} />
                </Field>
                <Field label="TWITTER / X">
                  <TextInput value={twitter} onChange={setTwitter} placeholder="@handle" disabled={quoting} />
                </Field>
              </div>
            </div>
          </div>

          {/* FIX: error rendered clearly with full message */}
          {quoteErr && (
            <div style={{
              padding: "11px 14px",
              background: T.red + "0a", border: `1px solid ${T.red}30`, borderRadius: 2,
              fontSize: isMobile ? 13 : 11, color: T.red, lineHeight: 1.6,
              display: "flex", gap: 8, alignItems: "flex-start",
            }}>
              <span style={{ flexShrink: 0, marginTop: 1 }}>×</span>
              <span>{quoteErr}</span>
            </div>
          )}

          {/*
            FIX UX FLOW (Part 4):
            - If no quote yet → show "Get Quote" button
            - If quote exists → show QuoteCard inline, which has "← Edit" + "Confirm & Deploy"
            - "Confirm & Deploy" opens ConfirmActionModal (not auto)
          */}
          {!quote ? (
            <button
              onClick={getQuote}
              disabled={isGetQuoteDisabled}
              style={{
                padding:       isMobile ? "15px 20px" : "11px 20px",
                background:    isGetQuoteDisabled ? T.amberGlow : T.amber,
                border:        `1px solid ${T.amber}`,
                borderRadius:  2,
                color:         isGetQuoteDisabled ? T.amber : "#0c0c0a",
                fontSize:      isMobile ? 14 : 12,
                fontFamily:    T.mono,
                fontWeight:    600,
                cursor:        isGetQuoteDisabled ? "not-allowed" : "pointer",
                display:       "flex",
                alignItems:    "center",
                justifyContent:"center",
                gap:           8,
                letterSpacing: "0.06em",
                minHeight:     isMobile ? 52 : 42,
                transition:    "background .12s",
                width:         isMobile ? "100%" : "auto",
                alignSelf:     isMobile ? "stretch" : "flex-start",
              }}
            >
              {quoting ? (
                <>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${T.amber}30`, borderTopColor: T.amber, animation: "spin .6s linear infinite", flexShrink: 0 }} />
                  GETTING QUOTE…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  GET QUOTE
                </>
              )}
            </button>
          ) : (
            /* FIX: inline quote result — user sees cost before deploy modal opens */
            <QuoteCard
              quote={quote}
              name={name.trim()}
              symbol={symbol.trim().toUpperCase()}
              chain={chain}
              supply={supply}
              onEdit={() => setQuote(null)}
              onConfirm={openConfirm}
              deploying={deploying}
              deployLabel={deployLabel}
              walletMissing={!wallet?.isConnected}
              networkMismatch={networkMismatch}
              isMobile={isMobile}
            />
          )}
        </div>
      </div>

      {/* Confirmation modal — only reachable after reviewing quote */}
      {confirming && (
        <ConfirmActionModal
          title="DEPLOY TOKEN"
          summary={`Deploying ${name.trim()} (${symbol.trim().toUpperCase()}) on ${CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain}.`}
          details={[
            { label: "Token Name",     value: name.trim() },
            { label: "Symbol",         value: symbol.trim().toUpperCase() },
            { label: "Chain",          value: CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain },
            { label: "Supply %",       value: `${supply}%` },
            quote?.cost != null && { label: "Estimated Cost", value: `${quote.cost} ${quote.currency ?? ""}`.trim() },
          ].filter(Boolean)}
          warning="This transaction will be submitted on-chain and cannot be reversed."
          confirmText="DEPLOY"
          cancelText="CANCEL"
          onConfirm={deploy}
          onCancel={() => setConfirming(false)}
          busy={deploying}
          isMobile={isMobile}
        />
      )}

      {/* Wallet-waiting overlay — shown after modal closes, before wallet popup resolves */}
      {txStatus === "waiting_wallet" && (
        <div style={{
          position:       "fixed",
          inset:          0,
          background:     "rgba(10,10,8,.78)",
          zIndex:         600,
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          backdropFilter: "blur(3px)",
        }}>
          <div style={{
            background:   "#111110",
            border:       `1px solid ${T.amber}40`,
            borderTop:    `2px solid ${T.amber}`,
            borderRadius: 2,
            padding:      "28px 32px",
            display:      "flex",
            flexDirection:"column",
            alignItems:   "center",
            gap:          16,
            maxWidth:     320,
            width:        "90%",
            textAlign:    "center",
          }}>
            <span style={{
              width: 32, height: 32,
              borderRadius: "50%",
              border: `2px solid ${T.amber}25`,
              borderTopColor: T.amber,
              animation: "spin .7s linear infinite",
              flexShrink: 0,
            }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, letterSpacing: "0.08em", marginBottom: 6 }}>
                CONFIRM IN WALLET
              </div>
              <div style={{ fontSize: 11, color: T.sub, lineHeight: 1.7 }}>
                Check your wallet extension or app and approve the transaction.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
