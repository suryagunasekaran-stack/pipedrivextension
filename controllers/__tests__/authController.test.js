import authController from '../authController.js';

// Simple mock function for ES modules environment
const mockFn = (returnValue) => {
  const fn = (...args) => {
    fn.calls.push(args);
    fn.lastCall = args;
    return returnValue;
  };
  fn.calls = [];
  fn.lastCall = null;
  fn.mockReturnValue = (value) => {
    fn.returnValue = value;
    return fn;
  };
  fn.mockReturnThis = () => {
    fn.returnValue = fn;
    return fn;
  };
  return fn;
};

describe('authController', () => {
	test('should register a user successfully', async () => {
		const req = { body: { username: 'testuser', password: 'password' } };
		const res = { json: mockFn(), status: mockFn().mockReturnThis() };
		await authController.register(req, res);
		expect(res.json).toHaveBeenCalledWith({ message: 'User registered successfully' });
	});

	test('should login a user successfully', async () => {
		const req = { body: { username: 'testuser', password: 'password' } };
		const res = { json: mockFn(), status: mockFn().mockReturnThis() };
		await authController.login(req, res);
		expect(res.json).toHaveBeenCalledWith({ message: 'User logged in successfully' });
	});

	test('should return error for invalid login', async () => {
		const req = { body: { username: 'wronguser', password: 'wrongpassword' } };
		const res = { json: mockFn(), status: mockFn().mockReturnThis() };
		await authController.login(req, res);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({ message: 'Invalid credentials' });
	});
});