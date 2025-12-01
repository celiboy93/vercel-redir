// api/index.js
import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  // Error ဖြစ်ရင် Vercel Logs မှာ ကြည့်လို့ရအောင် try-catch ခံထားပါတယ်
  try {
    const { video, acc = "1" } = req.query;

    if (!video) {
      return res.status(400).json({ error: "Video parameter missing" });
    }

    // ၁။ Account နံပါတ်အလိုက် Key များကို ယူခြင်း
    const accountId = process.env[`R2_ACCOUNT_ID_${acc}`];
    const accessKeyId = process.env[`R2_ACCESS_KEY_ID_${acc}`];
    const secretAccessKey = process.env[`R2_SECRET_ACCESS_KEY_${acc}`];
    const bucketName = process.env[`R2_BUCKET_NAME_${acc}`];

    // Setting မရှိရင် Error ပြမယ် (Crash မဖြစ်စေပါ)
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      console.error(`Missing settings for Account ${acc}`);
      return res.status(500).json({ error: `Account ${acc} configuration missing in Vercel` });
    }

    // ၂။ R2 Client တည်ဆောက်ခြင်း
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });

    // ၃။ APK က Size လှမ်းစစ်လျှင် (HEAD Request)
    // ဒါပါမှ APK မှာ Size ပေါ်မှာပါ
    if (req.method === 'HEAD') {
      try {
        const command = new HeadObjectCommand({ Bucket: bucketName, Key: video });
        const metadata = await r2.send(command);

        // Size နှင့် Type ကို APK ထံ ပြန်ပြောခြင်း
        res.setHeader("Content-Length", metadata.ContentLength);
        res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
        res.setHeader("Content-Disposition", `attachment; filename="${video}"`);
        return res.status(200).end();
      } catch (error) {
        // ဖိုင်မရှိရင် 404 ပြမယ်
        return res.status(404).end();
      }
    }

    // ၄။ Download ဆွဲလျှင် (GET Request) -> Link ထုတ်ပေးမည်
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: video,
      ResponseContentDisposition: `attachment; filename="${video}"`, // တန်း Download ကျစေမည့်ကုဒ်
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 }); // 3 နာရီ

    // Link ကို Redirect လုပ်မည်
    return res.redirect(302, signedUrl);

  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
}
