const chalk = require('chalk');
const { ethers } = require('ethers');

const SCAN_URL = 'https://chainscan-galileo.0g.ai/tx/';
const ROUTER_ADDRESS = '0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c';

// Token Addresses
const TOKENS = {
  ETH: '0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c',
  BTC: '0x36f6414ff1df609214ddaba71c84f18bcf00f67d',
  USDT: '0x3ec8a8705be1d5ca90066b37ba62c4183b024ebf',
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

// === Minting Functionality ===
async function mintTokens(wallet) {
  for (const symbol of TOKEN_LIST) {
    let attempt = 1;
    const maxRetries = 1;
    while (attempt <= maxRetries) {
      try {
        console.log(chalk.blue(`🔨 Minting ${symbol} (Attempt ${attempt})...`));
        const tx = await wallet.sendTransaction({
          to: TOKENS[symbol],
          data: '0x1249c58b', // methodID mint()
          gasLimit: 300_000,
        });
        const receipt = await tx.wait();
        console.log(chalk.green(`✅ Mint ${symbol} successful! TX: ${SCAN_URL}${receipt.hash}`));
        break;
      } catch (err) {
        // Retry on 502 or server errors
        if (
          (err.response && err.response.status === 502) ||
          (err.code === 'SERVER_ERROR' && err.shortMessage && err.shortMessage.includes('502 Bad Gateway')) ||
          (err.message && err.message.includes('502 Bad Gateway'))
        ) {
          console.log(chalk.yellow(`⚠️ 502 Bad Gateway while minting ${symbol} (Attempt ${attempt}). Retrying...`));
        } else {
          console.log(chalk.red(`❌ Failed to mint ${symbol}: ${err.message}`));
          if (attempt >= maxRetries) break;
        }
        if (attempt >= maxRetries) break;
        const delay = 2000 + Math.floor(Math.random() * 2000);
        console.log(chalk.yellow(`⏳ Waiting ${(delay / 1000).toFixed(2)}s before retry...`));
        await sleep(delay);
        attempt++;
      }
    }
    await sleep(2000); // Delay 2 seconds between mints
  }
}

// === Swap Functionality ===
async function swapTokens(wallet) {
  const swapTimes = getRandomInt(7, 10);
  console.log(chalk.blue(`\n🔁 Performing ${swapTimes} swaps for wallet ${wallet.address}`));

  for (let i = 0; i < swapTimes; i++) {
    const fromSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];
    let toSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];
    while (toSymbol === fromSymbol) {
      toSymbol = TOKEN_LIST[getRandomInt(0, TOKEN_LIST.length - 1)];
    }
    const fromToken = new ethers.Contract(TOKENS[fromSymbol], ERC20_ABI, wallet);
    const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

    let balance;
    try {
      balance = await fromToken.balanceOf(wallet.address);
    } catch (err) {
      console.log(chalk.red(`❌ Failed to get balance for ${fromSymbol}: ${err.message}`));
      continue;
    }
    const amountIn = balance / BigInt(10); // Swap 10% of balance

    if (amountIn === 0n) {
      console.log(chalk.yellow(`⚠️ Insufficient ${fromSymbol} balance, skipping swap.`));
      continue;
    }

    let allowance;
    try {
      allowance = await fromToken.allowance(wallet.address, ROUTER_ADDRESS);
    } catch (err) {
      console.log(chalk.red(`❌ Failed to get allowance for ${fromSymbol}: ${err.message}`));
      continue;
    }

    if (allowance < amountIn) {
      let attempt = 1;
      const maxRetries = 5;
      while (attempt <= maxRetries) {
        try {
          console.log(chalk.cyan(`🔓 Approving ${fromSymbol} (Attempt ${attempt})...`));
          const approveTx = await fromToken.approve(ROUTER_ADDRESS, ethers.MaxUint256);
          await approveTx.wait();
          console.log(chalk.green(`✅ Approved ${fromSymbol}.`));
          break;
        } catch (err) {
          if (
            (err.response && err.response.status === 502) ||
            (err.code === 'SERVER_ERROR' && err.shortMessage && err.shortMessage.includes('502 Bad Gateway')) ||
            (err.message && err.message.includes('502 Bad Gateway'))
          ) {
            console.log(chalk.yellow(`⚠️ 502 Bad Gateway while approving ${fromSymbol} (Attempt ${attempt}). Retrying...`));
          } else {
            console.log(chalk.red(`❌ Failed to approve ${fromSymbol}: ${err.message}`));
            if (attempt >= maxRetries) break;
          }
          if (attempt >= maxRetries) break;
          const delay = 2000 + Math.floor(Math.random() * 2000);
          console.log(chalk.yellow(`⏳ Waiting ${(delay / 1000).toFixed(2)}s before retry...`));
          await sleep(delay);
          attempt++;
        }
      }
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

    let attempt = 1;
    const maxRetries = 5;
    while (attempt <= maxRetries) {
      try {
        console.log(chalk.blue(`\n🔄 Swapping ${fromSymbol} to ${toSymbol} (10% balance, Attempt ${attempt})...`));
        const swapTx = await router.exactInputSingle(params);
        const receipt = await swapTx.wait();
        console.log(chalk.green(`✅ Swap successful! TX: ${SCAN_URL}${receipt.hash}`));
        break;
      } catch (err) {
        if (
          (err.response && err.response.status === 502) ||
          (err.code === 'SERVER_ERROR' && err.shortMessage && err.shortMessage.includes('502 Bad Gateway')) ||
          (err.message && err.message.includes('502 Bad Gateway'))
        ) {
          console.log(chalk.yellow(`⚠️ 502 Bad Gateway while swapping (Attempt ${attempt}). Retrying...`));
        } else {
          console.log(chalk.red(`❌ Swap failed: ${err.message}`));
          if (attempt >= maxRetries) break;
        }
        if (attempt >= maxRetries) break;
        const delay = 2000 + Math.floor(Math.random() * 2000);
        console.log(chalk.yellow(`⏳ Waiting ${(delay / 1000).toFixed(2)}s before retry...`));
        await sleep(delay);
        attempt++;
      }
    }

    await sleep(5000); // Delay 5 seconds between swaps
  }
}

module.exports = {
  mintTokens,
  swapTokens,
};
