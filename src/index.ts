import { WebSocket } from "ws";
import { transactionsUpdates } from "./sandwich";
import { filteredToken } from "./fliter";
import { } from "./trade";

async function main(): Promise<void> {
    const wsUrl = "wss://atlas-mainnet.helius-rpc.com?api-key=2f690c0f-c63b-4f17-a1fc-6f74fe48d12e";

    const messageGenerator = transactionsUpdates(wsUrl);
    const filteredMintGenerator = filteredToken(messageGenerator);
    await getQuote(filteredMintGenerator);

    await checkTrade();
}

main()