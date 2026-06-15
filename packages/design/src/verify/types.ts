export interface TestResult {
  name: string
  passed: boolean
  message: string
  severity: 'error' | 'warning'
  autoFixable: boolean
  suggestedFix?: string | undefined
}

export interface VerificationResult {
  passed: boolean
  results: TestResult[]
}
