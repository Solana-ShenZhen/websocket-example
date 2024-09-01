import { Message } from "@solana/web3.js";

export interface TransactionNotification {
    jsonrpc: string;
    method: string;
    params: Params;
}

export interface Params {
    subscription: number;
    result: Result;
}

export interface Result {
    transaction: TransactionOut;
    signature: string;
}

export interface TransactionOut {
    transaction: Transaction;
    meta: Meta;
    version: number;
}

export interface Transaction {
    signatures: string[];
    message: TransactionMessage;
}

export interface TransactionMessage {
    accountKeys: AccountKey[];
    recentBlockhash: string;
    instructions: Instruction[];
    addressTableLookups: AddressTableLookup[];
}

export interface AccountKey {
    pubkey: string;
    writable: boolean;
    signer: boolean;
    source: string;
}

export interface Instruction {
    programId: string;
    accounts: string[];
    data: string;
    stackHeight: number | null;
}

export interface AddressTableLookup {
    accountKey: string;
    writableIndexes: number[];
    readonlyIndexes: number[];
}

export interface Meta {
    err: any;
    status: { Ok: any };
    fee: number;
    preBalances: number[];
    postBalances: number[];
    innerInstructions: InnerInstruction[];
    logMessages: string[];
    preTokenBalances: TokenBalance[];
    postTokenBalances: TokenBalance[];
    rewards: any;
    computeUnitsConsumed: number;
}

export interface InnerInstruction {
    index: number;
    instructions: Instruction[];
}

export interface TokenBalance {
    accountIndex: number;
    mint: string;
    uiTokenAmount: {
        uiAmount: number;
        decimals: number;
        amount: string;
        uiAmountString: string;
    };
    owner: string;
    programId: string;
}

