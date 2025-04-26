// === zero-bot.js ===
const fs = require('fs');
const { ethers } = require('ethers');
const Web3 = require('web3');
const chalk = require('chalk');

// === Config ===
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const web3 = new Web3(new Web3.providers.HttpProvider(RPC_URL));
const provider = new ethers.JsonRpcProvider(RPC_URL);

const ROUTER_ADDRESS = '0x16a811adc55A99b4456F62c54F12D3561559a268';
const SCAN_URL = 'https://chainscan-galileo.0g.ai/tx/';

// Token Addresses
const TOKENS = {
  ETH: '0x2619090fcfdb99a8ccf51c76c9467f7375040eeb',
  BTC: '0x6dc29491a8396bd52376b4f6da1f3e889c16ca85',
  USDT: '0xa8f030218d7c26869cadd46c5f10129e635cd565',
};

const TOKEN_LIST = Object.keys(TOKENS);

// Minimal ABIs
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const ROUTER_ABI = [
  `function exactInputSingle(
    tuple(
      address tokenIn,
      address tokenOut,
      uint24 fee,
      address recipient,
      uint256 deadline,
      uint256 amountIn,
      uint256 amountOutMinimum,
      uint160 sqrtPriceLimitX96
    ) params
  ) external payable returns (uint256)`
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ===== Mint menggunakan 0x1249c58b (mint()) =====
async function mintTokens(wallet) {
  for (const symbol of TOKEN_LIST) {
    try {
      console.log(chalk.blue(`🔨 Minting ${symbol}...`));
      
      const tx = await wallet.sendTransaction({
        to: TOKENS[symbol],
        data: '0x1249c58b', // methodID mint()
        gasLimit: 300_000,  // gas limit aman
      });

      const receipt = await tx.wait();
      console.log(chalk.green(`✅ Mint ${symbol} sukses! TX: ${SCAN_URL}${receipt.hash}`));
    } catch (err) {
      console.log(chalk.red(`❌ Mint ${symbol} gagal: ${err.message}`));
    }
    await sleep(2000); // Delay 2 detik antar mint
  }
}

// ===== Swap =====
async function swapTokens(wallet) {
  const swapTimes = getRandomInt(10, 15);
  console.log(chalk.blue(`\n🔁 Akan melakukan ${swapTimes} swap untuk wallet ${wallet.address}`));

  for (let i = 0; i < swapTimes; i++) {
    const fromSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];
    let toSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];

    while (toSymbol === fromSymbol) {
      toSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];
    }

    const fromToken = new ethers.Contract(TOKENS[fromSymbol], ERC20_ABI, wallet);
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

    const balance = await fromToken.balanceOf(wallet.address);
    const amountIn = balance / BigInt(10); // swap 10% saldo

    if (amountIn === 0n) {
      console.log(chalk.yellow(`⚠️ Saldo ${fromSymbol} terlalu kecil, skip swap.`));
      continue;
    }

    const allowance = await fromToken.allowance(wallet.address, ROUTER_ADDRESS);
    if (allowance < amountIn) {
      console.log(chalk.cyan(`🔓 Melakukan approve ${fromSymbol}...`));
      const approveTx = await fromToken.approve(ROUTER_ADDRESS, ethers.MaxUint256);
      await approveTx.wait();
      console.log(chalk.green(`✅ Approve ${fromSymbol} selesai.`));
    }

    const params = {
      tokenIn: TOKENS[fromSymbol],
      tokenOut: TOKENS[toSymbol],
      fee: 3000,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 600,
      amountIn: amountIn,
      amountOutMinimum: 0,
      sqrtPriceLimitX96: 0
    };

    try {
      console.log(chalk.blue(`\n🔄 Swap ${fromSymbol} ke ${toSymbol} sebesar 10% saldo...`));
      const swapTx = await router.exactInputSingle(params);
      const receipt = await swapTx.wait();
      console.log(chalk.green(`✅ Swap sukses! TX: ${SCAN_URL}${receipt.hash}`));
    } catch (err) {
      console.log(chalk.red(`❌ Swap gagal: ${err.message}`));
    }

    await sleep(5000); // Delay 5 detik antar swap
  }
}

// ===== Main =====
async function main() {
  const privateKeys = fs.readFileSync('wallet.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  console.log(chalk.yellow(`🔵 Ditemukan ${privateKeys.length} akun di wallet.txt`));

  for (const key of privateKeys) {
    const wallet = new ethers.Wallet(key, provider);

    console.log(chalk.magenta(`\n🚀 Proses wallet: ${wallet.address}`));
    await mintTokens(wallet);
    await swapTokens(wallet);
  }

  console.log(chalk.green(`⏳ Semua akun selesai. Menunggu 24 jam untuk mint & swap lagi...`));
  setTimeout(main, 24 * 60 * 60 * 1000); // 24 jam
}

main().catch(console.error);
