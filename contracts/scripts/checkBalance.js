const hre = require("hardhat");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);

    console.log("\n🔍 Deployer Account Info:");
    console.log("   Address:", deployer.address);
    console.log("   Balance:", hre.ethers.formatEther(balance), "ETH");
    console.log("   Network:", hre.network.name);

    if (balance === 0n) {
        console.log("\n❌ Balance is zero! Get ETH from:");
        console.log("   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet\n");
    } else {
        console.log("\n✅ Account has ETH and is ready to deploy!\n");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

