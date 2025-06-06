'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiService } from '@/services/api';
import { PipedriveDataResponse, CreateQuoteResponse } from '@/types/api';
import { Loader2, Package, User, Building, DollarSign, FileText, AlertCircle } from 'lucide-react';
import { showError, showSuccess, showLoading } from '@/utils/errorHandler';
import Link from 'next/link';

export default function PipedriveDataView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');
  const dealId = searchParams.get('dealId');
  
  const [dealData, setDealData] = useState<PipedriveDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingQuote, setCreatingQuote] = useState(false);

  useEffect(() => {
    if (companyId && dealId) {
      loadDealData(companyId, dealId);
    } else {
      showError('Missing company ID or deal ID');
      setLoading(false);
    }
  }, [companyId, dealId]);

  const loadDealData = async (companyId: string, dealId: string) => {
    try {
      setLoading(true);
      const data = await apiService.getPipedriveData(companyId, dealId);
      setDealData(data);
    } catch (error) {
      showError(error, 'Failed to load deal data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuote = async () => {
    if (!companyId || !dealId) return;

    setCreatingQuote(true);
    try {
      const result = await showLoading(
        apiService.createXeroQuote({
          pipedriveCompanyId: companyId,
          pipedriveDealId: dealId,
        }),
        {
          loading: 'Creating quote in Xero...',
          success: (data: CreateQuoteResponse) => 
            `Quote ${data.quoteNumber} created successfully!`,
          error: 'Failed to create quote',
        }
      );

      // Reload deal data to show updated quote number
      await loadDealData(companyId, dealId);
    } finally {
      setCreatingQuote(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-gray-600">Loading deal data...</p>
        </div>
      </div>
    );
  }

  if (!dealData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">No Deal Data Found</h2>
          <p className="text-gray-600 mb-6">
            We couldn't find the deal information you're looking for.
          </p>
          <Link href="/" className="btn-primary">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { deal, person, organization, products } = dealData;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{deal.title}</h1>
              <div className="flex items-center gap-4 mt-2">
                <span className={`badge ${deal.status === 'won' ? 'badge-success' : deal.status === 'lost' ? 'badge-error' : 'badge-warning'}`}>
                  {deal.status}
                </span>
                <span className="text-gray-500">Deal ID: {deal.id}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Value</p>
              <p className="text-2xl font-bold text-primary">
                {deal.currency} {deal.value.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Deal Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Organization Info */}
            {organization && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Building className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Organization</h2>
                </div>
                <div className="space-y-2">
                  <p className="text-gray-900 font-medium">{organization.name}</p>
                  {organization.address && (
                    <p className="text-gray-600 text-sm">{organization.address}</p>
                  )}
                </div>
              </div>
            )}

            {/* Contact Person */}
            {person && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <User className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Contact Person</h2>
                </div>
                <div className="space-y-2">
                  <p className="text-gray-900 font-medium">{person.name}</p>
                  {person.email?.[0] && (
                    <p className="text-gray-600 text-sm">
                      Email: {person.email[0].value}
                    </p>
                  )}
                  {person.phone?.[0] && (
                    <p className="text-gray-600 text-sm">
                      Phone: {person.phone[0].value}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Products */}
            {products && products.length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Package className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-semibold">Products</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b">
                      <tr>
                        <th className="text-left py-2 text-sm font-medium text-gray-700">Product</th>
                        <th className="text-right py-2 text-sm font-medium text-gray-700">Qty</th>
                        <th className="text-right py-2 text-sm font-medium text-gray-700">Price</th>
                        <th className="text-right py-2 text-sm font-medium text-gray-700">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id} className="border-b">
                          <td className="py-3">{product.name}</td>
                          <td className="py-3 text-right">{product.quantity}</td>
                          <td className="py-3 text-right">
                            {deal.currency} {product.item_price.toLocaleString()}
                          </td>
                          <td className="py-3 text-right font-medium">
                            {deal.currency} {product.sum.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} className="py-3 text-right font-semibold">
                          Total:
                        </td>
                        <td className="py-3 text-right font-bold text-primary">
                          {deal.currency} {products.reduce((sum, p) => sum + p.sum, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Actions */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={handleCreateQuote}
                  disabled={creatingQuote}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {creatingQuote ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating Quote...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Create Xero Quote
                    </>
                  )}
                </button>

                <Link
                  href={`/create-project?companyId=${companyId}&dealId=${dealId}`}
                  className="btn-secondary w-full flex items-center justify-center gap-2"
                >
                  <Package className="h-4 w-4" />
                  Create Project
                </Link>
              </div>
            </div>

            {/* Deal Summary */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Deal Summary</h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium">{deal.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Organization:</span>
                  <span className="font-medium">{deal.org_id?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Currency:</span>
                  <span className="font-medium">{deal.currency}</span>
                </div>
                {deal.expected_close_date && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Expected Close:</span>
                    <span className="font-medium">
                      {new Date(deal.expected_close_date).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Custom Fields */}
            {Object.keys(deal).filter(key => 
              !['id', 'title', 'value', 'currency', 'status', 'org_id', 'person_id'].includes(key)
            ).length > 0 && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Additional Info</h2>
                <div className="space-y-2 text-sm">
                  {Object.entries(deal)
                    .filter(([key]) => 
                      !['id', 'title', 'value', 'currency', 'status', 'org_id', 'person_id'].includes(key)
                    )
                    .map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <span className="text-gray-600">{key}:</span>
                        <span className="font-medium">
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Back Button */}
        <div className="mt-8">
          <Link href="/" className="btn-ghost">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}