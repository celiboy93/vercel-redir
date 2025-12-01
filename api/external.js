export default async function handler(req, res) {
  // ၁။ Headers (APK အတွက်)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).send("URL required");

  try {
    // ၂။ Link အစစ်ကို ရှာဖွေခြင်း (Redirect တွေကို လိုက်သွားမည်)
    let finalUrl = url;
    let currentUrl = url;
    
    // Redirect တွေကို ၅ ဆင့်အထိ လိုက်ရှာမယ်
    for (let i = 0; i < 5; i++) {
      const response = await fetch(currentUrl, { method: "HEAD", redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location) {
          currentUrl = new URL(location, currentUrl).toString();
          finalUrl = currentUrl;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    // ၃။ 🔥 Range Hack (အရေးကြီးဆုံးအဆင့်) 🔥
    // HEAD အစား GET ကိုသုံးပြီး 0-0 (ပထမဆုံး 1 byte) ကိုပဲ တောင်းမယ်
    // ဒါဆိုရင် Server က ဖိုင်အပြည့်မပေးဘဲ "Size ကတော့ ဒီလောက်ရှိတယ်" ဆိုပြီး Content-Range ပြန်ပေးလေ့ရှိတယ်
    const rangeResponse = await fetch(finalUrl, {
      method: "GET",
      headers: {
        "Range": "bytes=0-0", // 1 byte ပဲ တောင်းမယ်
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    // Content-Range: bytes 0-0/12345678 (12345678 က File Size ပါ)
    const contentRange = rangeResponse.headers.get("content-range");
    let fileSize = rangeResponse.headers.get("content-length"); // Fallback

    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) {
        fileSize = match[1]; // Total Size ကို ရပြီ
      }
    }

    const contentType = rangeResponse.headers.get("content-type");
    const filename = url.split('/').pop() || "video.mp4";

    // ၄။ (HEAD Request) APK ကို Size ပြန်ပြောမယ့်နေရာ
    if (req.method === "HEAD") {
      if (fileSize) res.setHeader("Content-Length", fileSize);
      if (contentType) res.setHeader("Content-Type", contentType);
      
      // APK ကို Download လုပ်ပါလို့ အတင်းပြောမယ်
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Accept-Ranges", "bytes");
      
      return res.status(200).end();
    }

    // ၅။ (GET Request) Download ဆွဲရင် Link အစစ်ဆီ ပို့ပေးလိုက်မယ်
    res.redirect(302, finalUrl);

  } catch (error) {
    console.error("Fetch Error:", error);
    // Error တက်ရင်လည်း မူရင်း Link ကိုပဲ Redirect လုပ်ပေးလိုက်မယ်
    res.redirect(302, url);
  }
}
