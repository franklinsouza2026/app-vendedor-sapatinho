export class IdentidadeError extends Error {
  constructor(
    public status: number,
    public type: string,
    message: string
  ) {
    super(message);
  }
}
