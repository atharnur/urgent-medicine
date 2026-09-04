import crypto from "node:crypto";

export type OclConcept = Record<string, any>;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  return v || null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    const v = clean(value);
    if (v) return v;
  }
  return null;
}

function extras(concept: OclConcept): Record<string, any> {
  const x = concept.extras;
  return x && typeof x === "object" && !Array.isArray(x) ? x : {};
}

function pickExtra(x: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    const direct = x[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    const lowerKey = Object.keys(x).find(k => k.toLowerCase() === key.toLowerCase());
    if (lowerKey && typeof x[lowerKey] === "string" && x[lowerKey].trim()) return x[lowerKey];
  }
  return null;
}

function names(concept: OclConcept): string[] {
  if (!Array.isArray(concept.names)) return [];
  return concept.names.map((n: any) => clean(n?.name ?? n?.name_value ?? n)).filter(Boolean) as string[];
}

export function normalizeOclConcept(concept: OclConcept) {
  const x = extras(concept);
  const nameList = names(concept);
  const displayName = firstString(concept.display_name, concept.displayName, concept.name, nameList[0]);
  const id = firstString(concept.id, concept.code);
  if (!id || !displayName) return { valid: false as const, reason: "MISSING_ID_OR_DISPLAY_NAME" };

  const darFromId = id.includes("--") ? id.split("--", 1)[0] : null;
  const tradeName = firstString(
    pickExtra(x, ["trade_name", "tradeName", "brand_name", "brandName"]),
    displayName
  );
  const genericName = firstString(
    pickExtra(x, ["generic_name", "genericName", "generic", "active_ingredient", "activeIngredient"]),
    concept.concept_class === "Ingredient" ? displayName : null
  );
  const manufacturer = firstString(pickExtra(x, ["manufacturer", "manufacturer_name", "manufacturerName", "company"]));
  const strength = firstString(pickExtra(x, ["strength", "dose_strength", "doseStrength"]));
  const dosageForm = firstString(pickExtra(x, ["dosage_form", "dosageForm", "form"]));
  const packSize = firstString(pickExtra(x, ["pack_size", "packSize", "pack"]));
  const indication = firstString(pickExtra(x, ["indication", "indications"]));
  const prescriptionRequiredRaw = pickExtra(x, ["prescription_required", "prescriptionRequired"]);
  const prescriptionRequired = typeof prescriptionRequiredRaw === "string"
    ? ["true", "yes", "1"].includes(prescriptionRequiredRaw.toLowerCase())
    : Boolean(prescriptionRequiredRaw);

  return {
    valid: true as const,
    sourceCode: id,
    darIdentifier: firstString(pickExtra(x, ["dar_identifier", "darIdentifier", "dar", "registration_number", "registrationNumber"]), darFromId),
    tradeName,
    genericName,
    manufacturer,
    strength,
    dosageForm,
    packSize,
    indication,
    prescriptionRequired,
    sourceVersion: firstString(concept.version, concept.version_url),
    sourceUpdatedAt: firstString(concept.updated_on, concept.updatedOn),
    sourceUrl: firstString(concept.url, concept.version_url),
    rawPayload: concept,
  };
}

export function payloadHash(payload: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}
