import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { WiggleBone } from "wiggle/spring";
import { Lt, ORDER } from "./lt.js";

/* ------------ DOM ------------ */
const canvas  = document.getElementById("webgl");
const titleEl = document.querySelector(".hero-card h1");
const priceEl = document.querySelector(".hero-card .price");
const leadEl  = document.querySelector(".hero-card .lead");
const prevBtn = document.getElementById("prevProduct");
const nextBtn = document.getElementById("nextProduct");

/* --- Punch state --- */
const punch = {
  active: false, t: 0,
  ampPos: new THREE.Vector3(0.05, 0.03, 0.00),
  ampRotX: THREE.MathUtils.degToRad(1.2),
  ampScale: 0.02,
  damp: 6.0, omega: 18.0,
  basePos: new THREE.Vector3(), baseRotX: 0, baseScale: 1,
};
function triggerPunch(intensity = 1) {
  if (!modelRoot) return;
  punch.active = true; punch.t = 0;
  punch.basePos.copy(modelRoot.position);
  punch.baseRotX = modelRoot.rotation.x;
  punch.baseScale = modelRoot.scale.x;
  punch._kPos   = punch.ampPos.clone().multiplyScalar(intensity);
  punch._kRotX  = punch.ampRotX * intensity;
  punch._kScale = punch.ampScale * intensity;
}

/* ------------ ürün & varyant ------------ */
let idx = Math.max(0, ORDER.indexOf("Vibe Besiktas"));
let variantIdx = 0;
const currentKey = () => ORDER[(idx % ORDER.length + ORDER.length) % ORDER.length];
if (prevBtn) prevBtn.addEventListener("click", () => { idx--; variantIdx = 0; showProduct(currentKey(), true); });
if (nextBtn) nextBtn.addEventListener("click", () => { idx++; variantIdx = 0; showProduct(currentKey(), true); });

/* ------------ Renderer/Scene/Camera ------------ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.shadowMap.enabled = true;
renderer.setClearAlpha(0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.25, 3.1);
scene.add(camera);

// lights
const keyL = new THREE.DirectionalLight(0xffffff, 2.9); keyL.position.set(3, 4, 2); keyL.castShadow = true; keyL.shadow.mapSize.set(1024, 1024); keyL.shadow.bias = -0.00015; scene.add(keyL);
const fillL = new THREE.DirectionalLight(0x9fb7ff, 1.8); fillL.position.set(-2.2, 2, 3); scene.add(fillL);
const rimL  = new THREE.DirectionalLight(0xffd4b0, 2.1); rimL.position.set(-1.4, 3, -2.4); scene.add(rimL);
scene.add(new THREE.AmbientLight(0xffffff, .25));

/* ------------ Loaders ------------ */
const gltf = new GLTFLoader();
const draco = new DRACOLoader(); draco.setDecoderPath("/draco/"); gltf.setDRACOLoader(draco);
const texLoader = new THREE.TextureLoader();

/* ------------ Globals ------------ */
let modelRoot = null;
const wiggleBones = [];
let accumYaw = 0, currentYaw = 0;

/* ------------ Helpers ------------ */
function ensureUV2(root){
  root.traverse(o=>{
    if (o.isMesh && o.geometry && !o.geometry.attributes.uv2 && o.geometry.attributes.uv){
      o.geometry.setAttribute("uv2", new THREE.BufferAttribute(o.geometry.attributes.uv.array, 2));
    }
  });
}

