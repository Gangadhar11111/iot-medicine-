/**
 * MediChain — Application Controller (MetaMask + Smart Contract Version)
 * Handles UI, QR scanning, navigation, charts, and MetaMask/contract interaction.
 */

(function () {
    'use strict';

    const MM = window.MetaMaskModule;
    const localBlockchain = window.MediChain; // Fallback
    let html5QrCode = null;
    let scannerPageQr = null;
    let activityChart = null;
    let distributionChart = null;
    let useSmartContract = false; // Will be true when MetaMask + contract are ready

    // ===== Global Toast (exposed for MetaMask module) =====
    window.showToast = showToast;

    // ===== Initialization =====
    async function init() {
        // Initialize local blockchain as fallback
        await localBlockchain.initialize();

        // Initialize MetaMask module
        await MM.init();
        useSmartContract = MM.hasContract && MM.isConnected;

        setupNavigation();
        setupEventListeners();
        setupBlockchainListeners();
        await updateDashboard();
        initCharts();
        await updateInventoryTable();
        updateTransactionTable();
        updateAlerts();
        hideLoadingScreen();
    }

    function hideLoadingScreen() {
        setTimeout(() => {
            const ls = document.getElementById('loading-screen');
            ls.classList.add('fade-out');
            document.getElementById('app').classList.remove('hidden');
            setTimeout(() => ls.style.display = 'none', 500);
        }, 2200);
    }

    // ===== Navigation =====
    function setupNavigation() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                navigateTo(link.dataset.page);
            });
        });
        document.querySelectorAll('.view-all').forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                navigateTo(link.dataset.page);
            });
        });
    }

    function navigateTo(page) {
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const navLink = document.querySelector(`[data-page="${page}"]`);
        const pageEl = document.getElementById(`page-${page}`);
        if (navLink) navLink.classList.add('active');
        if (pageEl) pageEl.classList.add('active');
        const titles = {
            dashboard: 'Dashboard', register: 'Register Medicine',
            verify: 'Verify Medicine', supplychain: 'Supply Chain',
            transactions: 'Transaction Ledger', scanner: 'IoT QR Scanner',
            alerts: 'Alert Center'
        };
        document.getElementById('page-title').textContent = titles[page] || page;
        document.getElementById('breadcrumb-current').textContent = titles[page] || page;
        document.getElementById('sidebar').classList.remove('open');
    }

    // ===== Event Listeners =====
    function setupEventListeners() {
        // Sidebar toggle
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // MetaMask connect
        document.getElementById('connect-wallet-btn').addEventListener('click', async () => {
            if (MM.isConnected) {
                MM.disconnect();
                useSmartContract = false;
                showToast('Wallet disconnected. Using local blockchain.', 'info');
            } else {
                const connected = await MM.connectWallet();
                if (connected) {
                    useSmartContract = MM.hasContract;
                    if (useSmartContract) {
                        showToast('🔗 Connected to MetaMask + Smart Contract!', 'success');
                    } else {
                        showToast('MetaMask connected but no contract found. Deploy the contract first.', 'warning');
                    }
                    await updateDashboard();
                    await updateInventoryTable();
                }
            }
        });

        // Register form
        document.getElementById('register-form').addEventListener('submit', handleRegister);
        document.getElementById('reset-form').addEventListener('click', resetForm);

        // Verify
        document.getElementById('verify-manual-btn').addEventListener('click', handleManualVerify);
        document.getElementById('verify-batch').addEventListener('keypress', e => {
            if (e.key === 'Enter') handleManualVerify();
        });

        // Verify tabs
        document.querySelectorAll('.verify-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.verify-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.verify-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
            });
        });

        // QR Scanner in verify page
        document.getElementById('start-scanner-btn').addEventListener('click', () => startVerifyScanner());
        document.getElementById('stop-scanner-btn').addEventListener('click', () => stopVerifyScanner());

        // QR Scanner page
        document.getElementById('scanner-start').addEventListener('click', () => startPageScanner());
        document.getElementById('scanner-stop').addEventListener('click', () => stopPageScanner());

        // Download & Print QR
        document.getElementById('download-qr').addEventListener('click', downloadQR);
        document.getElementById('print-qr').addEventListener('click', printQR);

        // Supply chain track
        document.getElementById('track-btn').addEventListener('click', handleTrackMedicine);
        document.getElementById('track-batch').addEventListener('keypress', e => {
            if (e.key === 'Enter') handleTrackMedicine();
        });

        // Transaction filter
        document.getElementById('tx-filter').addEventListener('change', updateTransactionTable);

        // Global search
        document.getElementById('global-search').addEventListener('input', handleSearch);

        // Report counterfeit
        document.getElementById('report-counterfeit').addEventListener('click', handleReportCounterfeit);

        // Modal close
        document.getElementById('modal-close').addEventListener('click', closeModal);
        document.getElementById('modal-overlay').addEventListener('click', e => {
            if (e.target === document.getElementById('modal-overlay')) closeModal();
        });

        // Notification btn
        document.getElementById('notification-btn').addEventListener('click', () => navigateTo('alerts'));
    }

    // ===== Blockchain Event Listeners (local) =====
    function setupBlockchainListeners() {
        localBlockchain.on('medicineRegistered', () => {
            updateDashboard();
            updateInventoryTable();
            updateTransactionTable();
            updateCharts();
        });
        localBlockchain.on('verificationComplete', () => {
            updateDashboard();
            updateTransactionTable();
            updateCharts();
        });
        localBlockchain.on('alertCreated', () => {
            updateAlerts();
            updateDashboard();
        });
        localBlockchain.on('blockAdded', (block) => {
            updateBlockchainVisual();
            document.getElementById('block-number').textContent = block.index;
            const hash = block.hash;
            document.getElementById('last-hash').textContent = '0x' + hash.substring(0, 6) + '...' + hash.substring(hash.length - 4);
        });
    }

    // ===== Register Medicine =====
    async function handleRegister(e) {
        e.preventDefault();
        const btn = document.getElementById('register-btn');
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span> Mining Block...';

        try {
            const medicineData = {
                medicineName: document.getElementById('medicine-name').value.trim(),
                batchNumber: document.getElementById('batch-number').value.trim(),
                manufacturerId: document.getElementById('manufacturer-id').value.trim(),
                manufacturerName: document.getElementById('manufacturer-name').value.trim(),
                mfgDate: document.getElementById('mfg-date').value,
                expiryDate: document.getElementById('exp-date').value,
                type: document.getElementById('medicine-type').value,
                quantity: parseInt(document.getElementById('quantity').value) || 0,
                composition: document.getElementById('composition').value.trim(),
                shipmentDest: document.getElementById('shipment-dest').value.trim(),
                price: document.getElementById('price').value || '0'
            };

            if (!medicineData.medicineName || !medicineData.batchNumber ||
                !medicineData.manufacturerId || !medicineData.manufacturerName ||
                !medicineData.mfgDate || !medicineData.expiryDate) {
                showToast('Please fill in all required fields', 'error');
                resetButton();
                return;
            }

            let result;
            if (useSmartContract) {
                // Use MetaMask + Smart Contract
                result = await MM.registerMedicine(medicineData);
                // Also save locally for UI tracking
                try { await localBlockchain.registerMedicine(medicineData); } catch (e) { }
            } else {
                // Use local blockchain
                result = await localBlockchain.registerMedicine(medicineData);
                result = {
                    success: true,
                    transactionHash: result.transaction.hash,
                    blockNumber: result.block.index,
                    batchNumber: medicineData.batchNumber
                };
            }

            // Generate QR code
            const qrData = JSON.stringify({
                system: 'MediChain',
                version: '1.0',
                batch: medicineData.batchNumber,
                name: medicineData.medicineName,
                mfg: medicineData.manufacturerId,
                contract: (MM.hasContract && MM.contract) ? MM.contract.target || 'blockchain' : 'local',
                block: result.blockNumber
            });

            const qrContainer = document.getElementById('qr-canvas');
            qrContainer.innerHTML = ''; // Clear previous QR
            if (typeof QRCode !== 'undefined') {
                new QRCode(qrContainer, {
                    text: qrData,
                    width: 200,
                    height: 200,
                    colorDark: '#0a0e1a',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.H
                });
            } else {
                qrContainer.innerHTML = '<p style="padding:40px;color:#666;">QR library failed to load</p>';
                console.warn('QRCode library not loaded.');
            }

            // Show results
            document.getElementById('qr-placeholder').classList.add('hidden');
            document.getElementById('qr-result').classList.remove('hidden');
            document.getElementById('qr-med-name').textContent = medicineData.medicineName;
            document.getElementById('qr-batch-id').textContent = medicineData.batchNumber;

            const regDetails = document.getElementById('registration-details');
            regDetails.classList.remove('hidden');
            const txHash = result.transactionHash || '';
            document.getElementById('tx-hash').textContent =
                txHash.length > 20 ? txHash.substring(0, 18) + '...' + txHash.substring(txHash.length - 8) : txHash;
            document.getElementById('reg-block').textContent = '#' + result.blockNumber;
            document.getElementById('reg-timestamp').textContent = new Date().toLocaleString();

            const mode = useSmartContract ? '(Smart Contract via MetaMask)' : '(Local Blockchain)';
            showToast(`✅ "${medicineData.medicineName}" registered on Block #${result.blockNumber} ${mode}`, 'success');

            await updateDashboard();
            await updateInventoryTable();
        } catch (err) {
            showToast('❌ ' + err.message, 'error');
        }

        resetButton();
    }

    function resetButton() {
        const btn = document.getElementById('register-btn');
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="2" y="2" width="20" height="20" rx="4"/><path d="M7 7h10v10H7z"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg> Register on Blockchain`;
    }

    function resetForm() {
        document.getElementById('register-form').reset();
        document.getElementById('qr-placeholder').classList.remove('hidden');
        document.getElementById('qr-result').classList.add('hidden');
        document.getElementById('registration-details').classList.add('hidden');
    }

    // ===== Verify Medicine =====
    async function handleManualVerify() {
        const batch = document.getElementById('verify-batch').value.trim();
        if (!batch) { showToast('Please enter a batch number', 'error'); return; }
        await performVerification(batch);
    }

    async function performVerification(batchNumber) {
        const placeholder = document.getElementById('verify-placeholder');
        const successDiv = document.getElementById('verify-success');
        const failDiv = document.getElementById('verify-fail');
        placeholder.classList.add('hidden');

        try {
            let result;

            if (useSmartContract) {
                result = await MM.verifyMedicine(batchNumber);
                // Build checks for UI
                result.checks = [];
                if (result.isAuthentic) {
                    result.checks = [
                        { name: 'Blockchain Record Exists', passed: true, detail: 'Found on smart contract' },
                        { name: 'Batch Number Matches', passed: true, detail: `Batch: ${batchNumber}` },
                        { name: 'Medicine Not Expired', passed: true, detail: 'Status: Active' },
                        { name: 'Not Previously Sold', passed: true, detail: result.medicine ? `Status: ${result.medicine.status}` : 'Active' },
                        { name: 'Supply Chain Valid', passed: true, detail: 'On-chain verification passed' },
                        { name: 'Smart Contract Verified', passed: true, detail: `Block #${result.blockNumber}` }
                    ];
                } else {
                    result.checks = [
                        { name: 'Blockchain Record Exists', passed: !!result.medicine, detail: result.medicine ? 'Found' : 'NOT found' },
                        { name: 'Smart Contract Check', passed: false, detail: 'Verification failed on-chain' }
                    ];
                }
                // Also log locally
                try { await localBlockchain.verifyMedicine(batchNumber); } catch (e) { }
            } else {
                result = await localBlockchain.verifyMedicine(batchNumber);
            }

            if (result.isAuthentic) {
                successDiv.classList.remove('hidden');
                failDiv.classList.add('hidden');

                const checksDiv = document.getElementById('verification-checks');
                checksDiv.innerHTML = (result.checks || []).map(c => `
                    <div class="check-item">
                        <div class="check-icon ${c.passed ? 'pass' : 'fail'}">
                            ${c.passed
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
                    }
                        </div>
                        <span class="check-text">${c.name}</span>
                        <span class="badge ${c.passed ? 'badge-success' : 'badge-danger'}">${c.passed ? 'PASS' : 'FAIL'}</span>
                    </div>
                `).join('');

                const med = result.medicine;
                if (med) {
                    document.getElementById('verified-medicine-details').innerHTML = `
                        <h4 style="margin-bottom:12px; font-size:0.9rem;">Medicine Details</h4>
                        <div class="detail-row"><span class="detail-label">Name</span><span class="detail-value">${med.medicineName}</span></div>
                        <div class="detail-row"><span class="detail-label">Batch</span><span class="detail-value">${batchNumber}</span></div>
                        <div class="detail-row"><span class="detail-label">Manufacturer</span><span class="detail-value">${med.manufacturerName || med.manufacturerId}</span></div>
                        <div class="detail-row"><span class="detail-label">Mfg Date</span><span class="detail-value">${med.mfgDate}</span></div>
                        <div class="detail-row"><span class="detail-label">Expiry</span><span class="detail-value">${med.expiryDate}</span></div>
                        <div class="detail-row"><span class="detail-label">Type</span><span class="detail-value">${med.medicineType || med.type || '-'}</span></div>
                        <div class="detail-row"><span class="detail-label">Scans</span><span class="detail-value">${med.scanCount || 0}</span></div>
                        ${result.transactionHash ? `<div class="detail-row"><span class="detail-label">Tx Hash</span><span class="detail-value hash">${result.transactionHash.substring(0, 18)}...</span></div>` : ''}
                    `;
                }
                showToast('✅ Medicine verified as AUTHENTIC', 'success');
            } else {
                successDiv.classList.add('hidden');
                failDiv.classList.remove('hidden');
                const failedChecks = (result.checks || []).filter(c => !c.passed);
                document.getElementById('fail-reason').textContent =
                    failedChecks.map(c => c.detail).join('; ') || 'Verification failed';
                showToast('⚠️ Warning: Possible Counterfeit Medicine!', 'error');
            }
        } catch (err) {
            successDiv.classList.add('hidden');
            failDiv.classList.remove('hidden');
            document.getElementById('fail-reason').textContent = err.message;
            showToast('⚠️ ' + err.message, 'error');
        }
    }

    // ===== Report Counterfeit =====
    async function handleReportCounterfeit() {
        const batch = document.getElementById('verify-batch').value.trim();
        if (!batch) {
            showToast('No batch number to report', 'error');
            return;
        }
        try {
            if (useSmartContract) {
                await MM.reportCounterfeit(batch, 'Reported as counterfeit by verifier');
            }
            await localBlockchain.createAlert(batch, 'Reported as counterfeit by verifier');
            showToast('🚨 Counterfeit report submitted to blockchain', 'warning');
        } catch (err) {
            showToast('Report failed: ' + err.message, 'error');
        }
    }

    // ===== QR Scanning =====
    async function startVerifyScanner() {
        try {
            if (typeof Html5Qrcode === 'undefined') {
                showToast('QR Scanner library not loaded. Refresh the page.', 'error');
                return;
            }
            const reader = document.getElementById('qr-reader');
            reader.innerHTML = '';
            document.getElementById('scanner-status').style.display = 'none';
            html5QrCode = new Html5Qrcode('qr-reader');

            // Try multiple camera options
            let started = false;
            const cameraConfigs = [
                { facingMode: 'environment' },  // Back camera (mobile)
                { facingMode: 'user' },          // Front camera (laptop)
            ];

            // First try to get available cameras
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length > 0) {
                    // Use first available camera
                    await html5QrCode.start(
                        devices[0].id,
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        async (decodedText) => {
                            await stopVerifyScanner();
                            handleQRData(decodedText);
                        },
                        () => { }
                    );
                    started = true;
                }
            } catch (e) {
                console.warn('Camera enumeration failed, trying fallback:', e.message);
            }

            // Fallback: try facingMode configs
            if (!started) {
                for (const config of cameraConfigs) {
                    try {
                        await html5QrCode.start(
                            config,
                            { fps: 10, qrbox: { width: 250, height: 250 } },
                            async (decodedText) => {
                                await stopVerifyScanner();
                                handleQRData(decodedText);
                            },
                            () => { }
                        );
                        started = true;
                        break;
                    } catch (e) {
                        console.warn('Camera config failed:', config, e.message);
                    }
                }
            }

            if (started) {
                document.getElementById('start-scanner-btn').disabled = true;
                document.getElementById('stop-scanner-btn').disabled = false;
                showToast('📷 Camera scanner activated', 'info');
            } else {
                // Show file upload fallback
                showToast('📷 Camera unavailable. Use file upload or enter batch number manually.', 'warning');
                html5QrCode = null;
            }
        } catch (err) {
            showToast('Camera access denied: ' + err.message, 'error');
        }
    }

    async function stopVerifyScanner() {
        if (html5QrCode) {
            try { await html5QrCode.stop(); } catch (e) { }
            html5QrCode = null;
        }
        document.getElementById('start-scanner-btn').disabled = false;
        document.getElementById('stop-scanner-btn').disabled = true;
        document.getElementById('scanner-status').style.display = 'flex';
    }

    async function startPageScanner() {
        try {
            if (typeof Html5Qrcode === 'undefined') {
                showToast('QR Scanner library not loaded. Refresh the page.', 'error');
                return;
            }
            const reader = document.getElementById('scanner-reader');
            reader.innerHTML = '';
            document.getElementById('scanner-overlay').style.display = 'none';
            scannerPageQr = new Html5Qrcode('scanner-reader');

            let started = false;
            const scanCallback = async (decodedText) => {
                handleQRData(decodedText);
                addToScanHistory(decodedText);
            };

            // Try camera list first
            try {
                const devices = await Html5Qrcode.getCameras();
                if (devices && devices.length > 0) {
                    await scannerPageQr.start(
                        devices[0].id,
                        { fps: 10, qrbox: { width: 250, height: 250 } },
                        scanCallback,
                        () => { }
                    );
                    started = true;
                }
            } catch (e) {
                console.warn('Camera list failed:', e.message);
            }

            // Fallback to facingMode
            if (!started) {
                for (const mode of ['environment', 'user']) {
                    try {
                        await scannerPageQr.start(
                            { facingMode: mode },
                            { fps: 10, qrbox: { width: 250, height: 250 } },
                            scanCallback,
                            () => { }
                        );
                        started = true;
                        break;
                    } catch (e) {
                        console.warn(`Camera ${mode} failed:`, e.message);
                    }
                }
            }

            if (started) {
                document.getElementById('scanner-start').disabled = true;
                document.getElementById('scanner-stop').disabled = false;
                document.getElementById('cam-dot').classList.add('active');
                document.getElementById('cam-status-text').textContent = 'Active';
                showToast('📷 IoT Camera scanner activated', 'info');
            } else {
                showToast('📷 Camera unavailable. Check browser permissions.', 'warning');
                scannerPageQr = null;
            }
        } catch (err) {
            showToast('Camera failed: ' + err.message, 'error');
        }
    }

    async function stopPageScanner() {
        if (scannerPageQr) {
            try { await scannerPageQr.stop(); } catch (e) { }
            scannerPageQr = null;
        }
        document.getElementById('scanner-start').disabled = false;
        document.getElementById('scanner-stop').disabled = true;
        document.getElementById('cam-dot').classList.remove('active');
        document.getElementById('cam-status-text').textContent = 'Inactive';
        document.getElementById('scanner-overlay').style.display = 'flex';
    }

    async function addToScanHistory(data) {
        let batch = data;
        try { const parsed = JSON.parse(data); batch = parsed.batch || data; } catch (e) { }

        const result = await localBlockchain.verifyMedicine(batch);
        const historyDiv = document.getElementById('scan-history');
        if (historyDiv.querySelector('.empty-state')) historyDiv.innerHTML = '';

        const item = document.createElement('div');
        item.className = 'scan-history-item';
        item.innerHTML = `
            <div class="scan-result-icon ${result.isAuthentic ? 'authentic' : 'counterfeit'}">
                ${result.isAuthentic
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>'
            }
            </div>
            <div class="scan-result-info">
                <div class="scan-result-name">${result.medicine ? result.medicine.medicineName : batch}</div>
                <div class="scan-result-time">${result.isAuthentic ? '✓ Authentic' : '⚠ Counterfeit'} — ${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        historyDiv.prepend(item);
    }

    async function handleQRData(data) {
        let batchNumber = data;
        try {
            const parsed = JSON.parse(data);
            if (parsed.system === 'MediChain' && parsed.batch) {
                batchNumber = parsed.batch;
            }
        } catch (e) { }

        document.getElementById('verify-batch').value = batchNumber;
        await performVerification(batchNumber);
        navigateTo('verify');
        document.querySelector('[data-tab="manual"]').click();
    }

    // ===== Dashboard =====
    async function updateDashboard() {
        let stats;
        if (useSmartContract) {
            stats = await MM.getStats();
            stats = {
                totalMedicines: parseInt(stats.totalMedicines),
                verifiedAuthentic: parseInt(stats.totalVerifications),
                counterfeitAlerts: parseInt(stats.totalAlerts),
                totalBlocks: 0 // We'll get from provider
            };
        } else {
            stats = localBlockchain.getStats();
        }

        animateValue('total-medicines', stats.totalMedicines || 0);
        animateValue('verified-count', stats.verifiedAuthentic || 0);
        animateValue('flagged-count', stats.counterfeitAlerts || 0);
        animateValue('block-count', stats.totalBlocks || localBlockchain.chain.length);
        document.getElementById('total-txns').textContent = stats.totalTransactions || localBlockchain.transactions.length;

        // Update from local blockchain always
        const localStats = localBlockchain.getStats();
        if (localStats.latestBlock) {
            document.getElementById('block-number').textContent = localStats.latestBlock.index;
            const hash = localStats.latestBlock.hash || '0000000000';
            document.getElementById('last-hash').textContent = '0x' + hash.substring(0, 6) + '...' + hash.substring(hash.length - 4);
        }

        document.getElementById('alert-count').textContent = stats.counterfeitAlerts || 0;
        const notifDot = document.getElementById('notification-dot');
        if ((stats.counterfeitAlerts || 0) > 0) notifDot.classList.add('active');

        renderRecentTransactions(localStats.recentTransactions);
        updateBlockchainVisual();
    }

    function animateValue(elementId, target) {
        const el = document.getElementById(elementId);
        const current = parseInt(el.textContent) || 0;
        if (current === target) return;
        const step = target > current ? 1 : -1;
        let val = current;
        const interval = setInterval(() => {
            val += step;
            el.textContent = val;
            if (val === target) clearInterval(interval);
        }, 50);
    }

    function renderRecentTransactions(txns) {
        const container = document.getElementById('recent-transactions');
        if (!txns || txns.length === 0) {
            container.innerHTML = '<div class="empty-state mini"><p>No transactions yet. Register a medicine to get started.</p></div>';
            return;
        }
        container.innerHTML = txns.map(tx => {
            const icons = {
                registration: { cls: 'register', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' },
                verification: { cls: 'verify', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>' },
                transfer: { cls: 'register', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>' },
                alert: { cls: 'alert', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>' }
            };
            const icon = icons[tx.type] || icons.registration;
            const hashDisplay = tx.hash ? tx.hash.substring(0, 14) + '...' : 'pending';
            return `
                <div class="tx-item">
                    <div class="tx-icon ${icon.cls}">${icon.svg}</div>
                    <div class="tx-details">
                        <div class="tx-title">${tx.type.charAt(0).toUpperCase() + tx.type.slice(1)} — ${tx.data.batchNumber || ''}</div>
                        <div class="tx-hash-mini">${hashDisplay}</div>
                    </div>
                    <div class="tx-time">${timeAgo(tx.timestamp)}</div>
                </div>
            `;
        }).join('');
    }

    // ===== Inventory Table =====
    async function updateInventoryTable() {
        let medicines;
        if (useSmartContract) {
            medicines = await MM.getAllMedicines();
        } else {
            medicines = localBlockchain.getAllMedicines();
        }

        const tbody = document.getElementById('inventory-body');
        if (!medicines || medicines.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">No medicines registered yet</td></tr>';
            return;
        }

        tbody.innerHTML = medicines.map(m => {
            let status = m.status || 'active';
            return `
                <tr>
                    <td><code style="color:var(--accent-purple);font-size:0.8rem;">${m.batchNumber}</code></td>
                    <td>${m.medicineName}</td>
                    <td>${m.manufacturerName || m.manufacturerId}</td>
                    <td>${m.mfgDate}</td>
                    <td>${m.expiryDate}</td>
                    <td><span class="status-badge ${status.toLowerCase()}">${status.toUpperCase()}</span></td>
                    <td><button class="btn btn-sm btn-outline" onclick="window.appVerify('${m.batchNumber}')">Verify</button></td>
                </tr>
            `;
        }).join('');
    }

    // ===== Transaction Table =====
    function updateTransactionTable() {
        const filter = document.getElementById('tx-filter').value;
        let txns = localBlockchain.transactions.slice().reverse();
        if (filter !== 'all') txns = txns.filter(t => t.type === filter);

        const tbody = document.getElementById('transaction-body');
        if (txns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:40px;">No transactions found</td></tr>';
            return;
        }

        tbody.innerHTML = txns.map(tx => `
            <tr>
                <td class="hash-cell">${tx.hash ? tx.hash.substring(0, 16) + '...' : '-'}</td>
                <td><span class="badge badge-${tx.type === 'alert' ? 'danger' : 'info'}">${tx.type}</span></td>
                <td><code style="font-size:0.8rem;">${tx.data.batchNumber || '-'}</code></td>
                <td>${tx.from}</td>
                <td>${tx.blockNumber !== null ? '#' + tx.blockNumber : '-'}</td>
                <td>${new Date(tx.timestamp).toLocaleString()}</td>
                <td><span class="status-badge ${tx.status}">${tx.status}</span></td>
            </tr>
        `).join('');
    }

    // ===== Alerts =====
    function updateAlerts() {
        const alerts = localBlockchain.alerts.slice().reverse();
        const container = document.getElementById('alerts-list');
        if (alerts.length === 0) {
            container.innerHTML = `<div class="empty-state mini">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48" opacity="0.3"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
                <p>No alerts. All medicines verified successfully.</p>
            </div>`;
            return;
        }
        container.innerHTML = alerts.map(a => `
            <div class="alert-item">
                <div class="alert-icon-wrap">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="alert-content">
                    <div class="alert-title">Counterfeit Alert — ${a.batchNumber}</div>
                    <div class="alert-desc">${a.reason}</div>
                    <div class="alert-time">${new Date(a.timestamp).toLocaleString()}</div>
                </div>
            </div>
        `).join('');
    }

    // ===== Supply Chain =====
    async function handleTrackMedicine() {
        const batch = document.getElementById('track-batch').value.trim();
        if (!batch) { showToast('Enter a batch number', 'error'); return; }

        let supplyChainData;

        if (useSmartContract) {
            supplyChainData = await MM.getSupplyChain(batch);
        } else {
            const medicine = localBlockchain.getMedicine(batch);
            if (!medicine) { showToast('Medicine not found on blockchain', 'error'); return; }
            supplyChainData = medicine.supplyChain;
        }

        if (!supplyChainData || supplyChainData.length === 0) {
            showToast('No supply chain data found', 'error');
            return;
        }

        const resultCard = document.getElementById('supply-chain-result');
        resultCard.style.display = 'block';
        const timeline = document.getElementById('supply-timeline');

        timeline.innerHTML = supplyChainData.map((step, i) => `
            <div class="timeline-item" style="animation-delay: ${i * 0.15}s;">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <div class="timeline-title">${step.stage}</div>
                    <div class="timeline-desc">${step.actor} — ${step.location}</div>
                    <div class="timeline-time">${new Date(step.timestamp).toLocaleString()}</div>
                    ${step.txHash ? `<div style="font-size:0.7rem;color:var(--accent-purple);font-family:'JetBrains Mono',monospace;margin-top:4px;">Tx: ${step.txHash.substring(0, 20)}...</div>` : ''}
                </div>
            </div>
        `).join('');
    }

    // ===== Blockchain Visual =====
    function updateBlockchainVisual() {
        const container = document.getElementById('blockchain-visual');
        const blocks = localBlockchain.chain.slice(-6);
        container.innerHTML = blocks.map((block, i) => {
            const isGenesis = block.index === 0;
            const hash = block.hash || '0000000000';
            return `
                ${i > 0 ? '<div class="chain-connector"></div>' : ''}
                <div class="block-node ${isGenesis ? 'genesis' : ''}">
                    <span class="block-label">${isGenesis ? 'Genesis' : '#' + block.index}</span>
                    <span class="block-hash-mini">${hash.substring(0, 8)}...</span>
                </div>
            `;
        }).join('');
    }

    // ===== Charts =====
    function initCharts() {
        const actCtx = document.getElementById('activity-chart');
        if (actCtx) {
            activityChart = new Chart(actCtx, {
                type: 'line',
                data: {
                    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                    datasets: [{
                        label: 'Registrations', data: [2, 4, 3, 5, 7, 4, 6],
                        borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)',
                        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#00d4ff'
                    }, {
                        label: 'Verifications', data: [5, 8, 6, 9, 12, 8, 10],
                        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: '#10b981'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: '#8892b0', font: { family: 'Inter' } } } },
                    scales: {
                        x: { ticks: { color: '#5a6484' }, grid: { color: 'rgba(42,48,80,0.5)' } },
                        y: { ticks: { color: '#5a6484' }, grid: { color: 'rgba(42,48,80,0.5)' } }
                    }
                }
            });
        }
        const distCtx = document.getElementById('distribution-chart');
        if (distCtx) {
            distributionChart = new Chart(distCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Other'],
                    datasets: [{
                        data: [35, 25, 15, 15, 10],
                        backgroundColor: ['#00d4ff', '#7c3aed', '#10b981', '#f59e0b', '#ec4899'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false, cutout: '70%',
                    plugins: { legend: { position: 'bottom', labels: { color: '#8892b0', padding: 16, font: { family: 'Inter' } } } }
                }
            });
        }
    }

    function updateCharts() {
        const medicines = localBlockchain.getAllMedicines();
        if (distributionChart && medicines.length > 0) {
            const types = {};
            medicines.forEach(m => { types[m.type] = (types[m.type] || 0) + 1; });
            distributionChart.data.labels = Object.keys(types);
            distributionChart.data.datasets[0].data = Object.values(types);
            distributionChart.update();
        }
    }

    // ===== QR Download/Print =====
    function downloadQR() {
        const qrContainer = document.getElementById('qr-canvas');
        const img = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
        if (!img) { showToast('No QR code to download', 'error'); return; }
        const link = document.createElement('a');
        link.download = `MediChain_QR_${document.getElementById('qr-batch-id').textContent}.png`;
        link.href = img.src || img.toDataURL();
        link.click();
        showToast('QR Code downloaded', 'success');
    }

    function printQR() {
        const qrContainer = document.getElementById('qr-canvas');
        const img = qrContainer.querySelector('img') || qrContainer.querySelector('canvas');
        if (!img) return;
        const imgSrc = img.src || img.toDataURL();
        const w = window.open('');
        w.document.write(`<html><head><title>MediChain QR</title></head><body style="text-align:center;padding:40px;">
            <h2>${document.getElementById('qr-med-name').textContent}</h2>
            <p>${document.getElementById('qr-batch-id').textContent}</p>
            <img src="${imgSrc}" style="width:300px;"/><br>
            <p style="color:#888;font-size:12px;">Verified by MediChain Blockchain</p>
            <script>window.print();<\/script></body></html>`);
    }

    // ===== Search =====
    function handleSearch(e) {
        const query = e.target.value.trim();
        if (query.length < 2) return;
        const results = localBlockchain.search(query);
        if (results.length > 0) showToast(`Found ${results.length} result(s) for "${query}"`, 'info');
    }

    // ===== Toast =====
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" width="20" height="20"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" width="20" height="20"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        container.appendChild(toast);
        setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 4000);
    }

    function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

    function timeAgo(dateStr) {
        const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
        if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
        return Math.floor(seconds / 86400) + 'd ago';
    }

    // Globals
    window.appVerify = function (batch) {
        document.getElementById('verify-batch').value = batch;
        navigateTo('verify');
        performVerification(batch);
    };

    document.addEventListener('DOMContentLoaded', init);
})();
