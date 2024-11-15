export class CustomError extends Error {
  statusCode: number;

  constructor(text: string, statusCode: number) {
    super(text);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends CustomError {
  constructor(text: string) {
    super(`Validation Error: ${text}`, 400);
  }
}

export class NluError extends CustomError {
  constructor(text: string) {
    super(`Nlu Error: ${text}`, 401);
  }
}

export class DatabaseError extends CustomError {
  constructor(text: string) {
    super(`Database Error: ${text}`, 402);
  }
}
