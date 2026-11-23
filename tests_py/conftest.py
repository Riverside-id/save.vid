import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "api"))
os.environ.setdefault("MEDIA_TOKEN_SECRET", "pytest-secret-0123456789abcdefghijklmnop")
