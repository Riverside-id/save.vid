import json

import pytest

from _lib.errors import ResolveError
from _lib.instagram import normalize
from _lib.urls import parse_url
from fixtures import carousel, photo_entry, video_entry

SECRET = b"s" * 40


def run(info, url="https://www.instagram.com/p/ABCDEF12345/"):
    return normalize(info, parse_url(url), secret=SECRET, ttl=600, extractor_version="test")


def test_video_with_audio_offers_only_the_progressive_file():
    body = run(video_entry(has_audio=True))
    item = body["items"][0]
    assert body["postType"] == "video" and item["kind"] == "video"
    assert [v["label"] for v in item["variants"]] == ["MP4 · Standard"]  # duplicate URL removed, no silent DASH
    assert item["variants"][0]["hasAudio"] is None
    assert item["previewToken"]


def test_silent_video_also_offers_real_hd_renditions():
    item = run(video_entry(has_audio=False))["items"][0]
    labels = [v["label"] for v in item["variants"]]
    assert labels == ["MP4 · Standard", "MP4 · 720×1280", "MP4 · 480×854"]
    assert all(v["hasAudio"] is False for v in item["variants"])


def test_off_allowlist_urls_never_reach_a_token():
    body = run(video_entry(has_audio=False))
    assert "evil.example" not in json.dumps(body)


def test_photo_without_dimensions_uses_the_full_size_candidate():
    body = run(photo_entry(sized=False))
    v = body["items"][0]["variants"]
    assert body["postType"] == "image" and len(v) == 1
    assert v[0]["label"] == "JPG · Full size" and v[0]["width"] is None
    payload = json.loads(__import__("base64").urlsafe_b64decode(v[0]["token"].split(".")[0] + "=="))
    assert payload["u"].endswith("stp=full")


def test_photo_with_dimensions_is_labelled_with_the_real_size():
    v = run(photo_entry(sized=True))["items"][0]["variants"]
    assert [x["label"] for x in v] == ["JPG · 1080×1350"]


def test_carousel_mixes_photos_and_videos_with_numbered_files():
    body = run(carousel(photo_entry(prefix="a"), video_entry(prefix="b"), photo_entry(prefix="c")))
    assert body["postType"] == "carousel"
    assert [i["kind"] for i in body["items"]] == ["image", "video", "image"]
    assert [i["variants"][0]["filename"] for i in body["items"]] == [
        "socialsaver_ig_creator_ABCDEF12345_1.jpg",
        "socialsaver_ig_creator_ABCDEF12345_2.mp4",
        "socialsaver_ig_creator_ABCDEF12345_3.jpg",
    ]


def test_post_without_usable_media_is_an_honest_error():
    with pytest.raises(ResolveError) as exc:
        run({"formats": [], "thumbnails": [{"url": "https://evil.example/a.jpg"}]})
    assert exc.value.code == "NO_MEDIA"
