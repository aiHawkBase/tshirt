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
  BG_B64 = f ? await resizeAndCompressImage(f) : null;
});

on(els.user, "change", async (e) => {
  const f = e.target.files?.[0];
  USER_B64 = f ? await resizeAndCompressImage(f) : null;
  if (els.fileHint) els.fileHint.textContent = f ? `Seçildi: ${f.name}` : "(boydan, iyi ışık)";
});

// click → çalıştır
on(els.run, "click", async () => {
  if (!USER_B64) { alert("Önce kendi fotoğrafınızı yükleyin."); return; }

  try {
    els.run.disabled = true;
    els.run.textContent = "Hazırlanıyor…";
    showLoading("Fotoğrafınız Analiz Ediliyor", "Duruş açınız tespit ediliyor (ön/arka)...");

    const frontUrl = ACTIVE_SPEC.garmentFrontUrl || "";
    const backUrl  = ACTIVE_SPEC.garmentBackUrl  || "";

    console.groupCollapsed("[TRYON] click → inputs");
    console.log("bgMode:", els.bgSel?.value ?? "keep");
    console.log("userB64 length:", USER_B64?.length || 0);
    console.log("front url:", frontUrl);
    console.log("back  url:", backUrl);
    console.log("diffuseUrl:", ACTIVE_SPEC.diffuseUrl || null);
    console.groupEnd();

    const resultB64 = await runGeminiTryOn({
      userB64: USER_B64,
      garmentDiffuse: ACTIVE_SPEC.diffuseUrl,
      productName: ACTIVE_SPEC.productName,
      bgMode: els.bgSel?.value ?? "keep",
      bgB64: BG_B64,
      garmentFrontUrl: frontUrl,
      garmentBackUrl:  backUrl,
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
    hideLoading();
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
      const userB64 = await resizeAndCompressImage(file);

      // 2️⃣ Butonu pasifleştir & Loading popup'ını aç
      tryonRunSingle.disabled = true;
      tryonRunSingle.textContent = "Hazırlanıyor…";
      showLoading("Fotoğrafınız Analiz Ediliyor", "Duruş açınız tespit ediliyor (ön/arka)...");

      // 3️⃣ Try-on işlemini başlat
      const resultB64 = await runGeminiTryOn({
        userB64,
        garmentDiffuse: ACTIVE_SPEC.diffuseUrl,
        productName: ACTIVE_SPEC.productName,
        colorLabel: ACTIVE_SPEC.colorLabel,
        bgMode: "keep",
        garmentFrontUrl: ACTIVE_SPEC.garmentFrontUrl || null,
        garmentBackUrl: ACTIVE_SPEC.garmentBackUrl || null,
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
      hideLoading();
    }
  });
}

/* ---------- Helpers ---------- */
function resizeAndCompressImage(file, maxDim = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context could not be created"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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

function showLoading(title, desc) {
  const modal = document.getElementById("tryonLoadingModal");
  const tEl = document.getElementById("tryonLoadingStatusTitle");
  const dEl = document.getElementById("tryonLoadingStatusDesc");
  if (modal) modal.style.display = "flex";
  if (tEl && title) tEl.textContent = title;
  if (dEl && desc) dEl.textContent = desc;
}

function updateLoading(desc) {
  const dEl = document.getElementById("tryonLoadingStatusDesc");
  if (dEl && desc) dEl.textContent = desc;
}

function hideLoading() {
  const modal = document.getElementById("tryonLoadingModal");
  if (modal) modal.style.display = "none";
}

/* ---------- Gemini API Proxy Call ---------- */
async function callServerlessAction(action, data) {
  const res = await fetch("/api/tryon/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  if (json.error) {
    throw new Error(json.error);
  }
  return json;
}

async function runGeminiTryOn(opts) {
  const {
    userB64, garmentDiffuse, productName,
    bgMode, bgB64, garmentFrontUrl, garmentBackUrl
  } = opts;

  // 1️⃣ Duruş Tespiti Eylemi
  const detectRes = await callServerlessAction("detect", { userB64 });
  const pose = detectRes.pose || "front";
  console.log("[TRYON] Tespit edilen yön:", pose);

  // 2️⃣ Yükleme mesajını güncelle
  updateLoading("Tişört üzerinize göre uyarlanıyor ve yerleştiriliyor...");

  // 3️⃣ Sanal Giydirme Eylemi
  const tryonRes = await callServerlessAction("tryon", {
    userB64,
    garmentDiffuse,
    productName,
    pose,
    bgMode,
    bgB64,
    garmentFrontUrl,
    garmentBackUrl,
    baseUrl: window.location.origin
  });

  return tryonRes.resultB64;
}
