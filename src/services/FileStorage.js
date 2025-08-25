import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import { log } from '../utils/logger.js';
import { ENV } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FileStorage {
	constructor(root = path.join(__dirname, '..', '..', 'tmp')) {
		this.root = root;
		this.ensureDir(root);
	}

	ensureDir(dir) {
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	}

	tmpPath(name) {
		return path.join(this.root, name);
	}

	async downloadTelegramFile(bot, fileId, forceExt = 'ogg') {
		const file = await bot.getFile(fileId);
		const url = `https://api.telegram.org/file/bot${ENV.TELEGRAM_TOKEN}/${file.file_path}`;
		const outPath = this.tmpPath(`${file.file_unique_id}.${forceExt}`);

		const writer = fs.createWriteStream(outPath);
		
		const resp = await axios.get(url, {
			responseType: 'stream'
		});

		resp.data.pipe(writer);

		await new Promise((res, rej) => {
			writer.on('finish', res);
			writer.on('error', rej);
		});
		return outPath;
	}

	async saveBuffer(buffer, ext = 'ogg') {
		const outPath = this.tmpPath(`voice_${Date.now()}.${ext}`);
		fs.writeFileSync(outPath, buffer);
		return outPath;
	}
}