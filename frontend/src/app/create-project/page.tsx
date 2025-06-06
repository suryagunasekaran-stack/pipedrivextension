'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { apiService } from '@/services/api';
import { CreateProjectRequest } from '@/types/api';
import { Loader2, FileText, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { showError, showSuccess } from '@/utils/errorHandler';
import Link from 'next/link';

// Form validation schema
const projectFormSchema = z.object({
  existingProjectNumberToLink: z.string().optional(),
  createNewProject: z.boolean(),
});

type ProjectFormData = z.infer<typeof projectFormSchema>;

export default function CreateProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');
  const dealId = searchParams.get('dealId');
  
  const [isCreating, setIsCreating] = useState(false);
  const [projectCreated, setProjectCreated] = useState(false);
  const [projectResult, setProjectResult] = useState<any>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      createNewProject: true,
    },
  });

  const createNewProject = watch('createNewProject');

  useEffect(() => {
    if (!companyId || !dealId) {
      showError('Missing required parameters');
      router.push('/');
    }
  }, [companyId, dealId, router]);

  const onSubmit = async (data: ProjectFormData) => {
    if (!companyId || !dealId) return;

    setIsCreating(true);
    try {
      const request: CreateProjectRequest = {
        pipedriveDealId: dealId,
        pipedriveCompanyId: companyId,
      };

      if (!data.createNewProject && data.existingProjectNumberToLink) {
        request.existingProjectNumberToLink = data.existingProjectNumberToLink;
      }

      const result = await apiService.createProject(request);
      
      setProjectResult(result);
      setProjectCreated(true);
      
      showSuccess(
        `Project ${result.projectNumber} created successfully!`,
        'Project Created'
      );
    } catch (error) {
      showError(error, 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  if (projectCreated && projectResult) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 py-8">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold mb-2">Project Created Successfully!</h1>
              <p className="text-xl text-gray-600">
                Project Number: <span className="font-mono font-bold">{projectResult.projectNumber}</span>
              </p>
            </div>

            {/* Project Details */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Deal Information */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold mb-3">Deal Information</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Deal Name:</dt>
                    <dd className="font-medium">{projectResult.deal?.title}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Deal Value:</dt>
                    <dd className="font-medium">
                      {projectResult.deal?.currency} {projectResult.deal?.value?.toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-600">Organization:</dt>
                    <dd className="font-medium">{projectResult.organization?.name}</dd>
                  </div>
                </dl>
              </div>

              {/* Xero Integration Status */}
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="font-semibold mb-3">Xero Integration</h3>
                {projectResult.xero?.projectCreated ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>Project created in Xero</span>
                    </div>
                    {projectResult.xero.projectName && (
                      <p className="text-gray-600">
                        Project Name: {projectResult.xero.projectName}
                      </p>
                    )}
                    {projectResult.xero.tasksCreated && projectResult.xero.tasksCreated.length > 0 && (
                      <p className="text-gray-600">
                        Tasks Created: {projectResult.xero.tasksCreated.length}
                      </p>
                    )}
                    {projectResult.xero.quoteAccepted && (
                      <p className="text-green-600">✓ Quote accepted</p>
                    )}
                  </div>
                ) : (
                  <div className="text-yellow-600">
                    <AlertCircle className="h-4 w-4 inline mr-2" />
                    Xero integration pending or not configured
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href={`/pipedrive-data-view?companyId=${companyId}&dealId=${dealId}`}
                className="btn-primary"
              >
                View Deal Details
              </Link>
              <Link href="/" className="btn-outline">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-8">Create Project</h1>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Project Type Selection */}
            <div className="space-y-4">
              <label className="block">
                <input
                  type="radio"
                  {...register('createNewProject')}
                  value="true"
                  className="mr-2"
                />
                Create New Project
              </label>
              
              <label className="block">
                <input
                  type="radio"
                  {...register('createNewProject')}
                  value="false"
                  className="mr-2"
                />
                Link to Existing Project
              </label>
            </div>

            {/* Existing Project Number Input */}
            {!createNewProject && (
              <div>
                <label htmlFor="existingProjectNumber" className="block text-sm font-medium mb-2">
                  Existing Project Number
                </label>
                <input
                  id="existingProjectNumber"
                  type="text"
                  {...register('existingProjectNumberToLink')}
                  placeholder="e.g., NY25001"
                  className="input w-full"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Enter the project number you want to link this deal to
                </p>
              </div>
            )}

            {/* Information Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">What happens next?</p>
                  <ul className="space-y-1 text-blue-700">
                    {createNewProject ? (
                      <>
                        <li>• A new project will be created with a unique project number</li>
                        <li>• Deal information will be synced to the project</li>
                        <li>• If Xero is connected, a project will be created there too</li>
                        <li>• Products from the deal will be added as tasks in Xero</li>
                      </>
                    ) : (
                      <>
                        <li>• The deal will be linked to the existing project</li>
                        <li>• Deal information will be added to the project</li>
                        <li>• No new project will be created in Xero</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Deal Information Preview */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-2">Deal Information</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Deal ID:</dt>
                  <dd className="font-mono">{dealId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Company ID:</dt>
                  <dd className="font-mono">{companyId}</dd>
                </div>
              </dl>
            </div>

            {/* Form Actions */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={isCreating}
                className="btn-primary flex-1 flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Project...
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Create Project
                  </>
                )}
              </button>
              
              <Link
                href={`/pipedrive-data-view?companyId=${companyId}&dealId=${dealId}`}
                className="btn-outline flex-1 text-center"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}