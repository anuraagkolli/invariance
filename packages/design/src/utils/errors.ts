export class InvarianceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvarianceError'
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export class ConfigParseError extends InvarianceError {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ConfigParseError'
  }
}

export class ConfigValidationError extends InvarianceError {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message)
    this.name = 'ConfigValidationError'
  }
}

export class InvalidOverrideError extends InvarianceError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOverrideError'
  }
}

export class LevelViolationError extends InvarianceError {
  constructor(
    public readonly slotName: string,
    public readonly requestedLevel: number,
    public readonly allowedLevel: number,
  ) {
    super(
      `Slot "${slotName}" is locked at level ${allowedLevel}, cannot apply level ${requestedLevel} override`,
    )
    this.name = 'LevelViolationError'
  }
}
