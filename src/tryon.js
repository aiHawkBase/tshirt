// src/tryon.js
// Try-on UI + Gemini entegrasyonu

const els = {
  user:    document.getElementById("tryonUserPhoto"),
  bgSel:   document.getElementById("tryonBgSelect"),
  bgFile:  document.getElementById("tryonBgCustom"),
  bgHint:  document.getElementById("tryonBgHint"),
  run:     document.getElementById("tryonRun"),
  fileHint:document.getElementById("tryonFileHint"),
  modal:   document.getElementById("tryonModal"),
  close:   document.getElementById("tryonClose"),
  img:     document.getElementById("tryonResult"),
  dl:      document.getElementById("tryonDownload"),
};

// güvenli bind
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

let USER_B64 = null;
let BG_B64   = null;

let ACTIVE_SPEC = {
  productName: "Tee",
  colorLabel: "",
  diffuseUrl: "",
  backgroundUrl: "",
  accent: "#d6c119",
  garmentFrontUrl: "clothes/default_on.png",
  garmentBackUrl:  "clothes/default_arka.png",
};

window.addEventListener("product-changed", async (e) => {
  const d = e.detail || {};
  ACTIVE_SPEC = {
    ...ACTIVE_SPEC,
    productName:   d.productName ?? ACTIVE_SPEC.productName,
    colorLabel:    d.colorLabel  ?? ACTIVE_SPEC.colorLabel,
    diffuseUrl:    d.diffuseUrl  ?? ACTIVE_SPEC.diffuseUrl,
    backgroundUrl: d.backgroundUrl ?? ACTIVE_SPEC.backgroundUrl,
    accent:        d.accent ?? ACTIVE_SPEC.accent,
    garmentFrontUrl: d.garmentFrontUrl || ACTIVE_SPEC.garmentFrontUrl,
    garmentBackUrl:  d.garmentBackUrl  || ACTIVE_SPEC.garmentBackUrl,
  };

  // Görünür log
  console.groupCollapsed("[TRYON] product-changed");
  console.log("productName:", ACTIVE_SPEC.productName);
  console.log("diffuseUrl :", ACTIVE_SPEC.diffuseUrl || null);
  console.log("frontUrl   :", ACTIVE_SPEC.garmentFrontUrl || null);
  console.log("backUrl    :", ACTIVE_SPEC.garmentBackUrl  || null);
  console.groupEnd();

  // Dosyalar erişilebilir mi?
  const [cFront, cBack] = await Promise.all([checkImage(ACTIVE_SPEC.garmentFrontUrl), checkImage(ACTIVE_SPEC.garmentBackUrl)]);
  console.log("[TRYON] front check:", cFront);
  console.log("[TRYON] back  check:", cBack);
});

// arka plan seçimi (opsiyonel UI)
on(els.bgSel, "change", () => {
  const v = els.bgSel.value;
  const needsFile = v === "custom";
  if (els.bgFile) els.bgFile.hidden = !needsFile;
  if (els.bgHint) els.bgHint.style.display = needsFile ? "block" : "none";
  if (!needsFile) BG_B64 = null;
});

on(els.bgFile, "change", async (e) => {
  const f = e.target.files?.[0];
  BG_B64 = f ? await toBase64(f, true) : null;
});

on(els.user, "change", async (e) => {
  const f = e.target.files?.[0];
  USER_B64 = f ? await toBase64(f, true) : null;
  if (els.fileHint) els.fileHint.textContent = f ? `Seçildi: ${f.name}` : "(boydan, iyi ışık)";
});

