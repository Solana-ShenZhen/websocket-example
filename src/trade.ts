import { createJupiterApiClient } from "@jup-ag/api";
import { FilteredMint } from "./fliter";
import {
    Connection,
    LAMPORTS_PER_SOL,
    VersionedTransaction,
    VersionedTransactionResponse
} from "@solana/web3.js";
import {
    loadKeypair,
    sleep,
    transactionSenderAndConfirmationWaiter
} from "./utils";
import pLimit from "p-limit";
import fs from "fs";

// 限制并发请求数量
const limit = pLimit(100);

const USDC_TOKEN = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const W_SOL_TOKEN = "So11111111111111111111111111111111111111112";

const jupiterQuoteApi = createJupiterApiClient();
const wallet = loadKeypair("payer.json");
const URL = "https://mainnet.helius-rpc.com/?api-key=2f690c0f-c63b-4f17-a1fc-6f74fe48d12e";
const connection = new Connection(URL);
const BUY_AMOUT = 0.1 * LAMPORTS_PER_SOL;
const WAIT_TIME = 2 * 60 * 1000 // 2 min

const MAX_RETRIES = 10; // 最大重试次数

export async function getQuote(
    filteredMintGenerator: AsyncGenerator<FilteredMint>
): Promise<void> {
    const jupiterQuoteApi = createJupiterApiClient();
    const netWorthInSol = await connection.getBalance(wallet.publicKey);

    while (true) {
        for await (const filterMint of filteredMintGenerator) {

            limit(async () => {
                try {
                    let retryCount = 0;
                    let buytransactionResponse: VersionedTransactionResponse | undefined;
                    while (retryCount < MAX_RETRIES) {
                        const buytransactionResponse = await quoteAndSwap(
                            W_SOL_TOKEN,
                            filterMint.mint,
                            BUY_AMOUT
                        );
                        if (buytransactionResponse && !buytransactionResponse.meta?.err) {
                            break;
                        }

                        retryCount++;
                        if (retryCount === MAX_RETRIES) {
                            console.error("Reached max retry limit, exiting...");
                            break;
                        }
                    }

                    if (buytransactionResponse && !buytransactionResponse.meta?.err) {
                        const solChangeResult = solChange(buytransactionResponse);
                        if (solChangeResult) {
                            console.log(`Post Sol Balance: ${solChangeResult.postSolBalance}`);
                            console.log(`Sol Balance Change: ${solChangeResult.solBalanceChange}`);
                        } else {
                            console.error('Failed to calculate sol balance change.');
                        }
                    } else {
                        console.error('Failed to get a valid transaction response.');
                    }

                    await sleep(WAIT_TIME);

                    const sellQuote = await jupiterQuoteApi.quoteGet({
                        inputMint: buyQuote.outputMint,
                        outputMint: "So11111111111111111111111111111111111111112",
                        amount: Number(tokenBalance),
                        slippageBps: 50,
                        onlyDirectRoutes: false,
                        asLegacyTransaction: false,
                    })

                    if (!sellQuote) {
                        console.error("Unable to get sell quote for mint:", filterMint.mint);
                        return;
                    }

                    const solBalance = Number(sellQuote.outAmount);
                    const solBalanceChange = solBalance - (0.1 * LAMPORTS_PER_SOL);
                    startBalance += solBalanceChange;
                    console.log(`Sell ${buyQuote.outputMint}, get SOL: ${solBalanceChange}`);
                    console.log(`Sol balance in wallet: ${startBalance / LAMPORTS_PER_SOL}`);

                } catch (error) {
                    console.error("Error fetching quote for mint:", filterMint.mint, error);
                }
            });
        }

        // 等待所有的并发任务完成
        await limit(() => Promise.resolve());
    }
}

