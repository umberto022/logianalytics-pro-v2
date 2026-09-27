// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CatalogView } from "./CatalogView";
import type { PublicCatalogPayload } from "@/lib/catalogPublicPayload";
import { toCents } from "@/lib/money";

const DATA: PublicCatalogPayload = {
  businessName: "Stefany's Creations",
  logoUrl: null,
  colors: { primary: "#EC4899", accent: "#C084FC" },
  whatsappConfigured: true,
  pickup: { enabled: true, address: "Calle Falsa 123" },
  delivery: { enabled: true, zones: ["Santo Domingo Oeste", "Distrito Nacional"] },
  leadTimeNote: "Desde 3 días, sujeto a confirmación según el producto",
  discountRule: { minQty: 4, pct: 20, appliesToShipping: false },
  advanceRule: { pct: 50, largeOrderThresholdCents: toCents(2000), thresholdAfterDiscountExcludingShipping: true },
  products: [
    {
      id: "p1", name: "Llavero de rosario", category: "Religiosos", description: "Llavero artesanal",
      imageUrl: null, basePriceCents: toCents(500),
      variants: [
        { id: "v1", label: "Color: Rojo", priceCents: toCents(500) },
        { id: "v2", label: "Color: Azul", priceCents: toCents(550) },
      ],
      quantityPricing: [], inStock: true, allowBackorder: false,
    },
    {
      id: "p2", name: "Rosario grande", category: "Religiosos", description: "",
      imageUrl: null, basePriceCents: toCents(1000),
      variants: [], quantityPricing: [{ minQty: 3, unitPriceCents: toCents(900) }],
      inStock: false, allowBackorder: true,
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { vi.unstubAllGlobals(); cleanup(); });

describe("CatalogView — carrito público", () => {
  it("agrega una variante con precio distinto y lo refleja en el carrito", async () => {
    render(<CatalogView data={DATA} mode="public" slug="stefanys" />);
    fireEvent.click(screen.getByText("Llavero de rosario"));
    fireEvent.click(await screen.findByText("Color: Azul"));
    fireEvent.click(screen.getByRole("button", { name: /Añadir al carrito/i }));

    fireEvent.click(screen.getByRole("button", { name: /Ver carrito/i }));
    expect(await screen.findByText("Color: Azul")).toBeInTheDocument();
    expect(screen.getAllByText("RD$550.00").length).toBeGreaterThan(0); // 1 unidad @ RD$550 (override de la variante)
  });

  it("3 unidades no dispara descuento; agregar una 4ta sí", async () => {
    render(<CatalogView data={DATA} mode="public" slug="stefanys" />);
    fireEvent.click(screen.getByText("Llavero de rosario"));
    // qty = 3
    const plus = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-plus"))!;
    fireEvent.click(plus); fireEvent.click(plus);
    fireEvent.click(screen.getByRole("button", { name: /Añadir al carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver carrito/i }));
    expect(screen.queryByText(/Descuento/)).not.toBeInTheDocument();

    // subir a 4 dentro del carrito
    const cartPlus = screen.getAllByRole("button").find((b) => b.querySelector("svg.lucide-plus"))!;
    fireEvent.click(cartPlus);
    expect(await screen.findByText(/Descuento \(20%\)/)).toBeInTheDocument();
  });

  it("un producto agotado con encargo permitido se puede agregar y queda marcado", async () => {
    render(<CatalogView data={DATA} mode="public" slug="stefanys" />);
    fireEvent.click(screen.getByText("Rosario grande"));
    expect(screen.getByText(/disponible por encargo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Añadir al carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver carrito/i }));
    expect(await screen.findByText(/Por encargo — requiere más tiempo/)).toBeInTheDocument();
  });

  it("envía la solicitud con el payload correcto y muestra la referencia de confirmación", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true, json: async () => ({ ok: true, publicRef: "SC-TEST1" }),
    });
    render(<CatalogView data={DATA} mode="public" slug="stefanys" />);
    fireEvent.click(screen.getByText("Llavero de rosario"));
    fireEvent.click(screen.getByRole("button", { name: /Añadir al carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));

    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), { target: { value: "Cliente de prueba" } });
    fireEvent.change(screen.getByPlaceholderText("+1 809 000 0000"), { target: { value: "+1 809 555 0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Retiro/i }));

    fireEvent.click(screen.getByRole("button", { name: /Solicitar cotización/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/catalogo/stefanys/solicitud",
      expect.objectContaining({ method: "POST" })
    ));
    const [, opts] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body as string);
    expect(body.items).toEqual([{ inventoryId: "p1", variantId: "v1", quantity: 1 }]);
    expect(body.customerName).toBe("Cliente de prueba");
    expect(body.deliveryMethod).toBe("retiro");

    expect(await screen.findByText(/¡Solicitud enviada!/)).toBeInTheDocument();
    expect(screen.getByText(/SC-TEST1/)).toBeInTheDocument();
  });

  it("en modo vista previa no envía la solicitud al servidor", async () => {
    render(<CatalogView data={DATA} mode="preview" slug="stefanys" />);
    fireEvent.click(screen.getByText("Llavero de rosario"));
    fireEvent.click(screen.getByRole("button", { name: /Añadir al carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ver carrito/i }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/i }));
    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), { target: { value: "Cliente de prueba" } });
    fireEvent.change(screen.getByPlaceholderText("+1 809 000 0000"), { target: { value: "+1 809 555 0000" } });
    fireEvent.click(screen.getByRole("button", { name: /Retiro/i }));
    fireEvent.click(screen.getByRole("button", { name: /Solicitar cotización/i }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("busca y filtra por categoría", () => {
    render(<CatalogView data={DATA} mode="public" slug="stefanys" />);
    fireEvent.change(screen.getByPlaceholderText("Buscar productos…"), { target: { value: "rosario grande" } });
    expect(screen.queryByText("Llavero de rosario")).not.toBeInTheDocument();
    expect(screen.getByText("Rosario grande")).toBeInTheDocument();
  });
});
