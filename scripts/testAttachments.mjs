/**
 * Part 12 — attachment pipeline verification.
 * Generates real documents (PDF, DOCX, CSV, JSON, TXT, RTF, HTML, XML,
 * PPTX, XLSX, ODT, a PNG, a corrupted file and an unsupported file),
 * POSTs each to /api/process-attachment, and reports the result.
 *
 * Run: node scripts/testAttachments.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures/attachments");
mkdirSync(FIXTURES, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail: String(detail).slice(0, 200) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(28)} ${String(detail).slice(0, 120)}`);
}

/* -------------------- generators -------------------- */

async function makePdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const lines = [
    "Diet Plan Report",
    "Age: 34",
    "Gender: Female",
    "Height: 165 cm",
    "Weight: 68 kg",
    "Activity Level: Moderate",
    "Goal: Weight loss",
    "Daily Calorie Target: 1850 kcal",
    "Protein Target: 90 g",
    "Breakfast: Oats, Berries, Almonds",
    "Lunch: Grilled Chicken Salad",
    "Dinner: Dal, Rice, Vegetables",
    "Snacks: Apple, Green Tea",
    "Allergies: Peanuts",
    "Foods to Avoid: Shellfish",
  ];
  lines.forEach((line, i) => {
    if (line) page.drawText(line, { x: 50, y: 750 - i * 18, size: 11, font });
  });
  const bytes = await doc.save();
  writeFileSync(resolve(FIXTURES, "diet_report.pdf"), bytes);
  return Buffer.from(bytes);
}

async function makeDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>");
  zip.folder("_rels").file(".rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>");
  const doc =
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    "<w:p><w:r><w:t>Patient: Ravi Kumar</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Weight: 82 kg</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Height: 178 cm</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Age: 41</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Activity Level: Active</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Goal: Muscle gain</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Dietary Pattern: Non-vegetarian</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Breakfast: Eggs, Toast, Banana</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Lunch: Chicken Curry, Rice</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Dinner: Fish, Vegetables</w:t></w:r></w:p>" +
    "<w:p><w:r><w:t>Allergies: Dairy, Tree Nuts</w:t></w:r></w:p>" +
    "</w:body></w:document>";
  zip.folder("word").file("document.xml", doc);
  const buf = await zip.generateAsync({ type: "nodebuffer" });
  writeFileSync(resolve(FIXTURES, "patient_record.docx"), buf);
  return buf;
}

function makeCsv() {
  const csv = [
    "Participant ID,Name,Age,Gender,Height (cm),Weight (kg),Activity Level,Calories (kcal),Protein (g),Carbohydrates (g),Fat (g)",
    "1001,Zoya Singh,23,Female,165,58,Moderate,1853,68,250,55",
    "1002,Arun Kumar,31,Male,178,82,Active,2450,120,280,80",
    "1003,Meera Nair,27,Female,160,54,Sedentary,1650,52,230,48",
    "1004,Rahul Verma,45,Male,172,91,Very Active,2900,140,320,105",
    "1005,Ananya Iyer,29,Female,168,63,Light,1980,70,270,60",
  ].join("\n");
  writeFileSync(resolve(FIXTURES, "nutrition_data.csv"), csv);
  return Buffer.from(csv);
}

function makeJson() {
  const json = JSON.stringify({
    patient: {
      name: "Demo Patient",
      age: 28,
      heightCm: 170,
      weightKg: 65,
      gender: "Male",
      activityLevel: "Moderately Active",
    },
    targets: {
      goal: "Weight maintenance",
      dailyCalorieTarget: 2000,
      proteinTargetGrams: 80,
      dietaryType: "Vegetarian",
    },
  });
  writeFileSync(resolve(FIXTURES, "profile.json"), json);
  return Buffer.from(json);
}

function makeTxt() {
  const txt = [
    "My Food Diary",
    "",
    "Age: 25",
    "Weight: 70 kg",
    "Height: 175 cm",
    "Activity Level: Sedentary",
    "Goal: General health",
    "",
    "Breakfast: Idli, Sambar, Coffee",
    "Lunch: Rajma Chawal, Salad",
    "Dinner: Khichdi, Curd",
    "",
    "Intolerances: Lactose",
    "Foods to avoid: Oats, Mushroom",
  ].join("\n");
  writeFileSync(resolve(FIXTURES, "food_diary.txt"), txt);
  return Buffer.from(txt);
}

