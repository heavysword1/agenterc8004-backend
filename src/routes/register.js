const express = require('express');
const router = express.Router();

// Our own ERC-8004 registration file for memoryapi.org services
// This is what gets published at /.well-known/agent-registration.json
const REGISTRATION = {
  name: "MemoryAPI Agent",
  description: "Ocean Digital Group AI agent infrastructure — persistent memory, contract data, reputation tracking, and 25+ specialized MCP endpoints. All services support x402 micropayments on Base mainnet.",
  version: "1.0.0",
  agentId: "appy",
  publisher: "Ocean Digital Group",
  website: "https://memoryapi.org",
  x402Support: true,
  x402Network: "eip155:8453",
  active: true,
  services: [
    { name: "Memory API", endpoint: "https://api.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Persistent agent memory — store and retrieve context across sessions" },
    { name: "Contracts API", endpoint: "https://contracts.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Smart contract data and on-chain analytics" },
    { name: "Reputation API", endpoint: "https://rep.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Agent reputation scoring and trust metrics" },
    { name: "ERC-8004 Identity", endpoint: "https://agent.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "ERC-8004 AI agent identity and registry on Base" },
    { name: "FEC Campaign Finance", endpoint: "https://fec.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "US Federal Election Commission campaign finance data" },
    { name: "Weather API", endpoint: "https://weather.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Current weather and forecasts via Open-Meteo" },
    { name: "News API", endpoint: "https://news.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Real-time news search and aggregation" },
    { name: "Search API", endpoint: "https://search.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Web search with structured results" },
    { name: "PDF API", endpoint: "https://pdf.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "PDF generation from HTML or markdown" },
    { name: "Screenshot API", endpoint: "https://screenshot.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Webpage screenshots and visual capture" },
    { name: "Translate API", endpoint: "https://translate.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Text translation across 100+ languages" },
    { name: "Geocoding API", endpoint: "https://geo.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Address geocoding and reverse geocoding" },
    { name: "Currency API", endpoint: "https://currency.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Real-time currency exchange rates" },
    { name: "Crypto Prices API", endpoint: "https://crypto.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Cryptocurrency prices and market data" },
    { name: "Stock Prices API", endpoint: "https://stocks.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Stock market data and financial metrics" },
    { name: "WHOIS API", endpoint: "https://whois.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Domain WHOIS lookup and registration data" },
    { name: "IP Geolocation API", endpoint: "https://ipgeo.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "IP address geolocation and ISP data" },
    { name: "QR Code API", endpoint: "https://qr.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "QR code generation with custom styling" },
    { name: "Barcode API", endpoint: "https://barcode.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Barcode generation for various formats" },
    { name: "Email Validation API", endpoint: "https://emailval.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Email address validation and deliverability check" },
    { name: "Timezone API", endpoint: "https://tz.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Timezone lookup and conversion utilities" },
    { name: "Text Analysis API", endpoint: "https://nlp.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "NLP: sentiment, entity extraction, summarization" },
    { name: "Image Analysis API", endpoint: "https://vision.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "AI image analysis and object detection" },
    { name: "Calendar API", endpoint: "https://calendar.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Calendar event parsing and scheduling helpers" },
    { name: "Embeddings API", endpoint: "https://embed.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Vector embeddings for semantic search" },
    { name: "Audit Log API", endpoint: "https://audit.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Tamper-evident agent action audit logging" },
    { name: "Notifications API", endpoint: "https://notify.memoryapi.org/mcp", protocol: "mcp", x402: true, description: "Push notifications and webhook delivery" },
    { name: "Health Check API", endpoint: "https://ping.memoryapi.org/mcp", protocol: "mcp", x402: false, description: "Service health and uptime monitoring (free)" }
  ],
  erc8004: {
    identityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    reputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    chain: "eip155:8453"
  },
  createdAt: "2025-05-30T00:00:00Z"
};

router.get('/', (req, res) => {
  res.json(REGISTRATION);
});

module.exports = { router, REGISTRATION };
