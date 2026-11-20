import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const out = "fixtures/documents";
await mkdir(out, { recursive: true });
await mkdir("fixtures", { recursive: true });

const catalog = [
  { sku: "CAR-4417", name: "Aurelia Weave 4417", manufacturerRef: "AW4417" },
  { sku: "CAR-2201", name: "Kowhai Broadloom", manufacturerRef: "KB2201" },
  { sku: "UND-100", name: "Underlay Standard", manufacturerRef: "US100" },
  { sku: "CAR-3300", name: "Rimu Twist", manufacturerRef: "RT3300" },
  { sku: "ACC-010", name: "Install Kit", manufacturerRef: "IK010" },
  { sku: "CAR-5500", name: "Tawa Loop", manufacturerRef: "TL5500" },
];

const customers = [
  { name: "Kowhai Retail", email: "buyer@kowhai.example", account: "ACC-1001" },
  { name: "Tui Interiors", email: "orders@tui.example", account: "ACC-1002" },
  { name: "Rata Design", email: "ap@rata.example", account: "ACC-1003", creditLimitCents: 100000 },
  { name: "Kowhai Retail Ltd", email: "accounts@kowhai-ltd.example", account: "ACC-1004" },
];

await writeFile("fixtures/catalogue.json", `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile("fixtures/customers.json", `${JSON.stringify(customers, null, 2)}\n`);

const header = [
  "Northgate Interiors",
  "12 Harbour Road, Auckland",
  "orders@northgate.example",
  "Purchase order: PO-1042",
];

async function make(name, lines) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 790;
  for (const line of lines) {
    page.drawText(line, { x: 60, y, size: 11, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 18;
  }
  await writeFile(`${out}/${name}.pdf`, await pdf.save());
}

await make("clean-order", [
  ...header,
  "Date: 2026-11-02",
  "Deliver to: 8 Rata Street, Wellington",
  "",
  "Description                  Qty   Unit      Total",
  "Aurelia Weave 4417           2     120.00    240.00",
  "Kowhai Broadloom             1     450.00    450.00",
  "Underlay Standard            4      35.00    140.00",
]);

await make("letterhead", [
  ...header,
  "Date: 2026-11-03",
  "Deliver to: 8 Rata Street, Wellington",
  "Buyer: buyer@kowhai.example",
  "",
  "Description                  Qty   Unit      Total",
  "Aurelia Weave 4417           2     120.00    240.00",
]);

await make("vague-line", [
  ...header,
  "Date: 2026-11-04",
  "Deliver to: 8 Rata Street, Wellington",
  "",
  "Description                  Qty   Unit      Total",
  "weave 4417                   3",
]);

await make("statement", [
  "Northgate Interiors",
  "Account statement",
  "Balance brought forward: 4200.00",
  "Invoice 8812: 1200.00",
  "Invoice 8830: 3000.00",
]);

await make("credit-warning", [
  ...header,
  "Date: 2026-11-05",
  "Deliver to: 8 Rata Street, Wellington",
  "",
  "Description                  Qty   Unit      Total",
  "Aurelia Weave 4417          99     120.00   11880.00",
]);

await make("blank", []);

console.log(`wrote six fixtures to ${out}`);
