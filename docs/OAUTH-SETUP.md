# OAuth Setup with ArgoCD + Keycloak

## 1. Configure Keycloak in ArgoCD

Edit `argocd-cm` ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-cm
  namespace: argocd
data:
  url: https://argocd.example.com
  dex.config: |
    connectors:
    - type: oidc
      id: keycloak
      name: Keycloak
      config:
        issuer: https://keycloak.example.com/realms/master
        clientID: argocd
        clientSecret: $KEYCLOAK_CLIENT_SECRET
        redirectURI: https://argocd.example.com/api/dex/callback
        
    staticClients:
    - id: mcp-server
      name: 'MCP Server'
      redirectURIs:
      - 'http://localhost:3000/oauth/callback'
      - 'https://mcp.example.com/oauth/callback'
      secret: <generate-random-secret>
      public: false
```

## 2. Configure MCP Server

Set environment variables:

```bash
export ARGOCD_BASE_URL=https://argocd.example.com
export OAUTH_CLIENT_ID=mcp-server
export OAUTH_CLIENT_SECRET=<secret-from-argocd-cm>
export MCP_BASE_URL=http://localhost:3000
```

## 3. Test OAuth Flow

### Start MCP Server
```bash
pnpm run dev
```

### Initiate OAuth
```bash
# Open in browser
open http://localhost:3000/oauth/authorize
```

This will:
1. Redirect to ArgoCD
2. ArgoCD redirects to Keycloak
3. You login with Keycloak
4. Keycloak redirects to ArgoCD
5. ArgoCD redirects back to MCP with token
6. MCP validates token

### Use Token
```bash
# Token is returned in response
TOKEN=<token-from-oauth>

curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "list_applications",
    "params": {}
  }'
```

## 4. IDE Configuration

Update `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "argocd-mcp": {
      "command": "npx",
      "args": ["argocd-mcp@latest", "http"],
      "env": {
        "ARGOCD_BASE_URL": "https://argocd.example.com",
        "OAUTH_CLIENT_ID": "mcp-server",
        "OAUTH_CLIENT_SECRET": "<secret>",
        "MCP_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

First time: Browser opens for OAuth login
Subsequent: Uses cached token




