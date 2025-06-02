import 'dotenv/config'; // Changed from require('dotenv').config()
import express, { json } from 'express';
import cors from 'cors';
import { loadAllTokensFromFile, loadAllXeroTokensFromFile } from './services/tokenService.js';

// Import route files
import authRoutes from './routes/authRoutes.js'; // Added .js
import pipedriveRoutes from './routes/pipedriveRoutes.js'; // Added .js
import xeroRoutes from './routes/xeroRoutes.js'; // Added .js
import projectRoutes from './routes/projectRoutes.js'; // Added .js

const app = express();

// Enable CORS - configure appropriately for production
app.use(cors({
    origin: 'http://localhost:3001' // Allow requests from your Next.js app's origin
}));
app.use(json()); // Add this line to parse JSON request bodies

const port = process.env.PORT || 3000;

// Use the imported routes
app.use('/', authRoutes); // Mount auth routes at the root
app.use('/', pipedriveRoutes); // Mount Pipedrive routes (includes /pipedrive-action and /api/pipedrive-data)
app.use('/', xeroRoutes); // Mount Xero routes (includes /api/xero/status and /api/xero/create-quote)
app.use('/', projectRoutes); // Mount project routes (includes /api/project/create-full)


// --- Start Server and Load Tokens ---
async function startServer() {
    await loadAllTokensFromFile(); // Load Pipedrive tokens
    await loadAllXeroTokensFromFile(); // Load Xero tokens
    
    app.listen(port, () => {
        console.log(`Server running on port http://localhost:${port}`);
    });
}

startServer().catch(error => {
    console.error("Failed to start the server:", error);
    process.exit(1);
});
