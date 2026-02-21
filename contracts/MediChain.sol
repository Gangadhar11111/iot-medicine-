// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MediChain - IoT-Based Blockchain Medical Authentication System
 * @dev Smart contract for medicine registration, verification, and supply chain tracking
 * @notice Prevents counterfeit drug distribution using blockchain immutability
 */
contract MediChain {
    // ===== State Variables =====
    address public owner;
    uint256 public medicineCount;
    uint256 public verificationCount;
    uint256 public alertCount;

    // ===== Enums =====
    enum MedicineStatus { Active, Sold, Expired, Flagged }
    enum SupplyStage { Manufactured, QualityChecked, Shipped, InTransit, Delivered, Dispensed }

    // ===== Structs =====
    struct Medicine {
        uint256 id;
        string medicineName;
        string batchNumber;
        string manufacturerId;
        string manufacturerName;
        string mfgDate;
        string expiryDate;
        string medicineType;
        uint256 quantity;
        string composition;
        string shipmentDest;
        uint256 price;
        MedicineStatus status;
        address registeredBy;
        uint256 registeredAt;
        uint256 scanCount;
        bool exists;
    }

    struct SupplyChainEntry {
        SupplyStage stage;
        string actor;
        string location;
        uint256 timestamp;
        address updatedBy;
    }

    struct VerificationRecord {
        address verifier;
        uint256 timestamp;
        bool isAuthentic;
        string details;
    }

    struct CounterfeitAlert {
        uint256 id;
        string batchNumber;
        string reason;
        address reportedBy;
        uint256 timestamp;
        bool resolved;
    }

    // ===== Mappings =====
    mapping(string => Medicine) public medicines; // batchNumber => Medicine
    mapping(string => SupplyChainEntry[]) public supplyChain; // batchNumber => entries
    mapping(string => VerificationRecord[]) public verifications; // batchNumber => records
    mapping(uint256 => CounterfeitAlert) public alerts; // alertId => Alert
    mapping(address => bool) public authorizedManufacturers;
    mapping(address => bool) public authorizedDistributors;
    mapping(address => bool) public authorizedShops;
    string[] public allBatchNumbers; // Track all registered batches

    // ===== Events =====
    event MedicineRegistered(
        string indexed batchNumber,
        string medicineName,
        string manufacturerId,
        address registeredBy,
        uint256 timestamp
    );

    event MedicineVerified(
        string indexed batchNumber,
        bool isAuthentic,
        address verifier,
        uint256 timestamp
    );

    event SupplyChainUpdated(
        string indexed batchNumber,
        SupplyStage stage,
        string actor,
        string location,
        uint256 timestamp
    );

    event CounterfeitAlertRaised(
        uint256 alertId,
        string batchNumber,
        string reason,
        address reportedBy,
        uint256 timestamp
    );

    event MedicineStatusChanged(
        string indexed batchNumber,
        MedicineStatus newStatus,
        uint256 timestamp
    );

    event ManufacturerAuthorized(address indexed manufacturer, uint256 timestamp);
    event DistributorAuthorized(address indexed distributor, uint256 timestamp);
    event ShopAuthorized(address indexed shop, uint256 timestamp);

    // ===== Modifiers =====
    modifier onlyOwner() {
        require(msg.sender == owner, "Only contract owner can perform this action");
        _;
    }

    modifier onlyAuthorizedManufacturer() {
        require(
            authorizedManufacturers[msg.sender] || msg.sender == owner,
            "Not an authorized manufacturer"
        );
        _;
    }

    modifier medicineExists(string memory _batchNumber) {
        require(medicines[_batchNumber].exists, "Medicine not found on blockchain");
        _;
    }

    // ===== Constructor =====
    constructor() {
        owner = msg.sender;
        authorizedManufacturers[msg.sender] = true;
        authorizedDistributors[msg.sender] = true;
        authorizedShops[msg.sender] = true;
    }

    // ===== Authorization Functions =====
    function authorizeManufacturer(address _manufacturer) external onlyOwner {
        authorizedManufacturers[_manufacturer] = true;
        emit ManufacturerAuthorized(_manufacturer, block.timestamp);
    }

    function authorizeDistributor(address _distributor) external onlyOwner {
        authorizedDistributors[_distributor] = true;
        emit DistributorAuthorized(_distributor, block.timestamp);
    }

    function authorizeShop(address _shop) external onlyOwner {
        authorizedShops[_shop] = true;
        emit ShopAuthorized(_shop, block.timestamp);
    }

    // ===== Medicine Registration (split to avoid stack-too-deep) =====
    function registerMedicine(
        string memory _medicineName,
        string memory _batchNumber,
        string memory _manufacturerId,
        string memory _manufacturerName,
        string memory _mfgDate,
        string memory _expiryDate
    ) external onlyAuthorizedManufacturer {
        require(!medicines[_batchNumber].exists, "Batch number already registered");
        require(bytes(_batchNumber).length > 0, "Batch number cannot be empty");
        require(bytes(_medicineName).length > 0, "Medicine name cannot be empty");

        medicineCount++;

        Medicine storage med = medicines[_batchNumber];
        med.id = medicineCount;
        med.medicineName = _medicineName;
        med.batchNumber = _batchNumber;
        med.manufacturerId = _manufacturerId;
        med.manufacturerName = _manufacturerName;
        med.mfgDate = _mfgDate;
        med.expiryDate = _expiryDate;
        med.status = MedicineStatus.Active;
        med.registeredBy = msg.sender;
        med.registeredAt = block.timestamp;
        med.scanCount = 0;
        med.exists = true;

        allBatchNumbers.push(_batchNumber);

        // Add initial supply chain entry
        supplyChain[_batchNumber].push(SupplyChainEntry({
            stage: SupplyStage.Manufactured,
            actor: _manufacturerName,
            location: "Manufacturing Plant",
            timestamp: block.timestamp,
            updatedBy: msg.sender
        }));

        emit MedicineRegistered(
            _batchNumber,
            _medicineName,
            _manufacturerId,
            msg.sender,
            block.timestamp
        );
    }

    // Set additional medicine details (optional, call after registerMedicine)
    function setMedicineDetails(
        string memory _batchNumber,
        string memory _medicineType,
        uint256 _quantity,
        string memory _composition,
        string memory _shipmentDest,
        uint256 _price
    ) external medicineExists(_batchNumber) {
        Medicine storage med = medicines[_batchNumber];
        med.medicineType = _medicineType;
        med.quantity = _quantity;
        med.composition = _composition;
        med.shipmentDest = _shipmentDest;
        med.price = _price;
    }

    // ===== Medicine Verification =====
    function verifyMedicine(string memory _batchNumber)
        external
        returns (bool isAuthentic, string memory details)
    {
        verificationCount++;

        if (!medicines[_batchNumber].exists) {
            // Medicine not found — raise alert
            alertCount++;
            alerts[alertCount] = CounterfeitAlert({
                id: alertCount,
                batchNumber: _batchNumber,
                reason: "Medicine not found on blockchain",
                reportedBy: msg.sender,
                timestamp: block.timestamp,
                resolved: false
            });

            verifications[_batchNumber].push(VerificationRecord({
                verifier: msg.sender,
                timestamp: block.timestamp,
                isAuthentic: false,
                details: "NOT FOUND on blockchain"
            }));

            emit CounterfeitAlertRaised(alertCount, _batchNumber, "Not found on blockchain", msg.sender, block.timestamp);
            emit MedicineVerified(_batchNumber, false, msg.sender, block.timestamp);

            return (false, "WARNING: Medicine NOT found on blockchain. Possible counterfeit!");
        }

        Medicine storage med = medicines[_batchNumber];
        med.scanCount++;

        // Check status
        if (med.status == MedicineStatus.Flagged) {
            verifications[_batchNumber].push(VerificationRecord({
                verifier: msg.sender,
                timestamp: block.timestamp,
                isAuthentic: false,
                details: "Medicine FLAGGED as suspicious"
            }));
            emit MedicineVerified(_batchNumber, false, msg.sender, block.timestamp);
            return (false, "WARNING: Medicine has been FLAGGED as suspicious!");
        }

        if (med.status == MedicineStatus.Sold) {
            verifications[_batchNumber].push(VerificationRecord({
                verifier: msg.sender,
                timestamp: block.timestamp,
                isAuthentic: false,
                details: "Medicine already marked as SOLD"
            }));
            emit MedicineVerified(_batchNumber, false, msg.sender, block.timestamp);
            return (false, "WARNING: Medicine already marked as SOLD. Possible duplicate!");
        }

        // All checks passed
        verifications[_batchNumber].push(VerificationRecord({
            verifier: msg.sender,
            timestamp: block.timestamp,
            isAuthentic: true,
            details: "All verification checks passed"
        }));

        emit MedicineVerified(_batchNumber, true, msg.sender, block.timestamp);
        return (true, "Medicine is AUTHENTIC. All blockchain checks passed.");
    }

    // ===== Supply Chain Update =====
    function updateSupplyChain(
        string memory _batchNumber,
        SupplyStage _stage,
        string memory _actor,
        string memory _location
    ) external medicineExists(_batchNumber) {
        supplyChain[_batchNumber].push(SupplyChainEntry({
            stage: _stage,
            actor: _actor,
            location: _location,
            timestamp: block.timestamp,
            updatedBy: msg.sender
        }));

        emit SupplyChainUpdated(_batchNumber, _stage, _actor, _location, block.timestamp);
    }

    // ===== Mark Medicine as Sold =====
    function markAsSold(string memory _batchNumber) external medicineExists(_batchNumber) {
        medicines[_batchNumber].status = MedicineStatus.Sold;
        emit MedicineStatusChanged(_batchNumber, MedicineStatus.Sold, block.timestamp);
    }

    // ===== Flag Medicine =====
    function flagMedicine(string memory _batchNumber, string memory _reason) external {
        if (medicines[_batchNumber].exists) {
            medicines[_batchNumber].status = MedicineStatus.Flagged;
        }
        alertCount++;
        alerts[alertCount] = CounterfeitAlert({
            id: alertCount,
            batchNumber: _batchNumber,
            reason: _reason,
            reportedBy: msg.sender,
            timestamp: block.timestamp,
            resolved: false
        });
        emit CounterfeitAlertRaised(alertCount, _batchNumber, _reason, msg.sender, block.timestamp);
        emit MedicineStatusChanged(_batchNumber, MedicineStatus.Flagged, block.timestamp);
    }

    // ===== View Functions =====
    function getMedicine(string memory _batchNumber)
        external view
        returns (Medicine memory)
    {
        require(medicines[_batchNumber].exists, "Medicine not found");
        return medicines[_batchNumber];
    }

    function getSupplyChain(string memory _batchNumber)
        external view
        returns (SupplyChainEntry[] memory)
    {
        return supplyChain[_batchNumber];
    }

    function getVerifications(string memory _batchNumber)
        external view
        returns (VerificationRecord[] memory)
    {
        return verifications[_batchNumber];
    }

    function getAlert(uint256 _alertId)
        external view
        returns (CounterfeitAlert memory)
    {
        return alerts[_alertId];
    }

    function getTotalBatches() external view returns (uint256) {
        return allBatchNumbers.length;
    }

    function getBatchByIndex(uint256 _index) external view returns (string memory) {
        require(_index < allBatchNumbers.length, "Index out of bounds");
        return allBatchNumbers[_index];
    }

    function getStats()
        external view
        returns (
            uint256 totalMedicines,
            uint256 totalVerifications,
            uint256 totalAlerts,
            address contractOwner
        )
    {
        return (medicineCount, verificationCount, alertCount, owner);
    }
}
