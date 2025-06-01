# pipedrive-oauth-example

Pipedrive OAuth 2.0 handshake example

## Features

- Demonstrates Pipedrive OAuth 2.0 handshake.
- Demonstrates Xero OAuth 2.0 handshake.
- Provides API endpoints for:
    - Handling Pipedrive actions (App Extensions).
    - Fetching data from Pipedrive.
    - Checking Xero connection status.
    - Creating Quotes in Xero.

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```
2.  Navigate to the project directory:
    ```bash
    cd pipedrive-oauth-example
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

## Configuration

This application uses environment variables for configuration. Create a `.env` file in the root of the project with the following variables:

```env
# Pipedrive API Credentials
CLIENT_ID=your_pipedrive_client_id
CLIENT_SECRET=your_pipedrive_client_secret
REDIRECT_URI=your_pipedrive_redirect_uri

# Xero API Credentials
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=your_xero_redirect_uri

# Pipedrive Custom Field for Xero Quote Number
# (The API key for the custom field in Pipedrive where the Xero Quote number will be stored)
PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY=your_pipedrive_custom_field_key

# Xero Defaults for Quote Line Items
XERO_DEFAULT_ACCOUNT_CODE=200 # Example: Sales account code
XERO_DEFAULT_TAX_TYPE=NONE # Example: Tax rate identifier (e.g., NONE, ZERORATED, etc.)

# Server Port (Optional)
# PORT=3000
```

**Note:**
- The `REDIRECT_URI` for Pipedrive should match the one configured in your Pipedrive app settings (e.g., `http://localhost:3000/callback`).
- The `XERO_REDIRECT_URI` for Xero should match the one configured in your Xero app settings (e.g., `http://localhost:3000/xero-callback`).
- Obtain the Pipedrive and Xero API credentials from their respective developer portals.
- The `PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY` is the key of a custom field you need to create in Pipedrive (usually on the Deal entity) to store the Xero Quote number.

## Running the Application

1.  Ensure you have configured your `.env` file as described in the "Configuration" section.
2.  Start the server:
    ```bash
    npm start
    ```
3.  The application will be running on `http://localhost:3000` (or the port specified in your `.env` file).

## API Endpoints

The application exposes the following REST API endpoints:

### Authentication

-   **`GET /`**: Initiates the Pipedrive OAuth 2.0 authentication flow.
    -   Redirects the user to the Pipedrive authorization URL.
-   **`GET /callback`**: Handles the callback from Pipedrive after authentication.
    -   Exchanges the authorization code for access and refresh tokens.
    -   Stores the tokens and Pipedrive company ID.
-   **`GET /connect-xero`**: Initiates the Xero OAuth 2.0 authentication flow.
    -   Requires a `pipedriveCompanyId` query parameter to associate the Xero connection.
    -   Redirects the user to the Xero authorization URL.
-   **`GET /xero-callback`**: Handles the callback from Xero after authentication.
    -   Exchanges the authorization code for access and refresh tokens.
    -   Stores the Xero tokens, tenant ID, and associates them with the Pipedrive company ID.

### Pipedrive

-   **`GET /pipedrive-action`**: Handles actions triggered from a Pipedrive App Extension.
    -   Expects `companyId` and `selectedIds` (e.g., deal ID) query parameters from Pipedrive.
    -   Redirects to a frontend URL (`http://localhost:3001/pipedrive-data-view` by default) with the Pipedrive data.
-   **`GET /api/pipedrive-data`**: Fetches details for a specific Pipedrive deal, including associated person, organization, and products.
    -   Query Parameters:
        -   `dealId`: The ID of the Pipedrive deal.
        -   `companyId`: The Pipedrive company ID.
    -   Responds with a JSON object containing deal, person, organization, and product details.

### Xero

-   **`GET /api/xero/status`**: Checks the Xero connection status for a given Pipedrive company ID.
    -   Query Parameters:
        -   `pipedriveCompanyId`: The Pipedrive company ID.
    -   Responds with a JSON object indicating if Xero is connected (`isConnected: true/false`) and if it needs reconnection (`needsReconnect: true/false`).
-   **`POST /api/xero/create-quote`**: Creates a new quote in Xero based on Pipedrive deal data.
    -   Request Body (JSON):
        -   `pipedriveCompanyId`: The Pipedrive company ID.
        -   `pipedriveDealId`: The ID of the Pipedrive deal to create the quote from.
    -   Functionality:
        1.  Fetches deal, organization, person, and product details from Pipedrive.
        2.  Finds or creates a corresponding contact in Xero (based on Pipedrive organization name).
        3.  Prepares line items for the Xero quote from Pipedrive deal products (or deal value if no products).
        4.  Creates a draft quote in Xero.
        5.  Updates the Pipedrive deal with the Xero quote number (if `PIPEDRIVE_QUOTE_CUSTOM_FIELD_KEY` is configured).
    -   Responds with a JSON object containing the created quote details and status.
