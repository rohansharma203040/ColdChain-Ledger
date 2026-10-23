# ColdChain Ledger — Backend Render Deployment Guide

This guide describes how to configure, deploy, and operate the ColdChain Ledger Flask backend on [Render](https://render.com).

---

## 1. Render Service Configuration

Deploy the backend as a **Web Service** on Render with the following specifications:

| Setting | Value (Recommended) | Monorepo Root Alternative |
| :--- | :--- | :--- |
| **Environment** | Python 3 | Python 3 |
| **Region** | Oregon, Frankfurt, or Singapore | Any |
| **Branch** | `main` | `main` |
| **Root Directory** | `backend` | *(leave empty / root)* |
| **Build Command** | `pip install -r requirements.txt` | `pip install -r backend/requirements.txt` |
| **Start Command** | `gunicorn --bind 0.0.0.0:$PORT run:app` | `gunicorn --chdir backend --bind 0.0.0.0:$PORT run:app` |
| **Health Check Path**| `/api/health` | `/api/health` |
| **Auto-Deploy** | Yes | Yes |

> **Application Object Verification:**
> The entrypoint is `backend/run.py`. Inside `run.py`, the Flask application instance is initialized at line 17 as `app = create_app()`. Therefore, the WSGI target for Gunicorn is strictly `run:app`.

---

## 2. Environment Variables

Configure the following variables in the Render Dashboard (**Web Service** &rarr; **Environment** &rarr; **Environment Variables**):

### A. Required for Production

| Variable | Required | Description | Example / Recommendation |
| :--- | :--- | :--- | :--- |
| `SECRET_KEY` | **Yes** | Flask session and cryptographic secret | Secure 32-byte hex string (e.g. generated via `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `JWT_SECRET_KEY` | **Yes** | Secret key for signing JWT bearer tokens | 32+ character hex string (RFC 7518 requires &ge;32 bytes for HS256 to avoid insecure key warnings) |
| `ALLOWED_ORIGINS`| **Yes** | Comma-separated list of allowed CORS origins | `https://coldchain-ledger.onrender.com,http://localhost:5173` |
| `FLASK_ENV` | **Yes** | Flask environment setting | `production` (ensures debug mode is disabled) |
| `PYTHONUNBUFFERED` | Optional | Disables output buffering | `1` (ensures application logs immediately appear in Render log stream) |

### B. Database Configuration

| Variable | Required | Description | Example / Recommendation |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Recommended | Connection URI for the database | `postgresql://user:password@hostname:5432/coldchain_db` or `sqlite:////var/data/coldchain.db` |

*If `DATABASE_URL` is omitted, the application falls back to `sqlite:///coldchain.db` in the working directory (see persistence warning below).*

### C. Cryptographic Signing Keys

| Variable | Required | Description | Example / Recommendation |
| :--- | :--- | :--- | :--- |
| `SIGNING_PRIVATE_KEY_FILE` | Optional | Absolute path to Ed25519 private PEM key | `/etc/secrets/signing_key.pem` |
| `SIGNING_PUBLIC_KEY_FILE` | Optional | Absolute path to Ed25519 public PEM key | `/etc/secrets/signing_key_pub.pem` |
| `SIGNING_KEYS_DIR` | Optional | Directory holding signing keys | `/etc/secrets` or `keys` |

*If unconfigured, the service reads from local `backend/keys/`. If no keys exist at runtime, `seed_service.py` will generate development keys automatically.*

### D. SMTP Email Settings (Optional)

Configure only if using the automated PDF report dispatch endpoint (`POST /api/reports/<shipment_id>/email`). If omitted, other features operate normally while the email endpoint returns `SMTP_NOT_CONFIGURED`.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `SMTP_HOST` | *(empty)* | Hostname of SMTP server (e.g. `smtp.sendgrid.net`, `smtp.mailgun.org`, `smtp.gmail.com`) |
| `SMTP_PORT` | `587` | SMTP port (typically 587 for STARTTLS or 465 for SSL) |
| `SMTP_USER` | *(empty)* | SMTP account username or API key identity |
| `SMTP_PASSWORD` | *(empty)* | SMTP account password or API secret token |
| `SMTP_FROM` | `no-reply@coldchainledger.internal` | Sender email address displayed in outgoing emails |
| `SMTP_USE_TLS` | `true` | Set to `true` to enable STARTTLS |
| `SMTP_USE_SSL` | `false` | Set to `true` for implicit SSL (port 465) |

---

## 3. Database Persistence Requirements

> **CRITICAL ARCHITECTURAL WARNING:**
> Render Web Services operate on ephemeral container filesystems. Any local file (such as `backend/coldchain.db`) written to the container root will be **permanently destroyed** whenever:
> - The service redeploys
> - The service restarts or crashes
> - The instance goes to sleep (Free tier spin-down)

### Recommended Production Solution: Managed PostgreSQL

To ensure data integrity, audit trails, and multi-worker consistency across deploys:

1. Create a **PostgreSQL Database** on Render (Dashboard &rarr; **New** &rarr; **PostgreSQL**).
2. Copy the **Internal Database URL** from the database settings page.
3. In your Web Service settings, set `DATABASE_URL` to that Internal Database URL.
4. The backend automatically translates Render's legacy `postgres://` connection scheme into SQLAlchemy's required `postgresql://` dialect prefix and enables connection pinging (`pool_pre_ping=True`).
5. All tables are automatically initialized on startup via `Base.metadata.create_all(engine)`.

### Alternative: Persistent Disk with SQLite

If retaining SQLite:

1. Render Persistent Disks require a paid Web Service plan (Starter or higher).
2. Attach a Persistent Disk in Render Web Service &rarr; **Disks** &rarr; **Add Disk**.
3. Mount path: `/var/data` (Size: 1 GB or as required).
4. Set the environment variable:
   ```env
   DATABASE_URL=sqlite:////var/data/coldchain.db
   ```
   *(Note the four forward slashes: three for the scheme `sqlite:///` plus one for the absolute path `/var/data/...`)*

---

## 4. Seeding Initial Demo Data on Render

The backend includes a deterministic data seeder (`app/services/seed_service.py`) that creates:
- 4 default users (`admin`, `receiver`, `transporter1`, `transporter2`)
- 3 test shipments (`SHIP-1001` clean, `SHIP-1002` tampered, `SHIP-1003` missing records)
- Ed25519 signed manifests, hash chains, and demo blockchain commitments

Because Gunicorn directly imports `run:app` (bypassing `if __name__ == "__main__":`), you can seed a fresh database by either:

1. **One-time command from Render Shell:**
   Open the **Shell** tab in the Render Dashboard and execute:
   ```bash
   python -c "from app.services.seed_service import seed_database; seed_database()"
   ```
2. **Or via the Build Command:**
   ```bash
   pip install -r requirements.txt && python -c "from app.services.seed_service import seed_database; seed_database()"
   ```
   *The seeder is fully idempotent: if records already exist, it skips them safely.*

---

## 5. CORS Configuration for Frontend Deployment

When hosting the React frontend on Render (Static Site), Vercel, or Netlify:

1. Note the deployed frontend URL (e.g. `https://coldchain-ledger.onrender.com` or `https://coldchain-ledger.vercel.app`).
2. Add that URL to the `ALLOWED_ORIGINS` environment variable on the backend Web Service:
   ```env
   ALLOWED_ORIGINS=https://coldchain-ledger.onrender.com,http://localhost:5173
   ```
3. Multiple origins must be comma-separated without trailing slashes.
4. In the frontend React app, ensure `VITE_API_BASE_URL` points to your backend Render URL:
   ```env
   VITE_API_BASE_URL=https://coldchain-backend.onrender.com/api
   ```

---

## 6. Safe Handling of Private Signing Keys

ColdChain Ledger uses Ed25519 digital signatures to sign canonical dataset manifests before shipments embark on journeys.

### Security Best Practices

1. **Never commit `.pem` or `.key` files to Git.** Both root `.gitignore` and `backend/.gitignore` exclude `*.pem` and `*.key`.
2. **Using Render Secret Files:**
   - In Render Dashboard &rarr; Web Service &rarr; **Environment** &rarr; **Secret Files**.
   - Create a file named `signing_key.pem` and paste your private key.
   - Create a file named `signing_key_pub.pem` and paste your public key.
   - Render mounts these files securely into the container at `/etc/secrets/`.
   - Set the corresponding backend environment variables:
     ```env
     SIGNING_PRIVATE_KEY_FILE=/etc/secrets/signing_key.pem
     SIGNING_PUBLIC_KEY_FILE=/etc/secrets/signing_key_pub.pem
     ```
3. **Key Generation for Production:**
   Generate a unique keypair offline before deployment:
   ```python
   from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
   from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, PrivateFormat, NoEncryption

   priv = Ed25519PrivateKey.generate()
   pub = priv.public_key()
   with open("signing_key.pem", "wb") as f:
       f.write(priv.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()))
   with open("signing_key_pub.pem", "wb") as f:
       f.write(pub.public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
   ```

---

## 7. Remaining Deployment Limitations & Considerations

1. **Blockchain RPC Integration:**
   The current backend verifies cryptographic commitments against fingerprint records stored in the `blockchain_commitments` database table and supports demo mode (`is_demo=True`). The backend does not yet query an external Ethereum RPC endpoint (e.g. Infura / Alchemy). Live EVM queries would require integrating a Web3 provider and adding `BLOCKCHAIN_RPC_URL` and `CONTRACT_ADDRESS` settings.
2. **Render Free Tier Spin-Down:**
   If using the Free tier on Render, the backend service spins down after 15 minutes of inactivity. Initial requests after spin-down may experience a 30–50 second cold start delay. SQLite databases without Persistent Disks will lose data upon spin-down.
3. **Worker Count & Memory:**
   PDF report generation via ReportLab and Matplotlib chart plotting consume temporary memory. For Render's 512 MB Free / Starter instances, run Gunicorn with 2 workers:
   ```bash
   gunicorn --workers 2 --timeout 120 --bind 0.0.0.0:$PORT run:app
   ```
