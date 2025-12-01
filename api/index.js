        accessKeyId: accessKeyId,
        secretAccessKey: secretAccessKey,
      },
    });

    const bucketParams = {
      Bucket: bucketName,
      Key: video, // video နာမည် (Folder ပါရင်လည်း ရတယ်)
    };

    // ==========================================
    // ၄။ Smart Metadata Check (APK File Size ပြဿနာဖြေရှင်းချက်)
    // ==========================================
    if (req.method === "HEAD") {
      try {
        // R2 ကို ဖိုင်ဆိုဒ်လှမ်းမေးခြင်း
        const headCmd = new HeadObjectCommand(bucketParams);
        const metadata = await r2.send(headCmd);

        // APK ကို File Size နှင့် Type ပြန်ပြောခြင်း
        res.setHeader("Content-Length", metadata.ContentLength);
        res.setHeader("Content-Type", metadata.ContentType || "video/mp4");
        return res.status(200).end(); // Redirect မလုပ်ဘဲ ဒီမှာတင် အဆုံးသတ်
      } catch (error) {
        // ဖိုင်မရှိရင် 404 ပြ
        return res.status(404).end();
      }
    }

    // ==========================================
    // ၅။ Download Logic (GET Request)
    // ==========================================

    // Force Download ဖြစ်အောင် Header ထည့်ခြင်း
    bucketParams.ResponseContentDisposition = `attachment; filename="${video.split('/').pop()}"`;

    const command = new GetObjectCommand(bucketParams);

    // Signed URL ထုတ်ခြင်း (၃ နာရီ)
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 10800 });

    // User ကို R2 Link ဆီသို့ လမ်းကြောင်းလွှဲပေးခြင်း (Redirect)
    res.redirect(302, signedUrl);

  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
}
