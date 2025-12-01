export default async function handler(req, res) {
  // ၁။ CORS Headers (APK အတွက်)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;

  if (!url) return res.status(400).send("URL required");

  try {
    // ၂။ Browser အယောင်ဆောင်ပြီး Link ကို လှမ်းခေါ်မယ် (User-Agent ထည့်မှ Size ပေးတတ်လို့ပါ)
    // redirect: 'follow' ဆိုတော့ နောက်ဆုံး Link အထိ လိုက်သွားမယ်
    const response = await fetch(url, {
      method: "HEAD", 
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    const finalUrl = response.url; // Redirect ဆုံးသွားတဲ့ Link အစစ်
    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");

    // ဖိုင်နာမည် (URL ကနေ ယူမယ်)
    const filename = url.split('/').pop() || "video.mp4";

    // ၃။ (HEAD Request) APK ကို Size ပြန်ပြောမယ့်နေရာ
    if (req.method === "HEAD") {
      // Size ရှိရင် ထည့်ပေးမယ်
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
      
      if (contentType) res.setHeader("Content-Type", contentType);

      // 🔥 အရေးကြီးဆုံးအချက် 🔥
      // Browser မှာ Play နေတာကို တားပြီး Download ဖြစ်အောင် ဒီနေရာမှာ အတင်းပြောင်းပေးလိုက်တာပါ
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Accept-Ranges", "bytes");

      return res.status(200).end();
    }

    // ၄။ (GET Request) Download ဆွဲရင် Link အစစ်ဆီ ပို့ပေးလိုက်မယ်
    res.redirect(302, finalUrl);

  } catch (error) {
    console.error("External Error:", error);
    // Error တက်ရင်လည်း မူရင်း Link ကိုပဲ Redirect လုပ်ပေးလိုက်မယ် (ဒေါင်းလို့ရအောင်)
    res.redirect(302, url);
  }
}
