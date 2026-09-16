// Bakar ihop SVG-filerna i art/<djur>/ till en js-fil som appen laddar i ett svep.
// Kör med: node tools/build-art.mjs
import fs from "fs";
import path from "path";

const PETS = [
  { dir: "art/crow", out: "art/crow.js", varName: "CROW_ART" },
  { dir: "art/bear", out: "art/bear.js", varName: "BEAR_ART" }
];

for (const pet of PETS) {
  if (!fs.existsSync(pet.dir)) continue;
  const files = fs.readdirSync(pet.dir).filter((f) => f.endsWith(".svg")).sort();
  const entries = files.map((f) => {
    const svg = fs
      .readFileSync(path.join(pet.dir, f), "utf8")
      .replace(/<\?xml[^>]*\?>\s*/g, "")
      .replace(/<!DOCTYPE[^>]*>\s*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return `  ${JSON.stringify(path.basename(f, ".svg"))}: ${JSON.stringify(svg)}`;
  });
  const body = `"use strict";\n// Genererad av tools/build-art.mjs. Redigera SVG-filerna i ${pet.dir}/ istället.\nconst ${pet.varName} = {\n${entries.join(",\n")}\n};\n`;
  fs.writeFileSync(pet.out, body);
  console.log(`${pet.out}: ${files.length} poser, ${Math.round(body.length / 1024)} kB`);
}
