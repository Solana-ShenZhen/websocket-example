import {
    BlockhashWithExpiryBlockHeight,
    Connection,
    Keypair,
    TransactionExpiredBlockheightExceededError
} from "@solana/web3.js";
import * as fs from "fs";
import resolve from "resolve-dir";
import promiseRetry from "promise-retry";

export async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function loadKeypair(jsonPath: string): Keypair {
    return Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(resolve(jsonPath)).toString())));
}

const SEND_OPTIONS = {
    skipPreflight: true,
}

export async function transactionSenderAndConfirmationWaiter(
    connection: Connection,
    serializedTransaction: Buffer,
    blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight,
) {
    const txid = await connection.sendRawTransaction(
        serializedTransaction,
        SEND_OPTIONS,
    );

    const controller = new AbortController();
    const abortSignal = controller.signal;

    // 每隔 2 秒重新发送一次交易
    // 直到 `abortSignal` 被中止
    const abortableResender = async () => {
        while (true) {
            await sleep(2_000);
            if (abortSignal.aborted) return;
            try {
                await connection.sendRawTransaction(
                    serializedTransaction,
                    SEND_OPTIONS
                )
            } catch (e) {
                console.warn(`Failed to resend transaction: ${e}`);
            }
        }
    };

    try {
        // 重新发送交易
        abortableResender();
        const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight - 150;

        // this would throw TransactionExpiredBlockheightExceededError
        // 等待两个异步操作中的一个完成
        await Promise.race([
            connection.confirmTransaction(
                {
                    ...blockhashWithExpiryBlockHeight,
                    lastValidBlockHeight,
                    signature: txid,
                    abortSignal,
                },
                "confirmed"
            ),
            new Promise(async (resolve) => {
                // in case ws socket died
                while (!abortSignal.aborted) {
                    await sleep(2_000);
                    const tx = await connection.getSignatureStatus(txid, {
                        searchTransactionHistory: false
                    });
                    if (tx?.value?.confirmationStatus === "confirmed") {
                        resolve(tx);
                    }
                }
            }),
        ]);
    } catch (e) {
        if (e instanceof TransactionExpiredBlockheightExceededError) {
            // we consume this error and getTransaction would return null
            return null
        } else {
            // invalid state from web3.js
            throw e;
        }
    } finally {
        controller.abort();
    }

    // in case rpc is not synced yet, we add some retries
    // 获取交易信息
    const response = promiseRetry(
        async (retry) => {
            const response = await connection.getTransaction(txid, {
                commitment: "confirmed",
                maxSupportedTransactionVersion: 0,
            });
            if (!response) {
                retry(response);
            }
            return response;
        },
        {
            retries: 5,
            minTimeout: 1e3,
        }
    );

    return response;
}