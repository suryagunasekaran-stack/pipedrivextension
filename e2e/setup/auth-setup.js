#!/usr/bin/env node

/**
 * E2E Test Authentication Setup Script
 * 
 * This script helps set up authentication tokens for E2E testing:
 * 1. For Pipedrive: Uses API token directly (no OAuth needed for tests)
 * 2. For Xero: Guides through manual OAuth process and saves tokens
 * 
 * Run this once to set up your test environment:
 * node e2e/setup/auth-setup.js
 */

import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import inquirer from 'inquirer';
import open from 'open';
import express from 'express';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

class E2EAuthSetup {
  constructor() {
    this.testEnvPath = path.join(__dirname, '../../.env.test');
    this.app = express();
    this.server = null;
  }

  async run() {
    console.log('🚀 E2E Test Authentication Setup\n');

    // Check if we already have test tokens
    const existingTokens = await this.checkExistingTokens();
    if (existingTokens.hasPipedrive && existingTokens.hasXero) {
      const { reconfigure } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'reconfigure',
          message: 'Test tokens already exist. Reconfigure?',
          default: false
        }
      ]);

      if (!reconfigure) {
        console.log('✅ Using existing test configuration');
        return;
      }
    }

    // Setup Pipedrive
    await this.setupPipedrive();

    // Setup Xero
    await this.setupXero();

    console.log('\n✅ E2E authentication setup complete!');
    console.log('📝 Test tokens saved to .env.test');
    console.log('🚀 You can now run: npm run test:e2e');
  }

  async checkExistingTokens() {
    try {
      const content = await fs.readFile(this.testEnvPath, 'utf-8');
      return {
        hasPipedrive: content.includes('TEST_PIPEDRIVE_API_TOKEN'),
        hasXero: content.includes('TEST_XERO_ACCESS_TOKEN')
      };
    } catch (error) {
      return { hasPipedrive: false, hasXero: false };
    }
  }

  async setupPipedrive() {
    console.log('\n📈 Pipedrive Setup');
    console.log('For E2E testing, we\'ll use a Pipedrive API token instead of OAuth.\n');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'apiToken',
        message: 'Enter your Pipedrive sandbox API token:',
        validate: input => input.length > 0
      },
      {
        type: 'input',
        name: 'companyDomain',
        message: 'Enter your Pipedrive company domain (e.g., sandbox-company):',
        validate: input => input.length > 0
      },
      {
        type: 'input',
        name: 'companyId',
        message: 'Enter a test company ID (any number, e.g., 12345):',
        default: '12345'
      }
    ]);

    // Test the API token
    console.log('🔍 Testing Pipedrive connection...');
    const testUrl = `https://${answers.companyDomain}.pipedrive.com/v1/users/me?api_token=${answers.apiToken}`;
    
    try {
      const response = await fetch(testUrl);
      if (!response.ok) {
        throw new Error(`API test failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`✅ Connected to Pipedrive as: ${data.data.name}`);

      // Save Pipedrive config
      await this.saveToEnvFile({
        TEST_PIPEDRIVE_API_TOKEN: answers.apiToken,
        TEST_PIPEDRIVE_COMPANY_DOMAIN: answers.companyDomain,
        TEST_PIPEDRIVE_COMPANY_ID: answers.companyId
      });

    } catch (error) {
      console.error('❌ Failed to connect to Pipedrive:', error.message);
      process.exit(1);
    }
  }

  async setupXero() {
    console.log('\n📊 Xero Setup');
    console.log('For Xero, we need to perform OAuth once and save the tokens.\n');

    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'This will open a browser for Xero OAuth. Continue?',
        default: true
      }
    ]);

    if (!proceed) {
      console.log('⏭️  Skipping Xero setup');
      return;
    }

    // Start local server to handle OAuth callback
    await this.startOAuthServer();

    // Generate OAuth URL
    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = 'http://localhost:3333/xero-callback';
    
    const authUrl = `https://login.xero.com/identity/connect/authorize?` +
      `response_type=code&` +
      `client_id=${process.env.XERO_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=openid profile email accounting.contacts accounting.transactions projects offline_access&` +
      `state=${state}`;

    console.log('\n🌐 Opening browser for Xero authentication...');
    console.log('📝 Make sure to authorize your sandbox organization!');
    
    // Store state for validation
    this.xeroState = state;
    
    // Open browser
    await open(authUrl);

    // Wait for callback
    const tokens = await this.waitForXeroCallback();
    
    if (tokens) {
      console.log('✅ Xero authentication successful!');
      
      // Save Xero tokens
      await this.saveToEnvFile({
        TEST_XERO_ACCESS_TOKEN: tokens.access_token,
        TEST_XERO_REFRESH_TOKEN: tokens.refresh_token,
        TEST_XERO_TENANT_ID: tokens.tenant_id,
        TEST_XERO_TOKEN_EXPIRES: new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      });
    }

    // Stop server
    this.stopOAuthServer();
  }

  async startOAuthServer() {
    return new Promise((resolve) => {
      this.app.get('/xero-callback', async (req, res) => {
        const { code, state, error } = req.query;

        if (error) {
          res.send('❌ Authentication failed: ' + error);
          this.xeroCallbackResolve(null);
          return;
        }

        if (state !== this.xeroState) {
          res.send('❌ Invalid state parameter');
          this.xeroCallbackResolve(null);
          return;
        }

        // Exchange code for tokens
        try {
          const tokens = await this.exchangeXeroCode(code);
          res.send('✅ Authentication successful! You can close this window.');
          this.xeroCallbackResolve(tokens);
        } catch (error) {
          res.send('❌ Token exchange failed: ' + error.message);
          this.xeroCallbackResolve(null);
        }
      });

      this.server = this.app.listen(3333, () => {
        console.log('🔧 OAuth callback server listening on http://localhost:3333');
        resolve();
      });
    });
  }

  async waitForXeroCallback() {
    return new Promise((resolve) => {
      this.xeroCallbackResolve = resolve;
    });
  }

  async exchangeXeroCode(code) {
    const tokenUrl = 'https://identity.xero.com/connect/token';
    const redirectUri = 'http://localhost:3333/xero-callback';

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: process.env.XERO_CLIENT_ID,
      client_secret: process.env.XERO_CLIENT_SECRET
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${error}`);
    }

    const tokens = await response.json();

    // Get tenant connections
    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!connectionsResponse.ok) {
      throw new Error('Failed to get Xero tenant connections');
    }

    const connections = await connectionsResponse.json();
    if (connections.length === 0) {
      throw new Error('No Xero organizations connected');
    }

    // Use first tenant (should be sandbox)
    tokens.tenant_id = connections[0].tenantId;

    return tokens;
  }

  stopOAuthServer() {
    if (this.server) {
      this.server.close();
      console.log('🛑 OAuth server stopped');
    }
  }

  async saveToEnvFile(config) {
    let content = '';
    
    try {
      content = await fs.readFile(this.testEnvPath, 'utf-8');
    } catch (error) {
      // File doesn't exist, create header
      content = '# E2E Test Environment Variables\n';
      content += '# Generated by auth-setup.js\n\n';
    }

    // Update or add each config value
    for (const [key, value] of Object.entries(config)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${value}`;
      
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content += `${line}\n`;
      }
    }

    await fs.writeFile(this.testEnvPath, content);
  }
}

// Run setup
const setup = new E2EAuthSetup();
setup.run().catch(console.error); 