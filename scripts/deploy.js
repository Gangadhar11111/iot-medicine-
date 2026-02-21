const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const networkName = hre.network.name;
    console.log(`\n🚀 Deploying MediChain Smart Contract to ${networkName.toUpperCase()}...\n`);

    const [deployer] = await hre.ethers.getSigners();
    console.log("📋 Deploying with account:", deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("💰 Account balance:", hre.ethers.formatEther(balance), "ETH");

    if (networkName === "sepolia") {
        const balanceNum = parseFloat(hre.ethers.formatEther(balance));
        if (balanceNum < 0.01) {
            console.error("\n❌ Insufficient Sepolia ETH! You need at least 0.01 SepoliaETH.");
            console.error("   Get free Sepolia ETH from:");
            console.error("   • https://sepoliafaucet.com");
            console.error("   • https://www.alchemy.com/faucets/ethereum-sepolia");
            console.error("   • https://faucets.chain.link/sepolia");
            process.exit(1);
        }
        console.log("\n⏳ Deploying to Sepolia... This may take 15-45 seconds.\n");
    }

    // Deploy MediChain
    const MediChain = await hre.ethers.getContractFactory("MediChain");
    const mediChain = await MediChain.deploy();
    await mediChain.waitForDeployment();

    const contractAddress = await mediChain.getAddress();
    console.log("✅ MediChain deployed to:", contractAddress);
    console.log("🔗 Transaction hash:", mediChain.deploymentTransaction().hash);

    if (networkName === "sepolia") {
        console.log(`\n🔍 View on Etherscan: https://sepolia.etherscan.io/address/${contractAddress}`);
        console.log(`🔍 View TX: https://sepolia.etherscan.io/tx/${mediChain.deploymentTransaction().hash}`);
    }

    // Save deployment info
    const chainId = (await hre.ethers.provider.getNetwork()).chainId.toString();

    const deploymentInfo = {
        contractAddress: contractAddress,
        deployer: deployer.address,
        network: networkName,
        chainId: chainId,
        deployedAt: new Date().toISOString(),
        abi: JSON.parse(MediChain.interface.formatJson())
    };

    // Write to frontend-accessible location
    const outputDir = path.join(__dirname, "..", "public");
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
        path.join(outputDir, "deployment.json"),
        JSON.stringify(deploymentInfo, null, 2)
    );

    fs.writeFileSync(
        path.join(outputDir, "MediChainABI.json"),
        JSON.stringify(deploymentInfo.abi, null, 2)
    );

    console.log("\n📁 Deployment info saved to public/deployment.json");
    console.log("📁 Contract ABI saved to public/MediChainABI.json");

    if (networkName === "sepolia") {
        console.log("\n🎉 Deployed to SEPOLIA TESTNET!");
        console.log("   Add Sepolia network to MetaMask:");
        console.log("   Network: Sepolia Test Network");
        console.log("   RPC URL: (your Infura/Alchemy URL)");
        console.log("   Chain ID: 11155111");
        console.log("   Currency: SepoliaETH");
        console.log("   Explorer: https://sepolia.etherscan.io");
    } else {
        console.log("\n🎉 Deployment complete! Add the Hardhat network to MetaMask:");
        console.log("   Network: Localhost 8545");
        console.log("   RPC URL: http://127.0.0.1:8545");
        console.log("   Chain ID: 1337");
        console.log("   Currency: ETH");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Deployment failed:", error);
        process.exit(1);
    });