function buildMat(mesh, cfg, diffuseURL){
  const mapTex = diffuseURL
    ? texLoader.load(diffuseURL)
    : (cfg.diffuse ? texLoader.load(cfg.diffuse) : null);
  if (mapTex){ mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.flipY = false; }

  let normalTex = null;
  if (cfg.normal){
    normalTex = texLoader.load(cfg.normal);
    normalTex.flipY = false;
    normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
    const t = cfg.tiling ?? 1;
    normalTex.repeat.set(t, t);
  }

  let aoTex = null;
  if (cfg.ao){
    aoTex = texLoader.load(cfg.ao);
    aoTex.flipY = false;
  }

  const mat = new THREE.MeshPhysicalMaterial({
    map: mapTex || null,
    normalMap: normalTex || null,
    aoMap: aoTex || null,
    aoMapIntensity: cfg.aoStrength ?? 1,
    roughness: cfg.roughStrength ?? 1,
    metalness: 0,
    envMapIntensity: 0,
    side: THREE.DoubleSide,
    skinning: !!mesh.isSkinnedMesh,
  });

  if (normalTex){
    const s = cfg.normalStrength ?? 1;
    mat.normalScale = new THREE.Vector2(s, s);
  }

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFresnelPower     = { value: cfg.fresnelPower ?? 4 };
    shader.uniforms.uFresnelIntensity = { value: cfg.fresnelStrength ?? 0.6 };
    shader.uniforms.uFresnelInjection = { value: cfg.fresnelInject ?? 0.3 };
    shader.uniforms.uFresnelColor     = { value: new THREE.Color(1.0, 0.937, 0.804) };
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform float uFresnelPower;
uniform float uFresnelIntensity;
uniform float uFresnelInjection;
uniform vec3  uFresnelColor;`)
      .replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
{
  vec3 vDir = normalize(-vViewPosition);
  float ndotv = abs(dot(normalize(normal), vDir));
  float fresnelShape = pow(1.0 - ndotv, uFresnelPower) * uFresnelIntensity;
  float fresnelStrength = clamp(uFresnelInjection, 0.0, 1.0);
  totalEmissiveRadiance += uFresnelColor * fresnelShape * fresnelStrength;
}`);
  };
  mat.needsUpdate = true;
  return mat;
}

function applyMaterials(root, cfg, diffuseURL){
  ensureUV2(root);
  root.traverse(o=>{
    if (o.isMesh){
      o.castShadow = true; o.receiveShadow = true;
      o.material = buildMat(o, cfg, diffuseURL);
    }
  });
}

function swapDiffuse(root, diffuseURL){
  const next = diffuseURL ? texLoader.load(diffuseURL) : null;
  if (next){ next.colorSpace = THREE.SRGBColorSpace; next.flipY = false; }
  root.traverse(o=>{
    if (o.isMesh && o.material){
      const prev = o.material.map;
      o.material.map = next;
      o.material.needsUpdate = true;
      if (prev && prev !== next) prev.dispose?.();
    }
  });
}

function disposeModel(root){
  root?.traverse(o=>{
    if (o.geometry) o.geometry.dispose();
    if (o.material){
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        ["map","normalMap","aoMap","roughnessMap","metalnessMap","emissiveMap"].forEach(k=> m[k]?.dispose?.());
        m.dispose?.();
      }
    }
  });
}

/* ------------ Variant UI ------------ */
const colorRow = document.getElementById("colorVariants") || (()=>{ const d=document.createElement("div"); d.className="row"; d.id="colorVariants"; leadEl?.after?.(d); return d; })();
function renderVariantButtons(cfg){
  triggerPunch(0.03);
  colorRow.innerHTML = "";
  const label = document.createElement("span"); label.textContent = "Renk:"; colorRow.appendChild(label);
  cfg.variants.forEach((v,i)=>{
    const b=document.createElement("button");
    b.className="swatch"; b.title=v.label;
    b.style.width="28px"; b.style.height="28px"; b.style.borderRadius="999px"; b.style.border="1px solid #0003";
    b.style.background = v.color || "#ccc"; b.style.cursor="pointer"; b.style.outlineOffset="2px";
    if (i===variantIdx) b.style.outline="2px solid var(--accent)";
    b.addEventListener("click", ()=>applyVariant(i));
    colorRow.appendChild(b);
  });
}

