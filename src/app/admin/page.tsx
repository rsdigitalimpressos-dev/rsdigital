import { verificarAdminAutenticado } from "@/app/actions";
import { getAdminData } from "@/lib/repository";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sessao = await verificarAdminAutenticado();

  if (!sessao.autenticado) {
    return <AdminLoginForm modoDemo={sessao.modoDemo} />;
  }

  const dados = await getAdminData();

  return (
    <AdminDashboard
      initialPedidos={dados.pedidos}
      initialOrcamentos={dados.orcamentos}
      initialColegios={dados.colegios}
      initialSeries={dados.series}
      initialModulos={dados.modulos}
      initialLivros={dados.livros}
      initialCupons={dados.cupons}
      initialConfig={dados.config}
      initialLancamentos={dados.lancamentos}
      adminEmail={sessao.email || "Administrador"}
      modoSupabase={dados.modoSupabase}
    />
  );
}

