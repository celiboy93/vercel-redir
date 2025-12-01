export default async function handler(req, res) {
  // ၁။ CORS Headers (APK အတွက် အရေးကြီးသည်)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { url } = req.query;

  if (!url) {
    return res.status(400).send("URL parameter is required");
  }

  try {
    // ၂။ TkTube Link ကို လှမ်းခေါ်ပြီး Link အစစ် (Redirect Link) ကို ရှာမည်
    // redirect: 'follow' လို့ ပေးလိုက်ရင် နောက်ဆုံး Cloudflare Link ထိ လိုက်သွားပါလိမ့်မယ်
    const response = await fetch(url, {
      method: "HEAD", // Header ပဲ ယူမှာမို့ HEAD သုံးတာ ပိုမြန်တယ်
      redirect: "follow",
    });

    // ၃။ နောက်ဆုံး Link (Cloudflare Link) ရဲ့ URL အစစ်
    const finalUrl = response.url; 
    
    // ၄။ File Size နဲ့ Type ကို ယူမည်
    const contentLength = response.headers.get("content-length");
    const contentType = response.headers.get("content-type");

    // ဖိုင်နာမည်ကို မူရင်း URL ကနေ ဖြတ်ယူမယ်
    const filename = url.split('/').pop() || "video.mp4";

    // ၅။ (HEAD Request) APK က Size လာမေးတဲ့အဆင့်
    if (req.method === "HEAD") {
      if (contentLength) res.setHeader("Content-Length", contentLength);
      if (contentType) res.setHeader("Content-Type", contentType);
      
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Accept-Ranges", "bytes");
      
      return res.status(200).end();
    }

    // ၆။ (GET Request) Download ဆွဲရင် Link အစစ်ဆီ Redirect လုပ်ပေးလိုက်မယ်
    res.redirect(302, finalUrl);

  } catch (error) {
    console.error("External Link Error:", error);
    // HEAD method မရရင် GET နဲ့ ပြန်စမ်းမယ် (Backup Plan)
    try {
        if (req.method === "HEAD") {
            // တချို့ Server တွေက HEAD ပိတ်ထားရင် GET နဲ့ headers ပဲ လှမ်းယူကြည့်တာ
            const response = await fetch(url, { method: "GET", redirect: "follow" });
            const finalUrl = response.url;
            res.redirect(302, finalUrl);
        } else {
             res.status(500).send("Error resolving link");
        }
    } catch (e) {
        res.status(500).send("Invalid Link");
    }
  }
}
