import { z } from 'zod';

export const INCIDENT_CATEGORIES = [
  'FIRE_OR_SMOKE',
  'MEDICAL_EMERGENCY',
  'PHYSICAL_HAZARD',
  'SECURITY_INCIDENT',
  'OTHER_URGENT',
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const IncidentCategorySchema = z.enum(INCIDENT_CATEGORIES);

export interface CategoryMetadata {
  code: IncidentCategory;
  label: string;
  description: string;
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  icon: string;
}

export const CATEGORY_CATALOGUE: Record<IncidentCategory, CategoryMetadata> = {
  FIRE_OR_SMOKE: {
    code: 'FIRE_OR_SMOKE',
    label: 'Fire or Smoke',
    description: 'Active flames, electrical sparks, burning smells, or dense smoke sightings.',
    urgencyLevel: 'CRITICAL',
    icon: 'flame',
  },
  MEDICAL_EMERGENCY: {
    code: 'MEDICAL_EMERGENCY',
    label: 'Medical Emergency',
    description:
      'Physical injuries, loss of consciousness, severe bleeding, or acute medical crisis.',
    urgencyLevel: 'CRITICAL',
    icon: 'heart-pulse',
  },
  PHYSICAL_HAZARD: {
    code: 'PHYSICAL_HAZARD',
    label: 'Physical Hazard',
    description: 'Exposed live wiring, collapsed walkways, deep unmarked trenches, or flooding.',
    urgencyLevel: 'HIGH',
    icon: 'triangle-alert',
  },
  SECURITY_INCIDENT: {
    code: 'SECURITY_INCIDENT',
    label: 'Security Incident',
    description: 'Theft, physical altercation, unauthorized intrusion, or harassment.',
    urgencyLevel: 'HIGH',
    icon: 'shield-alert',
  },
  OTHER_URGENT: {
    code: 'OTHER_URGENT',
    label: 'Other Urgent Hazard',
    description: 'Urgent campus safety hazards not captured by other standard categories.',
    urgencyLevel: 'MEDIUM',
    icon: 'alert-circle',
  },
};
