const express = require('express');
const axios = require('axios');
const router = express.Router();
const { REGISTRATION } = require('./register');

const IDENTITY_REGISTRY = process.env.IDENTITY_REGISTRY || '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';

function padUint256(n) {
  return BigInt(n).toString(16).padStart(64, '0');
}

function decodeABIString(hexResult) {
  if (!hexResult || hexResult.length < 130) return null;
  const clean = hexResult.startsWith('0x') ? hexResult.slice(2) : hexResult;
  const length = parseInt(clean.slice(64, 128), 16);
  if (length === 0) return null;
  return Buffer.from(clean.slice(128, 128 + length * 2), 'hex').toString('utf-8');
}

function decodeAgentURI(uri) {
  if (!uri) return null;
  if (uri.includes('base64,')) {
    try {
      const b64 = uri.split('base64,')[1];
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
    } catch { return null; }
  }
  return null;
}

async function alchemyCall(method, params) {
  const url = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const { data } = await axios.post(url, {
    jsonrpc: '2.0', id: 1, method, params
  }, { timeout: 10000 });
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

const TOOLS = [
  {
    name: 'get_agent_identity',
    description: 'Look up an ERC-8004 AI agent by token ID on Base mainnet. Returns the agent\'s name, description, services, x402 payment support status, and owner address from the on-chain identity registry.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Agent token ID (default: 1)', default: 1 },
        chain: { type: 'string', description: 'Chain (default: base = eip155:8453)', default: 'base' }
      }
    }
  },
  {
    name: 'browse_erc8004_agents',
    description: 'Browse ERC-8004 registered AI agents on Base mainnet. Filter to only show agents with x402 payment support. Returns name, services count, and active status for each agent.',
    inputSchema: {
      type: 'object',
      properties: {
        x402only: { type: 'boolean', description: 'Only return agents with x402Support: true', default: false },
        limit: { type: 'number', description: 'Number of agents to scan (max 50)', default: 20 },
        start_id: { type: 'number', description: 'Starting agent token ID', default: 1 }
      }
    }
  },
  {
    name: 'get_registration_template',
    description: 'Get the ERC-8004 compatible registration JSON for memoryapi.org. This is the template/example showing how to register an AI agent with x402 support on Base.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function executeTool(name, args) {
  switch (name) {
    case 'get_agent_identity': {
      const agentId = parseInt(args.id) || 1;
      const tokenURIData = '0xc87b56dd' + padUint256(agentId);
      const ownerData = '0x6352211e' + padUint256(agentId);
      const [uriResult, ownerResult] = await Promise.all([
        alchemyCall('eth_call', [{ to: IDENTITY_REGISTRY, data: tokenURIData }, 'latest']),
        alchemyCall('eth_call', [{ to: IDENTITY_REGISTRY, data: ownerData }, 'latest']).catch(() => '0x')
      ]);
      const rawUri = decodeABIString(uriResult);
      if (!rawUri) throw new Error(`Agent ${agentId} not found`);
      let registration = decodeAgentURI(rawUri);
      if (!registration && rawUri.startsWith('http')) {
        const { data } = await axios.get(rawUri, { timeout: 8000 });
        registration = data;
      }
      const owner = ownerResult && ownerResult !== '0x' ? '0x' + ownerResult.slice(-40) : 'unknown';
      return {
        success: true,
        agent_id: agentId,
        owner,
        name: registration?.name || null,
        description: registration?.description || null,
        x402_support: registration?.x402Support || false,
        services: registration?.services || [],
        active: registration?.active !== undefined ? registration.active : true,
        raw_uri: rawUri,
        source: 'ERC-8004 Identity Registry on Base'
      };
    }

    case 'browse_erc8004_agents': {
      const x402only = args.x402only || false;
      const limit = Math.min(parseInt(args.limit) || 20, 50);
      const startId = parseInt(args.start_id) || 1;
      const tokenIds = Array.from({ length: limit }, (_, i) => startId + i);
      const url = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
      const requests = tokenIds.map((id, i) => ({
        jsonrpc: '2.0', id: i, method: 'eth_call',
        params: [{ to: IDENTITY_REGISTRY, data: '0xc87b56dd' + padUint256(id) }, 'latest']
      }));
      const { data: batchData } = await axios.post(url, requests, { timeout: 15000 });
      const agents = [];
      let x402Count = 0;
      for (let i = 0; i < batchData.length; i++) {
        const result = batchData[i]?.result;
        if (!result || result === '0x') continue;
        const uri = decodeABIString(result);
        if (!uri) continue;
        let reg = decodeAgentURI(uri);
        if (!reg && uri.startsWith('http')) {
          try { const r = await axios.get(uri, { timeout: 5000 }); reg = r.data; } catch { continue; }
        }
        if (!reg) continue;
        if (reg.x402Support) x402Count++;
        if (!x402only || reg.x402Support) {
          agents.push({ agent_id: tokenIds[i], name: reg.name || `Agent #${tokenIds[i]}`, x402_support: reg.x402Support || false, services_count: (reg.services || []).length, active: reg.active !== undefined ? reg.active : true });
        }
      }
      return { success: true, total_scanned: limit, x402_enabled_count: x402Count, agents };
    }

    case 'get_registration_template':
      return REGISTRATION;

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

router.get('/', (req, res) => {
  res.json({ name: 'AgentERC8004', version: '1.0.0', transport: 'http', protocol: 'mcp', tools: TOOLS.map(t => t.name) });
});

router.post('/', async (req, res) => {
  const { method, params, id } = req.body;
  try {
    let result;
    switch (method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'AgentERC8004', version: '1.0.0' } };
        break;
      case 'tools/list':
        result = { tools: TOOLS };
        break;
      case 'tools/call': {
        const { name, arguments: toolArgs = {} } = params;
        const toolResult = await executeTool(name, toolArgs);
        result = { content: [{ type: 'text', text: JSON.stringify(toolResult, null, 2) }] };
        break;
      }
      default:
        return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
    }
    res.json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    res.json({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } });
  }
});

module.exports = router;
