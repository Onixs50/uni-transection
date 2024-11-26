import { ethers } from 'ethers';
import fs from 'fs';
import readline from 'readline';
import chalk from 'chalk';
import clear from 'clear';
import boxen from 'boxen';

const RPC_URLS = [
    'https://endpoints.omniatech.io/v1/unichain/sepolia/public',
    'http://5.9.111.188:8549',
    'https://sepolia.unichain.org'
];

const CHAIN_ID = 1301;
const WALLET_FILE = 'wallets.txt';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

const providers = RPC_URLS.map(url => new ethers.JsonRpcProvider(url));
let currentProviderIndex = 0;

function getNextProvider() {
    currentProviderIndex = (currentProviderIndex + 1) % providers.length;
    return providers[currentProviderIndex];
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

function readWallets() {
    try {
        if (fs.existsSync(WALLET_FILE)) {
            const content = fs.readFileSync(WALLET_FILE, 'utf8');
            return content.split('\n').filter(line => line.trim());
        }
        return [];
    } catch (error) {
        console.error('Error reading wallet file:', error);
        return [];
    }
}

function saveWallets(wallets) {
    fs.writeFileSync(WALLET_FILE, wallets.join('\n'));
}

function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function generateWallets(count) {
    return Array.from({ length: count }, () => ethers.Wallet.createRandom());
}

function formatAmount(amount) {
    return ethers.formatEther(amount);
}

async function getBalanceWithRetry(address, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const provider = getNextProvider();
            const balance = await provider.getBalance(address);
            return balance;
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(RETRY_DELAY);
        }
    }
}

async function sendTransactionWithRetry(wallet, tx, retries = MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try {
            const provider = getNextProvider();
            const connectedWallet = wallet.connect(provider);
            const transaction = await connectedWallet.sendTransaction(tx);
            return transaction;
        } catch (error) {
            if (i === retries - 1) throw error;
            await sleep(RETRY_DELAY);
        }
    }
}

function displayLogo() {
    const logo = boxen(
        chalk.bold(chalk.cyan(
            '╔═══════════════════════════════════════╗\n' +
            '║             CODED BY ONIXIA           ║\n' +
            '║      Automated Transaction System     ║\n' +
            '╚═══════════════════════════════════════╝'
        )),
        {
            padding: 1,
            margin: 1,
            borderStyle: 'double',
            borderColor: 'cyan'
        }
    );
    console.log(logo);
}

async function displayTransactionInfo(fromAddress, toAddress, amount, hash) {
    const boxContent = 
        chalk.bold('Transaction Details\n\n') +
        chalk.blue(`From:   ${fromAddress}\n`) +
        chalk.green(`To:     ${toAddress}\n`) +
        chalk.yellow(`Amount: ${amount} ETH\n`) +
        chalk.magenta(`Hash:   ${hash}\n`) +
        chalk.cyan(`Explorer: https://sepolia.unichain.org/tx/${hash}`);

    console.log(boxen(boxContent, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'white'
    }));
}

async function main() {
    clear();
    displayLogo();

    let wallets = readWallets();
    
    if (wallets.length === 0) {
        console.log(chalk.yellow('\n📝 No wallets found in wallets.txt'));
        console.log(chalk.green('Please enter private keys (one per line, press Ctrl+D when done):'));
        
        let privateKeys = [];
        for await (const line of rl) {
            privateKeys.push(line.trim());
        }
        
        wallets = privateKeys;
        saveWallets(wallets);
    }

    const minEther = parseFloat(await question(chalk.cyan('\n💰 Enter minimum ETH amount (e.g., 0.00001): ')));
    const maxEther = parseFloat(await question(chalk.cyan('💰 Enter maximum ETH amount (e.g., 0.000005): ')));
    const minDelay = parseInt(await question(chalk.cyan('⏱️  Enter minimum delay between transactions (minutes): ')));
    const maxDelay = parseInt(await question(chalk.cyan('⏱️  Enter maximum delay between transactions (minutes): ')));
    const walletsPerSource = parseInt(await question(chalk.cyan('🔑 Enter number of receiver wallets to generate per source wallet: ')));
    const txPerWallet = parseInt(await question(chalk.cyan('📤 Enter number of transactions per receiver wallet: ')));

    console.log(chalk.green('\n🚀 Starting transaction process...\n'));

    while (true) {
        for (const privateKey of wallets) {
            const sourceWallet = new ethers.Wallet(privateKey);
            const receiverWallets = generateWallets(walletsPerSource);

            console.log(chalk.blue(`\n📊 Processing source wallet: ${sourceWallet.address}`));
            
            for (const receiverWallet of receiverWallets) {
                for (let i = 0; i < txPerWallet; i++) {
                    try {
                        const balance = await getBalanceWithRetry(sourceWallet.address);
                        const randomAmount = ethers.parseEther(randomInRange(minEther, maxEther).toFixed(18));
                        const randomDelayMinutes = randomInRange(minDelay, maxDelay);

                        const tx = await sendTransactionWithRetry(sourceWallet, {
                            to: receiverWallet.address,
                            value: randomAmount,
                            chainId: CHAIN_ID
                        });

                        await displayTransactionInfo(
                            sourceWallet.address,
                            receiverWallet.address,
                            formatAmount(randomAmount),
                            tx.hash
                        );

                        console.log(chalk.magenta(`\n⏳ Waiting ${randomDelayMinutes.toFixed(2)} minutes...\n`));
                        await sleep(randomDelayMinutes * 60 * 1000);
                    } catch (error) {
                        console.error(chalk.red('\n❌ Error:', error.message));
                        console.log(chalk.yellow('⏳ Waiting 30 seconds before continuing...\n'));
                        await sleep(30000);
                    }
                }
            }
        }
    }
}

main().catch(console.error);