// click → çalıştır
on(els.run, "click", async () => {
  if (!USER_B64) { alert("Önce kendi fotoğrafınızı yükleyin."); return; }

  try {
    els.run.disabled = true;
    els.run.textContent = "Hazırlanıyor…";

    const frontUrl = ACTIVE_SPEC.garmentFrontUrl || "";
    const backUrl  = ACTIVE_SPEC.garmentBackUrl  || "";

    const frontB64 = frontUrl ? await urlToBase64(frontUrl).catch(()=>null) : null;
    const backB64  = backUrl  ? await urlToBase64(backUrl).catch(()=>null)  : null;

    console.groupCollapsed("[TRYON] click → inputs");
    console.log("bgMode:", els.bgSel?.value ?? "keep");
    console.log("userB64 length:", USER_B64?.length || 0);
    console.log("front url:", frontUrl);
    console.log("back  url:", backUrl);
    console.log("frontB64 length:", frontB64?.length || 0);
    console.log("backB64  length:", backB64?.length || 0);
    console.log("diffuseUrl:", ACTIVE_SPEC.diffuseUrl || null);
    console.groupEnd();

    const resultB64 = await runGeminiTryOn({
      userB64: USER_B64,
      garmentDiffuse: ACTIVE_SPEC.diffuseUrl,
      productName: ACTIVE_SPEC.productName,
      bgMode: els.bgSel?.value ?? "keep",
      bgB64: BG_B64,
      garmentFrontB64: frontB64,
      garmentBackB64:  backB64,
    });

    if (!resultB64) throw new Error("Geçerli görsel dönmedi.");
    els.img.src = `data:image/png;base64,${resultB64}`;
    els.dl.href = els.img.src;
    openModal();

  } catch (err) {
    console.error(err);
    alert("Sanal deneme başarısız: " + (err.message || err));
  } finally {
    els.run.disabled = false;
    els.run.textContent = "Gemini ile Dene";
  }
});

// modal
function openModal(){ if (els.modal) els.modal.style.display = "flex"; }
function closeModal(){ if (els.modal) els.modal.style.display = "none"; }
on(els.close, "click", closeModal);
on(els.modal, "click", (e)=>{ if (e.target === els.modal) closeModal(); });
document.addEventListener("keydown", (e)=>{ if(e.key==='Escape') closeModal(); });
// Tek tuşla fotoğraf seçimi + try-on
const tryonRunSingle = document.getElementById("tryonRunSingle");

if (tryonRunSingle) {
  tryonRunSingle.addEventListener("click", async () => {
    try {
      // 1️⃣ Kullanıcıdan fotoğraf seçmesini iste
      const [fileHandle] = await window.showOpenFilePicker({
        types: [
          {
            description: "Görseller",
            accept: { "image/*": [".png", ".jpg", ".jpeg", ".webp"] },
          },
        ],
        multiple: false,
      });

      const file = await fileHandle.getFile();
      const userB64 = await toBase64(file, true);

      // 2️⃣ Butonu pasifleştir
      tryonRunSingle.disabled = true;
      tryonRunSingle.textContent = "Hazırlanıyor…";

      // 3️⃣ Try-on işlemini başlat
      const resultB64 = await runGeminiTryOn({
        userB64,
        garmentDiffuse: ACTIVE_SPEC.diffuseUrl,
        productName: ACTIVE_SPEC.productName,
        colorLabel: ACTIVE_SPEC.colorLabel,
        bgMode: "keep",
        garmentFrontB64: ACTIVE_SPEC.garmentFrontUrl
          ? await urlToBase64(ACTIVE_SPEC.garmentFrontUrl)
          : null,
        garmentBackB64: ACTIVE_SPEC.garmentBackUrl
          ? await urlToBase64(ACTIVE_SPEC.garmentBackUrl)
          : null,
      });

      if (!resultB64) throw new Error("Görsel alınamadı.");

      // 4️⃣ Sonucu modalda göster
      els.img.src = `data:image/png;base64,${resultB64}`;
      els.dl.href = els.img.src;
      openModal();
    } catch (err) {
      console.error(err);
      alert("Sanal deneme başarısız: " + (err.message || err));
    } finally {
      tryonRunSingle.disabled = false;
      tryonRunSingle.textContent = "Üstünde Dene";
    }
  });
}