function setHeroBackground(url, tint){
  document.documentElement.style.setProperty("--hero-bg", `url("${url}") center/cover no-repeat fixed`);
  if (tint) document.documentElement.style.setProperty("--ink", `url("${url}") ${tint}`);
}

/* ------------ Side banners ------------ */
const sideLeft  = document.getElementById("sideLeft");
const sideRight = document.getElementById("sideRight");

function normalizeSide(cfg) {
  if (!cfg) return { left: null, right: null };
  if (Array.isArray(cfg.side)) {
    const left  = cfg.side[0] ?? cfg.diffuse ?? null;
    const right = cfg.side[1] ?? cfg.diffuseAlt ?? cfg.diffuse ?? left;
    return { left, right };
  }
  return {
    left:  cfg.side?.left  ?? cfg.diffuse ?? null,
    right: cfg.side?.right ?? cfg.diffuseAlt ?? cfg.diffuse ?? null,
  };
}

function updateSideBanners(cfg, useAlt = false) {
  const { left, right } = normalizeSide(cfg);
  if (!sideLeft || !sideRight) return;

  sideLeft.style.opacity  = 0;
  sideRight.style.opacity = 0;

  sideLeft.src  = left  || "";
  sideRight.src = (useAlt ? (cfg.diffuseAlt || right) : right) || left || "";

  const on = (img) => {
    if (img.complete && img.naturalWidth) { img.style.opacity = 1; return; }
    img.addEventListener("load", () => { img.style.opacity = 1; }, { once:true });
  };
  if (sideLeft.src)  on(sideLeft);
  if (sideRight.src) on(sideRight);
}
// === yardımcı: metinde kelimeyi vurgula ===
function highlightWord(text, word, colorVar = "var(--accent)") {
  if (!text || !word) return text || "";
  // regex kaçışı
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re  = new RegExp(`(${esc})`, "gi");
  return String(text).replace(re, `<span style="color:${colorVar}">$1</span>`);
}

/* ------------ Show / Variant ------------ */
function showProduct(key, resetView=false){
  const cfg = Lt[key];
  const v = cfg.variants[variantIdx] || cfg.variants[0];

  document.documentElement.style.setProperty("--hero-bg", `url("${(Lt[key]?.heroBg || 'tokyo_bg.webp')}") center/cover no-repeat fixed`);
  updateSideBanners(Lt[key], false);

  if (titleEl) {
    let titleHTML = cfg.title || key;
    const sub = cfg.subtitle?.trim();
    if (sub && titleHTML.toLowerCase().includes(sub.toLowerCase())) {
      // Subtitle geçen kısmı accent rengine boyar
      const regex = new RegExp(`(${sub})`, "gi");
      titleHTML = titleHTML.replace(
        regex,
        `<span style="color:var(--accent);">$1</span>`
      );
    }
    titleEl.innerHTML = titleHTML;
  }  if (leadEl)  leadEl.textContent = cfg.subtitle || "";
  if (priceEl) priceEl.textContent = `${(cfg.price||0).toLocaleString("tr-TR")}₺`;
  renderVariantButtons(cfg);
  setHeroBackground(v.heroBg || "tokyo_bg.webp", cfg.palette?.inkTint);
  if (cfg.palette?.accent) document.documentElement.style.setProperty("--accent", cfg.palette.accent);

  // DEBUG — publish öncesi
  console.groupCollapsed(`[TRYON] showProduct → ${key}`);
  console.log("variantIdx:", variantIdx);
  console.log("diffuse (variant):", v?.diffuse || null);
  console.log("tryOn.front:", cfg?.tryOn?.front || null);
  console.log("tryOn.back :", cfg?.tryOn?.back  || null);
  console.groupEnd();

  // try-on’a yayınla
  publishTryOnSpec({
    title:   cfg.title || key,
    variantLabel: v?.label,
    diffuse: v?.diffuse || cfg.diffuse,
    heroBg:  v?.heroBg || cfg.heroBg,
    palette: cfg.palette,
    garmentFrontUrl: v?.tryOn?.front || cfg.tryOn?.front || "clothes/default_on.png",
    garmentBackUrl:  v?.tryOn?.back  || cfg.tryOn?.back  || "clothes/default_arka.png",
  });

  if (modelRoot && modelRoot.userData.modelPath === cfg.model){
    swapDiffuse(modelRoot, v.diffuse);
    return;
  }

  gltf.load(cfg.model, (res)=>{
    const group = res.scene;
    applyMaterials(group, cfg, v.diffuse);
    group.userData.modelPath = cfg.model;

    if (modelRoot){ scene.remove(modelRoot); disposeModel(modelRoot); }
    scene.add(group);
    fitCamera(group);
    attachWiggle(group, cfg);

    if (resetView){ accumYaw = currentYaw = 0; group.rotation.set(0,0,0); }
    else          { group.rotation.set(0, currentYaw, 0); }
    modelRoot = group;
  });
}