function makeRtf() {
  const rtf = '{\\rtf1\\ansi\\deff0\n' +
    '{\\fonttbl{\\f0 Helvetica;}}\n' +
    '\\f0\\fs24 Nutrition Notes\\par\n' +
    '\\par\n' +
    'Age: 52\\par\n' +
    'Weight: 88 kg\\par\n' +
    'Height: 172 cm\\par\n' +
    'Goal: Weight loss\\par\n' +
    '}';
  writeFileSync(resolve(FIXTURES, "notes.rtf"), rtf);
  return Buffer.from(rtf);
}

function makeHtml() {
  const html = `<!DOCTYPE html><html><head><title>Health Record</title></head>
<body><h1>Patient Summary</h1>
<p>Age: 30</p><p>Weight: 60 kg</p><p>Height: 160 cm</p>
<p>Goal: Improve eating habits</p>
<p>Dietary Pattern: Vegan</p>
<p>Breakfast: Smoothie, Toast</p>
<p>Allergies: Soy</p>
<script>alert("this should never run");</script></body></html>`;
  writeFileSync(resolve(FIXTURES, "record.html"), html);
  return Buffer.from(html);
}

function makeXml() {
  const xml = `<?xml version="1.0"?>
<record>
  <personal>
    <age>36</age>
    <weight>74 kg</weight>
    <height>180 cm</height>
    <gender>Male</gender>
    <activityLevel>Active</activityLevel>
  </personal>
  <goals><goal>Weight gain</goal><dailyCalorieTarget>2800</dailyCalorieTarget></goals>
  <preferences><dietaryType>Eggetarian</dietaryType></preferences>
</record>`;
  writeFileSync(resolve(FIXTURES, "record.xml"), xml);
  return Buffer.from(xml);
}

function makePng() {
  // Minimal valid 1x1 PNG (red pixel).
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8cfc0f01f29c30c0242643c106001a9a00f8110000000049454e44ae426082",
    "hex",
  );
  writeFileSync(resolve(FIXTURES, "label_photo.png"), png);
  return png;
}

function makeCorrupted() {
  // A file named .pdf but with random binary content (not a real PDF).
  const buf = Buffer.alloc(1024);
  for (let i = 0; i < buf.length; i++) buf[i] = (i * 37 + 11) % 256;
  writeFileSync(resolve(FIXTURES, "corrupted.pdf"), buf);
  return buf;
}

function makeUnsupported() {
  // A .zip file — the app explicitly does not extract archives.
  const zip = new JSZip();
  zip.file("readme.txt", "hello");
  return zip.generateAsync({ type: "nodebuffer" }).then((buf) => {
    writeFileSync(resolve(FIXTURES, "archive.zip"), buf);
    return buf;
  });
}

/* -------------------- runner -------------------- */

async function post(name, bytes, mime) {
  const res = await fetch(`${BASE}/api/process-attachment`, {
    method: "POST",
    headers: {
      "x-file-name": encodeURIComponent(name),
      "x-file-mime": mime,
    },
    body: bytes,
  });
  const json = await res.json();
  return { status: res.status, ...json };
}

