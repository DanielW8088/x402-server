import { config } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";

config();

const serverPrivateKey = process.env.SERVER_PRIVATE_KEY as `0x${string}`;

if (!serverPrivateKey) {
  console.error("❌ SERVER_PRIVATE_KEY not found in .env");
  process.exit(1);
}

const account = privateKeyToAccount(serverPrivateKey);

console.log("📍 Server Address (for MINTER_ROLE):");
console.log(account.address);
console.log();
console.log("Use this address to grant MINTER_ROLE:");
console.log(`TOKEN_CONTRACT_ADDRESS=<your-contract> SERVER_ADDRESS=${account.address} npm run grant:sepolia`);

