import axios from 'axios';
import { envs } from '../envs';
import { NluError } from '../types';

export const fetchNlu = async (nluParams: any): Promise<any> => {
	return axios
		.post(envs.HOBIT_NLU_ENDPOINT!, nluParams, {
			headers: {
				'Content-Type': 'application/json',
			},
		})
		.then((resp) => resp.data)
		.catch((err) => {
			throw new NluError(
				err.response?.data?.error || 'Failed to process NLU request'
			);
		});
};
