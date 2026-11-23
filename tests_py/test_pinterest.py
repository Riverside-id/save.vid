import base64
import io
import json
import urllib.error

import pytest

from _lib import redirects, service
from _lib.errors import ResolveError
from _lib.pinterest import best_image, best_video, normalize
from _lib.ratelimit import reset_memory_limiter
from _lib.urls import parse_url
from _lib.ytdlp_runner import map_ytdlp_error

SECRET = b"s" * 40
PIN = "https://i.pinimg.com"
VID = "https://v1.pinimg.com/videos"


def thumbs(w=600, h=1400):
    return [
        {"url": f"{PIN}/60x60/aa/x.jpg", "width": 60, "height": 60},
        {"url": f"{PIN}/236x/aa/x.jpg", "width": 236, "height": 550},
        {"url": f"{PIN}/600x315/aa/x.jpg", "width": 600, "height": 315},  # crop — must never win
        {"url": f"{PIN}/736x/aa/x.jpg", "width": w, "height": h},
        {"url": f"{PIN}/originals/aa/x.jpg", "width": w, "height": h},
    ]


def payload(token):
    return json.loads(base64.urlsafe_b64decode(token.split(".")[0] + "=="))


@pytest.mark.parametrize(
    "raw,pin_id",
    [
        ("https://id.pinterest.com/pin/1084663891475263837/", "1084663891475263837"),
        ("id.pinterest.com/pin/1084663891475263837", "1084663891475263837"),
        ("https://in.pinterest.com/pin/edamame-salad--567805465533794868/", "567805465533794868"),
        ("https://www.pinterest.co.uk/pin/123456789012/sent/?invite_code=x", "123456789012"),
        ("https://pinterest.com/pin/123456789012", "123456789012"),
    ],
)
def test_pinterest_urls(raw, pin_id):
    p = parse_url(raw)
    assert (p.platform, p.kind, p.media_id, p.canonical) == ("pinterest", "post", pin_id, f"https://www.pinterest.com/pin/{pin_id}/")


def test_pinterest_rejections_and_short_links():
    assert parse_url("https://pin.it/3AbCdEf").kind == "short-link"
    for bad in ["https://id.pinterest.com/someone/boards/", "https://id.pinterest.com/", "https://pinterest.evil.com/pin/123456/", "https://pinterest.com.evil.example/pin/123456/"]:
        with pytest.raises(ResolveError):
            parse_url(bad)


def test_best_image_prefers_originals_over_crops():
    img = best_image({"thumbnails": thumbs()})
    assert img["url"].endswith("/originals/aa/x.jpg") and (img["width"], img["height"]) == (600, 1400)
    assert best_image({"thumbnails": [{"url": f"{PIN}/600x315/a.jpg", "width": 600, "height": 315}]}) is None


def test_best_video_skips_hls_and_prefers_untiered_original():
    formats = [
        {"format_id": "V_HLSV3_MOBILE-1374", "url": f"{VID}/hls/a_640w.m3u8", "protocol": "m3u8_native", "width": 640, "height": 1136},
        {"format_id": "V_EXP3", "url": f"{VID}/a_t1.mp4", "protocol": "https", "width": 640, "height": 1138},
        {"format_id": "V_EXP7", "url": f"{VID}/a.mp4", "protocol": "https", "width": 640, "height": 1138},
        {"format_id": "V_EXP6", "url": f"{VID}/a_t4.mp4", "protocol": "https", "width": 640, "height": 1138},
        {"format_id": "X", "url": "https://evil.example/a.mp4", "protocol": "https", "width": 1080, "height": 1920},
    ]
    assert best_video({"formats": formats})["format_id"] == "V_EXP7"


