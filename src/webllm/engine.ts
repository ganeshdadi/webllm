import {
  CreateMLCEngine,
  deleteModelAllInfoInCache,
  hasModelInCache,
  type ChatCompletionMessageParam,
  type InitProgressReport,
  type MLCEngineInterface,
} from "@mlc-ai/web-llm";
import {
  APP_CONFIG,
  BANKING_SYSTEM_PROMPT,
  GENERATION_CONFIG,
  MODEL_ID,
} from "./config";

export type LoadPhase =
  | "checking-webgpu"
  | "idle"
  | "cache-check"
  | "downloading"
  | "loading-cached"
  | "ready"
  | "generating"
  | "error";

export type LoadProgress = {
  phase: LoadPhase;
  text: string;
  progress: number;
  cached: boolean | null;
};

export type WebLLMRequestMetadata = {
  api: "engine.chat.completions.create";
  request: {
    messages: ChatCompletionMessageParam[];
    stream: true;
    temperature: number;
    top_p: number;
    max_tokens: number;
  };
};

let enginePromise: Promise<MLCEngineInterface> | null = null;
let engineInstance: MLCEngineInterface | null = null;

export function isWebGpuAvailable(): boolean {
  return "gpu" in navigator;
}

export async function getCacheStatus(): Promise<boolean> {
  return hasModelInCache(MODEL_ID, APP_CONFIG);
}

export async function clearModelCache(): Promise<void> {
  await engineInstance?.unload();
  engineInstance = null;
  enginePromise = null;
  await deleteModelAllInfoInCache(MODEL_ID, APP_CONFIG);
}

export async function loadBankingEngine(
  onProgress: (progress: LoadProgress) => void,
): Promise<MLCEngineInterface> {
  if (!isWebGpuAvailable()) {
    const error =
      "WebGPU is not available in this browser. Try Chrome or Edge on a WebGPU-capable machine.";
    onProgress({ phase: "error", text: error, progress: 0, cached: null });
    throw new Error(error);
  }

  if (engineInstance) {
    onProgress({
      phase: "ready",
      text: "Model is already loaded in this tab.",
      progress: 1,
      cached: true,
    });
    return engineInstance;
  }

  if (enginePromise) {
    return enginePromise;
  }

  onProgress({
    phase: "cache-check",
    text: "Checking browser cache for model artifacts...",
    progress: 0,
    cached: null,
  });

  const cached = await getCacheStatus().catch(() => false);

  onProgress({
    phase: cached ? "loading-cached" : "downloading",
    text: cached
      ? "Cached model found. Loading from browser storage..."
      : "No cached model found. First load will download about 705 MB of model files.",
    progress: cached ? 0.2 : 0,
    cached,
  });

  const initProgressCallback = (report: InitProgressReport) => {
    onProgress({
      phase: cached ? "loading-cached" : "downloading",
      text: report.text,
      progress: report.progress,
      cached,
    });
  };

  enginePromise = CreateMLCEngine(
    MODEL_ID,
    {
      appConfig: APP_CONFIG,
      initProgressCallback,
      logLevel: "INFO",
    },
    MODEL_RECORD_CHAT_OPTIONS,
  )
    .then((engine) => {
      engineInstance = engine;
      onProgress({
        phase: "ready",
        text: cached
          ? "Ready. Model loaded from browser cache."
          : "Ready. Model downloaded and cached in the browser.",
        progress: 1,
        cached,
      });
      return engine;
    })
    .catch((error) => {
      enginePromise = null;
      const message =
        error instanceof Error ? error.message : "Failed to initialize WebLLM.";
      onProgress({
        phase: "error",
        text: message,
        progress: 0,
        cached,
      });
      throw error;
    });

  return enginePromise;
}

export async function streamBankingReply(
  messages: ChatCompletionMessageParam[],
  onToken: (content: string) => void,
): Promise<string> {
  if (!engineInstance) {
    throw new Error("Model is not loaded yet.");
  }

  const chunks = await engineInstance.chat.completions.create(
    createBankingReplyRequest(messages).request,
  );

  let fullText = "";
  for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta.content ?? "";
    if (token) {
      fullText += token;
      onToken(fullText);
    }
  }

  return fullText;
}

export async function streamDisputeDraft(
  userPrompt: string,
  onToken: (content: string) => void,
): Promise<string> {
  if (!engineInstance) {
    throw new Error("Model is not loaded yet.");
  }

  const chunks = await engineInstance.chat.completions.create(
    createDisputeDraftRequest(userPrompt).request,
  );

  let fullText = "";
  for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta.content ?? "";
    if (token) {
      fullText += token;
      onToken(fullText);
    }
  }

  return fullText;
}

