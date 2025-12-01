// api/index.js
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  // ၁။ R2 နှင့် ချိတ်ဆက်ခြင်း
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  // ၂။ URL မှ Video နာမည်ယူခြင်း
  // ဥပမာ: /api?video=batman.mp4 ဆိုရင် batman.mp4 ကိုရမယ်
  const videoName = req.query.video;

  if (!videoName) {
    return res.status(400).send("Video name is missing! (?video=filename.mp4)");
  }

  const bucketName = "lugyicar"; // ⚠️ ဒီနေရာမှာ Bucket နာမည်အမှန် ပြောင်းထည့်ပါ

  try {
    // ၃။ HEAD Request (APK က File Size စစ်တဲ့အခါ)
    if (req.method === "HEAD") {
      const command = new HeadObjectCommand({ Bucket: bucketName, Key: videoName });
      const metadata = await r2.send(command);

      // Header တွေ ပြန်ပို့ပေးမယ် (Redirect မလုပ်ဘူး)
      res.setHeader("Content-Length", metadata.ContentLength);
      res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
      return res.status(200).end();
    }

    // ၄။ GET Request (Download/Play လုပ်တဲ့အခါ)
    const command = new GetObjectCommand({ Bucket: bucketName, Key: videoName });
    // ၁ နာရီ (3600 စက္ကန့်) ခံတဲ့ Link ထုတ်မယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    // Vercel Node.js ရဲ့ Redirect လုပ်နည်း (307 သုံးထားပါတယ်)
    return res.redirect(307, signedUrl);

  } catch (error) {
    console.error(error);
    return res.status(404).send("Video not found or Error: " + error.message);
  }
}
