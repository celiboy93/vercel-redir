import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// 🔥 Cache Clients
const clients = new Map();
const LINK_DURATION = 14400; // 4 Hours

function getR2Client(acc) {
  if (clients.has(acc)) return clients.get(acc);

  const getEnv = (key) => process.env[acc === "1" ? key : `${key}_${acc}`] || process.env[key];
  const accountId = getEnv("R2_ACCOUNT_ID");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");

  if (!accountId || !accessKeyId || !secretAccessKey) throw new Error(`Config Error: Acc ${acc}`);

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  clients.set(acc, client);
  return client;
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Length, Authorization, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { video, acc = "1" } = req.query;
    if (!video) return res.status(400).send("Video missing");

    // Get Bucket Name
    const getEnv = (key) => process.env[acc === "1" ? key : `${key}_${acc}`] || process.env[key];
    const bucketName = getEnv("R2_BUCKET_NAME");

    const r2 = getR2Client(acc);

    // 🔥 အဓိက ပြင်ဆင်ချက် (၁) - URL Decoding
    // Link မှာ Space တွေကို %20 နဲ့ လာတတ်ပါတယ်။ ဒါကို ပုံမှန်စာသား ပြန်ပြောင်းမှ R2 က ရှာတွေ့ပါမယ်။
    const objectKey = decodeURIComponent(video);

    const cleanFileName = objectKey.split('/').pop();
    const encodedFileName = encodeURIComponent(cleanFileName);

    const bucketParams = {
      Bucket: bucketName,
      Key: objectKey, // decoded key ကို သုံးမယ်
    };

    // 🔥 အဓိက ပြင်ဆင်ချက် (၂) - HEAD Request Handling
    // Vercel က R2 ကို လှမ်းမေးပြီး APK ကို Size အတိအကျ ပြန်ဖြေပေးမယ်။
    if (req.method === 'HEAD') {
      try {
        const headCommand = new HeadObjectCommand(bucketParams);
        const metadata = await r2.send(headCommand);

        if (metadata.ContentLength) {
            res.setHeader("Content-Length", metadata.ContentLength);
        }
        res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
        res.setHeader("Content-Disposition", `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodedFileName}`);
        res.setHeader("Accept-Ranges", "bytes");
        
        return res.status(200).end(); // 200 OK နဲ့ Size ကို ပြန်ပို့မယ်
      } catch (error) {
        console.error("HEAD Error:", error);
        // တကယ်လို့ Vercel က ရှာမတွေ့ခဲ့ရင်တောင် (404 မပြဘဲ)
        // နောက်ဆုံးနည်းလမ်းအနေနဲ့ R2 ကို Redirect လုပ်ပေးလိုက်မယ် (Fallback)
        // ဒါဆို APK က ဒေါင်းလို့ရနိုင်သေးတယ်
        try {
             const command = new GetObjectCommand(bucketParams);
             const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });
             res.redirect(302, signedUrl);
             return;
        } catch (e) {
             return res.status(404).end();
        }
      }
    }

    // GET Request (Download)
    const command = new GetObjectCommand({
      ...bucketParams,
      ResponseContentDisposition: `attachment; filename="${cleanFileName}"; filename*=UTF-8''${encodedFileName}`,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });

    res.redirect(302, signedUrl);

  } catch (error) {
    console.error("Handler Error:", error);
    res.status(500).send("Server Error");
  }
}