export async function streamTransactionSearchSummary(
  userPrompt: string,
  onToken: (content: string) => void,
): Promise<string> {
  if (!engineInstance) {
    throw new Error("Model is not loaded yet.");
  }

  const chunks = await engineInstance.chat.completions.create(
    createTransactionSearchRequest(userPrompt).request,
  );

  let fullText = "";
  for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta.content ?? "";
    if (token) {
      fullText += token;
      onToken(fullText);
    }
  }

  return fullText;
}

export async function streamTransactionVisualizationSummary(
  userPrompt: string,
  onToken: (content: string) => void,
): Promise<string> {
  if (!engineInstance) {
    throw new Error("Model is not loaded yet.");
  }

  const chunks = await engineInstance.chat.completions.create(
    createTransactionVisualizationRequest(userPrompt).request,
  );

  let fullText = "";
  for await (const chunk of chunks) {
    const token = chunk.choices[0]?.delta.content ?? "";
    if (token) {
      fullText += token;
      onToken(fullText);
    }
  }

  return fullText;
}

export function createBankingReplyRequest(
  messages: ChatCompletionMessageParam[],
): WebLLMRequestMetadata {
  return {
    api: "engine.chat.completions.create",
    request: {
      messages: [{ role: "system", content: BANKING_SYSTEM_PROMPT }, ...messages],
      stream: true,
      ...GENERATION_CONFIG,
    },
  };
}

export function createDisputeDraftRequest(
  userPrompt: string,
): WebLLMRequestMetadata {
  return {
    api: "engine.chat.completions.create",
    request: {
      messages: [
        {
          role: "system",
          content: [
            "You are a local browser-only banking dispute form drafting assistant.",
            "Use only the transaction and form details provided by the user.",
            "Do not claim to submit disputes, access bank systems, verify accounts, or make final decisions.",
            "Generate a structured draft with these headings: Suggested dispute reason/category, Completed dispute summary, Customer narrative, Evidence checklist, Questions still needed before submission, Review note.",
            "Keep the output concise, practical, customer-friendly, and clearly marked as a draft for review.",
            "Do not request account identifiers, payment card details, credentials, authentication codes, or other sensitive personal or financial information.",
          ].join(" "),
        },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      ...GENERATION_CONFIG,
      max_tokens: 700,
    },
  };
}

export function createTransactionSearchRequest(
  userPrompt: string,
): WebLLMRequestMetadata {
  return {
    api: "engine.chat.completions.create",
    request: {
      messages: [
        {
          role: "system",
          content: [
            "You are a local browser-only banking transaction search assistant.",
            "Use only the customer search query and full transaction dataset provided by the user.",
            "Do not claim to access accounts, balances, card systems, or bank records beyond the provided transaction dataset.",
            "You decide which provided transaction IDs match the customer's natural-language search.",
            "The customer's query is authoritative; schema examples or placeholders are not search results.",
            "Return exactly one fenced JSON block with matchedTransactionIds and explanationMarkdown.",
            "Do not request account identifiers, payment card details, credentials, authentication codes, or other sensitive personal or financial information.",
          ].join(" "),
        },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      ...GENERATION_CONFIG,
      max_tokens: 900,
    },
  };
}

export function createTransactionVisualizationRequest(
  userPrompt: string,
): WebLLMRequestMetadata {
  return {
    api: "engine.chat.completions.create",
    request: {
      messages: [
        {
          role: "system",
          content: [
            "You are a local browser-only banking transaction visualization assistant.",
            "Use only the customer chart request and full transaction dataset provided by the user.",
            "Do not claim to access accounts, balances, card systems, or bank records beyond the provided transaction dataset.",
            "You decide which provided transactions are relevant and how to group them for the requested chart.",
            "The customer's chart request is authoritative; schema examples or placeholders are not chart data.",
            "Return exactly one fenced JSON block with chartTitle, chartData, and explanationMarkdown.",
            "Do not request account identifiers, payment card details, credentials, authentication codes, or other sensitive personal or financial information.",
          ].join(" "),
        },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      ...GENERATION_CONFIG,
      max_tokens: 1000,
    },
  };
}

export async function resetChat(): Promise<void> {
  await engineInstance?.resetChat();
}

const MODEL_RECORD_CHAT_OPTIONS = {
  context_window_size: 4096,
};
