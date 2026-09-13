import * as webllm from "@mlc-ai/web-llm";

export const MODEL_ID = "Llama-3.2-1B-Instruct-q4f16_1-MLC";
export type CacheBackend = "cache" | "indexeddb" | "cross-origin" | "opfs";
export const CACHE_BACKEND: CacheBackend = "indexeddb";

export const MODEL_RECORD: webllm.ModelRecord = {
  model: "https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC",
  model_id: MODEL_ID,
  model_lib:
    webllm.modelLibURLPrefix +
    webllm.modelVersion +
    "/Llama-3.2-1B-Instruct-q4f16_1_cs1k-webgpu.wasm",
  vram_required_MB: 879.04,
  low_resource_required: true,
  overrides: {
    context_window_size: 4096,
  },
};

export const APP_CONFIG: webllm.AppConfig = {
  cacheBackend: CACHE_BACKEND,
  model_list: [MODEL_RECORD],
};

export const MODEL_FACTS = {
  modelId: MODEL_ID,
  estimatedDownload: "705 MB model files; budget 750-900 MB including runtime artifacts",
  vramRequired: "879.04 MB",
  contextWindow: "4,096 tokens",
  cacheBackend: CACHE_BACKEND,
};

export const GENERATION_CONFIG = {
  temperature: 0.2,
  top_p: 0.9,
  max_tokens: 512,
};

export const BANKING_SYSTEM_PROMPT = [
  "You are a local browser-only banking assistant POC.",
  "Help with general banking education, sample customer communication, FAQ drafting, and policy explanation.",
  "Do not claim to access accounts, balances, transactions, KYC systems, core banking systems, or customer records.",
  "Do not ask for or reveal sensitive personal, financial, authentication, card, account, or credential data.",
  "When a request could affect money movement, fraud, credit decisions, compliance, or customer rights, explain that a production bank workflow needs verified systems and human-approved policy controls.",
  "Keep responses concise, practical, and clearly framed as a demo.",
].join(" ");

export const SAMPLE_PROMPTS = [
  {
    title: "Explain a Fee",
    prompt:
      "Draft a simple explanation for why an overdraft fee may appear on a checking account statement.",
  },
  {
    title: "Policy Summary",
    prompt:
      "Summarize a sample policy: customers can dispute card transactions within 60 days of statement availability.",
  },
  {
    title: "FAQ Answer",
    prompt:
      "Answer a banking FAQ: what is the difference between available balance and current balance?",
  },
  {
    title: "Customer Reply",
    prompt:
      "Draft a careful support reply for a customer asking why an ACH transfer is still pending.",
  },
];
