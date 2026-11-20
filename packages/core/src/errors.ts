export class IntakeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "IntakeError";
  }
}
