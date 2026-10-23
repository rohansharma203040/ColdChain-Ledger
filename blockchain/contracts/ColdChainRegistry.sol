// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ColdChainRegistry
 * @dev Tamper-evident on-chain anchor for pharmaceutical cold chain shipments.
 * Stores immutable SHA-256 dataset fingerprints and cryptographic manifest hashes.
 */
contract ColdChainRegistry {
    struct Commitment {
        string shipmentId;
        bytes32 datasetFingerprint;
        bytes32 manifestHash;
        address sender;
        uint256 timestamp;
        uint256 blockNumber;
        bool exists;
    }

    // Mapping from shipment ID hash to Commitment
    mapping(bytes32 => Commitment) private commitments;

    event ShipmentCommitted(
        bytes32 indexed shipmentKey,
        string shipmentId,
        bytes32 indexed datasetFingerprint,
        bytes32 manifestHash,
        address indexed sender,
        uint256 timestamp,
        uint256 blockNumber
    );

    /**
     * @notice Anchor a shipment's dataset fingerprint and manifest hash on-chain.
     * @param shipmentId Unique business identifier of the shipment (e.g. SHIP-1001)
     * @param datasetFingerprint Root SHA-256 fingerprint of the hash-chained sensor records
     * @param manifestHash Hash of the signed Ed25519 manifest
     */
    function commitShipment(
        string calldata shipmentId,
        bytes32 datasetFingerprint,
        bytes32 manifestHash
    ) external {
        require(bytes(shipmentId).length > 0, "Empty shipment ID");
        require(datasetFingerprint != bytes32(0), "Empty dataset fingerprint");

        bytes32 key = keccak256(abi.encodePacked(shipmentId));
        require(!commitments[key].exists, "Shipment already committed");

        commitments[key] = Commitment({
            shipmentId: shipmentId,
            datasetFingerprint: datasetFingerprint,
            manifestHash: manifestHash,
            sender: msg.sender,
            timestamp: block.timestamp,
            blockNumber: block.number,
            exists: true
        });

        emit ShipmentCommitted(
            key,
            shipmentId,
            datasetFingerprint,
            manifestHash,
            msg.sender,
            block.timestamp,
            block.number
        );
    }

    /**
     * @notice Verify if a computed dataset fingerprint matches the on-chain commitment.
     * @param shipmentId Unique business identifier of the shipment
     * @param computedFingerprint The SHA-256 fingerprint computed from sensor records
     */
    function verifyCommitment(
        string calldata shipmentId,
        bytes32 computedFingerprint
    ) external view returns (bool isMatched, uint256 blockNumber, uint256 timestamp, address sender) {
        bytes32 key = keccak256(abi.encodePacked(shipmentId));
        Commitment memory c = commitments[key];
        require(c.exists, "No commitment found for this shipment");

        return (
            c.datasetFingerprint == computedFingerprint,
            c.blockNumber,
            c.timestamp,
            c.sender
        );
    }

    /**
     * @notice Retrieve the full commitment record for a shipment.
     */
    function getCommitment(string calldata shipmentId) external view returns (Commitment memory) {
        bytes32 key = keccak256(abi.encodePacked(shipmentId));
        require(commitments[key].exists, "No commitment found");
        return commitments[key];
    }
}
