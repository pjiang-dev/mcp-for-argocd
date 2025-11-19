# OAuth Authentication

The MCP server now supports OAuth 2.0 authentication using the MCP SDK's built-in OAuth capabilities. This allows users to authenticate via ArgoCD's Dex SSO (which can be configured with various identity providers like Keycloak, Google, Okta, etc.).

## Features

- **OAuth 2.0 Support**: Full OAuth 2.0 authorization code flow
- **Dex Integration**: Works with ArgoCD's Dex SSO
- **Token Verification**: Validates tokens with ArgoCD
- **Multiple Auth Methods**: Supports OAuth tokens, API tokens, and environment variable tokens
- **Health Endpoints**: Check OAuth configuration status

## Quick Start

### 1. Configure ArgoCD

Register the MCP server as an OAuth client in your ArgoCD instance. See [OAUTH-SETUP.md](./OAUTH-SETUP.md) for detailed instructions.

### 2. Set Environment Variables

```bash
export ARGOCD_BASE_URL=https://argocd.example.com
export OAUTH_CLIENT_ID=mcp-server
export OAUTH_CLIENT_SECRET=<your-secret>
export MCP_BASE_URL=http://localhost:3000
```

### 3. Start MCP Server

```bash
pnpm run dev
```

### 4. Authenticate

Open your browser to: http://localhost:3000/oauth/authorize

This will redirect you through the OAuth flow:
1. ArgoCD login page
2. Identity provider (Keycloak/Google/etc)
3. Back to MCP with token

## Authentication Methods

The MCP server supports three authentication methods (in order of priority):

### 1. OAuth Bearer Token (Recommended for Users)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer <oauth-token>" \
  -H "Content-Type: application/json" \
  -d '{"method": "list_applications"}'
```

### 2. API Token Header (Good for Services)
```bash
curl -X POST http://localhost:3000/mcp \
  -H "x-argocd-api-token: <api-token>" \
  -H "Content-Type: application/json" \
  -d '{"method": "list_applications"}'
```

### 3. Environment Variable (Fallback)
```bash
export ARGOCD_API_TOKEN=<token>
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"method": "list_applications"}'
```

## Health Check

Check if OAuth is properly configured:

```bash
curl http://localhost:3000/readiness
```

Response:
```json
{
  "status": "ready",
  "oauth_enabled": true,
  "argocd_url": "https://argocd.example.com"
}
```

## OAuth Endpoints

The MCP server exposes the following OAuth endpoints:

- `GET /oauth/authorize` - Start OAuth flow
- `GET /oauth/callback` - OAuth callback (handled by MCP SDK)
- `POST /oauth/token` - Token endpoint (handled by MCP SDK)
- `POST /oauth/revoke` - Revoke token (handled by MCP SDK)

## Security Considerations

1. **HTTPS Required**: OAuth should be used over HTTPS in production
2. **Client Secret**: Keep `OAUTH_CLIENT_SECRET` secure
3. **Token Storage**: Tokens are handled by the MCP SDK
4. **Token Verification**: All tokens are verified with ArgoCD

## Troubleshooting

See [TESTING-OAUTH.md](./TESTING-OAUTH.md) for detailed troubleshooting steps.

### Common Issues

**OAuth not enabled**
- Verify all environment variables are set
- Check `/readiness` endpoint

**Invalid redirect URI**
- Ensure `MCP_BASE_URL` matches the redirect URI in ArgoCD config

**Token verification failed**
- Check `ARGOCD_BASE_URL` is correct
- Verify token is valid: `curl <argocd>/api/v1/session/userinfo -H "Authorization: Bearer <token>"`

## For Developers

### OAuth Provider Implementation

The OAuth provider is implemented using MCP SDK's `ProxyOAuthServerProvider`:

```typescript
const oauthProvider = new ProxyOAuthServerProvider({
  endpoints: {
    authorizationUrl: `${argocdUrl}/api/dex/auth`,
    tokenUrl: `${argocdUrl}/api/dex/token`,
    revocationUrl: `${argocdUrl}/api/dex/revoke`
  },
  verifyAccessToken: async (token) => {
    // Verify with ArgoCD
  },
  getClient: async (client_id) => {
    // Validate client
  }
});
```

### Adding Custom OAuth Logic

To customize OAuth behavior, modify `src/server/transport.ts`:

1. Update `verifyAccessToken` to add custom validation
2. Modify `getClient` to support multiple clients
3. Add custom metadata to the token response

## Next Steps

- [Setup Guide](./OAUTH-SETUP.md) - Configure ArgoCD and Keycloak
- [Testing Guide](./TESTING-OAUTH.md) - Test OAuth locally
- [Environment Variables](./env.example) - Configuration reference




