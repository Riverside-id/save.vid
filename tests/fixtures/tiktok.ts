/** Synthetic TikTok page fixtures (structure mirrors the real embedded JSON; URLs are fake). */
export function tiktokPage(itemStruct: unknown, statusCode = 0): string {
  const data = { __DEFAULT_SCOPE__: { "webapp.video-detail": { statusCode, itemInfo: { itemStruct } } } };
  return `<!doctype html><html><head><title>TikTok</title></head><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(data)}</script></body></html>`;
}

export const VIDEO_ITEM = {
  id: "7047596209028074758",
  desc: "hello world",
  author: { uniqueId: "creator", nickname: "Creator" },
  video: {
    width: 576,
    height: 1024,
    duration: 21,
    originCover: "https://p16-common-sign.tiktokcdn.com/obj/cover.jpeg?x-expires=1",
    playAddr: "https://v16-webapp-prime.tiktok.com/video/play/",
    downloadAddr: "https://v16-webapp-prime.tiktok.com/video/WATERMARKED/",
    bitrateInfo: [
      { GearName: "lower_540_0", CodecType: "h264", PlayAddr: { DataSize: 2969386, Width: 576, Height: 1024, UrlList: ["https://v16-webapp-prime.tiktok.com/video/lower/"] } },
      { GearName: "normal_540_0", CodecType: "h264", PlayAddr: { DataSize: 5076682, Width: 576, Height: 1024, UrlList: ["https://v16-webapp-prime.tiktok.com/video/best/"] } },
      { GearName: "adapt_540_1", CodecType: "h265_hvc1", PlayAddr: { DataSize: 9999999, Width: 576, Height: 1024, UrlList: ["https://v16-webapp-prime.tiktok.com/video/hevc/"] } },
    ],
  },
};

export const SLIDESHOW_ITEM = {
  id: "7300000000000000000",
  desc: "photos",
  author: { uniqueId: "photographer", nickname: "Photo" },
  imagePost: {
    cover: { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/cover.jpeg"] } },
    images: [
      { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/img1.jpeg"] }, imageWidth: 1080, imageHeight: 1440 },
      { imageURL: { urlList: ["https://p16-sign.tiktokcdn.com/img2.webp"] }, imageWidth: 1080, imageHeight: 1350 },
    ],
  },
};