function publishTryOnSpec({ title, variantLabel, diffuse, heroBg, palette, garmentFrontUrl, garmentBackUrl }) {
  const spec = {
    productName: title,
    colorLabel:  variantLabel || "",
    diffuseUrl:  diffuse,
    backgroundUrl: heroBg || "",
    accent: palette?.accent || "#d6c119",
    garmentFrontUrl,
    garmentBackUrl
  };
  window.dispatchEvent(new CustomEvent("product-changed", { detail: spec }));
}

function applyVariant(i){
  const cfg = Lt[currentKey()];
  variantIdx = THREE.MathUtils.clamp(i, 0, cfg.variants.length-1);
  const v = cfg.variants[variantIdx];
  renderVariantButtons(cfg);
  if (modelRoot) swapDiffuse(modelRoot, v.diffuse);
  setHeroBackground(v.heroBg || "tokyo_bg.webp", cfg.palette?.inkTint);

  publishTryOnSpec({
    title:   cfg.title || currentKey(),
    variantLabel: v?.label,
    diffuse: v?.diffuse || cfg.diffuse,
    heroBg:  v?.heroBg || cfg.heroBg,
    palette: cfg.palette,
    garmentFrontUrl: v?.tryOn?.front || cfg.tryOn?.front || "clothes/default_on.png",
    garmentBackUrl:  v?.tryOn?.back  || cfg.tryOn?.back  || "clothes/default_arka.png",
  });
}

/* ------------ Wiggle ------------ */
function computeDepthMap(rootBone){
  const depth = new Map();
  (function walk(b, d){ depth.set(b, d); b.children.forEach(c=>c.isBone && walk(c, d+1)); })(rootBone, 0);
  return depth;
}
function buildWiggleForSkeleton(allBones, baseVel, rootBone){
  const depth = computeDepthMap(rootBone);
  let maxDepth = 0; depth.forEach(d=>{ if (d>maxDepth) maxDepth = d; });
  const list = [];
  allBones.forEach((bone)=>{
    if (bone === rootBone) return;
    const t = (maxDepth>0 ? (depth.get(bone)??1)/maxDepth : .5);
    list.push(new WiggleBone(bone, {
      stiffness: THREE.MathUtils.lerp(10000, 3000, t),
      damping:   THREE.MathUtils.lerp(99, 94, t),
      velocity:  (baseVel ?? .8) * THREE.MathUtils.lerp(0.03, 0.12, t),
    }));
  });
  return list;
}
function attachWiggle(group, cfg){
  wiggleBones.length = 0;
  const baseV = cfg.wiggleVelocity || .8;
  const skinned = []; group.traverse(o=>{ if (o.isSkinnedMesh) skinned.push(o); });
  if (!skinned.length) return;
  const bones=[]; skinned.forEach(m=>m.skeleton.bones.forEach(b=>{ if(!bones.includes(b)) bones.push(b); }));
  const rootBone = bones.find(b=>!b.parent?.isBone) || bones[0];
  buildWiggleForSkeleton(bones, baseV, rootBone).forEach(w=>wiggleBones.push(w));
}

