import { createWalletClient, createPublicClient, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import { createRPCBalancer } from "../lib/rpc-balancer.js";
import { serverPrivateKey, minterPrivateKey, network } from "./env.js";
import { log } from "../lib/logger.js";

// Chain setup
export const chain = network === "base-sepolia" ? baseSepolia : base;

// Wallet accounts
export const serverAccount = privateKeyToAccount(serverPrivateKey);
export const minterAccount = privateKeyToAccount(minterPrivateKey);

// RPC Load Balancer
export const rpcBalancer = createRPCBalancer(
  network === "base-sepolia" 
    ? process.env.BASE_SEPOLIA_RPC_URL
    : process.env.BASE_RPC_URL,
  network === "base-sepolia" 
    ? "https://sepolia.base.org"
    : "https://mainnet.base.org"
);

log.info(`🌐 RPC Configuration: ${rpcBalancer.getStatus().totalUrls} endpoint(s)`);
rpcBalancer.getUrls().forEach((url, i) => {
  log.debug(`   ${i + 1}. ${url}`);
});

// Create transport with fallback support
export const rpcTransport = rpcBalancer.createTransport({
  timeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
});

// Wallet clients
export const serverWalletClient = createWalletClient({
  account: serverAccount,
  chain,
  transport: rpcTransport,
}) as any;

export const minterWalletClient = createWalletClient({
  account: minterAccount,
  chain,
  transport: rpcTransport,
}) as any;

export const publicClient = createPublicClient({
  chain,
  transport: rpcTransport,
}) as any;

// Backward compatibility
export const walletClient = serverWalletClient;
export const account = serverAccount;

// Combined client for x402 settle
export const combinedClient = {
  ...publicClient,
  ...serverWalletClient,
  account: serverAccount,
  chain,
  transport: rpcTransport,
} as any;

// Contract ABIs
export const tokenAbi = parseAbi([
  "function mint(address to, bytes32 txHash) external",
  "function hasMinted(bytes32 txHash) view returns (bool)",
  "function mintAmount() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function liquidityDeployed() view returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function MINTER_ROLE() view returns (bytes32)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "event TokensMinted(address indexed to, uint256 amount, bytes32 txHash)",
]);

export const usdcAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

