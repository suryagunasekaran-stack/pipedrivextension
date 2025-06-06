/**
 * Tests for PipedriveDataView Component
 * Verifies deal data display and quote creation functionality
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PipedriveDataView from '@/app/pipedrive-data-view/page';
import { server } from '../mocks/api';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
  useSearchParams: () => {
    const params = new URLSearchParams();
    params.set('companyId', 'test-company');
    params.set('dealId', '123');
    return params;
  },
}));

// Start/stop mock server
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Helper to render with providers
function renderWithProviders(component: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {component}
    </QueryClientProvider>
  );
}

describe('PipedriveDataView', () => {
  it('loads and displays deal data', async () => {
    renderWithProviders(<PipedriveDataView />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading deal data...')).not.toBeInTheDocument();
    });

    // Check deal title is displayed
    expect(screen.getByText('Test Deal')).toBeInTheDocument();
    
    // Check deal value
    expect(screen.getByText('USD 10,000')).toBeInTheDocument();
    
    // Check organization
    expect(screen.getByText('Test Company')).toBeInTheDocument();
    
    // Check contact person
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText(/john@test.com/)).toBeInTheDocument();
  });

  it('displays products table', async () => {
    renderWithProviders(<PipedriveDataView />);

    await waitFor(() => {
      expect(screen.queryByText('Loading deal data...')).not.toBeInTheDocument();
    });

    // Check products are displayed
    expect(screen.getByText('Product A')).toBeInTheDocument();
    expect(screen.getByText('Product B')).toBeInTheDocument();
    
    // Check quantities and prices
    expect(screen.getByText('2')).toBeInTheDocument(); // Quantity for Product A
    expect(screen.getByText('USD 5,000')).toBeInTheDocument(); // Total for each product
  });

  it('handles quote creation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipedriveDataView />);

    await waitFor(() => {
      expect(screen.getByText('Create Xero Quote')).toBeInTheDocument();
    });

    // Click create quote button
    await user.click(screen.getByText('Create Xero Quote'));

    // Wait for success message (would be shown via toast in real app)
    await waitFor(() => {
      expect(screen.getByText('Creating Quote...')).toBeInTheDocument();
    });

    // Verify the button returns to normal state after completion
    await waitFor(() => {
      expect(screen.getByText('Create Xero Quote')).toBeInTheDocument();
    });
  });

  it('shows error when deal data is missing', async () => {
    // Mock missing parameters
    jest.spyOn(require('next/navigation'), 'useSearchParams').mockReturnValue(
      new URLSearchParams()
    );

    renderWithProviders(<PipedriveDataView />);

    await waitFor(() => {
      expect(screen.queryByText('Loading deal data...')).not.toBeInTheDocument();
    });

    // Should show error state
    expect(screen.getByText(/Missing company ID or deal ID/)).toBeInTheDocument();
  });

  it('navigates to create project page', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipedriveDataView />);

    await waitFor(() => {
      expect(screen.getByText('Create Project')).toBeInTheDocument();
    });

    const createProjectLink = screen.getByText('Create Project');
    expect(createProjectLink).toHaveAttribute(
      'href',
      '/create-project?companyId=test-company&dealId=123'
    );
  });
});