import { Message } from "./sandwich";
import { TransactionNotification } from "./types";

export interface FilteredMint {
    mint: string,
}

const WSOL = "So11111111111111111111111111111111111111112";
const TARGET_ADDRESS = "arsc4jbDnzaqcCLByyGo7fg7S2SmcFsWUzQuDtLZh2y";
const TARGET_SOL_AMOUNT = 20;

export async function* filteredToken(
    messageGenerator: AsyncGenerator<Message>,
): AsyncGenerator<FilteredMint> {
    for await (const message of messageGenerator) {
        const messageObj: TransactionNotification = JSON.parse(message.data);
        console.log(`message ${message.index}`);

        const preTokenBalancesArray = messageObj.params.result.transaction.meta.preTokenBalances;
        const postTokenBalancesArray = messageObj.params.result.transaction.meta.postTokenBalances;

        let preSolBalance: number | undefined = undefined;
        let postSolBalance: number | undefined = undefined;

        // Find pre-transaction SOL balance for the target address
        for (const tokenBalance of preTokenBalancesArray) {
            if (tokenBalance.mint === WSOL && tokenBalance.owner === TARGET_ADDRESS) {
                preSolBalance = tokenBalance.uiTokenAmount.uiAmount;
                break;
            }
        }

        // Find post-transaction SOL balance for the target address
        for (const tokenBalance of postTokenBalancesArray) {
            if (tokenBalance.mint === WSOL && tokenBalance.owner === TARGET_ADDRESS) {
                postSolBalance = tokenBalance.uiTokenAmount.uiAmount;
                break;
            }
        }

        // Check if both pre and post SOL balances were found
        if (preSolBalance !== undefined && postSolBalance !== undefined) {
            const balanceChange = preSolBalance - postSolBalance;
            if (balanceChange > 0 && balanceChange > TARGET_SOL_AMOUNT) {
                console.log(`Opportunity found: ${balanceChange}`);
                console.log(`Initiating attack`);

                for (const tokenBalance of preTokenBalancesArray) {
                    if (tokenBalance.accountIndex === 4) {
                        yield { mint: tokenBalance.mint };
                        break;

                    }
                }
            }
        } else {
            console.error("Failed to find the SOL balance for the target address in either preTokenBalances or postTokenBalances.");
        }
    }
}