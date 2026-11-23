"""Synthetic yt-dlp info dicts mirroring real Instagram output (URLs are fake)."""

CDN = "https://scontent-test.cdninstagram.com"
HEADERS = {"Referer": "https://www.instagram.com/"}


def thumbs(sized=True, base="img"):
    sizes = [(150, 150), (320, 400), (640, 800), (1080, 1350)]
    if sized:
        return [{"url": f"{CDN}/v/{base}_{w}.jpg?stp=s{w}", "width": w, "height": h} for w, h in sizes]
    # logged-out photo posts: no dimensions, smallest → largest, full size last
    return [{"url": f"{CDN}/v/{base}.jpg?stp=s{w}"} for w, _ in sizes] + [{"url": f"{CDN}/v/{base}.jpg?stp=full"}]


def video_entry(has_audio=True, prefix="v"):
    acodec = None if has_audio else "none"
    prog = {"format_id": "0", "url": f"{CDN}/o1/{prefix}/prog.mp4", "ext": "mp4", "protocol": "https", "acodec": acodec}
    return {
        "id": prefix,
        "channel": "creator",
        "uploader": "Creator Name",
        "description": "caption " * 5,
        "duration": 12.5,
        "http_headers": HEADERS,
        "formats": [
            prog,
            dict(prog, format_id="1"),  # duplicate URL, must be de-duplicated
            {"format_id": "dash-1v", "url": f"{CDN}/o1/{prefix}/720.mp4", "width": 720, "height": 1280, "vcodec": "avc1", "acodec": "none", "tbr": 900, "protocol": "https"},
            {"format_id": "dash-2v", "url": f"{CDN}/o1/{prefix}/480.mp4", "width": 480, "height": 854, "vcodec": "avc1", "acodec": "none", "tbr": 400, "protocol": "https"},
            {"format_id": "dash-evil", "url": "https://evil.example/x.mp4", "width": 1080, "height": 1920, "vcodec": "avc1", "acodec": "none", "protocol": "https"},
        ],
        "thumbnails": thumbs(base=prefix),
    }


def photo_entry(sized=False, prefix="p"):
    return {"id": prefix, "channel": "creator", "uploader": "Creator Name", "formats": [], "thumbnails": thumbs(sized, prefix)}


def carousel(*entries):
    return {"_type": "playlist", "channel": "creator", "uploader": "Creator Name", "description": "album", "entries": list(entries)}
