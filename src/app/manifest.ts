import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RS Digital · Módulos Escolares",
    short_name: "RS Digital",
    description:
      "Sistema online de pedidos e orçamentos de módulos e apostilas escolares da gráfica RS Digital.",
    start_url: "/pedido",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#161616",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
