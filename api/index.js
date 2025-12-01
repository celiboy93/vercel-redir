// api/index.js
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  try {
    // URL မှ video နှင့် acc နံပါတ်ကို ယူမည် (acc မပါရင် 1 ဟု သတ်မှတ်မည်)
    const { video, acc = "1" } = req.query;

    if (!video) {
      return res.status(400).send("Video Name Required (?video=...)");
    }

    // Smart Lookup - နံပါတ်အလိုက် Key များကို အလိုအလျောက် ရှာဖွေခြင်း
    const accountId = process.env[`R2_ACCOUNT_ID_${acc}`];
    const accessKeyId = process.env[`R2_ACCESS_KEY_ID_${acc}`];
    const secretAccessKey = process.env[`R2_SECRET_ACCESS_KEY_${acc}`];
    const bucketName = process.env[`R2_BUCKET_NAME_${acc}`]; // Bucket Name လည်း acc အလိုက်ကွဲနိုင်လို့ပါ

    // အကယ်၍ နံပါတ်မှားထည့်မိရင် သို့မဟုတ် Key မထည့်ရသေးရင် Error ပြမည်
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      return res.status(400).send(`Account No.${acc} configuration not found in Vercel Environment Variables.`);
    }

    // R2 Client Setup
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // Download Link ထုတ်ပေးခြင်း
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: video,
      ResponseContentDisposition: "attachment", // Force Download
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 }); // 3 Hours

    // Redirect to Signed URL
    return res.redirect(302, signedUrl);

  } catch (error) {
    console.error(error);
    return res.status(500).send("Server Error: " + error.message);
  }
}
