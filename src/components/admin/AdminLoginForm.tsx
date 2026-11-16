"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Lock,
  Mail,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { SplashScreen } from "@/components/brand/SplashScreen";
import { loginAdminAction } from "@/app/actions";

interface AdminLoginFormProps {
  modoDemo: boolean;
}

export function AdminLoginForm({}: AdminLoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    try {
      const res = await loginAdminAction(email, password);
      if (!res.ok) {
        setErro(res.erro || "Falha no login.");
        setCarregando(false);
        return;
      }
      router.refresh();
    } catch {
      setErro("Erro inesperado ao realizar login.");
      setCarregando(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col justify-between relative overflow-hidden">
        {/* Luzes sutis da identidade CMYK ao fundo */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[520px] h-[260px] bg-gradient-to-r from-brand-cyan/15 via-brand-magenta/15 to-brand-yellow/20 blur-3xl rounded-full" />

        {/* Faixa superior CMYK */}
        <div className="h-1 w-full flex relative z-10">
          <div className="flex-1 bg-brand-cyan" />
          <div className="flex-1 bg-brand-magenta" />
          <div className="flex-1 bg-brand-yellow" />
          <div className="flex-1 bg-brand-ink" />
        </div>

        {/* Card Central Moderno com Animação da Logo */}
        <div className="flex-1 flex items-center justify-center p-4 relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[400px] bg-white border border-brand-border/90 rounded-3xl shadow-xl shadow-black/[0.04] p-8 sm:p-9 space-y-7"
          >
            {/* Cabeçalho com Logomarca Animada CMYK */}
            <div className="flex flex-col items-center text-center space-y-3">
              <motion.div
                initial={{ rotate: -180, scale: 0.8 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{
                  duration: 0.6,
                  ease: [0.22, 1, 0.36, 1],
                }}
                className="w-16 h-16 rounded-2xl bg-white border border-brand-border/80 shadow-md shadow-black/5 flex items-center justify-center"
              >
                <svg
                  viewBox="0 0 120 120"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-12 h-12"
                >
                  <motion.circle
                    cx={48}
                    cy={48}
                    r={26}
                    fill="#00A0DC"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{ cx: [48, 53, 48], cy: [48, 52, 48] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <motion.circle
                    cx={72}
                    cy={48}
                    r={26}
                    fill="#E5007D"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{ cx: [72, 67, 72], cy: [48, 52, 48] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                  <motion.circle
                    cx={60}
                    cy={70}
                    r={26}
                    fill="#FFD200"
                    style={{ mixBlendMode: "multiply" }}
                    animate={{ cx: [60, 60, 60], cy: [70, 64, 70] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </svg>
              </motion.div>

              <div className="space-y-1">
                <div className="inline-flex items-center text-[19px] leading-none font-brand">
                  <span
                    className="text-brand-ink tracking-[-0.05em]"
                    style={{ fontWeight: 900 }}
                  >
                    RS
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-[2.5px] mx-1.5 -skew-x-12 rounded-full bg-gradient-to-b from-brand-cyan via-brand-magenta to-brand-yellow shrink-0"
                  />
                  <span
                    className="bg-gradient-to-r from-[#0095D9] via-[#0284C7] to-[#E5007D] bg-clip-text text-transparent uppercase tracking-[0.06em]"
                    style={{ fontWeight: 700 }}
                  >
                    DIGITAL
                  </span>
                </div>
                <p className="text-xs text-brand-muted">
                  Acesso ao painel de gestão
                </p>
              </div>
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-bold text-brand-ink mb-1.5"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-brand-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@rsdigital.com.br"
                    className="w-full pl-10 pr-3.5 py-3 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-cyan/25 focus:border-brand-cyan transition-all"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold text-brand-ink mb-1.5"
                >
                  Senha
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-brand-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    type={mostrarSenha ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 text-sm bg-white border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-cyan/25 focus:border-brand-cyan transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-muted hover:text-brand-ink transition-colors"
                    tabIndex={-1}
                  >
                    {mostrarSenha ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {erro && (
                <div className="flex items-center gap-2 border border-red-200 text-red-600 p-3 rounded-xl text-xs font-semibold bg-white">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{erro}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={carregando}
                className="w-full py-3.5 px-5 bg-brand-ink hover:bg-brand-magenta disabled:opacity-50 text-white font-bold text-sm rounded-xl shadow-md shadow-black/10 transition-all inline-flex items-center justify-center gap-2"
              >
                <span>{carregando ? "Entrando..." : "Entrar no Sistema"}</span>
                {!carregando && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>

            <div className="pt-2 text-center">
              <Link
                href="/pedido"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-muted hover:text-brand-ink transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar para página de pedidos
              </Link>
            </div>
          </motion.div>
        </div>

        <footer className="py-4 text-center text-[11px] text-brand-muted relative z-10">
          RS Digital
        </footer>
      </div>
    </>
  );
}
