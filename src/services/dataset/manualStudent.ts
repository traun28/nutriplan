import { buildColumnIndex, normaliseRecord } from "@/data/dataset/normalizer";
import type { DatasetParticipant } from "@/data/dataset/schema";

export interface ManualStudentInput {
  participantId: string;
  name: string;
  age: string;
  gender: string;
  heightCm: string;
  weightKg: string;
  activityLevel: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks: string;
  caloriesKcal: string;
  proteinG: string;
  carbohydratesG: string;
  fatG: string;
  dietaryFibreG: string;
  sugarG: string;
  sodiumMg: string;
}

export function normalizeManualStudent(
  input: ManualStudentInput,
  rowIndex: number,
): DatasetParticipant {
  const headers = Object.keys(input);
  const index = buildColumnIndex(headers);
  const row = Object.fromEntries(headers.map((header) => [header, input[header as keyof ManualStudentInput] ?? ""]));
  const result = normaliseRecord(
    { row, sourcePage: null, sourceRow: rowIndex },
    index,
    new Date().toISOString(),
  );
  return {
    ...result.participant,
    sourceMetadata: {
      ...result.participant.sourceMetadata,
      sourceFile: "manual entry",
    },
  };
}
