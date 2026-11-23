import json
from pathlib import Path

from _lib.tokens import sign_token

VECTOR = json.loads((Path(__file__).resolve().parent.parent / "shared" / "token-vector.json").read_text(encoding="utf-8"))


def test_cross_language_vector_is_stable():
    p = VECTOR["payload"]
    token = sign_token(
        VECTOR["secret"].encode(),
        url=p["u"],
        referer=p["r"],
        filename=p["f"],
        mime=p["m"],
        ttl=p["x"] - VECTOR["now"],
        now=VECTOR["now"],
    )
    assert token == VECTOR["token"]


def test_different_secret_changes_signature():
    a = sign_token(b"a" * 32, url="https://x.cdninstagram.com/a", referer=None, filename="a", mime="image/jpeg", ttl=1, now=0)
    b = sign_token(b"b" * 32, url="https://x.cdninstagram.com/a", referer=None, filename="a", mime="image/jpeg", ttl=1, now=0)
    assert a.split(".")[0] == b.split(".")[0] and a != b
