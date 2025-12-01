// api/index.js
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// R2 Setup
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME; // Environment Variable ထဲမှာ ထည့်ဖို့မမေ့ပါနဲ့

export default async function handler(req, res) {
  // Query ကနေ video နာမည်ယူမယ် (ဥပမာ: ?video=batman)
  let { video } = req.query;

  if (!video) {
    return res.status(400).send("Video name missing");
  }

  // .mp4 မပါရင် ထည့်ပေးမယ်
  if (!video.endsWith(".mp4")) {
    video += ".mp4";
  }

  try {
    // ၁။ APK က File Size လှမ်းစစ်တဲ့အဆင့် (HEAD Request)
    if (req.method === "HEAD") {
      const command = new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: video,
      });

      // R2 ကို Metadata လှမ်းမေးမယ်
      const metadata = await r2.send(command);

      // APK ကို File Size နဲ့ Type ပြန်ပြောမယ် (Download မလုပ်ဘူး)
      res.setHeader("Content-Length", metadata.ContentLength);
      res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
      res.setHeader("Content-Disposition", `attachment; filename="${video}"`);
      return res.status(200).end();
    }

    // ၂။ တကယ် Download ဆွဲတဲ့အဆင့် (GET Request)
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: video,
    });

    // Presigned URL (အချိန်ပိုင်း Link) ထုတ်မယ် - ၃ နာရီ (10800 စက္ကန့်)
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // User ကို အဲဒီ Link ဆီ Redirect လုပ်ပေးမယ်
    return res.redirect(307, signedUrl);

  } catch (error) {
    console.error(error);
    return res.status(404).send("Video Not Found or Error");
  }
}
