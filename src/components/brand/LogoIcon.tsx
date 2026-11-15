import React from "react";

interface LogoIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Logo (ícone) oficial RS Digital — Círculos CMYK sobre fundo claro
 * Três círculos nas cores de tinta (ciano, magenta e amarelo) sobrepostos com mix-blend-mode: multiply.
 */
export function LogoIcon({ size = 40, className = "", ...props }: LogoIconProps) {
  return (
    <svg
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="120" height="120" rx="24" fill="#FFFFFF" />
      <circle
        cx="48"
        cy="48"
        r="26"
        fill="#00A0DC"
        style={{ mixBlendMode: "multiply" }}
      />
      <circle
        cx="72"
        cy="48"
        r="26"
        fill="#E5007D"
        style={{ mixBlendMode: "multiply" }}
      />
      <circle
        cx="60"
        cy="70"
        r="26"
        fill="#FFD200"
        style={{ mixBlendMode: "multiply" }}
      />
    </svg>
  );
}