def test_normalize_image_and_video_pins():
    p = parse_url("https://id.pinterest.com/pin/567805465533794868/")
    body = normalize({"thumbnails": thumbs(), "formats": [], "title": "Pinterest video #567805465533794868", "uploader": "Eat With Clarity"}, p, secret=SECRET, ttl=60, extractor_version="t")
    v = body["items"][0]["variants"][0]
    assert body["postType"] == "image" and body["caption"] is None and body["author"]["displayName"] == "Eat With Clarity"
    assert (v["label"], v["filename"]) == ("JPG · 600×1400", "socialsaver_pinterest_567805465533794868.jpg")
    assert payload(v["token"])["u"].endswith("/originals/aa/x.jpg")

    vid = normalize(
        {"thumbnails": thumbs(1080, 1920), "duration": 57.7, "description": "Origami", "formats": [{"format_id": "V_720P", "url": f"{VID}/b.mp4", "protocol": "https", "width": 1080, "height": 1920}]},
        p, secret=SECRET, ttl=60, extractor_version="t",
    )
    item = vid["items"][0]
    assert vid["postType"] == "video" and item["variants"][0]["label"] == "MP4 · 1080×1920" and item["previewToken"]
    assert item["durationSeconds"] == 57.7 and vid["caption"] == "Origami"

    with pytest.raises(ResolveError) as exc:
        normalize({"thumbnails": [], "formats": []}, p, secret=SECRET, ttl=60, extractor_version="t")
    assert exc.value.code == "NO_MEDIA"


def test_error_messages_name_the_platform():
    assert "Pinterest" in map_ytdlp_error("HTTP Error 404: Not Found", "Pinterest").message
    assert map_ytdlp_error("[vimeo] 1: HTTP Error 401", "Pinterest").code == "UNSUPPORTED_URL"


class FakeOpener:
    """Simulates redirect hops: {url: location or None (=200)}."""

    def __init__(self, hops):
        self.hops = hops
        self.seen = []

    def open(self, req, timeout=None):
        self.seen.append(req.full_url)
        loc = self.hops[req.full_url]
        if loc is None:
            return io.BytesIO(b"")
        raise urllib.error.HTTPError(req.full_url, 302, "Found", {"Location": loc}, None)


def is_pin(url):
    try:
        p = parse_url(url)
        return p.platform == "pinterest" and p.kind == "post"
    except ResolveError:
        return False


def allowed(h):
    return h in ("pin.it", "api.pinterest.com") or h.endswith("pinterest.com")


def test_pin_it_expansion_follows_validated_hops():
    op = FakeOpener({
        "https://pin.it/3AbCdEf": "https://api.pinterest.com/url_shortener/3AbCdEf/redirect/",
        "https://api.pinterest.com/url_shortener/3AbCdEf/redirect/": "https://www.pinterest.com/pin/123456789012/sent/?invite_code=x",
    })
    final = redirects.expand("https://pin.it/3AbCdEf", host_allowed=allowed, is_final=is_pin, opener=op, check_ip=False)
    assert parse_url(final).canonical == "https://www.pinterest.com/pin/123456789012/"


def test_pin_it_expansion_refuses_off_allowlist_redirects():
    op = FakeOpener({"https://pin.it/evil1": "http://169.254.169.254/latest/meta-data/"})
    with pytest.raises(ResolveError) as exc:
        redirects.expand("https://pin.it/evil1", host_allowed=allowed, is_final=is_pin, opener=op, check_ip=False)
    assert exc.value.code == "UNSUPPORTED_URL"
    assert op.seen == ["https://pin.it/evil1"]  # the metadata address was never requested


def test_service_dispatches_pinterest(monkeypatch):
    reset_memory_limiter()
    service.clear_cache()
    calls = []

    def fake_extract(url, extractor, timeout):
        calls.append((url, extractor))
        return {"thumbnails": thumbs(), "formats": []}

    monkeypatch.setattr(service, "extract_info", fake_extract)
    status, body, _ = service.resolve("https://id.pinterest.com/pin/slug--567805465533794868/?x=1", "7.7.7.7")
    assert status == 200 and body["platform"] == "pinterest"
    assert calls == [("https://www.pinterest.com/pin/567805465533794868/", "Pinterest")]


