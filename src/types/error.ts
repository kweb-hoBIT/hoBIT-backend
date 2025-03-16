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
			'요청 데이터가 잘못되었습니다. 필수 값을 확인하세요.'
		);
	}
}

export class NluError extends CustomError {
	constructor(text: string) {
		super(
			`Nlu Error: ${text}`,
			500,
			'서버에서 문제가 발생했습니다. 관리자에게 문의해 주세요.'
		);
	}
}

export class DatabaseError extends CustomError {
	constructor(text: string) {
		super(
			`Database Error: ${text}`,
			500,
			'서버에서 문제가 발생했습니다. 관리자에게 문의해 주세요.'
		);
	}
}

export class NotFoundError extends CustomError {
	constructor(text: string) {
		super(
			`Not Found Error: ${text}`,
			404,
			'요청하신 리소스를 찾을 수 없습니다. URL을 확인하세요.'
		);
	}
}
