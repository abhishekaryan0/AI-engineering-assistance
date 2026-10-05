export type InputType = 'research' | 'analysis' | 'action';

export interface AgentSettings {
  detailLevel?: number; // 0..1
  referencesLevel?: number; // 0..1
  expertiseLevel?: 'junior_engineer' | 'senior_engineer' | 'engineering_lead';
  model?: string;
}
