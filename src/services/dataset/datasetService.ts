/**
 * Dataset signal used by the diet generator.
 *
 * Uploaded student datasets remain independent and are never read here. This
 * module only exposes the bundled reference signal used to rank food choices.
 */
import type { UserProfile } from "@/types/profile";
import { getAllParticipants, isDatasetAvailable } from "@/data/dataset/loader";
import {
  buildDatasetSignal,
  NEUTRAL_SIGNAL,
  type DatasetSignal,
} from "@/data/dataset/similarProfiles";

/**
 * The auxiliary ranking signal for Part 7.
 * Returns a neutral, ranking-inert signal when no dataset is loaded.
 */
export function getDatasetSignal(profile: UserProfile): DatasetSignal {
  if (!isDatasetAvailable()) return NEUTRAL_SIGNAL;
  return buildDatasetSignal(profile, getAllParticipants());
}
