/**
 * Tests for Pipedrive API service
 * Tests all API interactions with proper mocking
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getDealDetails,
  getPersonDetails,
  getOrganizationDetails,
  getDealProducts,
  updateDealWithProjectNumber
} from '../pipedriveApiService.js';
import { PipedriveMock, mockData, cleanupMocks } from '../../__tests__/testUtils.js';

describe('Pipedrive API Service', () => {
  let pipedriveMock;

  beforeEach(() => {
    pipedriveMock = new PipedriveMock();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('getDealDetails', () => {
    test('should fetch deal successfully', async () => {
      const mockDeal = mockData.pipedriveDeal('12345');
      pipedriveMock.mockGetDeal('12345', mockDeal);

      const result = await getDealDetails('https://api.pipedrive.com', 'valid-token', '12345');

      expect(result).toEqual(mockDeal);
      pipedriveMock.done();
    });

    test('should handle deal not found', async () => {
      pipedriveMock.mockGetDeal('12345', null, 404);

      await expect(getDealDetails('https://api.pipedrive.com', 'valid-token', '12345'))
        .rejects.toThrow();
    });

    test('should handle API errors', async () => {
      pipedriveMock.mockGetDeal('12345', null, 500);

      await expect(getDealDetails('https://api.pipedrive.com', 'valid-token', '12345'))
        .rejects.toThrow();
    });
  });

  describe('getPersonDetails', () => {
    test('should fetch person successfully', async () => {
      const mockPerson = mockData.pipedrivePerson('101');
      pipedriveMock.mockGetPerson('101', mockPerson);

      const result = await getPersonDetails('https://api.pipedrive.com', 'valid-token', '101');

      expect(result).toEqual(mockPerson);
      pipedriveMock.done();
    });

    test('should handle person not found', async () => {
      pipedriveMock.mockGetPerson('101', null, 404);

      await expect(getPersonDetails('https://api.pipedrive.com', 'valid-token', '101'))
        .rejects.toThrow();
    });
  });

  describe('getOrganizationDetails', () => {
    test('should fetch organization successfully', async () => {
      const mockOrg = mockData.pipedriveOrganization('201');
      pipedriveMock.mockGetOrganization('201', mockOrg);

      const result = await getOrganizationDetails('https://api.pipedrive.com', 'valid-token', '201');

      expect(result).toEqual(mockOrg);
      pipedriveMock.done();
    });

    test('should handle organization not found', async () => {
      pipedriveMock.mockGetOrganization('201', null, 404);

      await expect(getOrganizationDetails('https://api.pipedrive.com', 'valid-token', '201'))
        .rejects.toThrow();
    });
  });

  describe('getDealProducts', () => {
    test('should fetch deal products successfully', async () => {
      const mockProducts = mockData.dealProducts('12345');
      pipedriveMock.mockGetDealProducts('12345', mockProducts);

      const result = await getDealProducts('https://api.pipedrive.com', 'valid-token', '12345');

      expect(result).toEqual(mockProducts);
      pipedriveMock.done();
    });

    test('should handle empty products', async () => {
      pipedriveMock.mockGetDealProducts('12345', []);

      const result = await getDealProducts('https://api.pipedrive.com', 'valid-token', '12345');

      expect(result).toEqual([]);
      pipedriveMock.done();
    });
  });

  describe('updateDealWithProjectNumber', () => {
    test('should update deal successfully', async () => {
      const updateData = { custom_fields: { project_number: 'PROJ-001' } };
      pipedriveMock.mockUpdateDeal('12345');

      // Mock environment variable
      process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY = 'project_number';

      const result = await updateDealWithProjectNumber('https://api.pipedrive.com', 'valid-token', '12345', 'PROJ-001');

      expect(result).toBeDefined();
      pipedriveMock.done();
    });

    test('should handle update failure', async () => {
      pipedriveMock.mockUpdateDeal('12345', 400);

      // Mock environment variable
      process.env.PIPEDRIVE_PROJECT_NUMBER_CUSTOM_FIELD_KEY = 'project_number';

      await expect(updateDealWithProjectNumber('https://api.pipedrive.com', 'valid-token', '12345', 'PROJ-001'))
        .rejects.toThrow();
    });
  });
});
