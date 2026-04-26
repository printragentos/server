import { useState, useCallback } from "react";
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
  { value: "eip155:8453",     label: "Base (EVM)"          },
  { value: "eip155:1",        label: "Ethereum (EVM)"      },
  { value: "eip155:42161",    label: "Arbitrum (EVM)"      },
  { value: "eip155:137",      label: "Polygon (EVM)"       },
  { value: "solana:mainnet",  label: "Solana"              },
];

function Field({ label, children, hint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 500, color: T.sub, textTransform: "uppercase", letterSpacing: "0.12em" }}>
        {label}
      </label>
      {children}
      {hint && (
        <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.03em" }}>{hint}</div>
      )}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, disabled, multiline, rows = 3 }) {
  const base = {
    background:  T.card,
    border:      `1px solid ${T.border}`,
    borderRadius: 2,
    padding:     "10px 13px",
    color:       T.text,
    fontSize:    13,
    fontFamily:  T.mono,
    width:       "100%",
    lineHeight:  1.6,
    resize:      multiline ? "vertical" : "none",
    transition:  "border-color .12s",
    minHeight:   44,
  };
  return multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} disabled={disabled} style={base} />
    : <input    value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={base} />;
}

function SelectInput({ value, onChange, options, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background:  T.card,
        border:      `1px solid ${T.border}`,
        borderRadius: 2,
        padding:     "10px 13px",
        color:       T.text,
        fontSize:    13,
        fontFamily:  T.mono,
        width:       "100%",
        cursor:      disabled ? "not-allowed" : "pointer",
        minHeight:   44,
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DeployTokenForm({ wallet, isMobile = false }) {
  const [name,        setName]        = useState("");
  const [symbol,      setSymbol]      = useState("");
  const [chain,       setChain]       = useState("eip155:8453");
  const [description, setDescription] = useState("");
  const [imageUrl,    setImageUrl]    = useState("");
  const [website,     setWebsite]     = useState("");
  const [twitter,     setTwitter]     = useState("");

  const [quote,       setQuote]       = useState(null);
  const [quoting,     setQuoting]     = useState(false);
  const [quoteErr,    setQuoteErr]    = useState(null);
  const [confirming,  setConfirming]  = useState(false);
  const [deploying,   setDeploying]   = useState(false);
  const [result,      setResult]      = useState(null);

  const validate = () => {
    if (!name.trim())   return "Token name is required.";
    if (!symbol.trim()) return "Token symbol is required.";
    return null;
  };

  const getQuote = useCallback(async () => {
    const err = validate();
    if (err) { setQuoteErr(err); return; }
    setQuoting(true);
    setQuoteErr(null);
    try {
      const data = await apiFetch("/printr/quote", {
        method: "POST",
        body: {
          name:   name.trim(),
          symbol: symbol.trim().toUpperCase(),
          chain,
        },
      });
      setQuote(data);
      setConfirming(true);
    } catch (e) {
      setQuoteErr(e.message);
    } finally {
      setQuoting(false);
    }
  }, [name, symbol, chain]);

  const deploy = useCallback(async () => {
    setDeploying(true);
    try {
      const payload = {
        name:        name.trim(),
        symbol:      symbol.trim().toUpperCase(),
        chain,
        description: description.trim() || undefined,
        imageUrl:    imageUrl.trim()    || undefined,
        socials:     {
          website: website.trim() || undefined,
          twitter: twitter.trim() || undefined,
        },
      };

      // If wallet connected, add deployer address
      if (wallet?.isConnected) {
        payload.deployer = wallet.address;
      }

      const data = await apiFetch("/printr/token", { method: "POST", body: payload });

      setResult({
        status: "success",
        txHash: data.txHash ?? data.transaction?.hash ?? null,
        chainId: chain.startsWith("solana") ? null : parseInt(chain.split(":")[1]),
        token: {
          name:    name.trim(),
          symbol:  symbol.trim().toUpperCase(),
          address: data.tokenAddress ?? data.address ?? null,
          chain,
        },
      });
      setConfirming(false);
    } catch (e) {
      setResult({ status: "error", error: e.message });
      setConfirming(false);
    } finally {
      setDeploying(false);
    }
  }, [name, symbol, chain, description, imageUrl, website, twitter, wallet]);

  const reset = () => {
    setName(""); setSymbol(""); setChain("eip155:8453");
    setDescription(""); setImageUrl(""); setWebsite(""); setTwitter("");
    setQuote(null); setQuoteErr(null); setResult(null);
    setConfirming(false);
  };

  // Show result
  if (result) {
    return (
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
    );
  }

  // Form
  // Responsive grid: 2 columns on desktop, 1 column on mobile
  const twoCol = {
    display:             "grid",
    gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
    gap:                 isMobile ? 14 : 12,
  };

  return (
    <>
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
            Deploy an omni-chain token via Printr. Review cost before confirming.
          </div>
        </div>

        {/* Wallet status banner */}
        {!wallet?.isConnected && (
          <div style={{
            padding:    isMobile ? "12px 14px" : "10px 13px",
            background: T.yellow + "08",
            border:     `1px solid ${T.yellow}25`,
            borderRadius: 2,
            fontSize:   isMobile ? 13 : 11,
            color:      T.yellow,
            lineHeight: 1.7,
          }}>
            !  Connect a wallet to sign the deployment transaction.
          </div>
        )}

        {/* Section: Token basics */}
        <div>
          <div style={{ fontSize: 10, color: T.sub, letterSpacing: "0.14em", marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
            TOKEN BASICS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 14 : 12 }}>
            <div style={twoCol}>
              <Field label="TOKEN NAME *">
                <TextInput value={name} onChange={setName} placeholder="e.g. My Token" disabled={quoting} />
              </Field>
              <Field label="SYMBOL *" hint="3–5 characters recommended">
                <TextInput
                  value={symbol}
                  onChange={v => setSymbol(v.toUpperCase().slice(0, 8))}
                  placeholder="e.g. MTK"
                  disabled={quoting}
                />
              </Field>
            </div>

            <Field label="CHAIN">
              <SelectInput value={chain} onChange={setChain} options={CHAIN_OPTIONS} disabled={quoting} />
            </Field>

            <Field label="DESCRIPTION (OPTIONAL)">
              <TextInput value={description} onChange={setDescription} placeholder="Describe your token…" multiline rows={isMobile ? 4 : 3} disabled={quoting} />
            </Field>
          </div>
        </div>

        {/* Section: Media + socials */}
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

        {/* Error */}
        {quoteErr && (
          <div style={{
            padding:    "10px 13px",
            background: T.red + "0a",
            border:     `1px solid ${T.red}30`,
            borderRadius: 2,
            fontSize:   isMobile ? 13 : 11,
            color:      T.red,
            lineHeight: 1.6,
          }}>
            ×  {quoteErr}
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={getQuote}
          disabled={quoting || !name.trim() || !symbol.trim()}
          style={{
            padding:      isMobile ? "15px 20px" : "11px 20px",
            background:   quoting || !name.trim() || !symbol.trim() ? T.amberGlow : T.amber,
            border:       `1px solid ${T.amber}`,
            borderRadius: 2,
            color:        quoting || !name.trim() || !symbol.trim() ? T.amber : "#0c0c0a",
            fontSize:     isMobile ? 14 : 12,
            fontFamily:   T.mono,
            fontWeight:   600,
            cursor:       quoting || !name.trim() || !symbol.trim() ? "not-allowed" : "pointer",
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            gap:          8,
            letterSpacing:"0.06em",
            minHeight:    isMobile ? 52 : 42,
            transition:   "background .12s",
            width:        isMobile ? "100%" : "auto",
            alignSelf:    isMobile ? "stretch" : "flex-start",
          }}
        >
          {quoting ? (
            <>
              <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${T.amber}30`, borderTopColor: T.amber, animation: "spin .6s linear infinite", flexShrink: 0 }} />
              GETTING QUOTE…
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 2V14M2 8H14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              GET QUOTE & DEPLOY
            </>
          )}
        </button>
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <ConfirmActionModal
          title="DEPLOY TOKEN"
          summary={`You are deploying ${name.trim()} (${symbol.trim().toUpperCase()}) on ${CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain}.`}
          details={[
            { label: "Token Name",   value: name.trim() },
            { label: "Symbol",       value: symbol.trim().toUpperCase() },
            { label: "Chain",        value: CHAIN_OPTIONS.find(c => c.value === chain)?.label ?? chain },
            quote?.cost && { label: "Estimated Cost", value: `${quote.cost} ${quote.currency ?? ""}` },
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
    </>
  );
}
