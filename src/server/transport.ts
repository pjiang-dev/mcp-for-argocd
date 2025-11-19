import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { logger } from '../logging/logging.js';
import { createServer } from './server.js';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { ProxyOAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';

export const connectStdioTransport = () => {
  const server = createServer({
    argocdBaseUrl: process.env.ARGOCD_BASE_URL || '',
    argocdApiToken: process.env.ARGOCD_API_TOKEN || ''
  });

  logger.info('Connecting to stdio transport');
  server.connect(new StdioServerTransport());
};

export const connectSSETransport = (port: number) => {
  const app = express();
  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get('/sse', async (req, res) => {
    const server = createServer({
      argocdBaseUrl: (req.headers['x-argocd-base-url'] as string) || '',
      argocdApiToken: (req.headers['x-argocd-api-token'] as string) || ''
    });

    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    res.on('close', () => {
      delete transports[transport.sessionId];
    });
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send(`No transport found for sessionId: ${sessionId}`);
    }
  });

  logger.info(`Connecting to SSE transport on port: ${port}`);
  app.listen(port);
};

export const connectHttpTransport = (port: number) => {
  const app = express();
  app.use(express.json());

  // OAuth Configuration
  const argocdUrl = process.env.ARGOCD_BASE_URL || '';
  const oauthClientId = process.env.OAUTH_CLIENT_ID || 'mcp-server';
  const oauthClientSecret = process.env.OAUTH_CLIENT_SECRET || '';
  const mcpBaseUrl = process.env.MCP_BASE_URL || `http://localhost:${port}`;

  // Only set up OAuth if we have the required configuration
  if (argocdUrl && oauthClientId && oauthClientSecret) {
    // Create OAuth provider for ArgoCD
    const oauthProvider = new ProxyOAuthServerProvider({
      endpoints: {
        authorizationUrl: `${argocdUrl}/api/dex/auth`,
        tokenUrl: `${argocdUrl}/api/dex/token`,
        revocationUrl: `${argocdUrl}/api/dex/revoke`
      },
      verifyAccessToken: async (token) => {
        // Verify token with ArgoCD
        try {
          const response = await fetch(`${argocdUrl}/api/v1/session/userinfo`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!response.ok) {
            throw new Error('Invalid token');
          }

          const userInfo = await response.json();

          return {
            token,
            clientId: oauthClientId,
            scopes: ['openid', 'email', 'profile', 'groups'],
            metadata: {
              username: userInfo.username,
              email: userInfo.email,
              groups: userInfo.groups
            }
          };
        } catch (error) {
          throw new Error('Token verification failed');
        }
      },
      getClient: async (client_id) => {
        if (client_id !== oauthClientId) {
          throw new Error('Invalid client');
        }

        return {
          client_id,
          redirect_uris: [
            `${mcpBaseUrl}/oauth/callback`,
            'http://localhost:3000/oauth/callback'
          ]
        };
      }
    });

    // Mount OAuth router
    const authRouter = mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: new URL(argocdUrl),
      baseUrl: new URL(mcpBaseUrl),
      serviceDocumentationUrl: new URL(
        'https://github.com/argoproj-labs/mcp-for-argocd'
      )
    });

    app.use('/oauth', authRouter);

    logger.info(`OAuth configured for ArgoCD: ${argocdUrl}`);
  } else {
    logger.info('OAuth not configured - missing required environment variables');
  }

  // Health endpoints
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: Date.now()
    });
  });

  app.get('/readiness', (req, res) => {
    res.status(200).json({
      status: 'ready',
      oauth_enabled: !!(argocdUrl && oauthClientId && oauthClientSecret),
      argocd_url: argocdUrl
    });
  });

  const httpTransports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  app.post('/mcp', async (req, res) => {
    const sessionIdFromHeader = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionIdFromHeader && httpTransports[sessionIdFromHeader]) {
      transport = httpTransports[sessionIdFromHeader];
    } else if (!sessionIdFromHeader && isInitializeRequest(req.body)) {
      // Get token from three possible sources:
      // 1. Authorization: Bearer <token> (OAuth)
      // 2. x-argocd-api-token header (API token)
      // 3. ARGOCD_API_TOKEN env var (fallback)

      const authHeader = req.headers['authorization'] as string | undefined;
      const bearerToken = authHeader?.startsWith('Bearer ')
        ? authHeader.substring(7)
        : undefined;

      const argocdApiToken =
        bearerToken ||
        (req.headers['x-argocd-api-token'] as string) ||
        process.env.ARGOCD_API_TOKEN ||
        '';

      if (!argocdApiToken) {
        res.status(401).json({
          error: 'authentication_required',
          message: 'Authentication required. Use OAuth or provide x-argocd-api-token header.',
          oauth_url: '/oauth/authorize'
        });
        return;
      }

      // Use URL from header if provided, otherwise from env
      const argocdBaseUrl =
        (req.headers['x-argocd-base-url'] as string) ||
        process.env.ARGOCD_BASE_URL ||
        '';

      if (!argocdBaseUrl) {
        res.status(400).json({
          error: 'missing_argocd_url',
          message: 'ARGOCD_BASE_URL not configured'
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (newSessionId) => {
          httpTransports[newSessionId] = transport;
        }
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete httpTransports[transport.sessionId];
        }
      };

      const server = createServer({
        argocdBaseUrl,
        argocdApiToken
      });

      await server.connect(transport);

      logger.info('Session initialized with token');
    } else {
      const errorMsg = sessionIdFromHeader
        ? `Invalid or expired session ID: ${sessionIdFromHeader}`
        : 'Bad Request: Not an initialization request and no valid session ID provided.';
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: errorMsg
        },
        id: req.body?.id !== undefined ? req.body.id : null
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req: express.Request, res: express.Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !httpTransports[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = httpTransports[sessionId];
    await transport.handleRequest(req, res);
  };

  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  logger.info(`Connecting to Http Stream transport on port: ${port}`);
  app.listen(port);
};
