test('hello world!', () => {
	expect(1 + 1).toBe(2);
});

test('string concatenation', () => {
	expect('Hello' + ' ' + 'World').toBe('Hello World');
});

test('array includes', () => {
	expect([1, 2, 3]).toContain(2);
});