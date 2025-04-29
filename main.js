const fs = require('fs');
const chalk = require('chalk');
const { ethers } = require('ethers');
const { loadProxies, fetchRandomImage, prepareImageData, uploadToStorage, initializeWallet } = require('./up');
const { mintTokens, swapTokens } = require('./swap');

// === Config ===
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const SCAN_URL = 'https://chainscan-galileo.0g.ai/tx/';
const provider = new ethers.JsonRpcProvider(RPC_URL);
const CONTRACT_ADDRESS = '0x56A565685C9992BF5ACafb940ff68922980DBBC5';
const METHOD_ID = '0xef3e12dc';

// === Main Workflow ===
async function main() {
  // Load proxies and wallet private keys
  loadProxies();

  const privateKeys = fs.readFileSync('wallet.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  console.log(chalk.yellow(`🔵 Found ${privateKeys.length} accounts in wallet.txt`));

  for (const [index, key] of privateKeys.entries()) {
    const wallet = new ethers.Wallet(key, provider);
    console.log(chalk.magenta(`\n🚀 Processing wallet: ${wallet.address}`));

    try {
      // Mint Tokens
      console.log(chalk.blue(`\n🔨 Minting tokens for wallet ${wallet.address}`));
      await mintTokens(wallet);

      // Swap Tokens
      console.log(chalk.blue(`\n🔁 Swapping tokens for wallet ${wallet.address}`));
      await swapTokens(wallet);

      // Upload Files
      const uploadsCount = Math.floor(Math.random() * 3) + 4; // Random between 4–6 files
      console.log(chalk.blue(`\n📤 Uploading ${uploadsCount} files with wallet ${wallet.address}`));

      for (let i = 1; i <= uploadsCount; i++) {
        try {
          console.log(chalk.blue(`\n📤 Starting upload #${i} for wallet ${wallet.address}`));
          const imageBuffer = await fetchRandomImage();
          const imageData = await prepareImageData(imageBuffer);

          // Upload the file
          const receipt = await uploadToStorage(imageData, wallet, index, i);
          console.log(chalk.green(`✅ File #${i} uploaded successfully. TX: ${SCAN_URL}${receipt.hash}`));
        } catch (error) {
          console.log(chalk.red(`❌ Failed to upload file #${i}: ${error.message}`));
        }
      }

      console.log(chalk.green(`✅ Done processing wallet ${wallet.address}`));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to process wallet ${wallet.address}: ${error.message}`));
    }

    // Delay before processing the next wallet
    console.log(chalk.yellow(`⏳ Waiting 10 seconds before switching wallets...`));
    await sleep(10000); // 10-second delay
  }

  console.log(chalk.green(`🎉 All wallets processed successfully.`));
  console.log(chalk.yellow(`⏳ Waiting 24 hours to re-run...`));
  setTimeout(main, 24 * 60 * 60 * 1000); // Re-run after 24 hours
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Start the main workflow
main().catch(error => {
  console.error(chalk.red(`❌ Fatal error: ${error.message}`));
});
