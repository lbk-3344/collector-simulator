// Fixture seed for the Overview location map (BL-036/038), the Devices list
// (BL-047), and the Item Feed library (BL-058). Scatters simulated Devices
// across 3 real location codes from Luc's sandbox tenant, two Workflow
// fixtures, a Task per Device that used to be workflow-attached (BL-059 —
// Device relates to a Workflow *through* a Task now), and one Item Feed of
// each kind.
// Re-seeded, NOT migrated row-for-row, on each schema redesign — see
// CLAUDE-CONCEPT.md 16.6 (BL-059), same approach as BL-042/BL-049.
// Run with: node prisma/seed-devices.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Order matters — most cascade from Workflow/Device, but be explicit.
await prisma.simulatedRead.deleteMany({});
await prisma.inFlightBatch.deleteMany({});
await prisma.feedLink.deleteMany({});
await prisma.flowLink.deleteMany({});
await prisma.feedNode.deleteMany({});
await prisma.task.deleteMany({});
await prisma.itemFeed.deleteMany({});
await prisma.device.deleteMany({});
await prisma.workflow.deleteMany({});

const packLine = await prisma.workflow.create({ data: { name: "Pack Line A", status: "STOPPED" } });
const inboundQc = await prisma.workflow.create({ data: { name: "Inbound QC", status: "STOPPED" } });

const NOW = new Date();

