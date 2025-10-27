const { ethers } = require("ethers");

// Common Uniswap v4 and contract errors
const errorSignatures = {
    "0xe65af6a0": "PoolAlreadyInitialized()",
    "0x7c214f04": "Unauthorized()",
    "0x89c62b64": "PoolNotInitialized()",
    "0x30cd7471": "InsufficientBalance()",
};

const errorSig = process.env.ERROR_SIG || "0xe65af6a0";

console.log(`\n🔍 Decoding error signature: ${errorSig}`);

if (errorSignatures[errorSig]) {
    console.log(`✅ Known error: ${errorSignatures[errorSig]}`);

    if (errorSig === "0xe65af6a0") {
        console.log(`\n📝 This means: Pool is already initialized in Uniswap v4`);
        console.log(`\n💡 Possible solutions:`);
        console.log(`   1. Pool might have been initialized in a previous failed attempt`);
        console.log(`   2. Another token might be using the same pool key`);
        console.log(`   3. Need to use a different fee or tickSpacing`);
    }
} else {
    console.log(`❓ Unknown error signature`);
    console.log(`\nTry decoding with: cast sig-event ${errorSig}`);
}

// Calculate some common error signatures
console.log(`\n📋 Common error signatures:`);
const errors = [
    "PoolAlreadyInitialized()",
    "Unauthorized()",
    "PoolNotInitialized()",
    "InsufficientBalance()",
    "MaxMintCountExceeded()",
    "LiquidityAlreadyDeployed()",
];

errors.forEach(err => {
    const sig = ethers.id(err).slice(0, 10);
    console.log(`   ${sig} = ${err}`);
});

