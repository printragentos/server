/**
 * Printr Agent OS — server.js  (v3 · FINAL)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fastify · Printr REST API (quote / create / track) · Printr MCP
 * Anthropic agentic loop · EVM (viem) · Solana (@solana/web3.js)
 * Scheduling (node-cron) · Inbound & Outbound Webhooks · Multi-agent Pipelines
 * On-chain auto-sign: EVM + SVM payload submission
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config";
import Fastify          from "fastify";
import cors             from "@fastify/cors";
import staticFiles      from "@fastify/static";
import { existsSync }   from "fs";
import { resolve }      from "path";
import { fileURLToPath } from "url";
import Anthropic        from "@anthropic-ai/sdk";
import { Client }       from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createPublicClient, createWalletClient, http,
  formatEther, parseEther,
} from "viem";
import { privateKeyToAccount }  from "viem/accounts";
import { base, mainnet, sepolia, baseSepolia, polygon, arbitrum } from "viem/chains";
import {
  Connection, PublicKey, Keypair, SystemProgram,
  Transaction, TransactionInstruction, LAMPORTS_PER_SOL, sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58             from "bs58";
import cron             from "node-cron";
import { EventEmitter } from "events";
import { v4 as uuid }   from "uuid";

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT         = parseInt(process.env.PORT ?? "3001");
const IS_DEV       = process.env.NODE_ENV !== "production";
const ai           = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PRINTR_REST  = process.env.PRINTR_REST_URL ?? "https://api-preview.printr.money/v0";
const PRINTR_KEY   = process.env.PRINTR_API_KEY  ?? "";

// Minimal 1×1 transparent PNG (base64) — used as image placeholder when none provided
const PLACEHOLDER_IMAGE = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ─── Printr REST API client ───────────────────────────────────────────────────
//
// All endpoints on https://api-preview.printr.money/v0
// Auth: Bearer JWT stored in PRINTR_API_KEY
// Docs: https://printr.money/docs

/**
 * Generic Printr REST fetch.
 * Throws with a descriptive error on non-2xx responses.
 */
