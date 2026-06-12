export { migrate, analyze, writeMigration } from './migrate'
export type { MigrateOptions, ScannerAgent, AnalyzeResult } from './migrate'
export { runCheck } from './check'
export type { CheckResult, CheckViolation } from './check'
export { migrateTheme } from './migrate-theme'
export type { ThemeMigrationReport, ThemeRegistry } from './migrate-theme'
export type {
  CandidateSection,
  MigrationPlan,
  ObservedText,
  ObservedValue,
  ScannerResult,
  SemanticResult,
  SourceEdit,
  StaticExtraction,
  TailwindMaps,
} from './types'