// export async function checkTrade() {
//     const transactionResponse = await quoteAndSwap(
//         W_SOL_TOKEN,
//         USDC_TOKEN,
//         0.001 * LAMPORTS_PER_SOL,
//     );
//     if (transactionResponse !== undefined) {
//         const postSolBalance = solChange(transactionResponse);
//         if (postSolBalance !== undefined) {
//             console.log(`Wallet balance: ${postSolBalance / LAMPORTS_PER_SOL} SOL`);
//         }
//         const getToken = tokenChange(transactionResponse, USDC_TOKEN);
//         if (getToken !== null && getToken !== undefined) {
//             console.log(`Get token: ${getToken}`);
//         }
//     }
// }

async function quoteAndSwap(
    inputMint: string,
    outputMint: string,
    amount: number,
) {
    try {
        const quote = await jupiterQuoteApi.quoteGet({
            inputMint,
            outputMint,
            amount,
            slippageBps: 50,
            onlyDirectRoutes: false,
            asLegacyTransaction: false,
        });

        if (!quote) {
            console.error("Unable to get buy quote for mint:", outputMint);
            return;
        }

        const swapResult = await jupiterQuoteApi.swapPost({
            swapRequest: {
                quoteResponse: quote,
                userPublicKey: wallet.publicKey.toString(),
                dynamicComputeUnitLimit: true,
                prioritizationFeeLamports: "auto",
            }
        });

        const swapTransactionBuf = Buffer.from(swapResult.swapTransaction, "base64");
        var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        transaction.sign([wallet]);

        // const { value: simulatedTransactionResponse } = await connection.simulateTransaction(transaction, {
        //     replaceRecentBlockhash: true,
        //     commitment: "processed",
        // });
        // const { err, logs } = simulatedTransactionResponse;

        // if (err) {
        //     console.error("Simulation Error:");
        //     console.error({ err, logs });
        //     return;
        // }

        const serializedTransaction = Buffer.from(transaction.serialize());
        const blockhash = transaction.message.recentBlockhash;

        const trasactionResponse = await transactionSenderAndConfirmationWaiter(
            connection,
            serializedTransaction,
            {
                blockhash,
                lastValidBlockHeight: swapResult.lastValidBlockHeight,
            },
        );

        // If we are not getting a response back, the transaction has not confirmed.
        if (!trasactionResponse) {
            console.error("Transaction not confirmed");
            return;
        }

        if (trasactionResponse.meta?.err) {
            console.error(trasactionResponse.meta?.err);
        }

        return trasactionResponse

    } catch (error) {
        console.error("Error fetching quote and swap for mint:", outputMint);
    }
}

function solChange(
    transactionResponse: VersionedTransactionResponse
): { postSolBalance: number, solBalanceChange: number } | undefined {
    const preSolBalance = transactionResponse.meta?.preBalances?.[0];
    const postSolBalance = transactionResponse.meta?.postBalances?.[0];

    if (preSolBalance !== undefined && postSolBalance !== undefined) {
        const solBalanceChange = postSolBalance - preSolBalance;
        console.log(`Sol change: ${solBalanceChange}`);
        return { postSolBalance, solBalanceChange };
    }

    console.error(
        "Failed to get sol balance change for transaction id: ",
        transactionResponse.transaction.signatures[0]
    );
    return undefined;
}

function tokenChange(
    transactionResponse: VersionedTransactionResponse,
    tokenMint: string,
): number | null | undefined {
    const postTokenBalancesArray = transactionResponse.meta?.postTokenBalances;
    if (postTokenBalancesArray !== null && postTokenBalancesArray !== undefined) {
        for (const tokenBalance of postTokenBalancesArray) {
            if (tokenBalance.mint === tokenMint && tokenBalance.owner === wallet.publicKey.toString()) {
                return tokenBalance.uiTokenAmount.uiAmount;
            }
        }
    }
    return undefined;
}


// -------- store ---------
// const baseUrl = "https://quote-api.jup.ag/v6/quote";
// const params = new URLSearchParams({
//     inputMint: "So11111111111111111111111111111111111111112",
//     outputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//     amount: "100000000",
//     slippageBps: "50",
// });
// const url = `${baseUrl}?${params.toString()}`;
// const response = await fetch(url, {
//     method: 'GET',
//     headers: {
//         'Content-Type': 'application/json',
//     },
// });

// const data = await response.json();
// console.log(data);