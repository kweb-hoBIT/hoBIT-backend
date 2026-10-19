import sharp from 'sharp';
import FileType from 'file-type';

/**
 * 업로드 파일 검사 — 확장자·브라우저가 알려준 형식은 믿지 않고 파일 내용(앞부분 바이트)으로 판단
 * 이미지는 다시 저장해서 위치정보(EXIF) 등 메타데이터를 지우고, 이미지 안에 숨긴 다른 내용도 없앰
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000; // 압축 폭탄 방지

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const DOC_TYPES = new Set(['application/pdf']);

export type CheckedFile = { data: Buffer; mime: string; width: number | null; height: number | null; name: string };
export type FileError = 'too_large' | 'empty' | 'unsupported' | 'broken';

/** 파일 이름: 경로·제어문자 제거, 길이 제한, 확장자는 실제 형식으로 */
export function safeName(original: string, mime: string): string {
	const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf' }[mime] ?? 'bin';
	const base = (original.split(/[\\/]/).pop() ?? 'file')
		.normalize('NFC')
		.replace(/\.[^.]*$/, '')
		.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '')
		.trim()
		.slice(0, 80);
	return `${base || 'file'}.${ext}`;
}

export async function checkFile(input: Buffer, originalName: string): Promise<CheckedFile | FileError> {
	if (!input.length) return 'empty';
	if (input.length > MAX_FILE_BYTES) return 'too_large';
	const type = await FileType.fromBuffer(input);
	if (!type) return 'unsupported';
	if (DOC_TYPES.has(type.mime)) {
		return { data: input, mime: type.mime, width: null, height: null, name: safeName(originalName, type.mime) };
	}
	if (!IMAGE_TYPES.has(type.mime)) return 'unsupported';
	try {
		const img = sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: type.mime === 'image/gif' }).rotate(); // 회전 정보만 반영
		const out =
			type.mime === 'image/png'
				? await img.png().toBuffer({ resolveWithObject: true })
				: type.mime === 'image/webp'
					? await img.webp({ quality: 90 }).toBuffer({ resolveWithObject: true })
					: type.mime === 'image/gif'
						? await img.gif().toBuffer({ resolveWithObject: true })
						: await img.jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
		// sharp는 기본적으로 메타데이터(EXIF·GPS)를 출력에 넣지 않음
		return { data: out.data, mime: type.mime, width: out.info.width, height: out.info.height, name: safeName(originalName, type.mime) };
	} catch {
		return 'broken';
	}
}
