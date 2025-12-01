import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  try {
    // ၁။ URL မှ video နှင့် acc နံပါတ်ကို ယူမည်
    // acc မပါရင် "1" ဟု သတ်မှတ်မည်
    const { video, acc = "1" } = req.query;

    if (!video) {
      return res.status(400).send("Video parameter is required");
    }

    // ၂။ ဖိုင်နာမည် သန့်သန့်ဖြစ်အောင် လုပ်ခြင်း (Folder တွေဖြုတ်မည်)
    // ဥပမာ: "movies/action/batman.mp4" -> "batman.mp4"
    const cleanFileName = video.split('/').pop();

    // ၃။ Environment Variables ကို Account နံပါတ်အလိုက် ရွေးခြင်း
    // ဥပမာ: R2_ACCOUNT_ID_6 ကို ရှာမယ်။ မရှိရင် R2_ACCOUNT_ID (မူရင်း) ကို သုံးမယ်။
    const getEnv = (key) => process.env[`${key}_${acc}`] || process.env[key];

    const accountId = getEnv("R2_ACCOUNT_ID");
    const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
    const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
    const bucketName = getEnv("R2_BUCKET_NAME"); // Bucket နာမည်ကိုလည်း Env ထဲထည့်ထားရင် ပိုကောင်းပါတယ်

    // Key တွေ မစုံရင် Error ပြမယ်
    if (!accountId || !accessKeyId || !secretAccessKey) {
      return res.status(500).send(`Configuration Error for Account ${acc}`);
    }

    // ၄။ R2 Client တည်ဆောက်ခြင်း
    const r2 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    // Params ပြင်ဆင်ခြင်း (Bucket နာမည်ကို ကုဒ်ထဲမှာ တိုက်ရိုက်ရေးချင်ရင် ဒီနေရာမှာ ပြင်ပါ)
    // e.g., Bucket: "my-movie-bucket"
    const bucketParams = {
      Bucket: bucketName || "YOUR_DEFAULT_BUCKET_NAME", // Env မရှိရင် ဒီနေရာက နာမည်ကို ယူမယ်
      Key: video,
    };
        // ၅။ (HEAD Request) APK က File Size လှမ်းစစ်တဲ့အဆင့်
    if (req.method === 'HEAD') {
      try {
        const headCommand = new HeadObjectCommand(bucketParams);
        const metadata = await r2.send(headCommand);

        // Size နှင့် Name ကို APK သိအောင် ပြန်ဖြေမယ်
        res.setHeader("Content-Length", metadata.ContentLength);
        res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
        res.setHeader("Content-Disposition", `attachment; filename="${cleanFileName}"`);
        return res.status(200).end();
      } catch (error) {
        // ဖိုင်မရှိရင် 404 ပြမယ်
        return res.status(404).end();
      }
    }

    // ၆။ (GET Request) တကယ် Download ဆွဲတဲ့အဆင့်
    // ResponseContentDisposition က ဖိုင်နာမည်အမှန်နဲ့ Download ကျအောင် လုပ်ပေးတာပါ
    const getCommand = new GetObjectCommand({
      ...bucketParams,
      ResponseContentDisposition: `attachment; filename="${cleanFileName}"`,
    });

    // Signed URL ထုတ်ပေးပြီး Redirect လုပ်မည်
    const signedUrl = await getSignedUrl(r2, getCommand, { expiresIn: 14400 }); // 4 နာရီ

    res.redirect(302, signedUrl);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error: " + error.message);
  }
}
