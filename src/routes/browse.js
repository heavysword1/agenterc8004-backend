const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const router = express.Router();
const cache = new NodeCache({ stdTTL: 1800 });

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

async function getTokenURIBatch(tokenIds) {
  const url = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
  const requests = tokenIds.map((id, i) => ({
    jsonrpc: '2.0', id: i,
    method: 'eth_call',
    params: [{ to: IDENTITY_REGISTRY, data: '0xc87b56dd' + padUint256(id) }, 'latest']
  }));
  const { data } = await axios.post(url, requests, { timeout: 15000 });
  return data.map((r, i) => ({ id: tokenIds[i], result: r.result }));
}

async function fetchHTTPRegistration(uri) {
  if (uri.startsWith('http')) {
    try {
      const { data } = await axios.get(uri, { timeout: 5000 });
      return data;
    } catch { return null; }
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const x402only = req.query.x402only === 'true';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const startId = parseInt(req.query.start_id) || 1;

    const cacheKey = `browse:${x402only}:${limit}:${startId}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json(cached);

    const tokenIds = Array.from({ length: limit }, (_, i) => startId + i);
    const rawResults = await getTokenURIBatch(tokenIds);

    const agents = [];
    let x402Count = 0;

    // Process each result
    const processingPromises = rawResults.map(async ({ id, result }) => {
      if (!result || result === '0x') return null;
      const uri = decodeABIString(result);
      if (!uri) return null;

      let registration = decodeAgentURI(uri);
      if (!registration) {
        registration = await fetchHTTPRegistration(uri);
      }
      if (!registration) return null;

      return {
        agent_id: id,
        name: registration.name || `Agent #${id}`,
        x402_support: registration.x402Support || false,
        services_count: (registration.services || []).length,
        active: registration.active !== undefined ? registration.active : true
      };
    });

    const allAgents = await Promise.all(processingPromises);

    for (const agent of allAgents) {
      if (!agent) continue;
      if (agent.x402_support) x402Count++;
      if (!x402only || agent.x402_support) {
        agents.push(agent);
      }
    }

    const result = {
      success: true,
      total_scanned: tokenIds.length,
      x402_enabled_count: x402Count,
      agents
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    console.error('[browse] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
