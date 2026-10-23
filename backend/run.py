#!/usr/bin/env python3
"""
ColdChain Ledger — Backend Entry Point
Run with: python run.py
"""

import os
import sys

# Add parent dir to path
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.services.seed_service import seed_database
from app.models.database import get_session

app = create_app()

if __name__ == "__main__":
    # Seed demo data on startup
    try:
        print("[STARTUP] Seeding demo data...")
        seed_database()
    except Exception as e:
        print(f"[STARTUP] Seed warning: {e}")

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV", "development") == "development"

    print(f"[STARTUP] ColdChain Ledger API starting on http://{host}:{port}")
    print(f"[STARTUP] Health check: http://localhost:{port}/api/health")
    app.run(host=host, port=port, debug=debug)
