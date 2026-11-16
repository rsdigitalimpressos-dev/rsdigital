import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RS Digital · Pedidos de Livros e Apostilas Escolares",
  description:
    "Sistema online de pedidos de livros e apostilas escolares impressos da gráfica RS Digital.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@300;400;500;600;700;800;900&display=swap"
        />
      </head>
      <body className="min-h-screen bg-brand-paper text-brand-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

