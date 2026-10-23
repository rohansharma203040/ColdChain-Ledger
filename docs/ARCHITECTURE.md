# ColdChain Ledger — Architecture & Security Specification

## 1. Threat Model & Design Goals

### Threats Addressed
1. **Transporter Retroactive Alteration**: A driver or logistics contractor whose refrigeration fails in transit might manually record falsified normal temperatures (e.g. 4°C instead of 9°C) to avoid liability.
2. **Backdated Timestamps**: Logging all readings at the journey's end rather than at actual checkpoints.
3. **Data Substitution / Man-in-the-Middle**: Tampering with sensor files or API payloads between the sensor node and the inspection station.
4. **Retroactive Ledger Rewriting**: Altering past records in the central database after a breach is discovered.

### Architectural Mitigations
- **Dual Telemetry**: Independent sealed IoT sensor telemetry is held separately from transporter-submitted readings. Transporters never have read access to the trusted sensor telemetry (`/api/trusted-data` returns 403 to `TRANSPORTER`).
- **Server Reception Non-Repudiation**: The server records `server_received_at` upon HTTP packet arrival, completely independent of the client's `measured_at`.
- **Cryptographic Hash Chain**: Every sensor record includes `previous_hash`, where:
  $$\text{RecordHash}_i = \text{SHA256}(\text{CanonicalJSON}(\text{Seq}_i, \text{Temp}_i, \text{Timestamp}_i, \text{PrevHash}_{i-1}))$$
- **Ed25519 Asymmetric Manifest**: The entire dataset is fingerprinted and digitally signed by the certified sensor device or sender key:
  $$\text{Signature} = \text{Ed25519Sign}_{K_{priv}}(\text{SHA256}(\text{Hash}_1 \mathbin{\Vert} \dots \mathbin{\Vert} \text{Hash}_n))$$
- **Smart Contract Anchor**: `ColdChainRegistry.sol` anchors the dataset fingerprint on-chain at dispatch time.

---

## 2. API Contract Summary

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/auth/login` | POST | Public | Authenticate user & issue JWT |
| `/api/auth/me` | GET | Authenticated | Retrieve session profile |
| `/api/shipments/` | GET | Authenticated | List visible shipments (role-filtered) |
| `/api/shipments/` | POST | ADMIN | Create new shipment batch |
| `/api/shipments/<id>` | GET | Authenticated | Retrieve shipment metadata |
| `/api/shipments/<id>/assign` | POST | ADMIN | Assign transporter driver |
| `/api/shipments/<id>/init-trusted-data` | POST | ADMIN | Initialize signed IoT dataset |
| `/api/journeys/<id>/start` | POST | TRANSPORTER | Mark journey as departed |
| `/api/journeys/<id>/deliver` | POST | TRANSPORTER | Mark journey as delivered |
| `/api/readings/<id>` | POST | TRANSPORTER | Submit manual temperature reading |
| `/api/readings/<id>` | GET | Authenticated | View submitted driver readings |
| `/api/trusted-data/<id>` | GET | ADMIN, RECEIVER | View authoritative IoT records (Blocked for drivers) |
| `/api/verification/<id>` | POST | ADMIN, RECEIVER | Run full cryptographic cross-verification |
| `/api/verification/<id>/offline` | POST | ADMIN, RECEIVER | Air-gapped offline verification |
| `/api/decisions/<id>` | POST | RECEIVER | Commit formal ACCEPT / REJECT / HOLD decision |
| `/api/audit/<id>` | GET | Authenticated | Retrieve immutable event audit trail |
| `/api/reports/<id>` | GET | Authenticated | Export signed JSON compliance dossier |
