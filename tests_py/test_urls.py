import pytest

from _lib.errors import ResolveError
from _lib.filenames import build_filename
from _lib.urls import is_allowed_media_url, parse_url


@pytest.mark.parametrize(
    "raw,canonical",
    [
        ("https://www.instagram.com/reel/Chunk8-jurw/?igsh=abc#x", "https://www.instagram.com/reel/Chunk8-jurw/"),
        ("instagram.com/p/BQ0eAlwhDrw", "https://www.instagram.com/p/BQ0eAlwhDrw/"),
        ("https://m.instagram.com/reels/Chunk8-jurw", "https://www.instagram.com/reel/Chunk8-jurw/"),
        ("https://www.instagram.com/someone/p/BQ0eAlwhDrw/", "https://www.instagram.com/p/BQ0eAlwhDrw/"),
        ("https://www.tiktok.com/@a.b/video/7047596209028074758?lang=en", "https://www.tiktok.com/@a.b/video/7047596209028074758"),
    ],
)
def test_accepts_and_canonicalizes(raw, canonical):
    assert parse_url(raw).canonical == canonical


@pytest.mark.parametrize(
    "raw,code",
    [
        ("", "INVALID_URL"),
        (None, "INVALID_URL"),
        (123, "INVALID_URL"),
        ("javascript:alert(1)", "INVALID_URL"),
        ("file:///etc/passwd", "INVALID_URL"),
        ("https://user:pw@www.instagram.com/p/abcdef/", "INVALID_URL"),
        ("https://www.instagram.com:81/p/abcdef/", "INVALID_URL"),
        ("https://www.instagram.com/p/abc def/", "INVALID_URL"),
        ("https://instagram.com.evil.example/p/abcdef/", "UNSUPPORTED_URL"),
        ("http://169.254.169.254/latest/meta-data", "UNSUPPORTED_URL"),
        ("https://www.instagram.com/stories/x/1/", "UNSUPPORTED_URL"),
        ("https://www.instagram.com/someone/", "UNSUPPORTED_URL"),
        ("https://www.instagram.com/p/" + "a" * 3000, "INVALID_URL"),
    ],
)
def test_rejects(raw, code):
    with pytest.raises(ResolveError) as exc:
        parse_url(raw)
    assert exc.value.code == code


def test_media_allowlist():
    assert is_allowed_media_url("https://scontent-cgk2-1.cdninstagram.com/o1/x.mp4")
    assert is_allowed_media_url("https://scontent.xx.fbcdn.net/v/x.jpg")
    for bad in [
        "http://scontent.cdninstagram.com/x",
        "https://cdninstagram.com/x",
        "https://evilcdninstagram.com/x",
        "https://scontent.cdninstagram.com.evil.example/x",
        "https://a.cdninstagram.com:8443/x",
        "https://u:p@a.cdninstagram.com/x",
        None,
    ]:
        assert not is_allowed_media_url(bad)


def test_filenames_are_safe():
    assert build_filename("socialsaver", "ig", "../../ëvil\"user", "Abc", 2, ext="mp4") == "socialsaver_ig_evil-user_Abc_2.mp4"
    assert build_filename("x", None, "", ext="j/p/g") == "x.j-p-g"