async function printrFetch(method, path, body) {
  if (!PRINTR_KEY) throw new Error("PRINTR_API_KEY is not configured.");

  const res = await fetch(`${PRINTR_REST}${path}`, {
    method,
    headers: {
      "Content-Type":  "application/json",
      Authorization:   `Bearer ${PRINTR_KEY}`,
    },
    body:   body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data?.error?.message ?? data?.error?.code ?? `HTTP ${res.status}`;
    throw new Error(`Printr API error: ${msg}`);
  }

  return data;
}

/**
 * POST /print/quote
 * Get cost estimate before creating a token.
 *
 * @param {string[]} chains              CAIP-2 chain IDs, first = home chain
 * @param {number}   supplyPercent       0.01–69
 * @param {object}   [opts]
 * @param {number}   [opts.graduationThresholdUsd]  defaults $69,000
 */
async function printrGetQuote(chains, supplyPercent, opts = {}) {
  const body = {
    chains,
    initial_buy: { supply_percent: supplyPercent },
  };
  if (opts.graduationThresholdUsd) body.graduation_threshold_per_chain_usd = opts.graduationThresholdUsd;
  if (opts.feeSink)                body.fee_sink = opts.feeSink;
  return printrFetch("POST", "/print/quote", body);
}

/**
 * POST /print
 * Register token in Printr's catalog and get the on-chain payload to sign.
 * Returns { token_id, payload, quote }
 *
 * payload is either:
 *   EVM: { to (CAIP-10), calldata (base64), value, gas_limit }
 *   SVM: { ixs, mint_address (CAIP-10), lookup_table }
 */
async function printrCreateToken(params) {
  const {
    name, symbol, description, image,
    chains, creatorAccounts,
    supplyPercent,
    graduationThresholdUsd,
    feeSink,
    externalLinks,
    customFees,
  } = params;

  const body = {
    name,
    symbol,
    description,
    image:           image ?? PLACEHOLDER_IMAGE,
    chains,
    creator_accounts: creatorAccounts,
    initial_buy:     { supply_percent: supplyPercent },
  };

  if (graduationThresholdUsd) body.graduation_threshold_per_chain_usd = graduationThresholdUsd;
  if (feeSink)                body.fee_sink = feeSink;
  if (externalLinks)          body.external_links = externalLinks;
  if (customFees)             body.custom_fees = customFees;

  return printrFetch("POST", "/print", body);
}

/**
 * GET /tokens/:id
 * Get full token metadata.
 * id = Printr token ID (hex) or CAIP-10 contract address
 */
async function printrGetToken(id) {
  return printrFetch("GET", `/tokens/${encodeURIComponent(id)}`);
}

/**
 * GET /tokens/:id/deployments
 * Track real-time deployment status across all chains.
 * States: pending → deploying → live | failed
 */
async function printrGetDeployments(id) {
  return printrFetch("GET", `/tokens/${encodeURIComponent(id)}/deployments`);
}

// ─── MCP ──────────────────────────────────────────────────────────────────────

let _mcpClient = null;
let _mcpCache  = null;

async function getMcpClient() {
  if (_mcpClient) return _mcpClient;
  const url = process.env.PRINTR_MCP_URL ?? "https://mcp.printr.fi";
  if (!PRINTR_KEY) throw new Error("PRINTR_API_KEY not set");

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${PRINTR_KEY}`, "Content-Type": "application/json" },
    },
  });

  _mcpClient = new Client({ name: "printr-agent-os", version: "3.0.0" }, { capabilities: { tools: {} } });
  try {
    await _mcpClient.connect(transport);
  } catch (e) {
    _mcpClient = null;
    _mcpCache  = null;
    throw new Error(`Printr MCP connection failed: ${e.message}`);
  }
  return _mcpClient;
}

function resetMcpClient() {
  try { _mcpClient?.close?.(); } catch {}
  _mcpClient = null;
  _mcpCache  = null;
}

async function listMcpTools() {
  if (_mcpCache) return _mcpCache;
  _mcpCache = ((await (await getMcpClient()).listTools()).tools ?? []);
  return _mcpCache;
}

async function callMcpTool(name, args) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await (await getMcpClient()).callTool({ name, arguments: args });
      if (res.isError) throw new Error(res.content?.map(x => x.text).join(" ") ?? "MCP error");
      return res.content?.map(x => x.text ?? "").join("\n") ?? "";
    } catch (e) {
      const isConn = e.message.includes("connection") || e.message.includes("closed") || e.message.includes("ECONNRESET");
      if (attempt === 1 && isConn) { resetMcpClient(); continue; }
      throw e;
    }
  }
}

// ─── EVM helpers (viem) ───────────────────────────────────────────────────────

// Map CAIP-2 reference to viem chain objects
const CAIP2_TO_CHAIN = {
  "1":     mainnet,
  "137":   polygon,
  "8453":  base,
  "42161": arbitrum,
  "11155111": sepolia,
  "84532": baseSepolia,
};

function evmChainFromCaip2(caip2) {
  // caip2 = "eip155:8453" → reference = "8453"
  const ref = caip2?.split(":")?.[1];
  return CAIP2_TO_CHAIN[ref] ?? evmChainFromRpc();
}

function evmChainFromRpc() {
  const rpc = (process.env.RPC_URL ?? "").toLowerCase();
  if (rpc.includes("base") && rpc.includes("sepolia")) return baseSepolia;
  if (rpc.includes("sepolia")) return sepolia;
  if (rpc.includes("base"))    return base;
  if (rpc.includes("arbitrum")) return arbitrum;
  if (rpc.includes("polygon")) return polygon;
  return mainnet;
}

function evmPub(chain) {
  return createPublicClient({ chain: chain ?? evmChainFromRpc(), transport: http(process.env.RPC_URL) });
}

function evmWal(chain) {
  const raw = process.env.WALLET_PRIVATE_KEY;
  if (!raw || raw.startsWith("0x_")) throw new Error("WALLET_PRIVATE_KEY not configured");
  const pk  = raw.startsWith("0x") ? raw : `0x${raw}`;
  const acc = privateKeyToAccount(pk);
  return {
    acc,
    wc: createWalletClient({ account: acc, chain: chain ?? evmChainFromRpc(), transport: http(process.env.RPC_URL) }),
  };
}

async function evmBalance(address) {
  const raw = await evmPub().getBalance({ address });
  return { address, balance: formatEther(raw), unit: "ETH", chain: evmChainFromRpc().name };
}

async function evmSend(to, amount) {
  const { acc, wc } = evmWal();
  const hash = await wc.sendTransaction({ account: acc, to, value: parseEther(String(amount)) });
  return { txHash: hash, from: acc.address, to, amount, unit: "ETH" };
}

// ─── Solana helpers (@solana/web3.js) ─────────────────────────────────────────

function solConn() {
  return new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
}

function solKeypair() {
  const raw = process.env.SOLANA_PRIVATE_KEY;
  if (!raw || raw === "your_solana_private_key_here") throw new Error("SOLANA_PRIVATE_KEY not configured");
  const secret = raw.trim().startsWith("[") ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw);
  return Keypair.fromSecretKey(secret);
}

async function solBalance(address) {
  const lamps = await solConn().getBalance(new PublicKey(address));
  return { address, balance: (lamps / LAMPORTS_PER_SOL).toFixed(9), unit: "SOL", lamports: lamps };
}

async function solSend(to, amount) {
  const conn = solConn();
  const from = solKeypair();
  const tx   = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: new PublicKey(to), lamports: Math.floor(amount * LAMPORTS_PER_SOL) })
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [from]);
  return { signature: sig, from: from.publicKey.toBase58(), to, amount, unit: "SOL" };
}

// ─── On-chain Printr payload submission ───────────────────────────────────────
//
// After calling POST /print, Printr returns a `payload` object.
// The creator must sign and broadcast this transaction to finalize deployment.
// These helpers handle that automatically using the configured wallet keys.

/**
 * Submit an EVM Printr token-creation payload.
 * payload.to       = CAIP-10 "eip155:8453:0xabc…"
 * payload.calldata = base64 ABI-encoded calldata
 * payload.value    = wei as decimal string
 * payload.gas_limit = integer
 */
async function submitEvmPrintrPayload(payload) {
  if (!payload.calldata) throw new Error("EVM payload missing calldata");

  // Extract chain ID and address from CAIP-10 "eip155:8453:0xabc..."
  const parts    = (payload.to ?? "").split(":");
  const caip2    = parts.length >= 2 ? `${parts[0]}:${parts[1]}` : null;
  const toAddr   = parts[parts.length - 1]; // last segment = address

  const chain    = caip2 ? evmChainFromCaip2(caip2) : evmChainFromRpc();
  const { acc, wc } = evmWal(chain);

  // Base64 → hex data
  const dataHex  = ("0x" + Buffer.from(payload.calldata, "base64").toString("hex"));

  const txHash = await wc.sendTransaction({
    account: acc,
    to:      toAddr,
    data:    dataHex,
    value:   payload.value ? BigInt(payload.value) : 0n,
    gas:     payload.gas_limit ? BigInt(payload.gas_limit) : undefined,
  });

  return {
    txHash,
    from:  acc.address,
    to:    toAddr,
    chain: chain.name,
  };
}

/**
 * Submit a Solana (SVM) Printr token-creation payload.
 * payload.ixs          = array of { program_id, accounts, data(base64) }
 * payload.mint_address = CAIP-10 mint address
 * payload.lookup_table = optional address lookup table
 */
async function submitSvmPrintrPayload(payload) {
  if (!payload.ixs || payload.ixs.length === 0) throw new Error("SVM payload missing instructions");

  const conn    = solConn();
  const keypair = solKeypair();

  const instructions = payload.ixs.map(ix => new TransactionInstruction({
    programId: new PublicKey(ix.program_id),
    keys:      (ix.accounts ?? []).map(a => ({
      pubkey:     new PublicKey(a.pubkey),
      isSigner:   a.is_signer,
      isWritable: a.is_writable,
    })),
    data: Buffer.from(ix.data, "base64"),
  }));

  const tx = new Transaction();
  instructions.forEach(ix => tx.add(ix));

  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer        = keypair.publicKey;

  const sig = await sendAndConfirmTransaction(conn, tx, [keypair]);

  // Extract mint address from CAIP-10 if present
  const mintParts = (payload.mint_address ?? "").split(":");
  const mintAddr  = mintParts[mintParts.length - 1] ?? null;

  return {
    signature:   sig,
    mintAddress: mintAddr,
    from:        keypair.publicKey.toBase58(),
  };
}

// ─── Native tool definitions ──────────────────────────────────────────────────

const EVM_TOOLS = [
  {
    name:        "evm_get_balance",
    description: "Get ETH balance of any EVM address",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "EVM address (0x…)" } },
      required: ["address"],
    },
  },
  {
    name:        "evm_send_transaction",
    description: "Send ETH from the server wallet to a recipient address",
    inputSchema: {
      type: "object",
      properties: {
        to:         { type: "string", description: "Recipient EVM address" },
        amount_eth: { type: "string", description: "Amount in ETH (e.g. '0.01')" },
      },
      required: ["to", "amount_eth"],
    },
  },
];

const SOL_TOOLS = [
  {
    name:        "solana_get_balance",
    description: "Get SOL balance of a Solana address",
    inputSchema: {
      type: "object",
      properties: { address: { type: "string", description: "Solana public key (base58)" } },
      required: ["address"],
    },
  },
  {
    name:        "solana_send_sol",
    description: "Send SOL from the server wallet to a recipient address",
    inputSchema: {
      type: "object",
      properties: {
        to:         { type: "string", description: "Recipient Solana public key" },
        amount_sol: { type: "number", description: "Amount in SOL (e.g. 0.01)" },
      },
      required: ["to", "amount_sol"],
    },
  },
];

// Printr REST API tools — available on ALL agents regardless of chain
const PRINTR_TOOLS = [
  {
    name:        "printr_get_quote",
    description: "Get a cost estimate before creating a token on Printr. Shows gas fees, x-chain fees, and initial buy cost across selected chains.",
    inputSchema: {
      type: "object",
      properties: {
        chains:               { type: "array",  items: { type: "string" }, description: "CAIP-2 chain IDs. First = home chain. E.g. ['eip155:8453','eip155:1'] for Base+Ethereum, ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'] for Solana." },
        supply_percent:       { type: "number", description: "% of total supply to buy at launch (0.01–69)" },
        graduation_threshold: { type: "number", description: "Graduation threshold per chain in USD. Min $15,000. Default $69,000." },
      },
      required: ["chains", "supply_percent"],
    },
  },
  {
    name:        "printr_create_token",
    description: "Create and deploy a new omni-chain token via Printr. Registers token in Printr's catalog and returns the on-chain transaction payload. Set auto_sign:true to automatically sign and broadcast using the server wallet keys. ⚠️ Uses real funds when auto_sign is true.",
    inputSchema: {
      type: "object",
      properties: {
        name:                 { type: "string",  description: "Token name (e.g. 'My Token')" },
        symbol:               { type: "string",  description: "Token ticker (e.g. 'MTK')" },
        description:          { type: "string",  description: "Token description (1–500 chars)" },
        chains:               { type: "array",   items: { type: "string" }, description: "CAIP-2 chain IDs. First = home chain." },
        creator_address:      { type: "string",  description: "Creator wallet address (raw hex for EVM, base58 for Solana)" },
        supply_percent:       { type: "number",  description: "% of supply to buy at launch (0.01–69)" },
        auto_sign:            { type: "boolean", description: "Auto-sign and broadcast the transaction using server wallet. Default false." },
        graduation_threshold: { type: "number",  description: "Graduation threshold USD per chain. Default $69,000." },
        image_base64:         { type: "string",  description: "Base64 token image (PNG/JPEG/GIF, max 500KB, square). Optional — uses placeholder if omitted." },
        website:              { type: "string",  description: "Token website URL (optional)" },
        twitter:              { type: "string",  description: "Twitter/X handle (optional)" },
        telegram:             { type: "string",  description: "Telegram link (optional)" },
        fee_sink:             { type: "string",  enum: ["dev","stake_pool","buyback","liquidity_pool"], description: "Where fees go. Default: dev" },
      },
      required: ["name", "symbol", "description", "chains", "creator_address", "supply_percent"],
    },
  },
  {
    name:        "printr_get_token",
    description: "Get full metadata for a Printr token: name, symbol, creator, chains, bonding curve properties, graduation status.",
    inputSchema: {
      type: "object",
      properties: {
        token_id: { type: "string", description: "Printr token ID (hex string) or CAIP-10 contract address" },
      },
      required: ["token_id"],
    },
  },
  {
    name:        "printr_get_deployments",
    description: "Track real-time deployment status of a Printr token across all chains. States: pending → deploying → live | failed. Includes graduation completion % and x-chain message IDs.",
    inputSchema: {
      type: "object",
      properties: {
        token_id: { type: "string", description: "Printr token ID (hex) or CAIP-10 contract address" },
      },
      required: ["token_id"],
    },
  },
];

function nativeTools(chain) {
  // Chain-specific tools + Printr tools (always available)
  return [...(chain === "solana" ? SOL_TOOLS : EVM_TOOLS), ...PRINTR_TOOLS];
}

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {
    // EVM native
    case "evm_get_balance":
      return evmBalance(args.address);

    case "evm_send_transaction":
      return evmSend(args.to, args.amount_eth);

    // Solana native
    case "solana_get_balance":
      return solBalance(args.address);

    case "solana_send_sol":
      return solSend(args.to, args.amount_sol);

    // Printr REST — quote
    case "printr_get_quote":
      return printrGetQuote(args.chains, args.supply_percent, {
        graduationThresholdUsd: args.graduation_threshold,
      });

    // Printr REST — create token (optionally auto-sign)
    case "printr_create_token": {
      const homeChain = args.chains?.[0] ?? "";
      const namespace = homeChain.split(":")[0]; // "eip155" or "solana"

      // Build CAIP-10 creator account: "eip155:8453:0xabc..." or "solana:...:pubkey"
      const creatorAccount = `${homeChain}:${args.creator_address}`;

      const result = await printrCreateToken({
        name:                 args.name,
        symbol:               args.symbol,
        description:          args.description,
        image:                args.image_base64 ?? PLACEHOLDER_IMAGE,
        chains:               args.chains,
        creatorAccounts:      [creatorAccount],
        supplyPercent:        args.supply_percent,
        graduationThresholdUsd: args.graduation_threshold,
        feeSink:              args.fee_sink,
        externalLinks: (args.website || args.twitter || args.telegram)
          ? { website: args.website, x: args.twitter, telegram: args.telegram }
          : undefined,
      });

      // Auto-sign and broadcast if requested
      let txResult = null;
      if (args.auto_sign && result.payload) {
        if (namespace === "eip155") {
          txResult = await submitEvmPrintrPayload(result.payload);
        } else if (namespace === "solana") {
          txResult = await submitSvmPrintrPayload(result.payload);
        }
      }

      return {
        token_id:    result.token_id,
        quote:       result.quote,
        auto_signed: !!txResult,
        tx:          txResult,
        // Return payload info without exposing raw calldata bytes in logs
        payload_type: result.payload?.calldata ? "evm" : result.payload?.ixs ? "svm" : "unknown",
        message: txResult
          ? `Token registered. Transaction broadcast. Token ID: ${result.token_id}`
          : `Token registered. Sign and broadcast the payload manually. Token ID: ${result.token_id}`,
      };
    }

    // Printr REST — get token
    case "printr_get_token":
      return printrGetToken(args.token_id);

    // Printr REST — deployment status
    case "printr_get_deployments":
      return printrGetDeployments(args.token_id);

    // Fall through to MCP
    default:
      return callMcpTool(name, args);
  }
}

// ─── Agent store ──────────────────────────────────────────────────────────────

const agents = new Map();

function mkAgent({ name, chain = "evm", tools = [], config = {} }) {
  const a = {
    id:      uuid(),
    name,
    chain:   chain === "solana" ? "solana" : "evm",
    tools,
    config: {
      systemPrompt: config.systemPrompt ?? `You are ${name}, an AI agent on the ${chain.toUpperCase()} blockchain. Use your tools to complete tasks accurately and concisely.`,
      maxSteps:     config.maxSteps  ?? 10,
      model:        config.model     ?? "claude-3-5-haiku-20241022",
      webhookUrl:   config.webhookUrl ?? null,
    },
    status:    "idle",
    tasksRun:  0,
    createdAt: Date.now(),
  };
  agents.set(a.id, a);
  return a;
}

// Default seed agents
mkAgent({
  name: "EVM Scout",
  chain: "evm",
  config: { systemPrompt: "You are EVM Scout, an Ethereum/Base chain agent. Check balances, execute transfers, get token quotes, and create tokens on Printr. Always confirm costs before executing any transaction." },
});
mkAgent({
  name: "Solana Scout",
  chain: "solana",
  config: { systemPrompt: "You are Solana Scout, a Solana chain agent. Check SOL balances, execute transfers, and deploy tokens via Printr. Confirm amounts carefully before acting." },
});
mkAgent({
  name: "Token Launcher",
  chain: "evm",
  config: {
    systemPrompt: "You are Token Launcher, a multi-chain token deployment specialist powered by Printr. You help users create and deploy tokens across EVM chains and Solana. Always start by getting a quote to show costs, then deploy if the user confirms. Track deployment status until all chains are live.",
    maxSteps: 15,
  },
});

// ─── Task store + bus ─────────────────────────────────────────────────────────

const tasks   = new Map();
const taskBus = new EventEmitter();
taskBus.setMaxListeners(500);

function mkTask(agentId, input) {
  const t = { id: uuid(), agentId, input, status: "queued", logs: [], result: null, createdAt: Date.now(), updatedAt: Date.now() };
  tasks.set(t.id, t);
  return t;
}

function tLog(taskId, entry, fwd) {
  const t = tasks.get(taskId);
  if (!t) return;
  const log = { ...entry, ts: Date.now() };
  t.logs.push(log);
  t.updatedAt = Date.now();
  taskBus.emit("evt", { taskId, kind: "log", log });
  fwd?.("log", log);
}

function tStatus(taskId, status, result, fwd) {
  const t = tasks.get(taskId);
  if (!t) return;
  t.status    = status;
  t.updatedAt = Date.now();
  if (result !== undefined) t.result = result;
  taskBus.emit("evt", { taskId, kind: "status", status, result });
  fwd?.("status", status, result);
}

// ─── Pipeline store + bus ─────────────────────────────────────────────────────

const pipelines    = new Map();
const pipelineRuns = new Map();
const plBus        = new EventEmitter();
plBus.setMaxListeners(200);

function mkPipeline({ name, steps = [] }) {
  const p = {
    id:        uuid(),
    name,
    steps:     steps.map(s => ({ agentId: s.agentId, promptTemplate: s.promptTemplate ?? null })),
    createdAt: Date.now(),
  };
  pipelines.set(p.id, p);
  return p;
}

function mkPipelineRun(pipelineId, initialInput) {
  const pl = pipelines.get(pipelineId);
  const r  = {
    id:           uuid(),
    pipelineId,
    pipelineName: pl?.name ?? "?",
    initialInput,
    status:       "queued",
    steps:        (pl?.steps ?? []).map(s => ({
      agentId:   s.agentId,
      agentName: agents.get(s.agentId)?.name ?? s.agentId,
      taskId:    null,
      status:    "pending",
      output:    null,
    })),
    logs:      [],
    result:    null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  pipelineRuns.set(r.id, r);
  return r;
}

function plLog(runId, entry) {
  const r = pipelineRuns.get(runId);
  if (!r) return;
  const log = { ...entry, ts: Date.now() };
  r.logs.push(log);
  r.updatedAt = Date.now();
  plBus.emit("evt", { runId, kind: "log", log });
}

function plStatus(runId, status, result) {
  const r = pipelineRuns.get(runId);
  if (!r) return;
  r.status    = status;
  r.updatedAt = Date.now();
  if (result !== undefined) r.result = result;
  plBus.emit("evt", { runId, kind: "status", status, result });
}

// ─── Scheduler (node-cron) ────────────────────────────────────────────────────

const schedules = new Map();
const cronJobs  = new Map();

function upsertSchedule(agentId, expression, input) {
  if (!cron.validate(expression)) throw new Error(`Invalid cron expression: "${expression}"`);
  cronJobs.get(agentId)?.stop();

  const s = { agentId, expression, input, enabled: true, lastRun: null, createdAt: Date.now() };
  schedules.set(agentId, s);

  const job = cron.schedule(expression, async () => {
    const agent = agents.get(agentId);
    if (!agent || agent.status === "running") return;
    s.lastRun = Date.now();
    console.log(`[cron] Scheduled run → agent "${agent.name}"`);
    try { await runAgent(agentId, s.input); }
    catch (e) { console.error(`[cron] Error: ${e.message}`); }
  });

  cronJobs.set(agentId, job);
  return s;
}

function removeSchedule(agentId) {
  cronJobs.get(agentId)?.stop();
  cronJobs.delete(agentId);
  schedules.delete(agentId);
}

// ─── Outbound webhook dispatcher ──────────────────────────────────────────────

async function dispatchWebhook(url, payload) {
  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Printr-Agent-OS": "3" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10_000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.warn(`[webhook] Delivery failed (${url}): ${e.message}`);
    return { ok: false, error: e.message };
  }
}

// ─── Agent runner ─────────────────────────────────────────────────────────────

/**
 * runLoop — core agentic loop.
 * Loads MCP tools + native tools, calls Anthropic with tool_use, executes tools.
 * fwd(kind, ...args) — lets pipeline runners observe log/status events.
 */
async function runLoop(agent, task, userInput, fwd) {
  tStatus(task.id, "running", undefined, fwd);
  tLog(task.id, { level: "info", message: `Agent "${agent.name}" starting on ${agent.chain.toUpperCase()}` }, fwd);

  // Load MCP tools
  let mcpTools = [];
  try {
    const all = await listMcpTools();
    mcpTools  = agent.tools.length > 0 ? all.filter(t => agent.tools.includes(t.name)) : all;
    tLog(task.id, { level: "info", message: `${mcpTools.length} MCP tool(s) loaded from Printr` }, fwd);
  } catch (e) {
    tLog(task.id, { level: "warn", message: `MCP unavailable: ${e.message} — using native tools only` }, fwd);
  }

  const native   = nativeTools(agent.chain); // includes PRINTR_TOOLS
  const allTools = [...native, ...mcpTools];
  tLog(task.id, {
    level: "info",
    message: `${allTools.length} tool(s) available — ${native.filter(t => !PRINTR_TOOLS.includes(t)).length} chain native · ${PRINTR_TOOLS.length} Printr API · ${mcpTools.length} MCP`,
  }, fwd);

  const aiTools  = allTools.map(t => ({
    name:         t.name,
    description:  t.description ?? t.name,
    input_schema: t.inputSchema ?? { type: "object", properties: {} },
  }));

  const messages = [{ role: "user", content: userInput }];
  const max      = agent.config.maxSteps;
  let   steps    = 0;
  let   finalTxt = "";

  while (steps < max) {
    steps++;
    tLog(task.id, { level: "info", message: `Step ${steps}/${max} — calling model` }, fwd);

    const params = {
      model:      agent.config.model,
      max_tokens: 4096,
      system:     agent.config.systemPrompt,
      messages,
    };
    if (aiTools.length > 0) params.tools = aiTools;

    const resp = await ai.messages.create(params);

    const textBlocks = resp.content.filter(b => b.type === "text");
    if (textBlocks.length) finalTxt = textBlocks.map(b => b.text).join("\n");

    if (resp.stop_reason === "end_turn") { tLog(task.id, { level: "info", message: "Model finished." }, fwd); break; }
    if (resp.stop_reason !== "tool_use") { tLog(task.id, { level: "warn",  message: `Stop: ${resp.stop_reason}` }, fwd); break; }

    const toolUse = resp.content.filter(b => b.type === "tool_use");
    messages.push({ role: "assistant", content: resp.content });

    const results = [];
    for (const blk of toolUse) {
      tLog(task.id, { level: "tool", message: `Calling ${blk.name}`, tool: blk.name, data: blk.input }, fwd);
      let out;
      try {
        const r = await executeTool(blk.name, blk.input);
        out     = typeof r === "string" ? r : JSON.stringify(r, null, 2);
        tLog(task.id, { level: "tool_result", message: `${blk.name} succeeded`, tool: blk.name, data: out.slice(0, 500) }, fwd);
      } catch (e) {
        out = `Error: ${e.message}`;
        tLog(task.id, { level: "error", message: `${blk.name} failed: ${e.message}`, tool: blk.name }, fwd);
      }
      results.push({ type: "tool_result", tool_use_id: blk.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  if (steps >= max) tLog(task.id, { level: "warn", message: `Max steps (${max}) reached` }, fwd);

  agent.status   = "idle";
  agent.tasksRun = (agent.tasksRun ?? 0) + 1;
  tStatus(task.id, "done", { output: finalTxt, steps }, fwd);
  tLog(task.id, { level: "info", message: "Task complete." }, fwd);

  if (agent.config.webhookUrl) {
    dispatchWebhook(agent.config.webhookUrl, {
      event:     "task.completed",
      agentId:   agent.id,
      agentName: agent.name,
      taskId:    task.id,
      input:     userInput,
      output:    finalTxt,
      steps,
    });
  }
}

async function runAgent(agentId, userInput) {
  const agent = agents.get(agentId);
  if (!agent)                    throw new Error(`Agent ${agentId} not found`);
  if (agent.status === "running") throw new Error("Agent is already running a task");

  const task   = mkTask(agentId, userInput);
  agent.status = "running";

  runLoop(agent, task, userInput).catch(e => {
    tLog(task.id, { level: "error", message: e.message });
    tStatus(task.id, "error", { error: e.message });
    agent.status = "error";
  });

  return task;
}

// ─── Pipeline runner ──────────────────────────────────────────────────────────

async function runPipelineRun(runId) {
  const run = pipelineRuns.get(runId);
  const pl  = pipelines.get(run?.pipelineId);
  if (!run || !pl) return;

  plStatus(runId, "running");
  plLog(runId, { level: "info", message: `Pipeline "${pl.name}" started — ${pl.steps.length} step(s)` });

  let prevOutput = run.initialInput;

  for (let i = 0; i < pl.steps.length; i++) {
    const step  = pl.steps[i];
    const agent = agents.get(step.agentId);

    if (!agent) {
      plLog(runId, { level: "error", message: `Step ${i + 1}: Agent ${step.agentId} not found — aborting` });
      plStatus(runId, "error", { error: `Agent ${step.agentId} not found` });
      run.steps[i].status = "error";
      return;
    }

    let prompt = prevOutput;
    if (step.promptTemplate) {
      prompt = step.promptTemplate
        .replace(/\{input\}/g,       run.initialInput)
        .replace(/\{prev_output\}/g, prevOutput);
    }

    plLog(runId, { level: "info", message: `Step ${i + 1}/${pl.steps.length}: "${agent.name}"`, step: i });
    run.steps[i].status = "running";
    run.updatedAt = Date.now();

    const task   = mkTask(agent.id, prompt);
    agent.status = "running";
    run.steps[i].taskId = task.id;

    const fwd = (kind, ...args) => {
      if (kind === "log") plLog(runId, { ...args[0], step: i, agentName: agent.name });
    };

    try { await runLoop(agent, task, prompt, fwd); }
    catch (e) {
      plLog(runId, { level: "error", message: `Step ${i + 1} threw: ${e.message}`, step: i });
      agent.status        = "error";
      run.steps[i].status = "error";
      plStatus(runId, "error", { error: e.message, failedStep: i });
      return;
    }

    const out            = task.result?.output ?? "";
    run.steps[i].status  = task.status;
    run.steps[i].output  = out;
    prevOutput           = out;

    if (task.status === "error") {
      plLog(runId, { level: "error", message: `Step ${i + 1} failed — pipeline aborted`, step: i });
      plStatus(runId, "error", { error: "Step failed", failedStep: i });
      return;
    }

    plLog(runId, { level: "info", message: `Step ${i + 1} complete → ${out.slice(0, 100)}${out.length > 100 ? "…" : ""}`, step: i });
    plBus.emit("evt", { runId, kind: "step_done", stepIndex: i, step: run.steps[i] });
  }

  plLog(runId, { level: "info", message: `Pipeline complete — ${pl.steps.length} step(s) ran` });
  plStatus(runId, "done", { output: prevOutput, steps: pl.steps.length });
}

async function startPipeline(pipelineId, input) {
  if (!pipelines.has(pipelineId)) throw new Error(`Pipeline ${pipelineId} not found`);
  const run = mkPipelineRun(pipelineId, input);
  runPipelineRun(run.id).catch(e => {
    plLog(run.id, { level: "error", message: e.message });
    plStatus(run.id, "error", { error: e.message });
  });
  return run;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function hijackSSE(req, reply) {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    "Content-Type":      "text/event-stream",
    "Cache-Control":     "no-cache, no-transform",
    Connection:          "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const send = o => { try { res.write(`data: ${JSON.stringify(o)}\n\n`); } catch {} };
  const end  = ()  => { try { res.end(); } catch {} };
  return { send, end };
}

// ─── Fastify ──────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const app = Fastify({
  logger: IS_DEV
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : true,
});

await app.register(cors, { origin: "*", methods: ["GET", "POST", "PUT", "DELETE"] });

// Serve built frontend in production (Docker / Railway / Render)
const distPath = resolve(__dirname, "frontend-dist");
if (!IS_DEV && existsSync(distPath)) {
  await app.register(staticFiles, { root: distPath, prefix: "/" });
  app.setNotFoundHandler((_req, reply) => reply.sendFile("index.html"));
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", () => ({
  status:     "ok",
  version:    "3.0.0",
  time:       new Date().toISOString(),
  agents:     agents.size,
  tasks:      tasks.size,
  pipelines:  pipelines.size,
  schedules:  schedules.size,
  printr_rest: PRINTR_REST,
  mcp_url:    process.env.PRINTR_MCP_URL ?? "https://mcp.printr.fi",
}));

// ── Tools ─────────────────────────────────────────────────────────────────────
app.get("/tools/list", async (_, reply) => {
  let mcp = [], mcpError = null;
  try   { mcp = await listMcpTools(); }
  catch (e) { mcpError = e.message; }

  return reply.send({
    mcp,
    native:   { evm: EVM_TOOLS, solana: SOL_TOOLS },
    printr:   PRINTR_TOOLS,
    mcpError,
    total: mcp.length + EVM_TOOLS.length + SOL_TOOLS.length + PRINTR_TOOLS.length,
  });
});

app.post("/tools/execute", {
  schema: {
    body: {
      type: "object",
      required: ["tool"],
      properties: {
        tool: { type: "string" },
        args: { type: "object", default: {} },
      },
    },
  },
}, async (req, reply) => {
  try   { return reply.send({ result: await executeTool(req.body.tool, req.body.args ?? {}) }); }
  catch (e) { return reply.status(400).send({ error: e.message }); }
});

// ── Printr REST API passthrough routes ────────────────────────────────────────
// These expose the Printr REST API directly (without going through an agent).

// GET /printr/chains — list of supported CAIP-2 chain IDs
app.get("/printr/chains", () => ({
  chains: [
    { id: "eip155:1",     name: "Ethereum Mainnet" },
    { id: "eip155:137",   name: "Polygon" },
    { id: "eip155:8453",  name: "Base" },
    { id: "eip155:42161", name: "Arbitrum One" },
    { id: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", name: "Solana Mainnet" },
  ],
  note: "First chain in array = home chain. Cross-chain deployments cascade via Axelar/LayerZero.",
}));

// POST /printr/quote — cost estimate
app.post("/printr/quote", {
  schema: {
    body: {
      type: "object",
      required: ["chains", "supply_percent"],
      properties: {
        chains:               { type: "array", items: { type: "string" } },
        supply_percent:       { type: "number" },
        graduation_threshold: { type: "number" },
        fee_sink:             { type: "string" },
      },
    },
  },
}, async (req, reply) => {
  try {
    const result = await printrGetQuote(req.body.chains, req.body.supply_percent, {
      graduationThresholdUsd: req.body.graduation_threshold,
      feeSink: req.body.fee_sink,
    });
    return reply.send(result);
  } catch (e) { return reply.status(400).send({ error: e.message }); }
});

// POST /printr/token — create token (returns payload, optionally auto-signs)
app.post("/printr/token", {
  schema: {
    body: {
      type: "object",
      required: ["name","symbol","description","chains","creator_address","supply_percent"],
      properties: {
        name:                 { type: "string" },
        symbol:               { type: "string" },
        description:          { type: "string" },
        chains:               { type: "array", items: { type: "string" } },
        creator_address:      { type: "string" },
        supply_percent:       { type: "number" },
        auto_sign:            { type: "boolean", default: false },
        graduation_threshold: { type: "number" },
        image_base64:         { type: "string" },
        website:              { type: "string" },
        twitter:              { type: "string" },
        telegram:             { type: "string" },
        fee_sink:             { type: "string" },
      },
    },
  },
}, async (req, reply) => {
  try {
    const result = await executeTool("printr_create_token", req.body);
    return reply.status(201).send(result);
  } catch (e) { return reply.status(400).send({ error: e.message }); }
});

// GET /printr/token/:id — token metadata
app.get("/printr/token/:id", async (req, reply) => {
  try   { return reply.send(await printrGetToken(req.params.id)); }
  catch (e) { return e.message.includes("404") ? reply.status(404).send({ error: "Token not found" }) : reply.status(400).send({ error: e.message }); }
});

// GET /printr/token/:id/deployments — live deployment status
app.get("/printr/token/:id/deployments", async (req, reply) => {
  try   { return reply.send(await printrGetDeployments(req.params.id)); }
  catch (e) { return reply.status(400).send({ error: e.message }); }
});

// ── Agents CRUD ───────────────────────────────────────────────────────────────
app.get("/agents", () => ({ agents: [...agents.values()].sort((a, b) => b.createdAt - a.createdAt) }));

app.post("/agents/create", {
  schema: {
    body: {
      type: "object",
      required: ["name"],
      properties: {
        name:   { type: "string", minLength: 1, maxLength: 64 },
        chain:  { type: "string", enum: ["evm","solana"], default: "evm" },
        tools:  { type: "array",  items: { type: "string" }, default: [] },
        config: { type: "object", default: {} },
      },
    },
  },
}, async (req, reply) => reply.status(201).send({ agent: mkAgent(req.body) }));

app.put("/agents/:id", {
  schema: {
    body: {
      type: "object",
      properties: {
        name:   { type: "string" },
        tools:  { type: "array", items: { type: "string" } },
        config: { type: "object" },
      },
    },
  },
}, async (req, reply) => {
  const a = agents.get(req.params.id);
  if (!a) return reply.status(404).send({ error: "not_found" });
  if (req.body.name)   a.name   = req.body.name;
  if (req.body.tools)  a.tools  = req.body.tools;
  if (req.body.config) Object.assign(a.config, req.body.config);
  return reply.send({ agent: a });
});

app.delete("/agents/:id", async (req, reply) => {
  if (!agents.delete(req.params.id)) return reply.status(404).send({ error: "not_found" });
  removeSchedule(req.params.id);
  return reply.send({ ok: true });
});

// ── Agent run ─────────────────────────────────────────────────────────────────
app.post("/agents/run", {
  schema: {
    body: {
      type: "object",
      required: ["agentId","input"],
      properties: {
        agentId: { type: "string" },
        input:   { type: "string", minLength: 1 },
      },
    },
  },
}, async (req, reply) => {
  const agent = agents.get(req.body.agentId);
  if (!agent)                    return reply.status(404).send({ error: "agent_not_found" });
  if (agent.status === "running") return reply.status(409).send({ error: "agent_already_running" });
  try   { return reply.status(202).send({ task: await runAgent(req.body.agentId, req.body.input) }); }
  catch (e) { return reply.status(500).send({ error: e.message }); }
});

// ── Scheduling ────────────────────────────────────────────────────────────────
app.get("/agents/:id/schedule",  (req)        => ({ schedule: schedules.get(req.params.id) ?? null }));
app.get("/schedules",            ()            => ({ schedules: [...schedules.values()] }));

app.post("/agents/:id/schedule", {
  schema: { body: { type: "object", required: ["expression","input"], properties: { expression: { type: "string" }, input: { type: "string" } } } },
}, async (req, reply) => {
  if (!agents.has(req.params.id)) return reply.status(404).send({ error: "agent_not_found" });
  try   { return reply.send({ schedule: upsertSchedule(req.params.id, req.body.expression, req.body.input) }); }
  catch (e) { return reply.status(400).send({ error: e.message }); }
});

app.delete("/agents/:id/schedule", (req, reply) => {
  if (!schedules.has(req.params.id)) return reply.status(404).send({ error: "no_schedule" });
  removeSchedule(req.params.id);
  return reply.send({ ok: true });
});

// ── Inbound webhook — POST /webhooks/:agentId  { input } ──────────────────────
app.post("/webhooks/:agentId", {
  schema: { body: { type: "object", required: ["input"], properties: { input: { type: "string" } } } },
}, async (req, reply) => {
  const agent = agents.get(req.params.agentId);
  if (!agent)                    return reply.status(404).send({ error: "agent_not_found" });
  if (agent.status === "running") return reply.status(409).send({ error: "agent_busy" });
  try   { return reply.status(202).send({ task: await runAgent(agent.id, req.body.input), message: "Agent triggered via webhook" }); }
  catch (e) { return reply.status(500).send({ error: e.message }); }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
app.get("/tasks/:id", (req, reply) => {
  const t = tasks.get(req.params.id);
  return t ? reply.send({ task: t }) : reply.status(404).send({ error: "not_found" });
});

app.get("/agents/:id/tasks", (req, reply) =>
  reply.send({ tasks: [...tasks.values()].filter(t => t.agentId === req.params.id).sort((a, b) => b.createdAt - a.createdAt) })
);

app.get("/tasks/:id/stream", async (req, reply) => {
  const task = tasks.get(req.params.id);
  if (!task) return reply.status(404).send({ error: "not_found" });

  const { send, end } = hijackSSE(req, reply);
  for (const log of task.logs) send({ type: "log", log });

  if (task.status === "done" || task.status === "error") {
    send({ type: "done", status: task.status, result: task.result });
    end();
    return;
  }

  const h = ({ taskId, kind, log, status, result }) => {
    if (taskId !== req.params.id) return;
    if (kind === "log")  send({ type: "log", log });
    if (kind === "status" && (status === "done" || status === "error")) {
      send({ type: "done", status, result });
      end();
      taskBus.off("evt", h);
    }
  };
  taskBus.on("evt", h);
  req.raw.on("close", () => taskBus.off("evt", h));
});

// ── Pipelines ─────────────────────────────────────────────────────────────────
app.get("/pipelines", () => ({ pipelines: [...pipelines.values()].sort((a, b) => b.createdAt - a.createdAt) }));

app.post("/pipelines/create", {
  schema: {
    body: {
      type: "object",
      required: ["name","steps"],
      properties: {
        name:  { type: "string", minLength: 1, maxLength: 64 },
        steps: {
          type: "array", minItems: 1,
          items: {
            type: "object", required: ["agentId"],
            properties: {
              agentId:        { type: "string" },
              promptTemplate: { type: "string", nullable: true },
            },
          },
        },
      },
    },
  },
}, async (req, reply) => {
  for (const s of req.body.steps) {
    if (!agents.has(s.agentId)) return reply.status(400).send({ error: `Agent ${s.agentId} not found` });
  }
  return reply.status(201).send({ pipeline: mkPipeline(req.body) });
});

app.delete("/pipelines/:id", (req, reply) => {
  if (!pipelines.delete(req.params.id)) return reply.status(404).send({ error: "not_found" });
  return reply.send({ ok: true });
});

app.post("/pipelines/:id/run", {
  schema: { body: { type: "object", required: ["input"], properties: { input: { type: "string", minLength: 1 } } } },
}, async (req, reply) => {
  if (!pipelines.has(req.params.id)) return reply.status(404).send({ error: "pipeline_not_found" });
  try   { return reply.status(202).send({ run: await startPipeline(req.params.id, req.body.input) }); }
  catch (e) { return reply.status(500).send({ error: e.message }); }
});

app.get("/pipelines/:id/runs", (req, reply) =>
  reply.send({ runs: [...pipelineRuns.values()].filter(r => r.pipelineId === req.params.id).sort((a, b) => b.createdAt - a.createdAt) })
);

app.get("/pipeline-runs/:id", (req, reply) => {
  const r = pipelineRuns.get(req.params.id);
  return r ? reply.send({ run: r }) : reply.status(404).send({ error: "not_found" });
});

app.get("/pipeline-runs/:id/stream", async (req, reply) => {
  const run = pipelineRuns.get(req.params.id);
  if (!run) return reply.status(404).send({ error: "not_found" });

  const { send, end } = hijackSSE(req, reply);
  for (const log of run.logs) send({ type: "log", log });
  send({ type: "state", steps: run.steps, status: run.status });

  if (run.status === "done" || run.status === "error") {
    send({ type: "done", status: run.status, result: run.result });
    end();
    return;
  }

  const h = ({ runId, kind, log, status, result, stepIndex, step }) => {
    if (runId !== req.params.id) return;
    if (kind === "log")       send({ type: "log", log });
    if (kind === "step_done") send({ type: "step_done", stepIndex, step });
    if (kind === "status" && (status === "done" || status === "error")) {
      send({ type: "done", status, result });
      end();
      plBus.off("evt", h);
    }
  };
  plBus.on("evt", h);
  req.raw.on("close", () => plBus.off("evt", h));
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

const graceful = async () => {
  console.log("\n  Shutting down gracefully…");
  for (const j of cronJobs.values()) j.stop();
  await app.close();
  process.exit(0);
};
process.on("SIGINT",  graceful);
process.on("SIGTERM", graceful);

// ─── Start ────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │  Printr Agent OS  v3  ·  http://localhost:${PORT}          │
  ├─────────────────────────────────────────────────────────┤
  │  ▸ Printr REST API   ${PRINTR_REST}  │
  │  ▸ MCP               ${(process.env.PRINTR_MCP_URL ?? "https://mcp.printr.fi").padEnd(35)}│
  │  ▸ Agents            ${String(agents.size).padEnd(35)}│
  │  ▸ Printr Tools      quote · create · get · deployments │
  │  ▸ Native            EVM (viem) · Solana · Scheduling   │
  │  ▸ Features          Webhooks · Pipelines · SSE logs    │
  └─────────────────────────────────────────────────────────┘
  `);
} catch (e) {
  app.log.error(e);
  process.exit(1);
}