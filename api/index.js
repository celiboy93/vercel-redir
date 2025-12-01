// api/index.js
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  // ၁။ Video Name ကို URL ကနေ ယူမယ်
  const videoName = req.query.video;

  if (!videoName) {
    return res.status(400).send("Error: Please provide a video name (e.g., ?video=batman.mp4)");
  }

  // Bucket Name (Vercel Env ထဲမှာ ထည့်ထားပါ၊ ဒါမှမဟုတ် ဒီမှာ တိုက်ရိုက်ရေးပါ)
  const bucketName = process.env.R2_BUCKET_NAME || "lugyicar"; // နေရာမှာ Bucket နာမည်မှန်ထည့်ပါ

  try {
    // ၂။ APK က Download မဆွဲခင် File Size လှမ်းစစ်တဲ့အဆင့် (HEAD Request)
    // ဒီအဆင့်မှာ Redirect မလုပ်ဘဲ Size ပဲ လှမ်းပြောပြမယ် (Bandwidth မကုန်ပါ)
    if (req.method === "HEAD") {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: videoName,
      });

      // R2 ကို File အချက်အလက်လှမ်းမေးမယ်
      const fileInfo = await r2.send(command);

      // APK ကို File Size နဲ့ Type ပြန်ပြောပြမယ်
      res.setHeader("Content-Length", fileInfo.ContentLength);
      res.setHeader("Content-Type", fileInfo.ContentType || "video/mp4");
      return res.status(200).end();
    }

    // ၃။ တကယ် Download ဆွဲတဲ့အဆင့် (GET Request)
    // ဒီအဆင့်ကျမှ Signed URL ထုတ်ပြီး Redirect လုပ်မယ်
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoName,
    });

    // ၃ နာရီခံတဲ့ Link ထုတ်မယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // Redirect လုပ်လိုက်မယ်
    return res.redirect(307, signedUrl);

  } catch (error) {
    // ဖိုင်နာမည်မှားရင် ဒီ Error တက်မယ်
    return res.status(404).json({
        error: "File Not Found",
        details: error.message,
        hint: "Check file name case-sensitivity and folder path"
    });
  }
}
