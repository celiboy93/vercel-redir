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

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(`Config Error: Missing credentials for Account ${acc}`);
  }

  const client = new S3Client({
    // ⚠️ ပြင်ဆင်ချက် (၁) - Node.js မှာ auto အစား us-east-1 သုံးမှ Error ကင်းပါတယ်
    region: "us-east-1", 
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

    if (!video) return res.status(400).send("Video parameter missing");

    // ⚠️ ပြင်ဆင်ချက် (၂) - ဂဏန်းနာမည်ဖြစ်နေရင် String အဖြစ် အတင်းပြောင်းမယ်
    const videoString = String(video).trim(); 

    // Bucket Name Check
    const getEnv = (key) => process.env[acc === "1" ? key : `${key}_${acc}`] || process.env[key];
    const bucketName = getEnv("R2_BUCKET_NAME");

    if (!bucketName) throw new Error("Bucket Name Missing in Env Vars");

    const r2 = getR2Client(acc);
    const objectKey = decodeURIComponent(videoString);
    const cleanFileName = objectKey.split('/').pop();
    const encodedFileName = encodeURIComponent(cleanFileName);

    const bucketParams = {
      Bucket: bucketName,
      Key: objectKey,
    };

    // HEAD Request (Size Checking)
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
        
        return res.status(200).end();
      } catch (error) {
        // Fallback: 404 မပြခင် Redirect စမ်းကြည့်မယ်
        try {
             const command = new GetObjectCommand(bucketParams);
             const signedUrl = await getSignedUrl(r2, command, { expiresIn: LINK_DURATION });
             res.redirect(302, signedUrl);
             return;
        } catch (e) {
             console.error("HEAD Fallback Error:", e);
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
    // ⚠️ ပြင်ဆင်ချက် (၃) - Server Error တက်ရင် ဘာကြောင့်လဲဆိုတာ မြင်ရအောင် ထုတ်ပြမယ်
    console.error("Handler Fatal Error:", error);
    res.status(500).json({ 
        error: "Server Error", 
        details: error.message,
        hint: "Check Vercel Logs for full stack trace" 
    });
  }
}
