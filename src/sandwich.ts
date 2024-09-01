import WebSocket from "ws";
import { sleep } from "./utils";

export interface Message {
    index: number,
    data: string,
}

// const RECEPTIONS_NUMBER = 10000;
const RECONNECT_INTERVAL = 5000; // 重连间隔时间（毫秒）
const MAX_RECONNECT_ATTEMPTS = 10; // 最大重连次数

export async function* transactionsUpdates(
    wsUrl: string
): AsyncGenerator<Message> {
    let reconnectAttempts = 0;
    let messageQueue: Message[] = [];

    const connect = (): WebSocket => {
        const ws = new WebSocket(wsUrl);
        wsSet(ws);
        return ws
    }

    const wsSet = (ws: WebSocket) => {
        let isFirstMessageReceived = false;
        let amount = 0;
        // let isClosed = false;

        ws.on("open", function open() {
            console.log("WebSocket is open");
            sendRequest(ws);
            reconnectAttempts = 0; // 重置重连尝试次数
        });

        ws.on("message", function incoming(data) {
            if (!isFirstMessageReceived) {
                // 忽略第一个消息
                isFirstMessageReceived = true;
                const messageStr = data.toString("utf-8");
                console.log(messageStr);
                return;
            }
            amount += 1;
            const message: Message = {
                data: data.toString(),
                index: amount,
            };
            messageQueue.push(message);

            // if (amount >= RECEPTIONS_NUMBER && !isClosed) {
            //     // 延迟关闭 WebSocket，以确保当前消息处理完毕
            //     isClosed = true;
            //     setTimeout(() => {
            //         ws.close();
            //     }, 0);
            // }
        });

        ws.on("error", function error(err) {
            console.error("WebSocket error:", err);
        });

        ws.on("close", async function close() {
            console.log("WebSocket is closed");
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                console.log(`Reconnecting in ${RECONNECT_INTERVAL / 1000} seconds...`);
                await sleep(RECONNECT_INTERVAL);
                reconnectAttempts++;
                connect();
            } else {
                console.error("Max reconnect attempts reached. Giving up.");
            }
        });
    }

    let ws = connect();

    while (true) {
        if (messageQueue.length > 0) {
            yield messageQueue.shift()!;
        } else {
            if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                    console.log(`Reconnecting in ${RECONNECT_INTERVAL / 1000} seconds...`);
                    await sleep(RECONNECT_INTERVAL);
                    reconnectAttempts++;
                    ws = connect();
                } else {
                    console.error("Max reconnect attempts reached. Giving up.");
                    return;
                }
            }
            await sleep(100); // 避免忙等待
        }
    }
}

function sendRequest(ws: WebSocket) {
    const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "transactionSubscribe",
        params: [
            {
                vote: false,
                failed: false,
                accountInclude: ["arsc4jbDnzaqcCLByyGo7fg7S2SmcFsWUzQuDtLZh2y"],
                accountRequire: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
            },
            {
                commitment: "processed",
                encoding: "jsonParsed",
                transactionDetails: "full",
                maxSupportedTransactionVersion: 0,
            }
        ]
    };
    ws.send(JSON.stringify(request));
}