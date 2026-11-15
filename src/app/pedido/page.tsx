import { getCatalogoPublico } from "@/lib/repository";
import { PedidoClient } from "@/components/pedido/PedidoClient";

export const dynamic = "force-dynamic";

export default async function PedidoPage() {
  const { colegios, series, modulos, config } = await getCatalogoPublico();

  return (
    <PedidoClient
      colegios={colegios}
      series={series}
      modulos={modulos}
      config={config}
    />
  );
}

