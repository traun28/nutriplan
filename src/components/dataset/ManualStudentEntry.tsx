"use client";

import { useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { apiClient, toUserMessage } from "@/services/apiClient";
import { Button, Card, CardBody } from "@/components/ui/core";
import type { ManualStudentInput } from "@/services/dataset/manualStudent";

const blankStudent: ManualStudentInput = {
  participantId: "", name: "", age: "", gender: "", heightCm: "", weightKg: "",
  activityLevel: "", breakfast: "", lunch: "", dinner: "", snacks: "",
  caloriesKcal: "", proteinG: "", carbohydratesG: "", fatG: "", dietaryFibreG: "", sugarG: "", sodiumMg: "",
};

const fields: Array<[keyof ManualStudentInput, string]> = [
  ["participantId", "Student ID"], ["name", "Name"], ["age", "Age"], ["gender", "Gender"],
  ["heightCm", "Height cm"], ["weightKg", "Weight kg"], ["activityLevel", "Activity level"],
  ["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"],
  ["caloriesKcal", "Calories kcal"], ["proteinG", "Protein g"], ["carbohydratesG", "Carbs g"],
  ["fatG", "Fat g"], ["dietaryFibreG", "Fibre g"], ["sugarG", "Sugar g"], ["sodiumMg", "Sodium mg"],
];

export function ManualStudentEntry({ onSaved }: { onSaved: () => void }) {
  const [datasetName, setDatasetName] = useState("Class student nutrition dataset");
  const [students, setStudents] = useState<ManualStudentInput[]>([{ ...blankStudent }]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = (row: number, field: keyof ManualStudentInput, value: string) => {
    setStudents((current) => current.map((student, index) => index === row ? { ...student, [field]: value } : student));
  };

  const save = async () => {
    setSaving(true); setMessage(null);
    try {
      await apiClient.post("/api/datasets/manual", { datasetName, students });
      setMessage(`Saved ${students.length} student record(s) as a separate dataset.`);
      setStudents([{ ...blankStudent }]);
      onSaved();
    } catch (error) {
      setMessage(toUserMessage(error, "The student dataset could not be saved."));
    } finally { setSaving(false); }
  };

  return (
    <Card className="mb-6">
      <CardBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-bold text-ink">Add students manually</h2><p className="mt-1 text-sm text-muted">Independent dataset records. Nothing is copied into your personal planner.</p></div>
          <Button size="sm" variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setOpen((value) => !value)}>{open ? "Hide entry table" : "Add students"}</Button>
        </div>
        {open && <div className="mt-5 space-y-4">
          <input value={datasetName} onChange={(event) => setDatasetName(event.target.value)} aria-label="Dataset name" placeholder="Dataset name" className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm" />
          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="min-w-[1100px] w-full border-collapse text-xs"><thead className="sticky top-0 bg-canvas"><tr>{fields.map(([, label]) => <th key={label} className="px-2 py-2 text-left font-semibold text-muted">{label}</th>)}<th /></tr></thead><tbody>{students.map((student, row) => <tr key={row} className="border-t border-line/70">{fields.map(([field, label]) => <td key={field} className="p-1"><input value={student[field]} onChange={(event) => update(row, field, event.target.value)} aria-label={`${label} row ${row + 1}`} className="h-8 w-24 rounded border border-line px-2 text-xs" /></td>)}<td className="p-1"><button type="button" aria-label={`Remove student ${row + 1}`} onClick={() => setStudents((current) => current.length === 1 ? current : current.filter((_, index) => index !== row))} className="grid h-8 w-8 place-items-center text-muted hover:text-danger-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td></tr>)}</tbody></table>
          </div>
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setStudents((current) => [...current, { ...blankStudent }])}>Add row</Button><Button size="sm" loading={saving} icon={<Save className="h-4 w-4" aria-hidden="true" />} onClick={() => void save()}>Save dataset</Button></div>
          {message && <p role="status" className="text-sm text-muted">{message}</p>}
        </div>}
      </CardBody>
    </Card>
  );
}
