# Testing OAuth Locally

## Prerequisites

1. ArgoCD instance with Keycloak configured
2. MCP server registered in ArgoCD as OAuth client
3. Node.js 20+

## Quick Start

1. **Clone and install**
```bash
git clone https://github.com/argoproj-labs/mcp-for-argocd.git
cd mcp-for-argocd
pnpm install
```

2. **Configure environment**
```bash
# Create .env file
cat > .env << EOF
ARGOCD_BASE_URL=https://argocd.example.com
OAUTH_CLIENT_ID=mcp-server
OAUTH_CLIENT_SECRET=<your-secret-here>
MCP_BASE_URL=http://localhost:3000
EOF
```

3. **Start server**
```bash
pnpm run dev
```

4. **Test OAuth in browser**
```bash
open http://localhost:3000/oauth/authorize
```

5. **Check token**
After OAuth completes, you'll receive a token. Test it:
```bash
TOKEN=<your-token>

curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Troubleshooting

### "Invalid redirect URI"
- Check `redirectURIs` in ArgoCD ConfigMap matches MCP_BASE_URL
- Common issue: http vs https mismatch

### "Token verification failed"
- Check ARGOCD_BASE_URL is correct
- Test manually: `curl https://argocd.example.com/api/v1/session/userinfo -H "Authorization: Bearer $TOKEN"`

### "Invalid client"
- Verify OAUTH_CLIENT_ID matches ArgoCD ConfigMap
- Verify OAUTH_CLIENT_SECRET matches

### OAuth not enabled
- Check `/readiness` endpoint:
```bash
curl http://localhost:3000/readiness
```
- Should show `oauth_enabled: true`
- If false, check environment variables are set correctly

## Testing with curl

### 1. Get OAuth authorize URL
```bash
curl http://localhost:3000/oauth/authorize
```

### 2. Complete OAuth flow in browser
Follow the redirects to Keycloak and back

### 3. Use the returned token
```bash
# Test with token
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

## Testing without OAuth

If OAuth is not configured, you can still use API tokens:

```bash
curl -X POST http://localhost:3000/mcp \
  -H "x-argocd-api-token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name":"test","version":"1.0"}
    }
  }'
```




