const express = require("express");
const cors = require("cors");
const path = require("path");
const { ethers } = require("ethers");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== Blockchain Connection =====
let provider, contract, signer;

function getDeployment() {
    const depPath = path.join(__dirname, "public", "deployment.json");
    if (!fs.existsSync(depPath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(depPath, "utf-8"));
}

async function connectBlockchain() {
    try {
        const deployment = getDeployment();
        const networkMode = deployment?.network || process.env.NETWORK_MODE || "localhost";

        if (networkMode === "sepolia") {
            // Connect to Sepolia via Infura/Alchemy
            const rpcUrl = process.env.SEPOLIA_RPC_URL;
            if (!rpcUrl || rpcUrl.includes("YOUR_INFURA")) {
                console.log("⚠️  Sepolia RPC URL not set. Update .env file.");
                return;
            }
            provider = new ethers.JsonRpcProvider(rpcUrl);
            const network = await provider.getNetwork();
            console.log(`⛓️  Connected to Sepolia (chainId: ${network.chainId})`);

            // Use private key from .env for signing
            const privateKey = process.env.PRIVATE_KEY;
            if (privateKey && !privateKey.includes("your_")) {
                signer = new ethers.Wallet(privateKey, provider);
                console.log(`🔑 Signer loaded: ${signer.address}`);
            } else {
                console.log("⚠️  No PRIVATE_KEY in .env — read-only mode");
            }
        } else {
            // Connect to localhost Hardhat
            provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
            const network = await provider.getNetwork();
            console.log(`⛓️  Connected to localhost (chainId: ${network.chainId})`);
            signer = await provider.getSigner(0);
        }

        if (deployment && signer) {
            contract = new ethers.Contract(
                deployment.contractAddress,
                deployment.abi,
                signer
            );
            console.log(`📄 Contract loaded at: ${deployment.contractAddress}`);
            console.log(`🌐 Network: ${networkMode.toUpperCase()}`);
        } else if (!deployment) {
            console.log("⚠️  No deployment found. Deploy the contract first.");
        }
    } catch (err) {
        console.log("⚠️  Blockchain not connected:", err.message);
    }
}

// ===== API Routes =====

// Health check
app.get("/api/health", async (req, res) => {
    try {
        const deployment = getDeployment();
        let blockchainConnected = false;
        let blockNumber = 0;

        if (provider) {
            try {
                blockNumber = await provider.getBlockNumber();
                blockchainConnected = true;
            } catch (e) { }
        }

        res.json({
            status: "ok",
            blockchain: blockchainConnected,
            contractDeployed: !!deployment,
            contractAddress: deployment?.contractAddress || null,
            blockNumber,
            timestamp: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get deployment info
app.get("/api/deployment", (req, res) => {
    const deployment = getDeployment();
    if (!deployment) {
        return res.status(404).json({ error: "Contract not deployed yet" });
    }
    res.json(deployment);
});

// Get contract stats
app.get("/api/stats", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const stats = await contract.getStats();
        res.json({
            totalMedicines: stats[0].toString(),
            totalVerifications: stats[1].toString(),
            totalAlerts: stats[2].toString(),
            contractOwner: stats[3]
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register medicine
app.post("/api/medicine/register", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const {
            medicineName, batchNumber, manufacturerId, manufacturerName,
            mfgDate, expiryDate, medicineType, quantity,
            composition, shipmentDest, price
        } = req.body;

        const tx = await contract.registerMedicine(
            medicineName, batchNumber, manufacturerId, manufacturerName,
            mfgDate, expiryDate
        );

        const receipt = await tx.wait();

        // Set additional details
        try {
            const tx2 = await contract.setMedicineDetails(
                batchNumber, medicineType || "tablet",
                quantity || 0, composition || "", shipmentDest || "",
                parseInt(price || 0)
            );
            await tx2.wait();
        } catch (e) {
            console.warn("Optional details failed:", e.message);
        }

        console.log(`✅ Medicine registered: ${batchNumber} in block ${receipt.blockNumber}`);

        res.json({
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            batchNumber
        });
    } catch (err) {
        console.error("Register error:", err.message);
        res.status(500).json({ error: err.reason || err.message });
    }
});

// Verify medicine
app.post("/api/medicine/verify", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const { batchNumber } = req.body;

        // Call the verification (this is a state-changing call)
        const tx = await contract.verifyMedicine(batchNumber);
        const receipt = await tx.wait();

        // Check events from the receipt
        let isAuthentic = false;
        let details = "";

        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
                if (parsed && parsed.name === "MedicineVerified") {
                    isAuthentic = parsed.args[1]; // isAuthentic bool
                }
            } catch (e) { }
        }

        // Get medicine details if it exists
        let medicine = null;
        try {
            medicine = await contract.getMedicine(batchNumber);
            medicine = {
                medicineName: medicine.medicineName,
                batchNumber: medicine.batchNumber,
                manufacturerId: medicine.manufacturerId,
                manufacturerName: medicine.manufacturerName,
                mfgDate: medicine.mfgDate,
                expiryDate: medicine.expiryDate,
                medicineType: medicine.medicineType,
                quantity: medicine.quantity.toString(),
                status: ["Active", "Sold", "Expired", "Flagged"][Number(medicine.status)],
                scanCount: medicine.scanCount.toString(),
                registeredBy: medicine.registeredBy,
                registeredAt: new Date(Number(medicine.registeredAt) * 1000).toISOString()
            };
        } catch (e) { }

        res.json({
            success: true,
            isAuthentic,
            batchNumber,
            medicine,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber
        });
    } catch (err) {
        console.error("Verify error:", err.message);
        res.status(500).json({ error: err.reason || err.message });
    }
});

// Get medicine details
app.get("/api/medicine/:batchNumber", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const med = await contract.getMedicine(req.params.batchNumber);
        res.json({
            medicineName: med.medicineName,
            batchNumber: med.batchNumber,
            manufacturerId: med.manufacturerId,
            manufacturerName: med.manufacturerName,
            mfgDate: med.mfgDate,
            expiryDate: med.expiryDate,
            medicineType: med.medicineType,
            quantity: med.quantity.toString(),
            status: ["Active", "Sold", "Expired", "Flagged"][Number(med.status)],
            scanCount: med.scanCount.toString(),
            registeredBy: med.registeredBy,
            registeredAt: new Date(Number(med.registeredAt) * 1000).toISOString()
        });
    } catch (err) {
        res.status(404).json({ error: "Medicine not found" });
    }
});

// Get supply chain
app.get("/api/supplychain/:batchNumber", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const chain = await contract.getSupplyChain(req.params.batchNumber);
        const stages = ["Manufactured", "QualityChecked", "Shipped", "InTransit", "Delivered", "Dispensed"];

        res.json(chain.map(entry => ({
            stage: stages[Number(entry.stage)],
            actor: entry.actor,
            location: entry.location,
            timestamp: new Date(Number(entry.timestamp) * 1000).toISOString(),
            updatedBy: entry.updatedBy
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update supply chain
app.post("/api/supplychain/update", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const { batchNumber, stage, actor, location } = req.body;
        const tx = await contract.updateSupplyChain(batchNumber, stage, actor, location);
        const receipt = await tx.wait();

        res.json({
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber
        });
    } catch (err) {
        res.status(500).json({ error: err.reason || err.message });
    }
});

// Get all registered batches
app.get("/api/medicines", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const totalBatches = await contract.getTotalBatches();
        const medicines = [];

        for (let i = 0; i < Number(totalBatches); i++) {
            const batch = await contract.getBatchByIndex(i);
            try {
                const med = await contract.getMedicine(batch);
                medicines.push({
                    medicineName: med.medicineName,
                    batchNumber: med.batchNumber,
                    manufacturerId: med.manufacturerId,
                    manufacturerName: med.manufacturerName,
                    mfgDate: med.mfgDate,
                    expiryDate: med.expiryDate,
                    medicineType: med.medicineType,
                    status: ["Active", "Sold", "Expired", "Flagged"][Number(med.status)],
                    scanCount: med.scanCount.toString()
                });
            } catch (e) { }
        }

        res.json(medicines);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Report counterfeit
app.post("/api/alert/report", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const { batchNumber, reason } = req.body;
        const tx = await contract.flagMedicine(batchNumber, reason || "Suspected counterfeit");
        const receipt = await tx.wait();

        res.json({
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber
        });
    } catch (err) {
        res.status(500).json({ error: err.reason || err.message });
    }
});

// Authorize a wallet address (called by frontend when MetaMask connects)
app.post("/api/authorize", async (req, res) => {
    try {
        if (!contract) return res.status(503).json({ error: "Contract not connected" });

        const { address } = req.body;
        if (!address) return res.status(400).json({ error: "Address required" });

        console.log(`🔑 Authorizing wallet: ${address}`);

        // Check if already authorized
        const isManufacturer = await contract.authorizedManufacturers(address);
        if (isManufacturer) {
            console.log(`  ✅ Already authorized as manufacturer`);
            return res.json({ success: true, alreadyAuthorized: true });
        }

        // Authorize as manufacturer
        const tx1 = await contract.authorizeManufacturer(address);
        await tx1.wait();
        console.log(`  ✅ Authorized as Manufacturer`);

        // Authorize as distributor
        const tx2 = await contract.authorizeDistributor(address);
        await tx2.wait();
        console.log(`  ✅ Authorized as Distributor`);

        // Authorize as shop
        const tx3 = await contract.authorizeShop(address);
        await tx3.wait();
        console.log(`  ✅ Authorized as Shop`);

        res.json({
            success: true,
            address,
            roles: ["manufacturer", "distributor", "shop"],
            message: "Wallet authorized for all roles"
        });
    } catch (err) {
        console.error("Authorization error:", err.message);
        res.status(500).json({ error: err.reason || err.message });
    }
});

// Serve frontend (catch-all for SPA, Express 5 compatible)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== Start Server =====
app.listen(PORT, async () => {
    console.log(`\n🏥 MediChain Backend Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving frontend from /public`);
    await connectBlockchain();
    console.log(`\n🔗 Ready for MetaMask connections!\n`);
});
