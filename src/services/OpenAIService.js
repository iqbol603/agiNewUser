import OpenAI from 'openai';
import fs from 'fs';
import { ENV } from '../config/env.js';
import { log } from '../utils/logger.js';

export class OpenAIService {
    constructor() {
		this.client = new OpenAI({ apiKey: ENV.OPENAI_API_KEY });
    }

    async transcribe(filePath) {
		try {
			const resp = await this.client.audio.transcriptions.create({
				file: fs.createReadStream(filePath),
				model: 'whisper-1'
			});
			return resp.text;
		} catch (e) {
			log.error('[STT ERROR]', e?.message || e);
			throw e;
		}
    }

    async speak(text) {
		try {
			const speech = await this.client.audio.speech.create({
				model: 'gpt-4o-mini-tts',
				voice: 'alloy',
				input: text,
				format: 'ogg'
			});
			const buffer = Buffer.from(await speech.arrayBuffer());
			return buffer;
		} catch (e) {
			log.warn('[TTS WARN]', e?.message || e);
			throw e;
		}
    }
}