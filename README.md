# MediChain — IoT Blockchain Medical Authentication System

## 🏗️ Architecture

```
┌────────────────────────────────────────────┐
│              Browser (Frontend)             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ MetaMask │  │ ethers.js│  │ QR Scan  │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  │
│       │              │                       │
│  ┌──────────────────────────────────────┐   │
│  │           metamask.js               │   │
│  │  (Smart Contract Interactions)      │   │
│  └────┬───────────────────────┬────────┘   │
│       │                       │             │
└───────┼───────────────────────┼─────────────┘
        │  Direct wallet calls  │  API fallback
        ▼                       ▼
┌──────────────┐    ┌─────────────────┐
│   Hardhat    │    │  Express Server │
│  Local Node  │◄───┤   (server.js)   │
│  (Port 8545) │    │   (Port 3000)   │
│              │    └─────────────────┘
│  ┌────────┐  │
│  │MediChain│  │
│  │Contract │  │
│  └────────┘  │
└──────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ (installed)
- MetaMask browser extension
- Git (optional)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Compile Smart Contract
```bash
npx hardhat compile
```

### Step 3: Start Hardhat Node (Terminal 1)
```bash
npx hardhat node
```
⚠️ Keep this terminal running! This is your local blockchain.

### Step 4: Deploy Contract (Terminal 2)
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### Step 5: Start Backend Server (Terminal 2)
```bash
node server.js
```

### Step 6: Open App
Navigate to **http://localhost:3000** in your browser.

## 🦊 MetaMask Setup

1. Install [MetaMask](https://metamask.io/) browser extension
2. Click **"Connect Wallet"** button in the app
3. MetaMask will prompt to:
   - Add the **Hardhat Localhost** network (Chain ID: 1337)
   - Connect your account
4. To get test ETH, import one of Hardhat's test accounts:
   - Go to MetaMask → Import Account → Enter one of the private keys from the Hardhat node terminal

### Hardhat Test Account (Account #0):
```
Address:    0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```
⚠️ These are FOR DEVELOPMENT ONLY. Never use on mainnet.

## 📁 Project Structure

```
├── contracts/
│   └── MediChain.sol        # Solidity smart contract
├── scripts/
│   └── deploy.js            # Deployment script
├── public/
│   ├── index.html           # Main app HTML
│   ├── styles.css           # Premium dark theme CSS
│   ├── blockchain.js        # Local blockchain simulation (fallback)
│   ├── metamask.js          # MetaMask + ethers.js integration
│   ├── app.js               # Application controller
│   ├── deployment.json      # Auto-generated contract address + ABI
│   └── MediChainABI.json    # Auto-generated ABI file
├── server.js                # Express backend API
├── hardhat.config.js        # Hardhat configuration
├── package.json             # npm project config
└── README.md                # This file
```

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + blockchain status |
| GET | `/api/deployment` | Contract address & ABI |
| GET | `/api/stats` | Medicine count, verifications, alerts |
| POST | `/api/medicine/register` | Register new medicine |
| POST | `/api/medicine/verify` | Verify medicine authenticity |
| GET | `/api/medicine/:batch` | Get medicine details |
| GET | `/api/medicines` | List all medicines |
| GET | `/api/supplychain/:batch` | Get supply chain history |
| POST | `/api/supplychain/update` | Add supply chain entry |
| POST | `/api/alert/report` | Report counterfeit |

## ⛓️ Smart Contract Functions

### Write Functions (require MetaMask)
- `registerMedicine(name, batch, mfgId, mfgName, mfgDate, expDate)`
- `setMedicineDetails(batch, type, quantity, composition, destination, price)`
- `verifyMedicine(batchNumber)` — verifies & records on-chain
- `updateSupplyChain(batch, stage, actor, location)`
- `markAsSold(batchNumber)`
- `flagMedicine(batchNumber, reason)` — counterfeit alert

### Read Functions (no gas)
- `getMedicine(batchNumber)`
- `getSupplyChain(batchNumber)`
- `getVerifications(batchNumber)`
- `getStats()`
- `getTotalBatches()` / `getBatchByIndex(index)`

## 🔐 How It Works

1. **Manufacturer** connects MetaMask → Registers medicine → Gets QR code
2. Medicine travels through supply chain, each step logged on blockchain
3. **Consumer/Shop** scans QR code → Smart contract verifies authenticity
4. If counterfeit detected → Alert raised on blockchain → All verifiers notified
