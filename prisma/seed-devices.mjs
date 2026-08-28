// Fixture seed for the Overview location map (BL-036/038) and the Devices
// list (BL-047) — scatters simulated Devices across 3 real location codes
// from Luc's sandbox tenant (fetched live via the confirmed-working BL-033
// endpoint, see CLAUDE-CONCEPT.md section 7.2), plus two Workflow fixtures.
// Redesigned 2026-08-28 (BL-042, section 15.1/15.2) for the Collector-shaped
// Device model and the derived 4-state visualization (section 15.3) — seeds
// a mix of all 4 states (Off/Active/Automated/Problem) so BL-043's color
// coding and BL-047's list page both have something real to show.
// Run with: node prisma/seed-devices.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

await prisma.device.deleteMany({});
await prisma.workflow.deleteMany({});

const packLine = await prisma.workflow.create({ data: { name: "Pack Line A", status: "RUNNING" } });
const inboundQc = await prisma.workflow.create({ data: { name: "Inbound QC", status: "STOPPED" } });

function defaultChannel(collectorId) {
  return {
    channelId: `${collectorId}-ch1`,
    channelType: "PRESENCE",
    channelPresenceEvent: "PRESENT",
  };
}

// TTMEMBASE (dc), TANDTWAREHOUSE (store), GRANITEFALLSSHOP (dc) — real codes
// from the sandbox tenant's GET .../locations?level=premise response.
const devices = [
  // TTMEMBASE — one of each state
  {
    name: "Portal — Membase Dock 1",
    type: "PORTAL",
    locationCode: "TTMEMBASE",
    positionX: 120,
    positionY: 220,
    configured: true,
    collectorId: "TTMEMBASE-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    ...defaultChannel("TTMEMBASE-PORTAL-01"),
    workflowId: packLine.id,
  },
  {
    name: "Conveyor Reader — Membase Line A",
    type: "CONVEYOR",
    locationCode: "TTMEMBASE",
    positionX: 340,
    positionY: 180,
    configured: true,
    collectorId: "TTMEMBASE-CONVEYOR-01",
    model: "FX9600",
    vendor: "Zebra",
    configVersion: "2.1.0",
    ...defaultChannel("TTMEMBASE-CONVEYOR-01"),
    workflowId: inboundQc.id,
  },
  {
    name: "Shelf Reader — Membase Rack 3",
    type: "SHELF",
    locationCode: "TTMEMBASE",
    positionX: 560,
    positionY: 410,
    configured: true,
    collectorId: "TTMEMBASE-SHELF-01",
    model: "IH45",
    vendor: "Impinj",
    configVersion: "1.0.2",
    ...defaultChannel("TTMEMBASE-SHELF-01"),
    workflowId: null,
  },
  {
    name: "Doorframe Reader — Membase Exit",
    type: "DOORFRAME",
    locationCode: "TTMEMBASE",
    positionX: 200,
    positionY: 520,
    configured: false,
  },

  // TANDTWAREHOUSE
  {
    name: "Portal — Warehouse Receiving",
    type: "PORTAL",
    locationCode: "TANDTWAREHOUSE",
    positionX: 90,
    positionY: 150,
    configured: true,
    collectorId: "TANDTWAREHOUSE-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    ...defaultChannel("TANDTWAREHOUSE-PORTAL-01"),
    workflowId: packLine.id,
  },
  {
    name: "Overhead Reader — Warehouse Zone B",
    type: "OVERHEAD",
    locationCode: "TANDTWAREHOUSE",
    positionX: 420,
    positionY: 300,
    configured: true,
    collectorId: "TANDTWAREHOUSE-OVERHEAD-01",
    model: "ArcReader",
    vendor: "Impinj",
    configVersion: "3.0.1",
    ...defaultChannel("TANDTWAREHOUSE-OVERHEAD-01"),
    workflowId: null,
  },
  {
    name: "Tabletop Encoder — Warehouse Pack Station",
    type: "TABLETOP",
    locationCode: "TANDTWAREHOUSE",
    positionX: 650,
    positionY: 500,
    configured: false,
  },
  {
    name: "Simple Reader — Warehouse Dock 4",
    type: "SIMPLE_READER",
    locationCode: "TANDTWAREHOUSE",
    positionX: 250,
    positionY: 620,
    configured: true,
    collectorId: "TANDTWAREHOUSE-SIMPLE-01",
    model: "SR-100",
    vendor: "Alien",
    configVersion: "0.9.5",
    ...defaultChannel("TANDTWAREHOUSE-SIMPLE-01"),
    workflowId: inboundQc.id,
  },

  // GRANITEFALLSSHOP
  {
    name: "Portal — Granite Falls Entry",
    type: "PORTAL",
    locationCode: "GRANITEFALLSSHOP",
    positionX: 160,
    positionY: 100,
    configured: true,
    collectorId: "GRANITEFALLSSHOP-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    ...defaultChannel("GRANITEFALLSSHOP-PORTAL-01"),
    workflowId: null,
  },
  {
    name: "Doorframe Reader — Granite Falls Room 2",
    type: "DOORFRAME",
    locationCode: "GRANITEFALLSSHOP",
    positionX: 480,
    positionY: 260,
    configured: false,
  },
];

for (const device of devices) {
  await prisma.device.create({ data: device });
}

console.log(`Seeded 2 workflows and ${devices.length} devices across TTMEMBASE, TANDTWAREHOUSE, GRANITEFALLSSHOP.`);
await prisma.$disconnect();
