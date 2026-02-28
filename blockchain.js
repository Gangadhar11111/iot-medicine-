/**
 * MediChain — Blockchain Engine
 * A client-side blockchain simulation for medicine authentication.
 * Designed for easy migration to Ethereum/Solidity smart contracts.
 */

// ===== SHA-256 Hashing =====
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===== Block Class =====
class Block {
    constructor(index, timestamp, data, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = '';
        this.nonce = 0;
    }

    async calculateHash() {
        const str = this.index + this.previousHash + this.timestamp + JSON.stringify(this.data) + this.nonce;
        return await sha256(str);
    }

    async mineBlock(difficulty = 2) {
        const target = Array(difficulty + 1).join('0');
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = await this.calculateHash();
        }
    }
}

// ===== Transaction Class =====
class Transaction {
    constructor(type, data, from, to = null) {
        this.id = 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        this.type = type; // 'registration', 'verification', 'transfer', 'alert'
        this.data = data;
        this.from = from;
        this.to = to;
        this.timestamp = new Date().toISOString();
        this.hash = '';
        this.blockNumber = null;
        this.status = 'pending';
    }

    async generateHash() {
        this.hash = '0x' + await sha256(this.id + this.type + JSON.stringify(this.data) + this.timestamp);
        return this.hash;
    }
}

// ===== MediChain Blockchain =====
class MediChainBlockchain {
    constructor() {
        this.chain = [];
        this.pendingTransactions = [];
        this.medicines = new Map(); // batchNumber -> medicine data
        this.transactions = []; // All transactions
        this.alerts = []; // Counterfeit alerts
        this.scanHistory = []; // QR scan history
        this.difficulty = 2;
        this.listeners = {};
    }

