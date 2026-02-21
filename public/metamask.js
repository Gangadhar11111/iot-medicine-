/**
 * MediChain — MetaMask & Smart Contract Integration
 * Connects to MetaMask wallet and interacts with deployed MediChain contract.
 */

window.MetaMaskModule = (function () {
    'use strict';

    let provider = null;
    let signer = null;
    let contract = null;
    let userAddress = null;
    let contractAddress = null;
    let contractABI = null;
    let isConnected = false;
    let chainId = null;
    let deploymentChainId = null; // From deployment.json

    const HARDHAT_CHAIN_ID = '0x539'; // 1337 in hex
    const SEPOLIA_CHAIN_ID = '0xaa36a7'; // 11155111 in hex
    const HARDHAT_RPC = 'http://127.0.0.1:8545';
    const API_BASE = window.location.origin;

    // ===== Initialize =====
    async function init() {
        // Try to load deployment info
        try {
            const res = await fetch('/deployment.json');
            if (res.ok) {
                const deployment = await res.json();
                contractAddress = deployment.contractAddress;
                contractABI = deployment.abi;
                deploymentChainId = deployment.chainId ? '0x' + parseInt(deployment.chainId).toString(16) : HARDHAT_CHAIN_ID;
                console.log('📄 Contract ABI loaded:', contractAddress, '(Chain:', deployment.network || 'unknown', ')');
            } else {
                console.warn('⚠️ No deployment.json found. Deploy the contract first.');
            }
        } catch (e) {
            console.warn('⚠️ Could not load deployment info:', e.message);
        }

        // Check if MetaMask is already connected
        if (window.ethereum) {
            try {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length > 0) {
                    await connectWallet(true);
                }
            } catch (e) { }

            // Listen for account changes
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
        }
    }

    // ===== Connect Wallet =====
    async function connectWallet(silent = false) {
        if (!window.ethereum) {
            if (!silent) {
                showWalletToast('MetaMask not detected! Please install MetaMask extension.', 'error');
            }
            return false;
        }

        try {
            // Request account access
            const accounts = await window.ethereum.request({
                method: silent ? 'eth_accounts' : 'eth_requestAccounts'
            });

            if (accounts.length === 0) {
                if (!silent) showWalletToast('No accounts found. Please unlock MetaMask.', 'error');
                return false;
            }

            userAddress = accounts[0];
            provider = new ethers.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
            chainId = await window.ethereum.request({ method: 'eth_chainId' });

            // Check if on correct network (matches deployment)
            const targetChain = deploymentChainId || HARDHAT_CHAIN_ID;
            if (chainId !== targetChain) {
                if (!silent) {
                    await switchToNetwork(targetChain);
                }
            }

            // Connect to contract if ABI available
            if (contractAddress && contractABI) {
                contract = new ethers.Contract(contractAddress, contractABI, signer);
                console.log('✅ Connected to MediChain contract');
            }

            isConnected = true;
            updateWalletUI();

            // Auto-authorize this wallet via backend (owner signs the tx)
            try {
                const authRes = await fetch(API_BASE + '/api/authorize', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: userAddress })
                });
                const authData = await authRes.json();
                if (authData.success) {
                    if (authData.alreadyAuthorized) {
                        console.log('✅ Wallet already authorized');
                    } else {
                        console.log('✅ Wallet authorized as:', authData.roles?.join(', '));
                        if (!silent) showWalletToast('🔑 Wallet authorized as Manufacturer, Distributor & Shop', 'success');
                    }
                }
            } catch (e) {
                console.warn('Auto-authorize skipped:', e.message);
            }

            if (!silent) {
                showWalletToast(`Wallet connected: ${formatAddress(userAddress)}`, 'success');
            }

            return true;
        } catch (err) {
            console.error('Wallet connection error:', err);
            if (!silent) {
                showWalletToast('Failed to connect: ' + err.message, 'error');
            }
            return false;
        }
    }

    // ===== Disconnect (UI only, MetaMask doesn't support programmatic disconnect) =====
    function disconnect() {
        isConnected = false;
        userAddress = null;
        signer = null;
        contract = null;
        updateWalletUI();
        showWalletToast('Wallet disconnected', 'info');
    }

    // ===== Switch to correct network =====
    async function switchToNetwork(targetChainId) {
        const networkConfigs = {
            [HARDHAT_CHAIN_ID]: {
                chainId: HARDHAT_CHAIN_ID,
                chainName: 'Hardhat Localhost',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [HARDHAT_RPC],
                blockExplorerUrls: null
            },
            [SEPOLIA_CHAIN_ID]: {
                chainId: SEPOLIA_CHAIN_ID,
                chainName: 'Sepolia Test Network',
                nativeCurrency: { name: 'SepoliaETH', symbol: 'SepoliaETH', decimals: 18 },
                rpcUrls: ['https://rpc.sepolia.org'],
                blockExplorerUrls: ['https://sepolia.etherscan.io']
            }
        };

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: targetChainId }]
            });
        } catch (switchError) {
            if (switchError.code === 4902) {
                const config = networkConfigs[targetChainId];
                if (config) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [config]
                        });
                    } catch (addError) {
                        showWalletToast('Failed to add network to MetaMask', 'error');
                    }
                }
            } else {
                const name = targetChainId === SEPOLIA_CHAIN_ID ? 'Sepolia' : 'Hardhat Localhost';
                showWalletToast(`Please switch to ${name} network in MetaMask`, 'warning');
            }
        }
    }

    // ===== Handle Account Changes =====
    function handleAccountsChanged(accounts) {
        if (accounts.length === 0) {
            disconnect();
        } else {
            userAddress = accounts[0];
            updateWalletUI();
            showWalletToast(`Account changed: ${formatAddress(userAddress)}`, 'info');
            // Reconnect with new signer
            if (provider) {
                provider.getSigner().then(s => {
                    signer = s;
                    if (contractAddress && contractABI) {
                        contract = new ethers.Contract(contractAddress, contractABI, signer);
                    }
                });
            }
        }
    }

    function handleChainChanged(_chainId) {
        chainId = _chainId;
        showWalletToast('Network changed. Reloading...', 'info');
        setTimeout(() => window.location.reload(), 1500);
    }

    // ===== Smart Contract Interactions =====

    // Register medicine on smart contract (two-step: register + details)
    async function registerMedicine(data) {
        if (!contract) {
            return await apiCall('/api/medicine/register', 'POST', data);
        }

        try {
            // Step 1: Register core medicine data
            const tx = await contract.registerMedicine(
                data.medicineName,
                data.batchNumber,
                data.manufacturerId,
                data.manufacturerName,
                data.mfgDate,
                data.expiryDate
            );

            showWalletToast('Transaction submitted. Mining...', 'info');
            const receipt = await tx.wait();

            // Step 2: Set additional details (optional)
            try {
                const tx2 = await contract.setMedicineDetails(
                    data.batchNumber,
                    data.type || 'tablet',
                    data.quantity || 0,
                    data.composition || '',
                    data.shipmentDest || '',
                    Math.floor(parseFloat(data.price || 0))
                );
                await tx2.wait();
            } catch (e) {
                console.warn('Optional details TX failed:', e.message);
            }

            return {
                success: true,
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber,
                batchNumber: data.batchNumber,
                from: userAddress
            };
        } catch (err) {
            console.error('Register error:', err);
            throw new Error(err.reason || err.message || 'Registration failed');
        }
    }

    // Verify medicine on smart contract
    async function verifyMedicine(batchNumber) {
        if (!contract) {
            return await apiCall('/api/medicine/verify', 'POST', { batchNumber });
        }

        try {
            // First try to get medicine info (view call, no gas)
            let medicine = null;
            let medicineExists = false;

            try {
                medicine = await contract.getMedicine(batchNumber);
                medicineExists = true;
            } catch (e) {
                // Medicine doesn't exist
            }

            // Call verify (state-changing, costs gas)
            const tx = await contract.verifyMedicine(batchNumber);
            showWalletToast('Verification transaction submitted...', 'info');
            const receipt = await tx.wait();

            // Parse events
            let isAuthentic = false;
            for (const log of receipt.logs) {
                try {
                    const parsed = contract.interface.parseLog({ topics: log.topics, data: log.data });
                    if (parsed && parsed.name === 'MedicineVerified') {
                        isAuthentic = parsed.args[1];
                    }
                } catch (e) { }
            }

            let medicineData = null;
            if (medicineExists && medicine) {
                medicineData = {
                    medicineName: medicine.medicineName,
                    batchNumber: medicine.batchNumber,
                    manufacturerId: medicine.manufacturerId,
                    manufacturerName: medicine.manufacturerName,
                    mfgDate: medicine.mfgDate,
                    expiryDate: medicine.expiryDate,
                    medicineType: medicine.medicineType,
                    quantity: medicine.quantity.toString(),
                    status: ['Active', 'Sold', 'Expired', 'Flagged'][Number(medicine.status)],
                    scanCount: (Number(medicine.scanCount) + 1).toString(),
                    registeredBy: medicine.registeredBy
                };
            }

            return {
                success: true,
                isAuthentic,
                batchNumber,
                medicine: medicineData,
                transactionHash: receipt.hash,
                blockNumber: receipt.blockNumber
            };
        } catch (err) {
            console.error('Verify error:', err);
            throw new Error(err.reason || err.message || 'Verification failed');
        }
    }

    // Get medicine details (view only, no gas)
    async function getMedicine(batchNumber) {
        if (!contract) {
            return await apiCall(`/api/medicine/${batchNumber}`, 'GET');
        }

        try {
            const med = await contract.getMedicine(batchNumber);
            return {
                medicineName: med.medicineName,
                batchNumber: med.batchNumber,
                manufacturerId: med.manufacturerId,
                manufacturerName: med.manufacturerName,
                mfgDate: med.mfgDate,
                expiryDate: med.expiryDate,
                medicineType: med.medicineType,
                quantity: med.quantity.toString(),
                status: ['Active', 'Sold', 'Expired', 'Flagged'][Number(med.status)],
                scanCount: med.scanCount.toString(),
                registeredBy: med.registeredBy,
                registeredAt: new Date(Number(med.registeredAt) * 1000).toISOString()
            };
        } catch (e) {
            return null;
        }
    }

    // Get supply chain
    async function getSupplyChain(batchNumber) {
        if (!contract) {
            return await apiCall(`/api/supplychain/${batchNumber}`, 'GET');
        }

        try {
            const chain = await contract.getSupplyChain(batchNumber);
            const stages = ['Manufactured', 'QualityChecked', 'Shipped', 'InTransit', 'Delivered', 'Dispensed'];

            return chain.map(entry => ({
                stage: stages[Number(entry.stage)],
                actor: entry.actor,
                location: entry.location,
                timestamp: new Date(Number(entry.timestamp) * 1000).toISOString(),
                updatedBy: entry.updatedBy
            }));
        } catch (e) {
            return [];
        }
    }

    // Update supply chain
    async function updateSupplyChain(batchNumber, stage, actor, location) {
        if (!contract) {
            return await apiCall('/api/supplychain/update', 'POST', { batchNumber, stage, actor, location });
        }

        try {
            const tx = await contract.updateSupplyChain(batchNumber, stage, actor, location);
            const receipt = await tx.wait();
            return { success: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
        } catch (err) {
            throw new Error(err.reason || err.message);
        }
    }

    // Get contract stats
    async function getStats() {
        if (!contract) {
            try {
                return await apiCall('/api/stats', 'GET');
            } catch (e) {
                return { totalMedicines: '0', totalVerifications: '0', totalAlerts: '0' };
            }
        }

        try {
            const stats = await contract.getStats();
            return {
                totalMedicines: stats[0].toString(),
                totalVerifications: stats[1].toString(),
                totalAlerts: stats[2].toString(),
                contractOwner: stats[3]
            };
        } catch (e) {
            return { totalMedicines: '0', totalVerifications: '0', totalAlerts: '0' };
        }
    }

    // Get all medicines
    async function getAllMedicines() {
        if (!contract) {
            try {
                return await apiCall('/api/medicines', 'GET');
            } catch (e) { return []; }
        }

        try {
            const total = await contract.getTotalBatches();
            const medicines = [];
            for (let i = 0; i < Number(total); i++) {
                const batch = await contract.getBatchByIndex(i);
                const med = await getMedicine(batch);
                if (med) medicines.push(med);
            }
            return medicines;
        } catch (e) {
            return [];
        }
    }

    // Flag / report counterfeit
    async function reportCounterfeit(batchNumber, reason) {
        if (!contract) {
            return await apiCall('/api/alert/report', 'POST', { batchNumber, reason });
        }

        try {
            const tx = await contract.flagMedicine(batchNumber, reason || 'Suspected counterfeit');
            const receipt = await tx.wait();
            return { success: true, transactionHash: receipt.hash };
        } catch (err) {
            throw new Error(err.reason || err.message);
        }
    }

    // ===== API Fallback =====
    async function apiCall(endpoint, method = 'GET', body = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(API_BASE + endpoint, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'API call failed');
        return data;
    }

    // ===== UI Helpers =====
    function updateWalletUI() {
        const btn = document.getElementById('connect-wallet-btn');
        const btnText = document.getElementById('wallet-btn-text');
        const display = document.getElementById('wallet-display');
        const role = document.getElementById('wallet-role');
        const avatar = document.getElementById('wallet-avatar');
        const avatarLetter = document.getElementById('wallet-avatar-letter');

        if (isConnected && userAddress) {
            btn.classList.add('connected');
            btnText.textContent = formatAddress(userAddress);
            display.textContent = formatAddress(userAddress);
            role.textContent = chainId === SEPOLIA_CHAIN_ID ? 'Sepolia Testnet' : chainId === HARDHAT_CHAIN_ID ? 'Hardhat Local' : 'Chain: ' + parseInt(chainId, 16);
            avatarLetter.textContent = userAddress.substring(2, 3).toUpperCase();
            avatar.style.background = generateGradient(userAddress);
        } else {
            btn.classList.remove('connected');
            btnText.textContent = 'Connect Wallet';
            display.textContent = 'Not Connected';
            role.textContent = 'Connect MetaMask';
            avatarLetter.textContent = '?';
            avatar.style.background = '';
        }
    }

    function formatAddress(addr) {
        return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
    }

    function generateGradient(addr) {
        const h1 = parseInt(addr.substring(2, 8), 16) % 360;
        const h2 = (h1 + 120) % 360;
        return `linear-gradient(135deg, hsl(${h1}, 70%, 50%), hsl(${h2}, 70%, 40%))`;
    }

    function showWalletToast(message, type) {
        // Delegate to app.js toast if available
        if (window.showToast) {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // ===== Public API =====
    return {
        init,
        connectWallet,
        disconnect,
        registerMedicine,
        verifyMedicine,
        getMedicine,
        getSupplyChain,
        updateSupplyChain,
        getStats,
        getAllMedicines,
        reportCounterfeit,
        get isConnected() { return isConnected; },
        get address() { return userAddress; },
        get contract() { return contract; },
        get hasContract() { return !!contract; }
    };
})();
