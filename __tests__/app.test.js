import request from 'supertest';
import express from 'express';

// Create a simple test app for basic endpoint testing
const createTestApp = () => {
    const app = express();
    app.use(express.json());
    
    // Basic test endpoints
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString()
        });
    });
    
    app.get('/api/status', (req, res) => {
        res.json({ 
            status: 'running', 
            timestamp: new Date().toISOString() 
        });
    });
    
    app.get('/basic-test', (req, res) => {
        res.json({ 
            message: 'Basic server is working!', 
            timestamp: new Date().toISOString(),
            query: req.query
        });
    });
    
    return app;
};

describe('Express App - Basic Endpoint Tests', () => {
    let app;
    
    beforeEach(() => {
        app = createTestApp();
    });
    
    test('GET /health should return OK status', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);
        
        expect(response.body).toHaveProperty('status', 'OK');
        expect(response.body).toHaveProperty('timestamp');
        expect(typeof response.body.timestamp).toBe('string');
    });
    
    test('GET /api/status should return running status', async () => {
        const response = await request(app)
            .get('/api/status')
            .expect(200);
        
        expect(response.body).toHaveProperty('status', 'running');
        expect(response.body).toHaveProperty('timestamp');
    });
    
    test('GET /basic-test should return basic message', async () => {
        const response = await request(app)
            .get('/basic-test')
            .expect(200);
        
        expect(response.body).toHaveProperty('message', 'Basic server is working!');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('query');
    });
    
    test('GET /basic-test with query parameters', async () => {
        const response = await request(app)
            .get('/basic-test?name=Jest&type=test')
            .expect(200);
        
        expect(response.body.query).toEqual({
            name: 'Jest',
            type: 'test'
        });
    });
    
    test('GET /nonexistent should return 404', async () => {
        await request(app)
            .get('/nonexistent')
            .expect(404);
    });
});

// Simple HTTP status code tests
describe('HTTP Response Tests', () => {
    let app;
    
    beforeEach(() => {
        app = createTestApp();
    });
    
    test('should return JSON content type for API endpoints', async () => {
        const response = await request(app)
            .get('/health')
            .expect(200);
        
        expect(response.headers['content-type']).toMatch(/json/);
    });
    
    test('should handle multiple concurrent requests', async () => {
        const requests = Array(5).fill().map(() => 
            request(app).get('/health').expect(200)
        );
        
        const responses = await Promise.all(requests);
        
        responses.forEach(response => {
            expect(response.body.status).toBe('OK');
        });
    });
}); 