import axios from 'axios';
import http from 'node:http';
import https from 'node:https';
import { ENV } from '../config/env.js';
import { log } from '../utils/logger.js';

const baseURL = String(process.env.API_BASE_URL || ENV.API_BASE_URL || '').trim();

export class ApiClient {
	constructor() {
		if (!/^https?:\/\//i.test(baseURL)) {
			throw new Error('API_BASE_URL не задан или некорректен');
		}
		this.http = axios.create({
			baseURL,
			timeout: Number(process.env.HTTP_TIMEOUT_MS || 15000),
			headers: {
				'Content-Type': 'application/json',
				...(process.env.API_KEY ? { Authorization: `Bearer ${process.env.API_KEY}` } : {})
			},
			httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
			httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 })
		});
		log.info('[API] client ready:', baseURL);
	}

	async get(entity, params = {}) {
		const { data } = await this.http.get('', { params: { entity, action: 'get', ...params } });
		return data;
	}

	async add(entity, body = {}) {
		const { data } = await this.http.post('', body, { params: { entity, action: 'add' } });
		return data;
	}

	async update(entity, id, body = {}) {
		const { data } = await this.http.post('', body, { params: { entity, action: 'update', id } });
		return data;
	}
}