# ── Video pins that Pinterest only lists as HLS ─────────────────────────────
from _lib.pinterest import derived_mp4_candidates, find_video, probe_mp4  # noqa: E402

HLS_ONLY = {
    "duration": 20.665,
    "thumbnails": thumbs(1080, 1920),
    "formats": [
        {"format_id": "V_HLSV3_MOBILE-audio", "protocol": "m3u8_native", "url": f"{VID}/iht/hls/a5/df/4e/a5df4e9cc113d46906bc5af85c2b536c_audio.m3u8",
         "manifest_url": "https://v1.pinimg.com/videos/iht/hls/a5/df/4e/a5df4e9cc113d46906bc5af85c2b536c.m3u8"},
        {"format_id": "V_HLSV3_MOBILE-1374", "protocol": "m3u8_native", "width": 640, "height": 1136,
         "url": "https://v1.pinimg.com/videos/iht/hls/a5/df/4e/a5df4e9cc113d46906bc5af85c2b536c_640w.m3u8"},
    ],
}
DERIVED = "https://v1.pinimg.com/videos/mc/720p/a5/df/4e/a5df4e9cc113d46906bc5af85c2b536c.mp4"


def test_derives_mp4_from_hls_hash_path():
    assert derived_mp4_candidates(HLS_ONLY) == [DERIVED, DERIVED.replace("/mc/", "/iht/")]
    assert derived_mp4_candidates({"formats": [{"url": "https://evil.example/videos/mc/hls/a5/df/4e/" + "a" * 32 + ".m3u8"}]}) == []


def test_hls_only_pin_becomes_a_verified_video():
    probed = []
    p = parse_url("https://tr.pinterest.com/pin/breakfast-recipes--578642252144694181/")
    body = normalize(HLS_ONLY, p, secret=SECRET, ttl=60, extractor_version="t", probe=lambda u: probed.append(u) or True)
    item = body["items"][0]
    assert body["postType"] == "video" and body["notice"] is None
    assert item["variants"][0]["label"] == "MP4 · Full video" and (item["width"], item["height"]) == (1080, 1920)
    assert payload(item["variants"][0]["token"])["u"] == DERIVED
    assert probed == [DERIVED]


def test_unverified_mp4_is_never_offered():
    p = parse_url("https://tr.pinterest.com/pin/578642252144694181/")
    body = normalize(HLS_ONLY, p, secret=SECRET, ttl=60, extractor_version="t", probe=lambda u: False)
    assert body["postType"] == "image" and "only streams it" in body["notice"]
    assert body["items"][0]["variants"][0]["note"] == "Cover image of the video pin."


def test_listed_mp4_needs_no_probe():
    info = {"thumbnails": thumbs(), "formats": [{"format_id": "V_720P", "url": f"{VID}/mc/720p/x.mp4", "protocol": "https", "width": 720, "height": 1280}]}
    assert find_video(info, probe=lambda u: pytest.fail("should not probe"))["format_id"] == "V_720P"


class ProbeOpener:
    def __init__(self, status=206, ctype="video/mp4", exc=None):
        self.status, self.ctype, self.exc, self.requests = status, ctype, exc, []

    def open(self, req, timeout=None):
        self.requests.append(req)
        if self.exc:
            raise self.exc
        outer = self

        class Resp(io.BytesIO):
            status = outer.status
            headers = {"Content-Type": outer.ctype}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        return Resp(b"x" * 1024)


def test_probe_requires_mp4_and_reads_only_a_range():
    op = ProbeOpener()
    assert probe_mp4(DERIVED, opener=op) is True
    assert op.requests[0].get_header("Range") == "bytes=0-1023"
    assert probe_mp4(DERIVED, opener=ProbeOpener(ctype="text/html")) is False
    assert probe_mp4(DERIVED, opener=ProbeOpener(exc=urllib.error.HTTPError(DERIVED, 403, "Forbidden", {}, None))) is False
    assert probe_mp4("https://evil.example/x.mp4", opener=ProbeOpener()) is False
