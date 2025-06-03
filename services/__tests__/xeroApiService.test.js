/**
 * Tests for Xero API service
 * Tests Xero integration with proper mocking
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getXeroContacts,
  createXeroContact,
  createXeroProject,
  getXeroProjects
} from '../xeroApiService.js';
import { XeroMock, mockData, cleanupMocks } from '../../__tests__/testUtils.js';

describe('Xero API Service', () => {
  let xeroMock;

  beforeEach(() => {
    xeroMock = new XeroMock();
  });

  afterEach(() => {
    cleanupMocks();
  });

  describe('getXeroContacts', () => {
    test('should fetch contacts successfully', async () => {
      const mockContacts = [mockData.xeroContact()];
      xeroMock.mockGetContacts(mockContacts);

      const result = await getXeroContacts('valid-token', 'Test Company');

      expect(result).toEqual(mockContacts);
      xeroMock.done();
    });

    test('should handle no contacts found', async () => {
      xeroMock.mockGetContacts([]);

      const result = await getXeroContacts('valid-token', 'Nonexistent Company');

      expect(result).toEqual([]);
      xeroMock.done();
    });

    test('should handle API errors', async () => {
      xeroMock.mockGetContacts(null, 500);

      await expect(getXeroContacts('invalid-token', 'Test Company'))
        .rejects.toThrow();
    });
  });

  describe('createXeroContact', () => {
    test('should create contact successfully', async () => {
      const mockContact = mockData.xeroContact();
      xeroMock.mockCreateContact(mockContact);

      const contactData = {
        Name: 'Test Company',
        EmailAddress: 'test@company.com'
      };

      const result = await createXeroContact('valid-token', contactData);

      expect(result).toEqual(mockContact);
      xeroMock.done();
    });

    test('should handle validation errors', async () => {
      xeroMock.mockCreateContact(null, 400);

      const invalidContactData = {
        Name: '', // Empty name should cause validation error
        EmailAddress: 'invalid-email'
      };

      await expect(createXeroContact('valid-token', invalidContactData))
        .rejects.toThrow();
    });
  });

  describe('createXeroProject', () => {
    test('should create project successfully', async () => {
      const mockProject = mockData.xeroProject();
      xeroMock.mockCreateProject(mockProject);

      const projectData = {
        Name: 'Test Project PROJ-001',
        ProjectNumber: 'PROJ-001',
        ContactId: 'contact-123'
      };

      const result = await createXeroProject('valid-token', projectData);

      expect(result).toEqual(mockProject);
      xeroMock.done();
    });

    test('should handle duplicate project number', async () => {
      xeroMock.mockCreateProject(null, 400);

      const duplicateProjectData = {
        Name: 'Duplicate Project',
        ProjectNumber: 'EXISTING-001',
        ContactId: 'contact-123'
      };

      await expect(createXeroProject('valid-token', duplicateProjectData))
        .rejects.toThrow();
    });
  });

  describe('getXeroProjects', () => {
    test('should fetch projects successfully', async () => {
      const mockProjects = [mockData.xeroProject()];
      xeroMock.mockGetProjects(mockProjects);

      const result = await getXeroProjects('valid-token', 'PROJ-001');

      expect(result).toEqual(mockProjects);
      xeroMock.done();
    });

    test('should handle no projects found', async () => {
      xeroMock.mockGetProjects([]);

      const result = await getXeroProjects('valid-token', 'NONEXISTENT-001');

      expect(result).toEqual([]);
      xeroMock.done();
    });
  });
});