// `workflow` here is a local marker only — turned into a Task row after the
// Device is created, not a column on Device anymore.
const devices = [
  {
    name: "Portal — Membase Dock 1",
    type: "PORTAL",
    locationCode: "TTMEMBASE",
    positionX: 120,
    positionY: 220,
    configured: true,
    publishedAt: NOW,
    collectorId: "TTMEMBASE-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    channels: [
      { id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" },
      { id: "CH2", type: "DIRECTIONAL", direction: "INBOUND" },
    ],
    workflow: packLine,
  },
  {
    name: "Conveyor Reader — Membase Line A",
    type: "CONVEYOR",
    locationCode: "TTMEMBASE",
    positionX: 340,
    positionY: 180,
    configured: true,
    publishedAt: NOW,
    collectorId: "TTMEMBASE-CONVEYOR-01",
    model: "FX9600",
    vendor: "Zebra",
    configVersion: "2.1.0",
    channels: [{ id: "CH1", type: "DIRECTIONAL", direction: "OUTBOUND" }],
    workflow: inboundQc,
  },
  {
    name: "Shelf Reader — Membase Rack 3",
    type: "SHELF",
    locationCode: "TTMEMBASE",
    positionX: 560,
    positionY: 410,
    configured: true,
    publishedAt: NOW,
    collectorId: "TTMEMBASE-SHELF-01",
    model: "IH45",
    vendor: "Impinj",
    configVersion: "1.0.2",
    channels: [{ id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" }],
    workflow: null,
  },
  {
    name: "Doorframe Reader — Membase Exit",
    type: "DOORFRAME",
    locationCode: "TTMEMBASE",
    positionX: 200,
    positionY: 520,
    configured: false,
  },
  {
    // Fully configured, never published — renders Off/"Not configured" (grey).
    name: "Overhead Reader — Membase Staging",
    type: "OVERHEAD",
    locationCode: "TTMEMBASE",
    positionX: 460,
    positionY: 130,
    configured: true,
    publishedAt: null,
    collectorId: "TTMEMBASE-OVERHEAD-01",
    model: "ArcReader",
    vendor: "Impinj",
    configVersion: "3.0.1",
    channels: [{ id: "CH1", type: "PRESENCE", presenceEvent: "FIRST_SEEN" }],
    workflow: null,
  },

  {
    name: "Portal — Warehouse Receiving",
    type: "PORTAL",
    locationCode: "TANDTWAREHOUSE",
    positionX: 90,
    positionY: 150,
    configured: true,
    publishedAt: NOW,
    collectorId: "TANDTWAREHOUSE-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    channels: [
      { id: "CH1", type: "DIRECTIONAL", direction: "INBOUND" },
      { id: "CH2", type: "DIRECTIONAL", direction: "OUTBOUND" },
    ],
    workflow: packLine,
  },
  {
    name: "Overhead Reader — Warehouse Zone B",
    type: "OVERHEAD",
    locationCode: "TANDTWAREHOUSE",
    positionX: 420,
    positionY: 300,
    configured: true,
    publishedAt: NOW,
    collectorId: "TANDTWAREHOUSE-OVERHEAD-01",
    model: "ArcReader",
    vendor: "Impinj",
    configVersion: "3.0.1",
    channels: [{ id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" }],
    workflow: null,
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
    publishedAt: NOW,
    collectorId: "TANDTWAREHOUSE-SIMPLE-01",
    model: "SR-100",
    vendor: "Alien",
    configVersion: "0.9.5",
    channels: [{ id: "CH1", type: "PRESENCE", presenceEvent: "LAST_SEEN" }],
    workflow: inboundQc,
  },

  {
    name: "Portal — Granite Falls Entry",
    type: "PORTAL",
    locationCode: "GRANITEFALLSSHOP",
    positionX: 160,
    positionY: 100,
    configured: true,
    publishedAt: NOW,
    collectorId: "GRANITEFALLSSHOP-PORTAL-01",
    model: "RX-9000",
    vendor: "Zebra",
    configVersion: "1.4.0",
    channels: [{ id: "CH1", type: "PRESENCE", presenceEvent: "PRESENT" }],
    workflow: null,
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

const tasksByName = {};
let taskCount = 0;
for (const { workflow, ...data } of devices) {
  const device = await prisma.device.create({ data });
  if (workflow) {
    const task = await prisma.task.create({
      data: { workflowId: workflow.id, deviceId: device.id, name: device.name },
    });
    tasksByName[device.name] = task;
    taskCount++;
  }
}

// Item Feeds (BL-058 revised) — multi-GTIN, and one PRESENT/ALL example.
const feedNew = await prisma.itemFeed.create({
  data: {
    name: "Fresh cartons (NEW)",
    kind: "NEW",
    gtins: ["03663328010013", "03663328010020"],
    quantityMin: 2,
    quantityMax: 5,
  },
});
await prisma.itemFeed.create({
  data: {
    name: "Warehouse Receiving stock (PRESENT, GTIN list)",
    kind: "PRESENT",
    presentMatchMode: "GTIN_LIST",
    gtins: ["00400020000941"],
    locationCode: "TANDTWAREHOUSE",
    zoneCode: "DEMOTT.00003.1000000000002",
    quantityMin: 1,
    quantityMax: 5,
  },
});
await prisma.itemFeed.create({
  data: {
    name: "Anything in Storage Area 1 (PRESENT, ALL)",
    kind: "PRESENT",
    presentMatchMode: "ALL",
    locationCode: "TANDTWAREHOUSE",
    zoneCode: "DEMOTT.00003.1000000000012",
    quantityMin: 1,
    quantityMax: 10,
  },
});
await prisma.itemFeed.create({
  data: {
    name: "Golden sample pallet (FIXED)",
    kind: "FIXED",
    fixedItems: ["3034DF978000FA400000005D", "urn:epc:id:sgtin:0366332.801001.1000"],
  },
});

// A small graph on "Pack Line A": NEW feed → dock portal, which flows to the
// sorting tabletop. (Left STOPPED — start it from the canvas.)
const dock = tasksByName["Portal — Membase Dock 1"];
if (dock) {
  const fn = await prisma.feedNode.create({
    data: { workflowId: packLine.id, itemFeedId: feedNew.id, positionX: 40, positionY: 80 },
  });
  await prisma.feedLink.create({
    data: {
      workflowId: packLine.id,
      feedNodeId: fn.id,
      targetTaskId: dock.id,
      targetChannelId: "CH1",
      fireIntervalSeconds: 60,
    },
  });
}

console.log(
  `Seeded 2 workflows, ${devices.length} devices (${taskCount} as Tasks), 4 item feeds + 1 feed node/link, across TTMEMBASE, TANDTWAREHOUSE, GRANITEFALLSSHOP.`
);
await prisma.$disconnect();
