#!/usr/bin/env node

/**
 * Test data cleanup and management script
 * Handles cleanup of test data in external APIs when needed for integration testing
 */

import 'dotenv/config';
import { MongoClient } from 'mongodb';

class TestDataCleanup {
  constructor() {
    this.mongoClient = null;
    this.db = null;
  }

  async connect() {
    if (process.env.NODE_ENV !== 'test') {
      console.log('⚠️  This script should only be run in test environment');
      return;
    }

    try {
      this.mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');
      await this.mongoClient.connect();
      this.db = this.mongoClient.db(process.env.DB_NAME || 'pipedriveapp_test');
      console.log('✅ Connected to test database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      throw error;
    }
  }

  async cleanupDatabase() {
    try {
      // Reset project sequences to known state for testing
      await this.db.collection('projectSequences').deleteMany({});
      
      // Insert default test sequences
      const defaultSequences = [
        { department: 'Engineering', prefix: 'ENG', currentNumber: 0 },
        { department: 'Sales', prefix: 'SAL', currentNumber: 0 },
        { department: 'Marketing', prefix: 'MKT', currentNumber: 0 }
      ];

      await this.db.collection('projectSequences').insertMany(defaultSequences);
      console.log('✅ Reset project sequences to default state');

      // Clean other test collections if they exist
      const collections = ['testDeals', 'testProjects', 'testContacts'];
      for (const collectionName of collections) {
        const collection = this.db.collection(collectionName);
        const result = await collection.deleteMany({});
        if (result.deletedCount > 0) {
          console.log(`✅ Cleaned ${result.deletedCount} documents from ${collectionName}`);
        }
      }

    } catch (error) {
      console.error('❌ Database cleanup failed:', error.message);
      throw error;
    }
  }

  async resetToTestState() {
    try {
      console.log('🧹 Starting test environment reset...');
      
      await this.connect();
      await this.cleanupDatabase();
      
      console.log('✅ Test environment reset complete');
    } catch (error) {
      console.error('❌ Test environment reset failed:', error.message);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }

  async generateTestData() {
    try {
      console.log('🔧 Generating test data...');
      
      await this.connect();
      
      // Generate some test project sequences
      const testSequences = [
        { department: 'Engineering', prefix: 'ENG', currentNumber: 5 },
        { department: 'Sales', prefix: 'SAL', currentNumber: 3 }
      ];

      await this.db.collection('projectSequences').deleteMany({});
      await this.db.collection('projectSequences').insertMany(testSequences);
      
      console.log('✅ Test data generation complete');
    } catch (error) {
      console.error('❌ Test data generation failed:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }

  async validateTestEnvironment() {
    try {
      console.log('🔍 Validating test environment...');
      
      // Check environment variables
      const requiredEnvVars = ['NODE_ENV', 'MONGODB_URI'];
      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      
      if (missingVars.length > 0) {
        console.error('❌ Missing environment variables:', missingVars.join(', '));
        return false;
      }

      if (process.env.NODE_ENV !== 'test') {
        console.error('❌ NODE_ENV must be set to "test"');
        return false;
      }

      // Check database connection
      await this.connect();
      
      // Verify collections exist and are accessible
      const collections = await this.db.listCollections().toArray();
      console.log(`✅ Found ${collections.length} collections in test database`);
      
      console.log('✅ Test environment validation passed');
      return true;
    } catch (error) {
      console.error('❌ Test environment validation failed:', error.message);
      return false;
    } finally {
      await this.disconnect();
    }
  }

  async disconnect() {
    if (this.mongoClient) {
      await this.mongoClient.close();
      console.log('📪 Disconnected from database');
    }
  }

  async getTestStats() {
    try {
      await this.connect();
      
      const stats = {};
      const collections = await this.db.listCollections().toArray();
      
      for (const collection of collections) {
        const count = await this.db.collection(collection.name).countDocuments();
        stats[collection.name] = count;
      }
      
      console.log('📊 Test database statistics:');
      Object.entries(stats).forEach(([name, count]) => {
        console.log(`  ${name}: ${count} documents`);
      });
      
      return stats;
    } catch (error) {
      console.error('❌ Failed to get test stats:', error.message);
      throw error;
    } finally {
      await this.disconnect();
    }
  }
}

// CLI interface
const command = process.argv[2];
const cleanup = new TestDataCleanup();

switch (command) {
  case 'reset':
    await cleanup.resetToTestState();
    break;
    
  case 'generate':
    await cleanup.generateTestData();
    break;
    
  case 'validate':
    const isValid = await cleanup.validateTestEnvironment();
    process.exit(isValid ? 0 : 1);
    break;
    
  case 'stats':
    await cleanup.getTestStats();
    break;
    
  default:
    console.log(`
🧪 Test Data Management Script

Usage:
  node scripts/testCleanup.js <command>

Commands:
  reset     - Reset test environment to clean state
  generate  - Generate test data for development
  validate  - Validate test environment setup
  stats     - Show test database statistics

Examples:
  npm run test:reset     # Reset test environment
  npm run test:generate  # Generate test data
  npm run test:validate  # Validate setup
`);
    break;
}

export default TestDataCleanup;
