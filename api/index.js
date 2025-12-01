// api/index.js
import { S3Client, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
  // URL နောက်က နာမည်ကို ယူမယ် (ဥပမာ: /batman -> batman)
  // .mp4 ပါရင် ဖယ်ထုတ်မယ်
  const urlParts = req.url.split('/');
  let videoName = urlParts[urlParts.length - 1];
  videoName = videoName.replace('.mp4', '');

  if (!videoName) {
    return res.status(400).send("Video name required");
  }

  // R2 ပေါ်က ဖိုင်နာမည်အမှန် (နောက်က .mp4 ပြန်တပ်)
  const objectKey = `${videoName}.mp4`;
  const bucketName = "lugyicar"; // ဒီနေရာမှာ Bucket နာမည် အမှန်ထည့်ပါ

  try {
    // ၁။ HEAD Request (APK က Size လှမ်းစစ်တဲ့အချိန်)
    if (req.method === 'HEAD') {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
      });
      const metadata = await r2.send(command);

      // Size နဲ့ Type ကို APK ဆီ လှမ်းပြောမယ် (Bandwidth မကုန်ပါ)
      res.setHeader('Content-Length', metadata.ContentLength);
      res.setHeader('Content-Type', metadata.ContentType || 'video/mp4');
      res.setHeader('Accept-Ranges', 'bytes');
      return res.status(200).end();
    }

    // ၂။ GET Request (တကယ် Download ဆွဲတဲ့အချိန်)
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: objectKey,
    });

    // Signed URL ထုတ်ပြီး Redirect လုပ်မယ်
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    return res.redirect(307, signedUrl);

  } catch (error) {
    console.error(error);
    return res.status(404).send("Video not found");
  }
}
