const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();
const cache = new NodeCache({ stdTTL: 1800 }); // 30 min cache

// Paths to try when discovering an agent's registration
const DISCOVERY_PATHS = [
  '/.well-known/agent-registration.json',
  '/.well-known/agent.json',
  '/.well-known/ai-plugin.json',
  '/agent.json',
];

function extractCapabilities(reg) {
  const caps = [];
  if (reg.x402Support) caps.push('x402-payments');
  if (reg.services?.length) caps.push('mcp');
  if (reg.tools?.length) caps.push('openai-tools');
  if (reg.openapi || reg.openApiUrl) caps.push('openapi');
  if (reg.auth?.type === 'oauth2') caps.push('oauth2');
  if (reg.auth?.type === 'bearer') caps.push('bearer-auth');
  if (reg.streaming) caps.push('streaming');
  return caps;
}

function normaliseServices(reg) {
  // ERC-8004 / memoryapi style
  if (Array.isArray(reg.services)) {
    return reg.services.map(s => ({
      name: s.name || s.id || 'unknown',
      endpoint: s.endpoint || null,
      protocol: s.protocol || 'http',
      x402: s.x402 || false,
      description: s.description || null,
    }));
  }
  // OpenAI plugin style (api.openai.com)
  if (reg.api?.url) {
    return [{ name: reg.name_for_human || reg.name, endpoint: reg.api.url, protocol: 'openapi', x402: false, description: reg.description_for_human || null }];
  }
  return [];
}

async function fetchWithTimeout(url, timeoutMs = 6000) {
  const resp = await axios.get(url, {
    timeout: timeoutMs,
    headers: { 'User-Agent': 'MemoryAPI-ERC8004-Resolver/1.0' },
    validateStatus: s => s < 500,
  });
  return resp;
}

// GET /x402/erc8004/resolve?url=https://someagent.example.com
router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url param required (e.g. https://myagent.example.com)' });

  let base;
  try {
    base = new URL(url).origin; // strip path, keep scheme+host
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const cacheKey = `resolve:${base}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const discovered = { url: base, found: false, path: null, registration: null };

  // Try each discovery path
  for (const path of DISCOVERY_PATHS) {
    try {
      const resp = await fetchWithTimeout(`${base}${path}`);
      if (resp.status === 200 && typeof resp.data === 'object') {
        discovered.found = true;
        discovered.path = path;
        discovered.registration = resp.data;
        break;
      }
    } catch {
      // try next
    }
  }

  if (!discovered.found) {
    const result = {
      url: base,
      resolved: false,
      reason: 'No agent registration found at standard discovery paths',
      tried: DISCOVERY_PATHS.map(p => `${base}${p}`),
    };
    cache.set(cacheKey, result);
    return res.status(404).json(result);
  }

  const reg = discovered.registration;
  const services = normaliseServices(reg);
  const capabilities = extractCapabilities(reg);

  // Check x402 payment endpoints if listed
  const x402Endpoints = services.filter(s => s.x402).map(s => s.endpoint).filter(Boolean);

  const result = {
    url: base,
    resolved: true,
    discoveryPath: discovered.path,
    name: reg.name || reg.name_for_human || reg.agentId || null,
    description: reg.description || reg.description_for_human || null,
    publisher: reg.publisher || reg.contact_email || null,
    version: reg.version || null,
    active: reg.active !== undefined ? reg.active : true,
    x402Support: reg.x402Support || false,
    x402Network: reg.x402Network || null,
    x402Endpoints,
    capabilities,
    services,
    servicesCount: services.length,
    erc8004TokenId: reg.erc8004?.tokenId || null,
    erc8004Contract: reg.erc8004?.contract || null,
  };

  cache.set(cacheKey, result);
  return res.json(result);
});

module.exports = router;
