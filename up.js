const { ethers } = require('ethers');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

// === Constants ===
const CHAIN_ID = 80087;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x56A565685C9992BF5ACafb940ff68922980DBBC5';
const METHOD_ID = '0xef3e12dc';
const PROXY_FILE = 'proxies.txt';

const provider = new ethers.JsonRpcProvider(RPC_URL);

let privateKeys = [];
let currentKeyIndex = 0;
let proxies = [];
let currentProxyIndex = 0;

// === Private Key Management ===
function loadPrivateKeys() {
  try {
    const walletFile = 'wallet.txt';
    if (!fs.existsSync(walletFile)) {
      console.error('wallet.txt file not found!');
      process.exit(1);
    }
    const data = fs.readFileSync(walletFile, 'utf8');
    privateKeys = data.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => (line.startsWith('0x') ? line : '0x' + line))
      .filter(line => /^0x[0-9a-fA-F]{64}$/.test(line));

    if (privateKeys.length === 0) {
      console.error('No valid private keys found in wallet.txt');
      process.exit(1);
    }
    console.log(`Loaded ${privateKeys.length} private key(s).`);
  } catch (error) {
    console.error(`Failed to load private keys: ${error.message}`);
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
        console.log(`Loaded ${proxies.length} proxies.`);
      } else {
        console.log('No proxies found, proceeding without proxies.');
      }
    } else {
      console.log('Proxy file not found, proceeding without proxies.');
    }
  } catch (error) {
    console.error(`Failed to load proxies: ${error.message}`);
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
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)...',
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

// === Image Handling ===
async function fetchRandomImage() {
  const axiosInstance = createAxiosInstance();
  const response = await axiosInstance.get('https://picsum.photos/800/600', { responseType: 'arraybuffer' });
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
      randomValue2: '0x' + randomBytes2.toString('hex'),
    };
  } catch (error) {
    console.error('Error generating contract parameters:', error.message);
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
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000005', 'hex'),
  ]);
}

// === Upload to Storage ===
async function uploadToStorage(imageData, wallet, walletIndex, uploadIndex) {
  try {
    console.log(`Uploading file #${uploadIndex} with wallet #${walletIndex + 1} (${wallet.address})`);
    const axiosInstance = createAxiosInstance();

    if (!imageData || !imageData.root || !imageData.data) {
      throw new Error('Invalid image data. Ensure fetchRandomImage and prepareImageData are working correctly.');
    }

    await axiosInstance.post('https://indexer-storage-testnet-turbo.0g.ai/file/segment', {
      root: imageData.root,
      index: 0,
      data: imageData.data,
      proof: { siblings: [imageData.root], path: [] },
    });

    const params = generateContractParams();
    const data = encodeTransactionData(imageData.root, params);

    const tx = await wallet.sendTransaction({
      to: CONTRACT_ADDRESS,
      data,
      gasLimit: 500_000,
    });

    console.log(`Uploading: ${tx.hash}`);
    const receipt = await tx.wait();
    return receipt;
  } catch (error) {
    console.error(`Upload failed: ${error.message}`);
    throw error;
  }
}

function saveTransactionResult(txData) {
  try {
    const resultsDir = 'results';
    if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(resultsDir, `tx-${timestamp}.json`);
    fs.writeFileSync(filePath, JSON.stringify(txData, null, 2));
  } catch (error) {
    console.error(`Failed to save transaction: ${error.message}`);
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
};
