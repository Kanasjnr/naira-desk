import { createKeyFile } from "@naira-desk/chain";
import { keyFile } from "./env.ts";

const address = await createKeyFile(keyFile);
console.log(`Saved a new agent key to ${keyFile}`);
console.log(`Agent address: ${address}`);
