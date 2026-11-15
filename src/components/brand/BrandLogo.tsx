import React from "react";
import { LogoIcon } from "./LogoIcon";

interface BrandLogoProps {
  theme?: "light" | "dark";
  size?: "sm" | "md" | "lg";
  uppercaseDigital?: boolean;
  className?: string;
}

/**
 * Marca RS / DIGITAL (Lockup Moderno Limpo)
 * - Ícone CMYK sobre fundo claro
 * - "RS" em peso 900 ultra-geométrico
 * - Barra diagonal em espectro CMYK (Ciano -> Magenta -> Amarelo)
 * - "DIGITAL" em peso 700 com gradiente Ciano-Magenta
 */
export function BrandLogo({
  theme = "light",
  size = "md",
  className = "",
}: BrandLogoProps) {
  const iconSizes = {
    sm: 32,
    md: 38,
    lg: 48,
  };

  const wordSizes = {
    sm: "text-[14px]",
    md: "text-[17px]",
    lg: "text-[22px]",
  };

  const slashSizes = {
    sm: "h-3 w-[2px] mx-1.5",
    md: "h-3.5 w-[2.5px] mx-1.5",
    lg: "h-4 w-[3px] mx-2",
  };

  const rsColor = theme === "dark" ? "text-white" : "text-brand-ink";
  const digitalGradient =
    theme === "dark"
      ? "bg-gradient-to-r from-[#38BDF8] via-[#00A0DC] to-[#FF47A3] bg-clip-text text-transparent"
      : "bg-gradient-to-r from-[#0095D9] via-[#0284C7] to-[#E5007D] bg-clip-text text-transparent";

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none font-brand ${className}`}
    >
      <LogoIcon
        size={iconSizes[size]}
        className={`shrink-0 ${
          theme === "dark" ? "rounded-[9px] shadow-sm" : "rounded-[8px]"
        }`}
      />
      <div
        className={`inline-flex items-center ${wordSizes[size]} leading-none whitespace-nowrap`}
      >
        <span
          className={`${rsColor} tracking-[-0.05em]`}
          style={{ fontWeight: 900 }}
        >
          RS
        </span>
        <span
          aria-hidden="true"
          className={`${slashSizes[size]} -skew-x-12 rounded-full bg-gradient-to-b from-brand-cyan via-brand-magenta to-brand-yellow shrink-0`}
        />
        <span
          className={`${digitalGradient} uppercase tracking-[0.06em]`}
          style={{ fontWeight: 700 }}
        >
          DIGITAL
        </span>
      </div>
    </div>
  );
}
