// Rate-limiter için bellek önbelleği
const rateLimitCache = new Map();
const LIMIT_WINDOW = 60 * 1000; // 1 dakika
const MAX_REQUESTS = 10; // Dakikada IP başına maksimum 10 API isteği (hem detect hem tryon dahil)

function getClientIp(headers) {
  if (!headers) return "unknown";
  return headers["do-connecting-ip"] || headers["x-forwarded-for"] || headers["x-real-ip"] || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();
  if (!rateLimitCache.has(ip)) {
    rateLimitCache.set(ip, [now]);
    return false;
  }
  const timestamps = rateLimitCache.get(ip).filter(t => now - t < LIMIT_WINDOW);
  if (timestamps.length >= MAX_REQUESTS) {
    return true;
  }
  timestamps.push(now);
  rateLimitCache.set(ip, timestamps);
  return false;
}

// 1️⃣ Pose Detection Helper
async function detectPose(userB64, apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{
      parts: [
        { text: "Is the person in this photo facing the camera (front view) or is their back turned to the camera (back view)? Respond with exactly one word: 'front' or 'back'." },
        { inlineData: { mimeType: "image/png", data: userB64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      console.warn("Pose detection HTTP failed, status:", res.status);
      return "front";
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase() || "";
    console.log("[POSE] Gemini response:", text);
    if (text.includes("back")) return "back";
    return "front";
  } catch (e) {
    console.warn("Pose detection execution error:", e);
    return "front";
  }
}

// 2️⃣ Ana Fonksiyon (DO Serverless Entry Point)
async function main(args) {
  // IP bazlı rate limit kontrolü
  const headers = args.__ow_headers || {};
  const ip = getClientIp(headers);
  if (isRateLimited(ip)) {
    return {
      headers: { "Content-Type": "application/json" },
      statusCode: 429,
      body: { error: "Çok fazla istek gönderdiniz. Lütfen bir dakika sonra tekrar deneyin." }
    };
  }

  // Çevre değişkeninden API key oku
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return {
      headers: { "Content-Type": "application/json" },
      statusCode: 500,
      body: { error: "Sunucu hatası: Gemini API anahtarı yapılandırılmamış." }
    };
  }

  const { action } = args;

  // === Eylem: Duruş Tespiti ===
  if (action === "detect") {
    const { userB64 } = args;
    if (!userB64) {
      return {
        headers: { "Content-Type": "application/json" },
        statusCode: 400,
        body: { error: "Kullanıcı fotoğrafı (userB64) eksik." }
      };
    }
    const pose = await detectPose(userB64, API_KEY);
    return {
      headers: { "Content-Type": "application/json" },
      statusCode: 200,
      body: { pose }
    };
  }

  // === Eylem: Sanal Giydirme ===
  if (action === "tryon") {
    const {
      userB64, garmentDiffuse, productName, pose,
      bgMode, bgB64, garmentFrontB64, garmentBackB64
    } = args;

    if (!userB64) {
      return {
        headers: { "Content-Type": "application/json" },
        statusCode: 400,
        body: { error: "Kullanıcı fotoğrafı (userB64) eksik." }
      };
    }

    try {
      // Yön bilgisine göre ön veya arka şablonu seç (eğer arka şablon yoksa ön şablona düş)
      let selectedGarmentB64 = garmentFrontB64;
      let selectedLabel = "Tişört Ön Şablon (şeffaf PNG):";

      if (pose === "back") {
        if (garmentBackB64) {
          selectedGarmentB64 = garmentBackB64;
          selectedLabel = "Tişört Arka Şablon (şeffaf PNG):";
        } else {
          console.warn("[TRYON] Arka şablon bulunamadı, ön şablona düşülüyor.");
        }
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${API_KEY}`;

      // Arka plan talimatı
      let bgText = "Arka planı fotoğraftaki gibi bırak.";
      if (bgMode === "white")    bgText = "Arka planı beyaz stüdyo zemin yap.";
      if (bgMode === "gradient") bgText = "Arka planı koyu yumuşak bir degrade yap, stüdyo ışığı gibi.";
      if (bgMode === "custom")   bgText = "Arka planı gönderdiğim özel görselle değiştir.";

      const prompt = [
        `Bu fotoğraftaki kişiye ${productName || "T-shirt"} giydir.`,
        "ŞABLONLARDAKİ RENKLERİ AYNEN KORU. Yeniden renklendirme yapma; yalnızca ışık koşullarına çok az uyum sağlayacak kadar ton eşlemesi yap.",
        `Kullanılacak tişört şablonu aşağıda verilmiştir (Kişinin ${pose === 'back' ? 'arka' : 'ön'} tarafı için). Mevcut tişörtün yerini bu şablonla BİREBİR hizalayarak değiştir.`,
        "Şablonun yaka, omuz, kol ve gövde hatlarına sadık kal. Deseni/dokuyu bozma; yalnızca perspektif, ışık ve kumaş kırışıklıklarına uydur.",
        "Kollar, yaka ve gövde hizalaması gerçekçi olsun. Yüz ve saç doğal kalsın.",
        "Gövde ve elleri bozma; gerekmedikçe ellerin üzerini kapatma.",
        "Kısa kollu tişört olarak uygula; kişinin vücut oranlarını koru.",
        "Çıktı: Tam boy portre, kırpmasız, dikey kompozisyon.",
        bgText
      ].join(" ");

      const parts = [
        { text: prompt },
        { inlineData: { mimeType: "image/png", data: userB64 } },
      ];

      if (selectedGarmentB64) {
        parts.push({ text: selectedLabel });
        parts.push({ inlineData: { mimeType: "image/png", data: selectedGarmentB64 } });
      }

      if (garmentDiffuse) {
        parts.push({ text: "Aşağıdaki görsel, giysinin baskı veya renk dokusu için referans alınacaktır:" });
        parts.push({ text: garmentDiffuse });
      }

      if (bgMode === "custom" && bgB64) {
        parts.push({ text: "Arka plan için kullanılacak görsel:" });
        parts.push({ inlineData: { mimeType: "image/png", data: bgB64 } });
      }

      const payload = {
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0.15,
          responseModalities: ["IMAGE"],
        },
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Gemini Image HTTP error:", res.status, err);
        return {
          headers: { "Content-Type": "application/json" },
          statusCode: 502,
          body: { error: `Gemini API hatası: ${err?.error?.message || res.statusText}` }
        };
      }

      const json = await res.json();
      const cand = json?.candidates?.[0];
      const outParts = cand?.content?.parts || [];
      const imgPart = outParts.find(p => p?.inlineData && /^image\//i.test(p.inlineData.mimeType || "image/png"));

      if (!imgPart?.inlineData?.data) {
        const text = outParts.map(p => p.text).filter(Boolean).join("\n");
        console.warn("Model did not return image. Text returned:", text);
        return {
          headers: { "Content-Type": "application/json" },
          statusCode: 502,
          body: { error: "Sanal deneme görseli üretilemedi." }
        };
      }

      return {
        headers: { "Content-Type": "application/json" },
        statusCode: 200,
        body: { resultB64: imgPart.inlineData.data }
      };

    } catch (err) {
      console.error("Serverless execution exception:", err);
      return {
        headers: { "Content-Type": "application/json" },
        statusCode: 500,
        body: { error: `Sunucu içi hata: ${err.message}` }
      };
    }
  }

  return {
    headers: { "Content-Type": "application/json" },
    statusCode: 400,
    body: { error: "Bilinmeyen eylem (action)." }
  };
}

exports.main = main;
