require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const express = require('express');
const { x402Logger } = require('/root/x402-activity-monitor');
const cors = require('cors');
const { paymentMiddleware, x402ResourceServer } = require('@x402/express');
const { bazaarResourceServerExtension } = require('@x402/extensions');
const { ExactEvmScheme } = require('@x402/evm/exact/server');
const { HTTPFacilitatorClient } = require('@x402/core/server');

const agentRouter = require('./routes/agent');
const browseRouter = require('./routes/browse');
const { router: registerRouter, REGISTRATION } = require('./routes/register');
const resolveRouter = require('./routes/resolve');
const mcpRouter = require('./routes/mcp');
const openapi = require('./openapi.json');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(x402Logger('agenterc8004-backend'));

const PORT = process.env.PORT || 3029;
const PAY_TO = process.env.PAY_TO_ADDRESS || '0x24FAcafEB49b4e3FACF0B3e69604A2F4640c9bf2';
const X402_NETWORK = process.env.X402_NETWORK || 'eip155:8453';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
const DOMAIN = 'agent.memoryapi.org';

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'agenterc8004', port: PORT, domain: DOMAIN }));

app.get('/openapi.json', (req, res) => res.json(openapi));

// Free: serve our own ERC-8004 registration file (no x402 required)
app.get('/.well-known/agent-registration.json', (req, res) => res.json(REGISTRATION));

app.get('/.well-known/oauth-protected-resource', (req, res) => {
  res.json({ resource: `https://${DOMAIN}/mcp`, authorization_servers: [], bearer_methods_supported: [], resource_documentation: 'https://memoryapi.org' });
});
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.status(404).json({ error: 'No OAuth required.' });
});

// MCP is free (no x402)
app.use('/mcp', mcpRouter);

