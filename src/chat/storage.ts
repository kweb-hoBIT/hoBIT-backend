import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import type { Readable } from 'stream';

/**
 * 첨부 파일 저장소 — 지금은 로컬 디스크, 나중에 S3로 바꿀 때 이 인터페이스만 새로 구현
 * 저장 위치는 웹에서 바로 열리는 경로가 아님 (서명된 링크를 거쳐서만 내려줌)
 */
export interface FileStorage {
	put(key: string, data: Buffer): Promise<void>;
	read(key: string): Promise<Readable>;
	remove(key: string): Promise<void>;
}

export class LocalStorage implements FileStorage {
	constructor(private readonly root: string) {}

	private file(key: string) {
		// 키는 서버가 만든 "YYYY/MM/uuid" 형식만 — 경로 탈출 방지
		if (!/^\d{4}\/\d{2}\/[0-9a-f-]{36}$/.test(key)) throw new Error('bad storage key');
		return path.join(this.root, key);
	}

	async put(key: string, data: Buffer) {
		const f = this.file(key);
		await fs.mkdir(path.dirname(f), { recursive: true, mode: 0o700 });
		await fs.writeFile(f, data, { mode: 0o600 });
	}

	async read(key: string) {
		const f = this.file(key);
		await fs.access(f);
		return createReadStream(f);
	}

	async remove(key: string) {
		await fs.rm(this.file(key), { force: true });
	}
}