/* ------------ Kamera ------------ */
function fitCamera(object){
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const dist = (maxDim/2)/Math.tan(fov/2);
  camera.near = .1; camera.far = Math.max(100, dist*10);
  camera.position.set(0, Math.max(1.1, size.y*.3), dist*1.4);
  camera.lookAt(new THREE.Vector3(0, size.y*.15, 1));
  camera.updateProjectionMatrix();
}

/* ------------ Interaction ------------ */
const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
let isOverModel=false, dragging=false, dragLastX=0;
const INPUT_SCALE=0.10, ROT_SPEED=THREE.MathUtils.degToRad(90), DRAG_INVERT=+1;
function setNDC(e){ const r=canvas.getBoundingClientRect(); ndc.x=((e.clientX-r.left)/r.width)*2-1; ndc.y=-((e.clientY-r.top)/r.height)*2+1; }
function hitTest(e){ if(!modelRoot) return false; setNDC(e); raycaster.setFromCamera(ndc,camera); return raycaster.intersectObject(modelRoot,true).length>0; }
canvas.addEventListener("mousemove",(e)=>{ isOverModel=hitTest(e); });
canvas.addEventListener("mousedown",(e)=>{ if(!isOverModel) return; dragging=true; canvas.classList.add("dragging"); dragLastX=e.clientX; });
window.addEventListener("mouseup", ()=>{ dragging=false; canvas.classList.remove("dragging"); });
window.addEventListener("mousemove",(e)=>{ if(!dragging||!modelRoot) return; const dx=e.clientX-dragLastX; dragLastX=e.clientX; accumYaw+=THREE.MathUtils.degToRad(dx*INPUT_SCALE*DRAG_INVERT); });
const MIN_Z=1.6, MAX_Z=4.5;
canvas.addEventListener("wheel",(e)=>{ const delta=Math.sign(e.deltaY); const step=0.15; camera.position.z=THREE.MathUtils.clamp(camera.position.z+delta*step, MIN_Z, MAX_Z); }, { passive:true });

/* ------------ Resize & Loop ------------ */
function resize(){ const w=canvas.clientWidth,h=canvas.clientHeight; renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize); resize();
const ro = new ResizeObserver(()=>resize()); ro.observe(canvas.parentElement);

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  if (modelRoot) {
    const diff = accumYaw - currentYaw;
    if (Math.abs(diff) > 1e-6) {
      const step = THREE.MathUtils.clamp(diff, -ROT_SPEED * dt, ROT_SPEED * dt);
      currentYaw += step;
    }

    if (punch.active) {
      punch.t += dt;
      const s = Math.exp(-punch.damp * punch.t) * Math.cos(punch.omega * punch.t);
      modelRoot.position.set(
        punch.basePos.x + punch._kPos.x * s,
        punch.basePos.y + punch._kPos.y * s,
        punch.basePos.z + punch._kPos.z * s
      );
      modelRoot.rotation.x = punch.baseRotX + punch._kRotX * s;
      modelRoot.scale.setScalar(punch.baseScale * (1 + punch._kScale * s));
      modelRoot.rotation.y = currentYaw;

      if (Math.abs(s) < 0.001) {
        punch.active = false;
        modelRoot.position.copy(punch.basePos);
        modelRoot.rotation.x = punch.baseRotX;
        modelRoot.scale.setScalar(punch.baseScale);
      }
    } else {
      modelRoot.rotation.y = currentYaw;
    }
  }

  wiggleBones.forEach(w => w.update(dt));
  renderer.render(scene, camera);
}
animate();

/* ------------ first load ------------ */
showProduct(currentKey(), true);
