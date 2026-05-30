const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();
const cache = new NodeCache({ stdTTL: 3600 });

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
  return null; // HTTPS URIs handled separately
}

async function alchemyCall(method, params) {
  const url = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const { data } = await axios.post(url, {
    jsonrpc: '2.0', id: 1, method, params
  }, { timeout: 10000 });
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

async function getTokenURI(tokenId) {
  const data = '0xc87b56dd' + padUint256(tokenId);
  const result = await alchemyCall('eth_call', [{ to: IDENTITY_REGISTRY, data }, 'latest']);
  return decodeABIString(result);
}

async function getOwnerOf(tokenId) {
  const data = '0x6352211e' + padUint256(tokenId);
  try {
    const result = await alchemyCall('eth_call', [{ to: IDENTITY_REGISTRY, data }, 'latest']);
    if (!result || result === '0x') return null;
    return '0x' + result.slice(-40);
  } catch { return null; }
}

async function fetchAgentRegistration(uri) {
  const decoded = decodeAgentURI(uri);
  if (decoded) return decoded;
  if (uri.startsWith('http')) {
    const { data } = await axios.get(uri, { timeout: 8000 });
    return data;
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const agentId = parseInt(req.query.id) || 1;
    const chain = req.query.chain || 'base';
    const cacheKey = `agent:${agentId}:${chain}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [rawUri, owner] = await Promise.all([
      getTokenURI(agentId),
      getOwnerOf(agentId)
    ]);

    if (!rawUri) {
      return res.status(404).json({ success: false, error: `Agent ${agentId} not found or has no URI` });
    }

    const registration = await fetchAgentRegistration(rawUri);

    const result = {
      success: true,
      agent_id: agentId,
      owner: owner || 'unknown',
      name: registration?.name || null,
      description: registration?.description || null,
      x402_support: registration?.x402Support || false,
      services: registration?.services || [],
      active: registration?.active !== undefined ? registration.active : true,
      raw_uri: rawUri,
      source: 'ERC-8004 Identity Registry on Base'
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[agent] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
