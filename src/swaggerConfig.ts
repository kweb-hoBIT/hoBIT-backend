import swaggerJsDoc from 'swagger-jsdoc';

const swaggerOptions = {
	definition: {
		openapi: '3.0.0',
		info: {
			title: 'Hobit API',
			version: '0.1.0',
			description: 'HoBIT API Docs',
		},
	},
	apis: ['./src/docs/swagger.yaml'],
};

export const swaggerSpec = swaggerJsDoc(swaggerOptions);
