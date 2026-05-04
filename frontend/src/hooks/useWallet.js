import { useState, useEffect, useCallback } from "react";
import { CHAIN_NAMES } from "../theme.js";

// ─── Wallet descriptors ───────────────────────────────────────────────────────

export const WALLET_DEFS = [
  {
    id:          "metamask",
    name:        "MetaMask",
    description: "Browser extension",
    chain:       "evm",
    color:       "#E2761B",
    check:       () => typeof window !== "undefined" && !!window.ethereum?.isMetaMask,
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M21.3 2L13.2 7.9L14.7 4.3L21.3 2Z" fill="#E17726"/>
      <path d="M2.7 2L10.7 7.95L9.3 4.3L2.7 2Z" fill="#E27625"/>
      <path d="M18.4 16.5L16.2 19.9L20.8 21.2L22.2 16.6L18.4 16.5Z" fill="#E27625"/>
      <path d="M1.8 16.6L3.2 21.2L7.8 19.9L5.6 16.5L1.8 16.6Z" fill="#E27625"/>
      <path d="M7.55 10.8L6.2 12.9L10.8 13.1L10.6 8.1L7.55 10.8Z" fill="#E27625"/>
      <path d="M16.45 10.8L13.35 8.05L13.2 13.1L17.8 12.9L16.45 10.8Z" fill="#E27625"/>
      <path d="M7.8 19.9L10.5 18.55L8.15 16.65L7.8 19.9Z" fill="#E27625"/>
      <path d="M13.5 18.55L16.2 19.9L15.85 16.65L13.5 18.55Z" fill="#E27625"/>
    </svg>`,
  },
  {
    id:          "coinbase",
    name:        "Coinbase Wallet",
    description: "Coinbase browser wallet",
    chain:       "evm",
    color:       "#1652F0",
    check:       () => typeof window !== "undefined" && !!window.ethereum?.isCoinbaseWallet,
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1652F0"/>
      <path d="M12 4C7.58 4 4 7.58 4 12C4 16.42 7.58 20 12 20C16.42 20 20 16.42 20 12C20 7.58 16.42 4 12 4ZM12 9.5C10.62 9.5 9.5 10.62 9.5 12C9.5 13.38 10.62 14.5 12 14.5C13.38 14.5 14.5 13.38 14.5 12C14.5 10.62 13.38 9.5 12 9.5Z" fill="white"/>
    </svg>`,
  },
  {
    id:          "phantom",
    name:        "Phantom",
    description: "Solana wallet",
    chain:       "solana",
    color:       "#AB9FF2",
    check:       () => typeof window !== "undefined" && !!window.solana?.isPhantom,
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#AB9FF2"/>
      <path d="M19.9 12.1C19.9 15.96 16.96 19.1 12.4 19.1H7.5C7.18 19.1 6.9 18.9 6.8 18.6L5 13.5C4.9 13.2 5.1 12.9 5.4 12.9H7.2C7.5 12.9 7.76 12.68 7.8 12.38C8.2 9.58 10.6 7.5 13.5 7.5C16.9 7.5 19.9 9.5 19.9 12.1Z" fill="white"/>
    </svg>`,
  },
  {
    id:          "browser",
    name:        "Browser Wallet",
    description: "Any injected provider",
    chain:       "evm",
    color:       "#c8a96e",
    check:       () => typeof window !== "undefined" && !!window.ethereum && !window.ethereum.isMetaMask && !window.ethereum.isCoinbaseWallet,
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#c8a96e" stroke-width="1.5"/>
      <path d="M12 3C12 3 9 7 9 12C9 17 12 21 12 21" stroke="#c8a96e" stroke-width="1.5"/>
      <path d="M12 3C12 3 15 7 15 12C15 17 12 21 12 21" stroke="#c8a96e" stroke-width="1.5"/>
      <path d="M3 12H21" stroke="#c8a96e" stroke-width="1.5"/>
    </svg>`,
  },
  {
    id:          "walletconnect",
    name:        "WalletConnect",
    description: "Scan QR with mobile wallet",
    chain:       "evm",
    color:       "#3B99FC",
    check:       () => true,
    iconSvg: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#3B99FC"/>
      <path d="M7.5 10C9.98 7.52 14.02 7.52 16.5 10L16.82 10.32C16.95 10.45 16.95 10.66 16.82 10.79L15.82 11.79C15.76 11.85 15.66 11.85 15.6 11.79L15.16 11.35C13.43 9.62 10.57 9.62 8.84 11.35L8.37 11.82C8.31 11.88 8.21 11.88 8.15 11.82L7.15 10.82C7.02 10.69 7.02 10.48 7.15 10.35L7.5 10ZM18.58 11.7L19.47 12.59C19.6 12.72 19.6 12.93 19.47 13.06L15.35 17.18C15.22 17.31 15.01 17.31 14.88 17.18L12 14.3L9.12 17.18C8.99 17.31 8.78 17.31 8.65 17.18L4.53 13.06C4.4 12.93 4.4 12.72 4.53 12.59L5.42 11.7C5.55 11.57 5.76 11.57 5.89 11.7L8.77 14.58L11.65 11.7C11.78 11.57 11.99 11.57 12.12 11.7L15 14.58L17.88 11.7C18.01 11.57 18.22 11.57 18.35 11.7L18.58 11.7Z" fill="white"/>
    </svg>`,
  },
];

// ─── Wallet connection logic ──────────────────────────────────────────────────

async function connectEvm(provider) {
  const accounts  = await provider.request({ method: "eth_requestAccounts" });
  const chainHex  = await provider.request({ method: "eth_chainId" });
  const balHex    = await provider.request({
    method: "eth_getBalance",
    params: [accounts[0], "latest"],
  });
  return {
    address: accounts[0],
    chainId: parseInt(chainHex, 16),
    balance: (parseInt(balHex, 16) / 1e18).toFixed(4),
    chain:   "evm",
  };
}

async function connectSolana(provider) {
  const resp = await provider.connect();
  const addr = resp.publicKey.toString();
  return {
    address: addr,
    chainId: null,
    balance: null,
    chain:   "solana",
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useWallet() {
  const [address,    setAddress]    = useState(null);
  const [chainId,    setChainId]    = useState(null);
  const [balance,    setBalance]    = useState(null);
  const [walletId,   setWalletId]   = useState(null);
  const [chain,      setChain]      = useState(null); // "evm" | "solana"
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState(null);

  const disconnect = useCallback(() => {
    setAddress(null);
    setChainId(null);
    setBalance(null);
    setWalletId(null);
    setChain(null);
    if (window.solana?.isPhantom) {
      window.solana.disconnect().catch(() => {});
    }
  }, []);

  const connect = useCallback(async (wId) => {
    setConnecting(true);
    setError(null);

    const def = WALLET_DEFS.find(w => w.id === wId);
    if (!def) { setError("Unknown wallet."); setConnecting(false); return; }

    try {
      let result;

      if (wId === "walletconnect") {
        setError("WalletConnect requires a project ID. Configure @walletconnect/modal in production.");
        setConnecting(false);
        return;
      }

      if (def.chain === "solana") {
        if (!window.solana?.isPhantom) throw new Error("Phantom not found. Install Phantom wallet.");
        result = await connectSolana(window.solana);
      } else {
        if (!window.ethereum) throw new Error("No EVM wallet found. Install MetaMask.");
        result = await connectEvm(window.ethereum);
      }

      setAddress(result.address);
      setChainId(result.chainId);
      setBalance(result.balance);
      setWalletId(wId);
      setChain(result.chain);
    } catch (e) {
      setError(e.message ?? "Connection failed.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const signAndSend = useCallback(async (txParams) => {
    if (!address) throw new Error("Wallet not connected.");
    if (chain === "solana") throw new Error("Use Phantom directly for Solana transactions.");
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{ from: address, ...txParams }],
    });
    return txHash;
  }, [address, chain]);

  // Sign a Printr payload: { to, calldata, value, gas_limit }
  const signEvmPayload = useCallback(async ({ to, calldata, value, gas_limit }) => {
    if (!address) throw new Error("Wallet not connected.");
    if (chain !== "evm") throw new Error("EVM wallet required for this transaction.");
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from:  address,
        to,
        data:  calldata,
        value: value != null ? `0x${BigInt(value).toString(16)}` : "0x0",
        ...(gas_limit != null && { gas: `0x${BigInt(gas_limit).toString(16)}` }),
      }],
    });
    return txHash;
  }, [address, chain]);

  // Listen for external account/chain changes (EVM only)
  useEffect(() => {
    if (!window.ethereum) return;
    const onAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else setAddress(accounts[0]);
    };
    const onChain = (hex) => setChainId(parseInt(hex, 16));
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", onAccounts);
      window.ethereum.removeListener("chainChanged", onChain);
    };
  }, [disconnect]);

  // Restore existing session silently (no popup)
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(accounts => {
      if (!accounts.length) return;
      window.ethereum.request({ method: "eth_chainId" }).then(hex => {
        setAddress(accounts[0]);
        setChainId(parseInt(hex, 16));
        setChain("evm");
        setWalletId(window.ethereum.isMetaMask ? "metamask" : window.ethereum.isCoinbaseWallet ? "coinbase" : "browser");
      });
    }).catch(() => {});

    if (window.solana?.isPhantom) {
      window.solana.connect({ onlyIfTrusted: true }).then(resp => {
        setAddress(resp.publicKey.toString());
        setChain("solana");
        setWalletId("phantom");
      }).catch(() => {});
    }
  }, []);

  const chainName = chainId ? (CHAIN_NAMES[chainId] ?? `Chain ${chainId}`) : null;
  const caip2     = chainId ? `eip155:${chainId}` : null;

  return {
    address,
    chainId,
    chainName,
    caip2,
    balance,
    walletId,
    chain,
    connecting,
    error,
    connect,
    disconnect,
    signAndSend,
    signEvmPayload,
    isConnected: !!address,
    wallets: WALLET_DEFS,
  };
}