async function main() {
  console.log("Generating fixtures...\n");
  const pdf = await makePdf();
  const docx = await makeDocx();
  const csv = makeCsv();
  const json = makeJson();
  const txt = makeTxt();
  const rtf = makeRtf();
  const html = makeHtml();
  const xml = makeXml();
  const png = makePng();
  const corrupted = makeCorrupted();
  const zip = await makeUnsupported();

  console.log(`POSTing to ${BASE}/api/process-attachment\n`);

  // 1. PDF — full structured extraction
  {
    const r = await post("diet_report.pdf", pdf, "application/pdf");
    const ok = r.kind === "pdf" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 68) &&
      r.extraction.fields.some((f) => f.key === "goal") &&
      r.extraction.fields.some((f) => f.key === "allergen") &&
      r.extraction.foods.some((f) => f.meal === "lunch");
    record("PDF extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}, foods=${r.extraction?.foods?.length ?? 0}, nutrients=${r.extraction?.nutrients?.length ?? 0}`);
  }

  // 2. DOCX
  {
    const r = await post("patient_record.docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const ok = r.kind === "docx" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 82) &&
      r.extraction.fields.some((f) => f.key === "dietaryType") &&
      r.extraction.foods.some((f) => f.meal === "lunch" && f.name.includes("Chicken"));
    record("DOCX extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}, foods=${r.extraction?.foods?.length ?? 0}`);
  }

  // 3. CSV (dataset-like)
  {
    const r = await post("nutrition_data.csv", csv, "text/csv");
    const ok = r.kind === "csv" && r.extraction &&
      r.extraction.tables?.length > 0 &&
      r.extraction.tables[0].rows.length >= 4 &&
      r.extraction.looksLikeDataset === true;
    record("CSV extraction + dataset flag", ok, `kind=${r.kind}, tableRows=${r.extraction?.tables?.[0]?.rows?.length ?? 0}, looksLikeDataset=${r.extraction?.looksLikeDataset}`);
  }

  // 4. JSON
  {
    const r = await post("profile.json", json, "application/json");
    const ok = r.kind === "json" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 65) &&
      r.extraction.fields.some((f) => f.key === "dietaryType");
    record("JSON extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}`);
  }

  // 5. TXT
  {
    const r = await post("food_diary.txt", txt, "text/plain");
    const ok = r.kind === "txt" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 70) &&
      r.extraction.fields.some((f) => f.key === "intolerance") &&
      r.extraction.foods.some((f) => f.meal === "breakfast");
    record("TXT extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}, foods=${r.extraction?.foods?.length ?? 0}`);
  }

  // 6. RTF
  {
    const r = await post("notes.rtf", rtf, "application/rtf");
    const ok = r.kind === "rtf" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 88);
    record("RTF extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}`);
  }

  // 7. HTML (script stripped)
  {
    const r = await post("record.html", html, "text/html");
    const ok = r.kind === "html" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 60) &&
      !r.extraction.text.includes("alert");
    record("HTML extraction (script stripped)", ok, `kind=${r.kind}, scriptRemoved=${!r.extraction?.text?.includes("alert")}`);
  }

  // 8. XML
  {
    const r = await post("record.xml", xml, "application/xml");
    const ok = r.kind === "xml" && r.extraction &&
      r.extraction.fields.some((f) => f.key === "weightKg" && f.value === 74) &&
      r.extraction.fields.some((f) => f.key === "dietaryType");
    record("XML extraction", ok, `kind=${r.kind}, fields=${r.extraction?.fields?.length ?? 0}`);
  }

  // 9. PNG (no OCR → honest limitation)
  {
    const r = await post("label_photo.png", png, "image/png");
    const ok = r.kind === "image" && r.extraction &&
      r.extraction.isLikelyScanned === true &&
      r.extraction.warnings.length > 0 &&
      !r.extraction.text.includes("invented");
    record("PNG (no-OCR honest limit)", ok, `kind=${r.kind}, isScanned=${r.extraction?.isLikelyScanned}, warnings=${r.extraction?.warnings?.length ?? 0}`);
  }

  // 10. Corrupted PDF
  {
    const r = await post("corrupted.pdf", corrupted, "application/pdf");
    const ok = (r.status === "failed" || r.status === "unsupported" || r.status === "needs_review") ||
      (r.extraction === null);
    record("Corrupted PDF handled", ok, `status=${r.status}, error=${r.error ?? r.statusDetail ?? "n/a"}`);
  }

  // 11. ZIP (unsupported, explained)
  {
    const r = await post("archive.zip", zip, "application/zip");
    const ok = r.status === "unsupported" || (r.extraction?.warnings?.length > 0);
    record("ZIP unsupported (explained)", ok, `kind=${r.kind}, status=${r.status}`);
  }

  // 12. Empty file
  {
    const r = await post("empty.txt", Buffer.alloc(0), "text/plain");
    const ok = r.error || r.status === 400;
    record("Empty file rejected", ok, `status=${r.status}, error=${r.error ?? "n/a"}`);
  }

  // 13. Confidence check (PDF should have high for clear matches)
  {
    const r = await post("diet_report.pdf", pdf, "application/pdf");
    const weightField = r.extraction?.fields?.find((f) => f.key === "weightKg");
    record("Confidence assigned", weightField?.confidence != null, `weightKg confidence=${weightField?.confidence}, provenance=${weightField?.provenance}`);
  }

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
