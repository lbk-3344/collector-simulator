// One-off fixture seed for the Overview location map (BL-036/038) — scatters
// a handful of simulated Devices across 3 real location codes from Luc's
// sandbox tenant (fetched live via the confirmed-working BL-033 endpoint,
// see CLAUDE-CONCEPT.md section 7.2). Run with: node prisma/seed-devices.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// TTMEMBASE (dc), TANDTWAREHOUSE (store), GRANITEFALLSSHOP (dc) — real codes
// from the sandbox tenant's GET .../locations?level=premise response.
const devices = [
  { name: "Portal — Membase Dock 1", type: "PORTAL", locationCode: "TTMEMBASE", positionX: 120, positionY: 220, status: "ONLINE" },
  { name: "Conveyor Reader — Membase Line A", type: "CONVEYOR", locationCode: "TTMEMBASE", positionX: 340, positionY: 180, status: "ONLINE" },
  { name: "Shelf Reader — Membase Rack 3", type: "SHELF", locationCode: "TTMEMBASE", positionX: 560, positionY: 410, status: "OFFLINE" },

  { name: "Portal — Warehouse Receiving", type: "PORTAL", locationCode: "TANDTWAREHOUSE", positionX: 90, positionY: 150, status: "ONLINE" },
  { name: "Overhead Reader — Warehouse Zone B", type: "OVERHEAD", locationCode: "TANDTWAREHOUSE", positionX: 420, positionY: 300, status: "ONLINE" },
  { name: "Tabletop Encoder — Warehouse Pack Station", type: "TABLETOP", locationCode: "TANDTWAREHOUSE", positionX: 650, positionY: 500, status: "OFFLINE" },
  { name: "Simple Reader — Warehouse Dock 4", type: "SIMPLE_READER", locationCode: "TANDTWAREHOUSE", positionX: 250, positionY: 620, status: "ONLINE" },

  { name: "Portal — Granite Falls Entry", type: "PORTAL", locationCode: "GRANITEFALLSSHOP", positionX: 160, positionY: 100, status: "ONLINE" },
  { name: "Doorframe Reader — Granite Falls Room 2", type: "DOORFRAME", locationCode: "GRANITEFALLSSHOP", positionX: 480, positionY: 260, status: "OFFLINE" },
];

for (const device of devices) {
  await prisma.device.create({ data: device });
}

console.log(`Seeded ${devices.length} devices across TTMEMBASE, TANDTWAREHOUSE, GRANITEFALLSSHOP.`);
await prisma.$disconnect();
