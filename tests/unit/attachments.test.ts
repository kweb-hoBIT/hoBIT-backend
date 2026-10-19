import sharp from 'sharp';
import { checkFile, safeName, MAX_FILE_BYTES } from '../../src/chat/attachments';

async function jpegWithGps(): Promise<Buffer> {
	// 위치정보(GPS)가 들어 있는 사진 — 스마트폰 사진처럼
	return sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 30, b: 30 } } })
		.jpeg()
		.withExif({ IFD0: { Make: 'TestPhone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '37/1 35/1 0/1' } })
		.toBuffer();
}

describe('첨부 파일 검사', () => {
	test('사진의 위치정보(EXIF)를 지우고 다시 저장', async () => {
		const input = await jpegWithGps();
		expect((await sharp(input).metadata()).exif).toBeDefined();
		const out = await checkFile(input, 'photo.jpg');
		if (typeof out === 'string') throw new Error(out);
		expect(out).toMatchObject({ mime: 'image/jpeg', width: 40, height: 30, name: 'photo.jpg' });
		expect((await sharp(out.data).metadata()).exif).toBeUndefined();
	});

	test('확장자를 속인 HTML 파일은 거부', async () => {
		const html = Buffer.from('<html><script>alert(1)</script></html>');
		await expect(checkFile(html, 'cute.png')).resolves.toBe('unsupported');
	});

	test('PDF는 그대로 받음, 이름의 확장자는 실제 형식으로', async () => {
		const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
		const out = await checkFile(pdf, '../../etc/passwd.exe');
		if (typeof out === 'string') throw new Error(out);
		expect(out.mime).toBe('application/pdf');
		expect(out.name).toBe('passwd.pdf');
	});

	test('10MB 초과·빈 파일·깨진 이미지 거부', async () => {
		await expect(checkFile(Buffer.alloc(MAX_FILE_BYTES + 1), 'big.pdf')).resolves.toBe('too_large');
		await expect(checkFile(Buffer.alloc(0), 'empty.png')).resolves.toBe('empty');
		const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer();
		await expect(checkFile(png.subarray(0, 40), 'broken.png')).resolves.toBe('broken');
	});

	test('파일 이름 정리 — 경로·제어문자 제거', () => {
		expect(safeName('C:\\Users\\me\\성적표<1>.png', 'image/png')).toBe('성적표1.png');
		expect(safeName('', 'application/pdf')).toBe('file.pdf');
	});
});
