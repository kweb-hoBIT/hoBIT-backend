export class CustomError extends Error {
  statusCode: number;
  externalErrorMessage: string;

  constructor(text: string, statusCode: number, externalErrorMessage: string) {
    super(text);
    this.statusCode = statusCode;
    this.externalErrorMessage = externalErrorMessage;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends CustomError {
  constructor(text: string) {
    super(
      `Validation Error: ${text}`,
      400,
      'The request data is invalid. Please check the required fields.'
    );
  }
}

export class NluError extends CustomError {
  constructor(text: string) {
    super(
      `Nlu Error: ${text}`,
      500,
      'A server error occurred. Please contact the administrator.'
    );
  }
}

export class DatabaseError extends CustomError {
  constructor(text: string) {
    super(
      `Database Error: ${text}`,
      500,
      'A server error occurred. Please contact the administrator.'
    );
  }
}

export class NotFoundError extends CustomError {
  constructor(text: string) {
    super(
      `Not Found Error: ${text}`,
      404,
      'The requested resource could not be found. Please check the URL.'
    );
  }
}
