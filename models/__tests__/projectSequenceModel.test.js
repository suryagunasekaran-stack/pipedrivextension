/**
 * Tests for project sequence model
 * Tests project numbering logic and database operations
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { getNextProjectNumber } from '../../models/projectSequenceModel.js';
import { mongoService } from '../../services/mongoService.js';

describe('Project Sequence Model', () => {
  let mongod;
  let mongoClient;
  let db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const mongoUri = mongod.getUri();
    process.env.MONGODB_URI = mongoUri;

    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db();

    await mongoService.connect();
  });

  afterAll(async () => {
    await mongoClient?.close();
    await mongod?.stop();
    await mongoService.disconnect();
  });

  beforeEach(async () => {
    // Clean up before each test
    await db.collection('projectSequences').deleteMany({});
  });

  afterEach(async () => {
    // Clean up after each test
    await db.collection('projectSequences').deleteMany({});
  });

  describe('getNextProjectNumber', () => {
    test('should create new sequence for new department', async () => {
      const projectNumber = await getNextProjectNumber('Engineering');

      expect(projectNumber).toBe('ENG-001');

      // Verify database state
      const sequence = await db.collection('projectSequences').findOne({ department: 'Engineering' });
      expect(sequence).toMatchObject({
        department: 'Engineering',
        prefix: 'ENG',
        currentNumber: 1
      });
    });

    test('should increment existing sequence', async () => {
      // Create initial sequence
      await db.collection('projectSequences').insertOne({
        department: 'Engineering',
        prefix: 'ENG',
        currentNumber: 5
      });

      const projectNumber = await getNextProjectNumber('Engineering');

      expect(projectNumber).toBe('ENG-006');

      // Verify database state
      const sequence = await db.collection('projectSequences').findOne({ department: 'Engineering' });
      expect(sequence.currentNumber).toBe(6);
    });

    test('should handle different departments with different prefixes', async () => {
      const engineeringNumber = await getNextProjectNumber('Engineering');
      const salesNumber = await getNextProjectNumber('Sales');
      const marketingNumber = await getNextProjectNumber('Marketing');

      expect(engineeringNumber).toBe('ENG-001');
      expect(salesNumber).toBe('SAL-001');
      expect(marketingNumber).toBe('MKT-001');

      // Verify all sequences exist
      const sequences = await db.collection('projectSequences').find({}).toArray();
      expect(sequences).toHaveLength(3);
    });

    test('should handle concurrent requests without race conditions', async () => {
      // Create multiple concurrent requests for the same department
      const requests = Array.from({ length: 10 }, () => 
        getNextProjectNumber('Engineering')
      );

      const results = await Promise.all(requests);

      // All results should be unique
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(10);

      // Results should be sequential
      const sortedResults = results.sort();
      expect(sortedResults[0]).toBe('ENG-001');
      expect(sortedResults[9]).toBe('ENG-010');

      // Verify final database state
      const sequence = await db.collection('projectSequences').findOne({ department: 'Engineering' });
      expect(sequence.currentNumber).toBe(10);
    });

    test('should handle unknown departments with generic prefix', async () => {
      const projectNumber = await getNextProjectNumber('Unknown Department');

      expect(projectNumber).toBe('UNK-001');

      const sequence = await db.collection('projectSequences').findOne({ department: 'Unknown Department' });
      expect(sequence).toMatchObject({
        department: 'Unknown Department',
        prefix: 'UNK',
        currentNumber: 1
      });
    });

    test('should handle special characters in department names', async () => {
      const projectNumber = await getNextProjectNumber('R&D Division');

      expect(projectNumber).toBe('R&D-001');

      const sequence = await db.collection('projectSequences').findOne({ department: 'R&D Division' });
      expect(sequence.prefix).toBe('R&D');
    });

    test('should handle very long department names', async () => {
      const longDepartment = 'Very Long Department Name That Exceeds Normal Limits';
      const projectNumber = await getNextProjectNumber(longDepartment);

      expect(projectNumber).toBe('VER-001'); // Should truncate prefix

      const sequence = await db.collection('projectSequences').findOne({ department: longDepartment });
      expect(sequence.prefix).toBe('VER');
    });

    test('should handle database connection failures', async () => {
      // Disconnect to simulate database failure
      await mongoService.disconnect();

      await expect(getNextProjectNumber('Engineering'))
        .rejects.toThrow();

      // Reconnect for cleanup
      await mongoService.connect();
    });

    test('should handle large sequence numbers', async () => {
      // Create sequence with large number
      await db.collection('projectSequences').insertOne({
        department: 'Engineering',
        prefix: 'ENG',
        currentNumber: 99999
      });

      const projectNumber = await getNextProjectNumber('Engineering');

      expect(projectNumber).toBe('ENG-100000');
    });

    test('should handle sequence reset scenarios', async () => {
      // Create sequence
      await getNextProjectNumber('Engineering'); // ENG-001
      await getNextProjectNumber('Engineering'); // ENG-002

      // Reset sequence manually (simulating admin action)
      await db.collection('projectSequences').updateOne(
        { department: 'Engineering' },
        { $set: { currentNumber: 0 } }
      );

      const projectNumber = await getNextProjectNumber('Engineering');

      expect(projectNumber).toBe('ENG-001');
    });
  });

  describe('Edge cases and error handling', () => {
    test('should handle null department name', async () => {
      await expect(getNextProjectNumber(null))
        .rejects.toThrow('Department name is required');
    });

    test('should handle empty department name', async () => {
      await expect(getNextProjectNumber(''))
        .rejects.toThrow('Department name is required');
    });

    test('should handle whitespace-only department name', async () => {
      await expect(getNextProjectNumber('   '))
        .rejects.toThrow('Department name is required');
    });

    test('should handle department names with only special characters', async () => {
      const projectNumber = await getNextProjectNumber('!!!@@@###');

      // Should generate a fallback prefix
      expect(projectNumber).toMatch(/^[A-Z]+-001$/);
    });
  });
});
