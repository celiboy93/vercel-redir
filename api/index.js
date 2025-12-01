import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 🔥 Client များကို Cache လုပ်ရန် (Vercel တွင် ပိုမြန်စေသည်)
const clients = new Map();

// Link သက်တမ်း (စက္ကန့်) - ၄ နာရီ (၁၂ နာရီလိုချင်ရင် 43200 ပြောင်းပါ)
const LINK_DURATION = 14400; 

function getR2Client(acc) {
  // Cache ထဲမှာ ရှိပြီးသားဆိုရင် အဟောင်းပဲ ပြန်သုံးမယ်
  if (clients.has(acc)) {
    return clients.get(acc);
  }

  // Env ယူပုံ (acc=1 ဆိုရင် suffix မလို၊ acc=2 ဆိုရင် _2 ထည့်မယ်)
  const getEnv = (key) => process.env[acc === "1" ? key : `${key}_${acc}`] || process.env[key];

  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(`Configuration Error for Account ${acc}`);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  // နောက်တစ်ခါပြန်သုံးဖို့ သိမ်းထားမယ်
  clients.set(acc, client);
  return client;
}

export default async function handler(req, res) {
  // 🔥 ၁။ CORS Headers (APK နှင့် Browser များတွင် Seeking ရရန် အရေးကြီးသည်)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

  // Preflight request (OPTIONS) ကို လက်ခံပေးခြင်း
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { video, acc = "1" } = req.query;

    if (!video) {
      return res.status(400).send("Video parameter is required");
    }

    // Bucket Name ရှာခြင်း
    const getEnv = (key) => process.env[acc === "1" ? key : `${key}_${acc}`] || process.env[key];
    const bucketName = getEnv("R2_BUCKET_NAME");

    if (!bucketName) {
      return res.status(500).send("Bucket Name Configuration Error");
    }

    // Client ရယူခြင်း
    let r2;
    try {
      r2 = getR2Client(acc);
    } catch (error) {
      return res.status(500).send(error.message);
    }

    const cleanFileName = video.split('/').pop();
    const encodedFileName = encodeURIComponent(cleanFileName); // မြန်မာစာ/Space ပါရင် အဆင်ပြေအောင်

    const bucketParams = {
      Bucket: bucketName,
      Key: video,
    };

    // 🔥 ၂။ (HEAD Request) APK က Size နှင့် Seek ရမရ လာစစ်သောနေရာ
    if (req.method === 'HEAD') {
      try {
        const headCommand = new HeadObjectCommand(bucketParams);
        const metadata = await r2.send(headCommand);

        // Size ပြန်ပေးခြင်း
        if (metadata.ContentLength) {
            res.setHeader("Content-Length", metadata.ContentLength);
        }
        res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
        // Filename ပြန်ပေးခြင်း
        res.setHeader("Content-Disposition", `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodedFileName}`);
        // Seeking (ရှေ့ကျော်/နောက်ရစ်) ရကြောင်း ပြောခြင်း
        res.setHeader("Accept-Ranges", "bytes");
        
        return res.status(200).end();
      } catch (error) {
        return res.status(404).end(); // ဖိုင်မရှိရင် 404
      }
    }

    // 🔥 ၃။ (GET Request) Download Link ထုတ်ပေးပြီး Redirect လုပ်ခြင်း
    const getCommand = new GetObjectCommand({
      ...bucketParams,
      // UTF-8 Filename support
      ResponseContentDisposition: `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodedFileName}`,
    });

    const signedUrl = await getSignedUrl(r2, getCommand, { expiresIn: LINK_DURATION });

    // 302 Redirect to R2
    res.redirect(302, signedUrl);

  } catch (error) {
    console.error("Handler Error:", error);
    res.status(500).send("Internal Server Error");
  }
}
