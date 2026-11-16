"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface SplashScreenProps {
  forceShow?: boolean;
  triggerKey?: string | number;
  onComplete?: () => void;
}

/**
 * Tela de abertura (splash) animada — Marca RS / DIGITAL
 * Executada ao entrar no site ou ao atualizar a página (F5):
 * 1. Fundo claro, ícone CMYK centralizado (~104px).
 * 2. O ícone gira 360° (~1,05s) enquanto os 3 círculos CMYK se aproximam do centro e retornam.
 * 3. Ao terminar o giro, o ícone desliza para a esquerda e a marca "RS / DIGITAL" é revelada à direita.
 * 4. Mantém o logotipo completo e então a splash some suavemente em fade-out.
 */
export function SplashScreen({
  triggerKey,
  onComplete,
}: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"spin" | "reveal">("spin");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setVisible(true);
    setPhase("spin");

    const revealTimer = setTimeout(() => {
      setPhase("reveal");
    }, 1050);

    const hideTimer = setTimeout(() => {
      setVisible(false);
      onCompleteRef.current?.();
    }, 2100);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(hideTimer);
    };
  }, [triggerKey]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={triggerKey !== undefined ? `splash-${triggerKey}` : "rs-digital-splash"}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-brand-paper select-none font-brand"
          aria-label="RS Digital — Carregando"
        >
          <div className="flex items-center justify-center px-6">
            <motion.div
              layout
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center"
            >
              {/* Ícone centralizado com giro 360° e mistura CMYK sobre fundo claro */}
              <motion.div
                initial={{ rotate: 0, scale: 0.94 }}
                animate={{
                  rotate: 360,
                  scale: phase === "reveal" ? 0.82 : 1,
                }}
                transition={{
                  rotate: { duration: 1.05, ease: [0.22, 1, 0.36, 1] },
                  scale: { duration: 0.32, ease: "easeOut" },
                }}
                className="shrink-0"
              >
                <svg
                  viewBox="0 0 120 120"
                  xmlns="http://www.w3.org/2000/svg"
                  width={104}
                  height={104}
                >
                  <rect width="120" height="120" rx="24" fill="#FFFFFF" />
                  <motion.circle
                    cx={48}
                    cy={48}
                    r={26}
                    fill="#00A0DC"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{
                      cx: [48, 56, 48],
                      cy: [48, 55, 48],
                    }}
                    transition={{ duration: 1.05, ease: "easeInOut" }}
                  />
                  <motion.circle
                    cx={72}
                    cy={48}
                    r={26}
                    fill="#E5007D"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{
                      cx: [72, 64, 72],
                      cy: [48, 55, 48],
                    }}
                    transition={{ duration: 1.05, ease: "easeInOut" }}
                  />
                  <motion.circle
                    cx={60}
                    cy={70}
                    r={26}
                    fill="#FFD200"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{
                      cx: [60, 60, 60],
                      cy: [70, 58, 70],
                    }}
                    transition={{ duration: 1.05, ease: "easeInOut" }}
                  />
                </svg>
              </motion.div>

              {/* Revelação da marca "RS / DIGITAL" à direita após o giro */}
              <AnimatePresence>
                {phase === "reveal" && (
                  <motion.div
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: "auto", opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden flex items-center"
                  >
                    <div className="pl-2.5 pr-1 inline-flex items-center whitespace-nowrap text-xl sm:text-2xl leading-none">
                      <span
                        className="text-brand-ink tracking-[-0.05em]"
                        style={{ fontWeight: 900 }}
                      >
                        RS
                      </span>

                      <span
                        aria-hidden="true"
                        className="h-5 sm:h-6 w-[3px] mx-2 -skew-x-12 rounded-full bg-gradient-to-b from-brand-cyan via-brand-magenta to-brand-yellow shrink-0"
                      />

                      <span
                        className="bg-gradient-to-r from-[#0095D9] via-[#0284C7] to-[#E5007D] bg-clip-text text-transparent uppercase tracking-[0.06em]"
                        style={{ fontWeight: 700 }}
                      >
                        DIGITAL
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