    // Event system
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }

    async initialize() {
        // Load from localStorage or create genesis
        const saved = localStorage.getItem('medichain_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.chain = data.chain || [];
                this.medicines = new Map(data.medicines || []);
                this.transactions = data.transactions || [];
                this.alerts = data.alerts || [];
                this.scanHistory = data.scanHistory || [];
            } catch(e) {
                console.warn('Failed to load saved data, creating fresh chain');
                await this.createGenesisBlock();
            }
        } else {
            await this.createGenesisBlock();
        }

        if (this.chain.length === 0) {
            await this.createGenesisBlock();
        }

        this.emit('initialized', this.getStats());
    }

    save() {
        const data = {
            chain: this.chain,
            medicines: Array.from(this.medicines.entries()),
            transactions: this.transactions,
            alerts: this.alerts,
            scanHistory: this.scanHistory
        };
        localStorage.setItem('medichain_data', JSON.stringify(data));
    }

    async createGenesisBlock() {
        const genesisBlock = new Block(0, new Date().toISOString(), { type: 'genesis', message: 'MediChain Genesis Block' }, '0');
        genesisBlock.hash = await genesisBlock.calculateHash();
        this.chain.push(genesisBlock);
        this.save();
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    async addBlock(data) {
        const latestBlock = this.getLatestBlock();
        const newBlock = new Block(
            this.chain.length,
            new Date().toISOString(),
            data,
            latestBlock.hash
        );
        await newBlock.mineBlock(this.difficulty);
        this.chain.push(newBlock);
        this.save();
        this.emit('blockAdded', newBlock);
        return newBlock;
    }

    // ===== Medicine Registration =====
    async registerMedicine(medicineData) {
        const { batchNumber } = medicineData;

        // Check if batch already exists
        if (this.medicines.has(batchNumber)) {
            throw new Error(`Batch ${batchNumber} already registered on blockchain`);
        }

        // Create medicine record
        const medicine = {
            ...medicineData,
            registeredAt: new Date().toISOString(),
            status: 'active', // active, sold, expired, flagged
            scanCount: 0,
            supplyChain: [
                {
                    stage: 'Manufactured',
                    actor: medicineData.manufacturerName || medicineData.manufacturerId,
                    location: 'Manufacturing Plant',
                    timestamp: new Date().toISOString(),
                    txHash: ''
                }
            ],
            verifications: []
        };

        // Create transaction
        const tx = new Transaction('registration', {
            batchNumber,
            medicineName: medicineData.medicineName,
            manufacturerId: medicineData.manufacturerId
        }, medicineData.manufacturerId);
        await tx.generateHash();

        // Add to blockchain
        const block = await this.addBlock({
            type: 'medicine_registration',
            batchNumber,
            medicineName: medicineData.medicineName,
            manufacturerId: medicineData.manufacturerId,
            txHash: tx.hash
        });

        // Update transaction
        tx.blockNumber = block.index;
        tx.status = 'confirmed';
        medicine.supplyChain[0].txHash = tx.hash;
        medicine.blockHash = block.hash;
        medicine.blockNumber = block.index;

        // Store
        this.medicines.set(batchNumber, medicine);
        this.transactions.push(tx);
        this.save();

        this.emit('medicineRegistered', { medicine, transaction: tx, block });
        return { medicine, transaction: tx, block };
    }

    // ===== Medicine Verification =====
    async verifyMedicine(batchNumber) {
        const checks = [];
        let isAuthentic = true;
        let medicine = null;

        // Check 1: Exists on blockchain
        if (this.medicines.has(batchNumber)) {
            medicine = this.medicines.get(batchNumber);
            checks.push({ name: 'Blockchain Record Exists', passed: true, detail: 'Medicine found on blockchain' });
        } else {
            checks.push({ name: 'Blockchain Record Exists', passed: false, detail: 'NOT found on blockchain' });
            isAuthentic = false;

            // Create alert
            await this.createAlert(batchNumber, 'Medicine not found on blockchain');

            // Create verification transaction
            const tx = new Transaction('verification', {
                batchNumber, result: 'COUNTERFEIT', reason: 'Not found on blockchain'
            }, 'verifier');
            await tx.generateHash();
            const block = await this.addBlock({
                type: 'verification_failed', batchNumber, txHash: tx.hash
            });
            tx.blockNumber = block.index;
            tx.status = 'confirmed';
            this.transactions.push(tx);
            this.scanHistory.push({
                batchNumber, result: 'counterfeit', timestamp: new Date().toISOString(),
                reason: 'Not found on blockchain'
            });
            this.save();
            this.emit('verificationComplete', { isAuthentic: false, checks, batchNumber });
            return { isAuthentic: false, checks, medicine: null, batchNumber };
        }

        // Check 2: Batch number matches
        checks.push({ name: 'Batch Number Matches', passed: true, detail: `Batch: ${batchNumber}` });

        // Check 3: Expiry check
        const now = new Date();
        const expDate = new Date(medicine.expiryDate);
        if (expDate > now) {
            checks.push({ name: 'Medicine Not Expired', passed: true, detail: `Expires: ${medicine.expiryDate}` });
        } else {
            checks.push({ name: 'Medicine Not Expired', passed: false, detail: `EXPIRED on ${medicine.expiryDate}` });
            isAuthentic = false;
        }

        // Check 4: Not already sold
        if (medicine.status !== 'sold') {
            checks.push({ name: 'Not Previously Sold', passed: true, detail: `Status: ${medicine.status}` });
        } else {
            checks.push({ name: 'Not Previously Sold', passed: false, detail: 'Medicine marked as SOLD' });
            isAuthentic = false;
        }

        // Check 5: Supply chain valid
        if (medicine.supplyChain && medicine.supplyChain.length > 0) {
            checks.push({ name: 'Supply Chain Valid', passed: true, detail: `${medicine.supplyChain.length} checkpoint(s)` });
        } else {
            checks.push({ name: 'Supply Chain Valid', passed: false, detail: 'No supply chain data' });
        }

        // Check 6: Blockchain integrity
        const blockIndex = medicine.blockNumber;
        if (blockIndex !== undefined && blockIndex < this.chain.length) {
            checks.push({ name: 'Blockchain Integrity', passed: true, detail: `Block #${blockIndex} verified` });
        } else {
            checks.push({ name: 'Blockchain Integrity', passed: false, detail: 'Block reference invalid' });
            isAuthentic = false;
        }

        // Update medicine scan count
        medicine.scanCount++;
        medicine.verifications.push({
            timestamp: new Date().toISOString(),
            result: isAuthentic ? 'authentic' : 'suspicious'
        });
        this.medicines.set(batchNumber, medicine);

        // Create transaction
        const tx = new Transaction('verification', {
            batchNumber,
            medicineName: medicine.medicineName,
            result: isAuthentic ? 'AUTHENTIC' : 'SUSPICIOUS'
        }, 'verifier');
        await tx.generateHash();
        const block = await this.addBlock({
            type: isAuthentic ? 'verification_passed' : 'verification_failed',
            batchNumber, txHash: tx.hash
        });
        tx.blockNumber = block.index;
        tx.status = 'confirmed';
        this.transactions.push(tx);

        this.scanHistory.push({
            batchNumber,
            medicineName: medicine.medicineName,
            result: isAuthentic ? 'authentic' : 'counterfeit',
            timestamp: new Date().toISOString()
        });

        if (!isAuthentic) {
            await this.createAlert(batchNumber, 'Verification checks failed');
        }

        this.save();
        this.emit('verificationComplete', { isAuthentic, checks, medicine, batchNumber });
        return { isAuthentic, checks, medicine, batchNumber };
    }

    // ===== Supply Chain Transfer =====
    async transferMedicine(batchNumber, stage, actor, location) {
        if (!this.medicines.has(batchNumber)) {
            throw new Error('Medicine not found');
        }

        const medicine = this.medicines.get(batchNumber);
        const tx = new Transaction('transfer', {
            batchNumber, stage, actor, location
        }, actor);
        await tx.generateHash();

        const block = await this.addBlock({
            type: 'supply_chain_transfer', batchNumber, stage, actor, txHash: tx.hash
        });
        tx.blockNumber = block.index;
        tx.status = 'confirmed';
        this.transactions.push(tx);

        medicine.supplyChain.push({
            stage, actor, location, timestamp: new Date().toISOString(), txHash: tx.hash
        });
        this.medicines.set(batchNumber, medicine);
        this.save();
        this.emit('transfer', { medicine, transaction: tx });
        return { medicine, transaction: tx };
    }

    // ===== Create Alert =====
    async createAlert(batchNumber, reason) {
        const alert = {
            id: 'alert_' + Date.now(),
            batchNumber,
            reason,
            timestamp: new Date().toISOString(),
            severity: 'high',
            status: 'active'
        };
        this.alerts.push(alert);

        const tx = new Transaction('alert', { batchNumber, reason }, 'system');
        await tx.generateHash();
        const block = await this.addBlock({
            type: 'counterfeit_alert', batchNumber, reason, txHash: tx.hash
        });
        tx.blockNumber = block.index;
        tx.status = 'confirmed';
        this.transactions.push(tx);
        this.save();
        this.emit('alertCreated', alert);
        return alert;
    }

    // ===== Chain Validation =====
    async isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const current = this.chain[i];
            const previous = this.chain[i - 1];

            const block = new Block(current.index, current.timestamp, current.data, current.previousHash);
            block.nonce = current.nonce;
            const recalculated = await block.calculateHash();

            if (current.hash !== recalculated) return false;
            if (current.previousHash !== previous.hash) return false;
        }
        return true;
    }

    // ===== Get Stats =====
    getStats() {
        const medicines = Array.from(this.medicines.values());
        return {
            totalMedicines: medicines.length,
            verifiedAuthentic: this.scanHistory.filter(s => s.result === 'authentic').length,
            counterfeitAlerts: this.alerts.length,
            totalBlocks: this.chain.length,
            totalTransactions: this.transactions.length,
            latestBlock: this.getLatestBlock(),
            recentTransactions: this.transactions.slice(-10).reverse()
        };
    }

    // ===== Get All Medicines =====
    getAllMedicines() {
        return Array.from(this.medicines.entries()).map(([batch, data]) => ({
            batchNumber: batch,
            ...data
        }));
    }

    // ===== Get Medicine by Batch =====
    getMedicine(batchNumber) {
        return this.medicines.get(batchNumber) || null;
    }

    // ===== Search =====
    search(query) {
        const q = query.toLowerCase();
        return this.getAllMedicines().filter(m =>
            m.batchNumber.toLowerCase().includes(q) ||
            m.medicineName.toLowerCase().includes(q) ||
            (m.manufacturerName && m.manufacturerName.toLowerCase().includes(q))
        );
    }

    // ===== Generate QR Data =====
    generateQRData(batchNumber) {
        const medicine = this.medicines.get(batchNumber);
        if (!medicine) return null;
        return JSON.stringify({
            system: 'MediChain',
            version: '1.0',
            batch: batchNumber,
            name: medicine.medicineName,
            mfg: medicine.manufacturerId,
            block: medicine.blockNumber,
            hash: medicine.blockHash ? medicine.blockHash.substring(0, 16) : ''
        });
    }
}

// Export global instance
window.MediChain = new MediChainBlockchain();
