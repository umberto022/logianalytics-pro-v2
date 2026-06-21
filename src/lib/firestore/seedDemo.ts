import {
  collection, addDoc, writeBatch, doc, Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return Timestamp.fromDate(d);
}

export async function seedDemoData(uid: string): Promise<void> {
  // ─── Suppliers ────────────────────────────────────────────────────────────
  const suppCol = collection(db, "users", uid, "suppliers");
  const [sup1, sup2, sup3] = await Promise.all([
    addDoc(suppCol, { name: "Distribuidora Caribe S.A.", rnc: "130000001", phone: "809-555-0101", email: "ventas@caribe.com", address: "Av. Independencia 45, Santo Domingo", notes: "Proveedor principal de bebidas", active: true, createdAt: Timestamp.now() }),
    addDoc(suppCol, { name: "Importadora del Norte", rnc: "130000002", phone: "809-555-0202", email: "pedidos@importnorte.com", address: "C/ El Conde 12, Santiago", notes: "Productos secos y enlatados", active: true, createdAt: Timestamp.now() }),
    addDoc(suppCol, { name: "Agro Dominicana", rnc: "130000003", phone: "849-555-0303", email: "info@agrodom.com", address: "Km 12 Autopista Duarte", notes: "Productos agrícolas frescos", active: true, createdAt: Timestamp.now() }),
  ]);

  // ─── Inventory items ──────────────────────────────────────────────────────
  const invCol = collection(db, "inventory", uid, "items");
  const movCol = collection(db, "inventoryMovements", uid, "records");
  const now    = Timestamp.now();

  const products = [
    { name: "Agua Purificada 1L",    category: "Bebidas",    sku: "BEB-AGUA1L",  supplier: "Distribuidora Caribe S.A.", currentStock: 240, minStock: 50,  maxStock: 500, unitCost: 12,  salePrice: 18,  leadTimeDays: 3 },
    { name: "Refresco Cola 2L",       category: "Bebidas",    sku: "BEB-COLA2L",  supplier: "Distribuidora Caribe S.A.", currentStock: 120, minStock: 30,  maxStock: 300, unitCost: 35,  salePrice: 55,  leadTimeDays: 5 },
    { name: "Arroz Selecto 5kg",      category: "Granos",     sku: "GRN-ARROZ5K", supplier: "Importadora del Norte",     currentStock: 85,  minStock: 20,  maxStock: 200, unitCost: 180, salePrice: 260, leadTimeDays: 7 },
    { name: "Aceite Vegetal 1L",      category: "Condimentos",sku: "CON-ACEIT1L", supplier: "Importadora del Norte",     currentStock: 60,  minStock: 15,  maxStock: 150, unitCost: 95,  salePrice: 140, leadTimeDays: 7 },
    { name: "Tomate Roma kg",         category: "Vegetales",  sku: "VEG-TOMRM1K", supplier: "Agro Dominicana",           currentStock: 40,  minStock: 10,  maxStock: 100, unitCost: 25,  salePrice: 40,  leadTimeDays: 2 },
    { name: "Cebolla Amarilla kg",    category: "Vegetales",  sku: "VEG-CEBAM1K", supplier: "Agro Dominicana",           currentStock: 8,   minStock: 10,  maxStock: 80,  unitCost: 20,  salePrice: 35,  leadTimeDays: 2 },
    { name: "Leche Entera 1L",        category: "Lácteos",    sku: "LAC-LECHE1L", supplier: "Distribuidora Caribe S.A.", currentStock: 72,  minStock: 25,  maxStock: 200, unitCost: 55,  salePrice: 80,  leadTimeDays: 4 },
    { name: "Azúcar Blanca 2kg",      category: "Granos",     sku: "GRN-AZUC2K",  supplier: "Importadora del Norte",     currentStock: 45,  minStock: 20,  maxStock: 120, unitCost: 70,  salePrice: 100, leadTimeDays: 5 },
  ];

  const invIds: string[] = [];
  for (const p of products) {
    const ref = await addDoc(invCol, { ...p, color: "", imageUrl: "", dailyDemand: 0, updatedAt: now });
    invIds.push(ref.id);
    await addDoc(movCol, {
      inventoryId: ref.id, sku: p.sku, productName: p.name,
      movementType: "purchase", quantity: p.currentStock,
      reference: "DEMO-SEED", note: "Stock inicial de demostración",
      createdAt: daysAgo(30),
    });
  }

  // ─── Customers ────────────────────────────────────────────────────────────
  const custCol = collection(db, "customers", uid, "records");
  await Promise.all([
    addDoc(custCol, { name: "Colmado El Buen Precio", rnc: "001-000001-1", phone: "809-333-1001", email: "colmado@gmail.com", address: "C/ Duarte 88, La Romana", notes: "Cliente frecuente, paga a 15 días", createdAt: now, updatedAt: now }),
    addDoc(custCol, { name: "Supermercado La Unión", rnc: "001-000002-2", phone: "809-333-2002", email: "compras@launion.com", address: "Av. España 200, San Pedro", notes: "Pedidos grandes los lunes", createdAt: now, updatedAt: now }),
    addDoc(custCol, { name: "Restaurante El Mangú", rnc: "001-000003-3", phone: "809-333-3003", email: "pedidos@elmangu.com", address: "Av. 27 de Febrero, SDE", notes: "Paga al contado", createdAt: now, updatedAt: now }),
    addDoc(custCol, { name: "Mini Market Pérez", rnc: "", phone: "849-333-4004", email: "", address: "C/ Mella 15, Higüey", notes: "", createdAt: now, updatedAt: now }),
  ]);

  // ─── Sales (últimas 4 semanas) ─────────────────────────────────────────────
  const salesCol = collection(db, "sales", uid, "records");
  const salesData = [
    // Week 1
    { idx: 0, qty: 48, price: 18,  client: "Colmado El Buen Precio",  route: "Ruta Este",   zone: "La Romana", daysBack: 28, payment: "pagado"   },
    { idx: 2, qty: 10, price: 260, client: "Supermercado La Unión",   route: "Ruta Sur",    zone: "San Pedro", daysBack: 26, payment: "pagado"   },
    { idx: 6, qty: 20, price: 80,  client: "Restaurante El Mangú",    route: "Ruta Capital", zone: "SDE",      daysBack: 25, payment: "pagado"   },
    // Week 2
    { idx: 1, qty: 24, price: 55,  client: "Mini Market Pérez",       route: "Ruta Este",   zone: "Higüey",    daysBack: 20, payment: "pagado"   },
    { idx: 3, qty: 15, price: 140, client: "Colmado El Buen Precio",  route: "Ruta Este",   zone: "La Romana", daysBack: 18, payment: "credito"  },
    { idx: 7, qty: 12, price: 100, client: "Supermercado La Unión",   route: "Ruta Sur",    zone: "San Pedro", daysBack: 16, payment: "pagado"   },
    // Week 3
    { idx: 0, qty: 60, price: 18,  client: "Supermercado La Unión",   route: "Ruta Sur",    zone: "San Pedro", daysBack: 12, payment: "pagado"   },
    { idx: 4, qty: 20, price: 40,  client: "Restaurante El Mangú",    route: "Ruta Capital", zone: "SDE",      daysBack: 11, payment: "pagado"   },
    { idx: 6, qty: 18, price: 80,  client: "Colmado El Buen Precio",  route: "Ruta Este",   zone: "La Romana", daysBack: 9,  payment: "pendiente"},
    // Week 4 (this week)
    { idx: 2, qty: 8,  price: 260, client: "Mini Market Pérez",       route: "Ruta Este",   zone: "Higüey",    daysBack: 5,  payment: "pagado"   },
    { idx: 1, qty: 18, price: 55,  client: "Restaurante El Mangú",    route: "Ruta Capital", zone: "SDE",      daysBack: 3,  payment: "pagado"   },
    { idx: 3, qty: 10, price: 140, client: "Supermercado La Unión",   route: "Ruta Sur",    zone: "San Pedro", daysBack: 1,  payment: "credito"  },
  ];

  const batch = writeBatch(db);
  let saleN = 1;
  for (const s of salesData) {
    const p    = products[s.idx];
    const id   = invIds[s.idx];
    const cost = p.unitCost * s.qty;
    const rev  = s.price * s.qty;
    const ref  = doc(salesCol);
    batch.set(ref, {
      saleOrderId:   `OV-DEMO-${String(saleN++).padStart(4, "0")}`,
      invoiceNumber: `FAC-DEMO-${String(saleN).padStart(4, "0")}`,
      inventoryId:   id,
      sku:           p.sku,
      productName:   p.name,
      category:      p.category,
      quantity:      s.qty,
      unitPrice:     s.price,
      unitCost:      p.unitCost,
      route:         s.route,
      zone:          s.zone,
      client:        s.client,
      paymentStatus: s.payment,
      saleDate:      daysAgo(s.daysBack),
      totalRevenue:  rev,
      totalCost:     cost,
      profit:        rev - cost,
    });
  }
  await batch.commit();
}
