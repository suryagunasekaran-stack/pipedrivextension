import { mongoService } from '../mongoService.js';

describe('mongoService', () => {
	test('should connect to the database', async () => {
		const result = await mongoService.connect();
		expect(result).toBe(true);
	});

	test('should insert a document', async () => {
		const doc = { name: 'test' };
		const result = await mongoService.insert(doc);
		expect(result).toHaveProperty('_id');
		expect(result.name).toBe('test');
	});

	test('should find a document', async () => {
		const doc = { name: 'test' };
		await mongoService.insert(doc);
		const result = await mongoService.find({ name: 'test' });
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe('test');
	});
});