try {
  const { createFacilitatorConfig } = require('@coinbase/x402');
  const rawConfig = createFacilitatorConfig(process.env.CDP_API_KEY_NAME, process.env.CDP_API_KEY_PRIVATE_KEY);
  const facilitatorClient = new HTTPFacilitatorClient({ url: rawConfig.url, createAuthHeaders: rawConfig.createAuthHeaders });
  const x402Server = new x402ResourceServer(facilitatorClient)
    .register(X402_NETWORK, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension);

  // Normalize x-payment -> payment-signature (x402 extractPayment only checks payment-signature)
  app.use((req, _res, next) => {
    const xpay = req.headers['x-payment'];
    if (xpay && !req.headers['payment-signature']) req.headers['payment-signature'] = xpay;
    next();
  });

  app.use(paymentMiddleware(
    {
      'GET /x402/erc8004/agent': {
        accepts: [{ scheme: 'exact', price: '$0.001', network: X402_NETWORK, payTo: PAY_TO }],
        description: 'Look up an ERC-8004 AI agent identity on Base mainnet. Returns name, description, services, x402 support, and owner.',
        extensions: { bazaar: { info: {
          serviceName: 'MemoryAPI ERC8004',
          tags: ['agents', 'identity', 'blockchain'],
          iconUrl: 'https://memoryapi.org/icon.png',
          description: 'ERC-8004 AI agent identity lookup. Reads from the on-chain Identity Registry on Base (0x8004...). Returns agent registration data including services and x402 support status.',
          input: { type: 'http', method: 'GET',
            queryParams: { id: '1', chain: 'base' },
            schema: { properties: {
              id: { type: 'integer', description: 'Agent token ID (default: 1)' },
              chain: { type: 'string', description: 'Chain (default: base = eip155:8453)' }
            }, required: [] }
          },
          output: { example: { success: true, agent_id: 1, owner: '0x...', name: 'Example Agent', x402_support: true, services: [], active: true, source: 'ERC-8004 Identity Registry on Base' } }
        }}}
      },

      'GET /x402/erc8004/browse': {
        accepts: [{ scheme: 'exact', price: '$0.001', network: X402_NETWORK, payTo: PAY_TO }],
        description: 'Browse ERC-8004 registered AI agents on Base. Filter by x402 payment support.',
        extensions: { bazaar: { info: {
          serviceName: 'MemoryAPI ERC8004',
          tags: ['agents', 'identity', 'blockchain'],
          iconUrl: 'https://memoryapi.org/icon.png',
          description: 'Browse the ERC-8004 agent registry on Base mainnet. Scan agents by token ID range, optionally filtering to only those with x402 micropayment support.',
          input: { type: 'http', method: 'GET',
            queryParams: { x402only: 'false', limit: '20', start_id: '1' },
            schema: { properties: {
              x402only: { type: 'boolean', description: 'Only return agents with x402Support: true' },
              limit: { type: 'integer', description: 'Number of agents to scan (max 50)' },
              start_id: { type: 'integer', description: 'Starting token ID' }
            }, required: [] }
          },
          output: { example: { success: true, total_scanned: 20, x402_enabled_count: 3, agents: [{ agent_id: 1, name: 'Example Agent', x402_support: true, services_count: 5, active: true }] } }
        }}}
      },

      'GET /x402/erc8004/resolve': {
        accepts: [{ scheme: 'exact', price: '$0.002', network: X402_NETWORK, payTo: PAY_TO }],
        description: 'Resolve any agent URL → capabilities, services, x402 endpoints, and identity via ERC-8004 discovery.',
        extensions: { bazaar: { info: {
          serviceName: 'MemoryAPI ERC8004',
          tags: ['agents', 'identity', 'discovery', 'x402'],
          iconUrl: 'https://memoryapi.org/icon.png',
          description: 'Feed in any agent endpoint URL and get back its full capability profile: name, publisher, x402 support, payment endpoints, MCP services, protocols supported, and ERC-8004 token ID if registered on-chain. Tries standard discovery paths (/.well-known/agent-registration.json, agent.json, ai-plugin.json). The DNS lookup for the agentic web.',
          input: { type: 'http', method: 'GET',
            queryParams: { url: 'https://someagent.example.com' },
            schema: { properties: {
              url: { type: 'string', description: 'Agent base URL to resolve (e.g. https://api.memoryapi.org)' }
            }, required: ['url'] }
          },
          output: { example: { url: 'https://api.memoryapi.org', resolved: true, name: 'MemoryAPI Agent', x402Support: true, x402Network: 'eip155:8453', capabilities: ['x402-payments', 'mcp'], servicesCount: 28, services: [{ name: 'Memory API', endpoint: 'https://api.memoryapi.org/mcp', protocol: 'mcp', x402: true }] } }
        }}}
      },
      'GET /x402/erc8004/register': {
        accepts: [{ scheme: 'exact', price: '$0.001', network: X402_NETWORK, payTo: PAY_TO }],
        description: 'Get ERC-8004 registration JSON for memoryapi.org — a complete example of an AI agent registration file with 28 MCP services and x402 support.',
        extensions: { bazaar: { info: {
          serviceName: 'MemoryAPI ERC8004',
          tags: ['agents', 'identity', 'blockchain'],
          iconUrl: 'https://memoryapi.org/icon.png',
          description: 'Returns the full ERC-8004 registration template for memoryapi.org. Use this as a reference to create your own agent registration. Includes 28 MCP endpoints and x402Support: true.',
          input: { type: 'http', method: 'GET', queryParams: {}, schema: { properties: {}, required: [] } },
          output: { example: { name: 'MemoryAPI Agent', x402Support: true, services: [{ name: 'Memory API', endpoint: 'https://api.memoryapi.org/mcp' }] } }
        }}}
      }
    },
    x402Server,
    { afterSettle: (req, res, next, s) => { const e = s?.extensionResponses; if (e) console.log('[CDP] EXTENSION-RESPONSES:', JSON.stringify(e)); next(); } },
    null, true
  ));

  console.log('✅ x402 payment middleware registered');
} catch (err) {
  console.warn('⚠️  x402 middleware skipped:', err.message);
}

app.use('/x402/erc8004/agent', agentRouter);
app.use('/x402/erc8004/browse', browseRouter);
app.use('/x402/erc8004/register', registerRouter);
app.use('/x402/erc8004/resolve', resolveRouter);

app.listen(PORT, () => console.log(`AgentERC8004 running on port ${PORT} — domain: ${DOMAIN}`));
