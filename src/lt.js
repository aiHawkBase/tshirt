// src/lt.js
export const ORDER = ["Vibe Besiktas", "Vibe Fish", "Vibe Fly", "Vibe Tokyo"];

/**
 * ŞEMA
 * - COMMON: tüm ürünlerde ortak ayarlar
 * - Ürün: title, subtitle, price, palette, heroBg, side, tryOn {front, back}, variants[]
 */

const COMMON = {
  model: "shirt.glb",

  // Material
  ao: "",
  normal: "normal.jpg",
  tiling: 10,
  normalStrength: 2.0,
  aoStrength: 1.0,
  roughStrength: 1.0,

  // FX
  wiggleVelocity: 0.8,
  fresnelStrength: 0.6,
  fresnelInject: 0.3,
  fresnelPower: 4.0,

  // UI
  palette: { accent: "#d6c119", inkTint: "#101114" },
  heroBg: "default_bg.webp",

  side: {
    left:  "side_left_default.webp",
    right: "side_right_default.webp",
  },

  // Varsayılan try-on şablonları (ürün özelinde ezilecek)
  tryOn: {
    front: "clothes/default_on.png",
    back:  "clothes/default_arka.png",
  },
};

export const Lt = {
  "Vibe Besiktas": {
    ...COMMON,
    title: "Siyah Beyaz • Beşiktaş Özel Koleksiyonu",
    subtitle: "Beşiktaş",
    price: 12999,

    palette: { accent: "#ffffff", inkTint: "#050505" },
    heroBg: "besiktaswallpaper.webp",
    side: {
      left:  "besiktaswallpaper.webp",
      right: "besiktaswallpaper.webp",
    },

    tryOn: {
      front: "besiktas1.jpg",
      back:  "besiktas1.jpg",
    },

    variants: [
      { 
        id: "besiktas-1", 
        label: "Siyah", 
        color: "#111111", 
        diffuse: "besiktas1.jpg",   
        heroBg: "besiktaswallpaper.webp",
        tryOn: {
          front: "besiktas1.jpg",
          back:  "besiktas1.jpg",
        }
      },
      { 
        id: "besiktas-2", 
        label: "Beyaz", 
        color: "#ffffff", 
        diffuse: "besiktas2.jpg",   
        heroBg: "besiktaswallpaper.webp",
        tryOn: {
          front: "besiktas2.jpg",
          back:  "besiktas2.jpg",
        }
      },
    ],
  },

  "Vibe Fish": {
    ...COMMON,
    title: "Soft knit • breathable • artwork: koi fish",
    subtitle: "koi",
    price: 12999,

    palette: { accent: "#90e0ef", inkTint: "#0e1015" },
    heroBg: "fish_bg.webp",
    side: {
      left:  "houseOfTheHawk.webp",
      right: "houseOfTheHawk.webp",
    },

    tryOn: {
      front: "clothes/fish_on.png",
      back:  "clothes/fish_arka.png",
    },

    variants: [
      { id: "fish-1", label: "Ocean", color: "#82cfff", diffuse: "hawk1.webp",   heroBg: "fish_bg.webp" },
      { id: "fish-2", label: "Deep",  color: "#3da9fc", diffuse: "hawk1_1.webp", heroBg: "fish_bg.webp" },
    ],
  },

  "Vibe Fly": {
    ...COMMON,
    title: "Those who don’t jump will never Fly.",
    subtitle: "Fly",
    price: 12999,

    palette: { accent: "#d6c119", inkTint: "#101114" },
    heroBg: "fly_bg.webp",
    side: { left: "fly_bg.webp", right: "fly_bg.webp" },

    tryOn: {
      front: "clothes/fly_on.png",
      back:  "clothes/fly_arka.png",
    },

    variants: [
      {
        id: "fly-1", label: "Volt", color: "#d6c119",
        diffuse: "hawk2.webp", heroBg: "fly_bg.webp",
        side: { left: "hawk3.webp", right: "hawk3_3.webp" },
      },
      { id: "fly-2", label: "Ash", color: "#7f7f7f", diffuse: "hawk2_2.webp", heroBg: "fly_bg.webp" },
    ],
  },

  "Vibe Tokyo": {
    ...COMMON,
    title: "Neon nights • Shibuya energy.",
    subtitle: "Shibuya",
    price: 12999,

    palette: { accent: "#ff5d8f", inkTint: "#0e0f14" },
    heroBg: "tokyo_bg.webp",
    side: { left: "houseOfTheHawk2.webp", right: "houseOfTheHawk2.webp" },

    tryOn: {
      front: "clothes/tokyo_on.png",
      back:  "clothes/tokyo_arka.png",
    },

    variants: [
      { id: "tokyo-1", label: "Neon", color: "#ff5d8f", diffuse: "hawk3.webp",   heroBg: "tokyo_bg.webp" },
      { id: "tokyo-2", label: "Noir", color: "#2f2f39", diffuse: "hawk3_3.webp", heroBg: "tokyo_bg.webp" },
    ],
  },
};