/* ---------- Helpers ---------- */
function toBase64(file, stripPrefix=false) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(stripPrefix ? s.split(",")[1] : s);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function urlToBase64(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) { console.warn("Şablon bulunamadı:", url, res.status); return null; }
    const blob = await res.blob();
    return await new Promise((ok, err) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1]);
      r.onerror = err; r.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn("Şablon okunamadı:", url, e);
    return null;
  }
}

// Görsel kontrol (CORS dostu)
function checkImage(url) {
  return new Promise(resolve => {
    if (!url) return resolve({ url, ok:false, reason: "empty-url" });
    const img = new Image();
    img.onload  = ()=> resolve({ url, ok:true,  w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = ()=> resolve({ url, ok:false, reason: "load-error" });
    img.src = url + (url.includes("?") ? "&" : "?") + "_ts=" + Date.now();
  });
}

/* ---------- Gemini API ---------- */
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
      console.warn("Pose detection failed, status:", res.status);
      return "front";
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase() || "";
    console.log("[POSE] Gemini response:", text);
    if (text.includes("back")) return "back";
    return "front";
  } catch (e) {
    console.warn("Pose detection error:", e);
    return "front";
  }
}

async function runGeminiTryOn(opts) {
  const {
    userB64, garmentDiffuse, productName,
    bgMode, bgB64, garmentFrontB64, garmentBackB64
  } = opts;

  const API_KEY = "";
  if (!API_KEY || API_KEY.startsWith("YOUR_")) {
    throw new Error("Gemini API anahtarı eksik. tryon.js içinde API_KEY girin.");
  }

  // 1️⃣ Kişinin önünün mü arkasının mı dönük olduğunu tespit et
  const pose = await detectPose(userB64, API_KEY);
  console.log("[TRYON] Tespit edilen yön:", pose);

  // 2️⃣ Yön bilgisine göre ön veya arka şablonu seç (eğer arka şablon yoksa ön şablona düş)
  let selectedGarmentB64 = garmentFrontB64;
  let selectedLabel = "Tişört Ön Şablon (şeffaf PNG):";

  if (pose === "back") {
    if (garmentBackB64) {
      selectedGarmentB64 = garmentBackB64;
      selectedLabel = "Tişört Arka Şablon (şeffaf PNG):";
    } else {
      console.warn("[TRYON] Arka şablon bulunamadı, ön şablon kullanılıyor.");
    }
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${API_KEY}`;

  // Arka plan talimatı
  let bgText = "Arka planı fotoğraftaki gibi bırak.";
  if (bgMode === "white")    bgText = "Arka planı beyaz stüdyo zemin yap.";
  if (bgMode === "gradient") bgText = "Arka planı koyu yumuşak bir degrade yap, stüdyo ışığı gibi.";
  if (bgMode === "custom")   bgText = "Arka planı gönderdiğim özel görselle değiştir.";

  const prompt = [
    `Bu fotoğraftaki kişiye ${productName} giydir.`,
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
  } else {
    console.warn("TRYON: seçilen şablon eksik (null)");
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
    const err = await res.json().catch(()=> ({}));
    console.error("Gemini HTTP hata:", res.status, err);
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  const cand = json?.candidates?.[0];
  if (!cand) {
    console.warn("Gemini boş candidates döndürdü:", json);
    return null;
  }
  if (cand.finishReason && cand.finishReason !== "FINISH_REASON_UNSPECIFIED") {
    console.warn("finishReason:", cand.finishReason, "safetyRatings:", cand.safetyRatings);
  }

  const outParts = cand?.content?.parts || [];
  const imgPart = outParts.find(p => p?.inlineData && /^image\//i.test(p.inlineData.mimeType || "image/png"));
  if (!imgPart?.inlineData?.data) {
    const text = outParts.map(p => p.text).filter(Boolean).join("\n");
    console.warn("Model görsel yerine metin döndürdü:", text);
    return null;
  }

  const b64 = imgPart.inlineData.data;
  console.groupCollapsed("[TRYON] model output");
  console.log("returned b64 length:", b64?.length || 0);
  console.groupEnd();
  return b64;
}
