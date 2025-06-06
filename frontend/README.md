# Pipedrive-Xero Frontend Application

A modern Next.js frontend application for integrating Pipedrive CRM with Xero accounting software.

## 🚀 Features

- **OAuth Authentication**: Secure authentication flows for both Pipedrive and Xero
- **Deal Management**: View and manage Pipedrive deals with detailed information
- **Quote Creation**: Generate Xero quotes directly from Pipedrive deals
- **Project Creation**: Create and link projects between both platforms
- **Real-time Status**: Live connection status for both services
- **Responsive Design**: Beautiful UI that works on all devices
- **Error Handling**: Comprehensive error handling with user-friendly messages

## 📋 Prerequisites

- Node.js 16.x or higher
- npm or yarn
- Backend API running on port 3000

## 🛠️ Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment variables:
```bash
cp .env.local.example .env.local
```

3. Update `.env.local` with your configuration:
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_FRONTEND_BASE_URL=http://localhost:3001
```

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run dev
```
The application will be available at [http://localhost:3001](http://localhost:3001)

### Production Build
```bash
npm run build
npm run start
```

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── app/                    # Next.js 13+ app directory
│   │   ├── auth/              # Authentication pages
│   │   ├── pipedrive-data-view/ # Deal viewing page
│   │   ├── create-project/    # Project creation page
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Home page
│   │   └── providers.tsx      # App providers
│   ├── components/            # Reusable components
│   ├── services/              # API service layer
│   ├── store/                 # State management (Zustand)
│   ├── types/                 # TypeScript types
│   ├── utils/                 # Utility functions
│   └── hooks/                 # Custom React hooks
├── public/                    # Static assets
└── __tests__/                # Test files
```

## 🔑 Key Technologies

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first CSS framework
- **Zustand**: Lightweight state management
- **React Query**: Server state management
- **Axios**: HTTP client
- **React Hook Form**: Form handling
- **Zod**: Schema validation
- **Jest & React Testing Library**: Testing

## 📱 Pages Overview

### Home Page (`/`)
- Authentication status display
- Quick actions to connect services
- Navigation to main features

### Authentication Pages
- `/auth/pipedrive/success`: Pipedrive OAuth callback
- `/auth/xero/success`: Xero OAuth callback
- `/auth/pipedrive/error`: Error handling
- `/auth/xero/error`: Error handling

### Deal Management (`/pipedrive-data-view`)
- View deal details
- Display associated contacts and products
- Create Xero quotes
- Navigate to project creation

### Project Creation (`/create-project`)
- Create new projects
- Link to existing projects
- Integration with Xero projects

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Backend API URL | `http://localhost:3000` |
| `NEXT_PUBLIC_FRONTEND_BASE_URL` | Frontend base URL | `http://localhost:3001` |

### API Integration

The frontend communicates with the backend through a centralized API service layer (`src/services/api.ts`). All API calls include:

- Automatic error handling
- Request/response logging (development)
- Authentication token management
- CORS configuration

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

## 🚀 Deployment

### Vercel (Recommended)
1. Push your code to GitHub
2. Import project in Vercel
3. Configure environment variables
4. Deploy

### Docker
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
RUN npm ci --production
EXPOSE 3001
CMD ["npm", "start"]
```

## 🐛 Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure backend CORS configuration includes frontend URL
   - Check API_BASE_URL environment variable

2. **Authentication Failures**
   - Verify OAuth redirect URLs are configured correctly
   - Check backend is running and accessible

3. **API Connection Issues**
   - Confirm backend is running on port 3000
   - Check network connectivity
   - Verify environment variables

## 📝 Best Practices

1. **State Management**
   - Use Zustand for global state
   - React Query for server state
   - Local state for component-specific data

2. **Error Handling**
   - Always use try-catch blocks
   - Show user-friendly error messages
   - Log errors for debugging

3. **Performance**
   - Lazy load routes
   - Optimize images
   - Use React Query caching

4. **Security**
   - Never store sensitive data in localStorage
   - Always validate user input
   - Use HTTPS in production

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write/update tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.