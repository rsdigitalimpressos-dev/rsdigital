import { getCatalogoPublico } from "@/lib/repository";
import { OrcamentoClient } from "@/components/pedido/OrcamentoClient";

export const dynamic = "force-dynamic";

export default async function OrcamentoPage() {
  const { colegios, series, modulos, config } = await getCatalogoPublico();

  return (
    <OrcamentoClient
      colegios={colegios}
      series={series}
      modulos={modulos}
      config={config}
    />
  );
}
