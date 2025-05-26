const { ethers } = require('ethers');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');

// === Configurable Constants ===
const CHAIN_ID = 80087;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x5f1D96895e442FC0168FA2F9fb1EBeF93Cb5035e';
const METHOD_ID = '0xef3e12dc';
const PROXY_FILE = 'proxies.txt';
const TIMEOUT_SECONDS = 120;
const MAX_RETRIES = 5;

const provider = new ethers.JsonRpcProvider(RPC_URL);

let privateKeys = [];
let currentKeyIndex = 0;
let proxies = [];
let currentProxyIndex = 0;

// === Logger ===
const logger = {
  info: msg => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
  warn: msg => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
  error: msg => console.log(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
  success: msg => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`)
};

// === Private Key Management ===
function loadPrivateKeys() {
  try {
    const walletFile = 'wallet.txt';
    if (!fs.existsSync(walletFile)) {
      logger.error('wallet.txt file not found!');
      process.exit(1);
    }
    const data = fs.readFileSync(walletFile, 'utf8');
    privateKeys = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => (line.startsWith('0x') ? line : '0x' + line))
      .filter(line => /^0x[0-9a-fA-F]{64}$/.test(line));
    if (privateKeys.length === 0) {
      logger.error('No valid private keys found in wallet.txt');
      process.exit(1);
    }
    logger.success(`Loaded ${privateKeys.length} private key(s).`);
  } catch (error) {
    logger.error(`Failed to load private keys: ${error.message}`);
    process.exit(1);
  }
}

function getNextPrivateKey() {
  return privateKeys[currentKeyIndex];
}

function rotatePrivateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % privateKeys.length;
  return privateKeys[currentKeyIndex];
}

// === Proxy Management ===
function loadProxies() {
  try {
    if (fs.existsSync(PROXY_FILE)) {
      const data = fs.readFileSync(PROXY_FILE, 'utf8');
      proxies = data.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      if (proxies.length > 0) {
        logger.success(`Loaded ${proxies.length} proxies.`);
      } else {
        logger.warn('No proxies found, proceeding without proxies.');
      }
    } else {
      logger.warn('Proxy file not found, proceeding without proxies.');
    }
  } catch (error) {
    logger.error(`Failed to load proxies: ${error.message}`);
  }
}

function getNextProxy() {
  if (proxies.length === 0) return null;
  const proxy = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  return proxy;
}

// === Utility Functions ===
function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',
    'Mozilla/5.0 (X11; Linux x86_64)...',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)...'
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

function createAxiosInstance() {
  const config = { headers: { 'User-Agent': getRandomUserAgent() } };
  const proxy = getNextProxy();
  if (proxy) {
    config.httpsAgent = new HttpsProxyAgent(proxy);
  }
  return axios.create(config);
}

function initializeWallet() {
  const privateKey = getNextPrivateKey();
  return new ethers.Wallet(privateKey, provider);
}

// === Image Handling (random source) ===
async function fetchRandomImage() {
  const axiosInstance = createAxiosInstance();
  const urls = [
    { url: 'https://picsum.photos/800/600', responseType: 'arraybuffer' },
    { url: 'https://loremflickr.com/800/600', responseType: 'arraybuffer' }
  ];
  const { url, responseType } = urls[Math.floor(Math.random() * urls.length)];
  const response = await axiosInstance.get(url, { responseType });
  return response.data;
}

async function prepareImageData(imageBuffer) {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Invalid image buffer.');
  }
  const hash = '0x' + crypto.createHash('sha256').update(imageBuffer).digest('hex');
  const imageBase64 = Buffer.from(imageBuffer).toString('base64');
  return { root: hash, data: imageBase64 };
}

// === Contract Data Encoding ===
function generateContractParams() {
  try {
    const randomBytes1 = crypto.randomBytes(32);
    const randomBytes2 = crypto.randomBytes(32);
    return {
      hexValue: '0x0000000000000000000000000000000000000000000000000000000000018190',
      randomValue1: '0x' + randomBytes1.toString('hex'),
      randomValue2: '0x' + randomBytes2.toString('hex')
    };
  } catch (error) {
    logger.error('Error generating contract parameters: ' + error.message);
    throw error;
  }
}

function encodeTransactionData(fileRoot, params) {
  if (!fileRoot || !params.randomValue1 || !params.randomValue2) {
    throw new Error('Invalid transaction data parameters.');
  }
  return ethers.concat([
    Buffer.from(METHOD_ID.slice(2), 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000020', 'hex'),
    Buffer.from(params.hexValue.slice(2), 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000060', 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000080', 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000003', 'hex'),
    Buffer.from(params.randomValue1.slice(2), 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000008', 'hex'),
    Buffer.from(params.randomValue2.slice(2), 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000007', 'hex'),
    Buffer.from(fileRoot.slice(2), 'hex'),
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000005', 'hex')
  ]);
}

// === Upload to Storage with Timeout and Robust 502 Handling ===
async function uploadToStorage(imageData, wallet, walletIndex, uploadIndex) {
  let attempt = 1;
  while (attempt <= MAX_RETRIES) {
    try {
      logger.info(`Uploading file #${uploadIndex} with wallet #${walletIndex + 1} (${wallet.address})...`);
      const axiosInstance = createAxiosInstance();

      if (!imageData || !imageData.root || !imageData.data) {
        throw new Error('Invalid image data. Ensure fetchRandomImage and prepareImageData are working correctly.');
      }

      // Upload the file to storage API
      await axiosInstance.post('https://indexer-storage-testnet-turbo.0g.ai/file/segment', {
        root: imageData.root,
        index: 0,
        data: imageData.data,
        proof: { siblings: [imageData.root], path: [] },
      });

      // Prepare contract call parameters
      const params = generateContractParams();
      const data = encodeTransactionData(imageData.root, params);

      // Send transaction
      logger.info(`Uploading to blockchain for file #${uploadIndex}...`);
      const tx = await wallet.sendTransaction({
        to: CONTRACT_ADDRESS,
        data,
        gasLimit: 500_000,
      });

      const txLink = `https://chainscan-galileo.0g.ai/tx/${tx.hash}`;
      logger.info(`Upload in progress. TX: ${txLink}`);
      let receipt;
      try {
        receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_SECONDS} seconds`)), TIMEOUT_SECONDS * 1000))
        ]);
      } catch (error) {
        if (error.message.includes('Timeout')) {
          logger.warn(`Transaction timeout after ${TIMEOUT_SECONDS}s`);
          receipt = await provider.getTransactionReceipt(tx.hash);
          if (receipt && receipt.status === 1) {
            logger.success(`Late confirmation in block ${receipt.blockNumber}`);
          } else {
            throw new Error(`Transaction failed or pending: ${txLink}`);
          }
        } else {
          throw error;
        }
      }

      if (receipt.status === 1) {
        logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
        logger.success(`File uploaded, root hash: ${imageData.root}`);
        return receipt;
      } else {
        throw new Error(`Transaction failed: ${txLink}`);
      }
    } catch (error) {
      // Retry on 502 or ethers.js server error
      if (
        (error.response && error.response.status === 502) ||
        (error.code === 'SERVER_ERROR' && error.shortMessage && error.shortMessage.includes('502 Bad Gateway')) ||
        (error.message && error.message.includes('502 Bad Gateway'))
      ) {
        logger.warn(`⚠️ 502 Bad Gateway on upload attempt ${attempt}. Retrying...`);
      } else {
        logger.error(`Upload attempt ${attempt} failed: ${error.message}`);
        if (attempt >= MAX_RETRIES) break;
      }
      if (attempt >= MAX_RETRIES) {
        logger.error(`❌ Exceeded max retries (${MAX_RETRIES}) for upload #${uploadIndex}. Skipping.`);
        break;
      }
      const delay = 2000 + Math.floor(Math.random() * 2000);
      logger.warn(`⏳ Waiting ${(delay / 1000).toFixed(2)}s before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }
  // Always return or resolve so the bot doesn't crash!
  return null;
}

function saveTransactionResult(txData) {
  try {
    const resultsDir = 'results';
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(resultsDir, `tx-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(txData, null, 2));
  } catch (error) {
    logger.error(`Failed to save transaction: ${error.message}`);
  }
}

module.exports = {
  loadPrivateKeys,
  loadProxies,
  getNextPrivateKey,
  rotatePrivateKey,
  fetchRandomImage,
  prepareImageData,
  uploadToStorage,
  saveTransactionResult,
  initializeWallet,
  logger
};
