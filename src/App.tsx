import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Loader2,
  MessagesSquare,
  Play,
  Search,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  clearModelCache,
  createBankingReplyRequest,
  createDisputeDraftRequest,
  createTransactionSearchRequest,
  createTransactionVisualizationRequest,
  getCacheStatus,
  isWebGpuAvailable,
  loadBankingEngine,
  resetChat,
  streamBankingReply,
  streamDisputeDraft,
  streamTransactionSearchSummary,
  streamTransactionVisualizationSummary,
  type LoadPhase,
  type LoadProgress,
  type WebLLMRequestMetadata,
} from "./webllm/engine";
import { MODEL_FACTS, SAMPLE_PROMPTS } from "./webllm/config";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type DemoTab =
  | "prompt-lab"
  | "dispute"
  | "txn-search"
  | "txn-visuals"
  | "model-calls";

type ModelCallSource =
  | "Banking Prompts"
  | "Dispute Form Filling"
  | "Transaction Search"
  | "Transaction Visualization";

type ModelCallStatus = "streaming" | "complete" | "error";

type ModelCallLog = {
  id: string;
  source: ModelCallSource;
  api: WebLLMRequestMetadata["api"];
  request: WebLLMRequestMetadata["request"];
  response: string;
  status: ModelCallStatus;
  createdAt: string;
};

type MockTransaction = {
  id: string;
  merchant: string;
  amount: string;
  amountValue: number;
  date: string;
  month: string;
  category: string;
  accountLabel: string;
  sampleIssueType: string;
  sampleExplanation: string;
  tags: string[];
};

type DisputeFormState = {
  disputeReason: string;
  customerExplanation: string;
  contactPreference: string;
  merchantContacted: string;
  desiredOutcome: string;
};

type ChartDataPoint = {
  label: string;
  amount: number;
  count: number;
};

type TransactionSearchModelOutput = {
  matchedTransactionIds?: string[];
};

type TransactionVisualizationModelOutput = {
  chartTitle?: string;
  chartData?: Array<{
    label?: string;
    amount?: number;
    count?: number;
    transactionIds?: string[];
  }>;
};

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      }

      return part;
    });
}

function renderSimpleMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.trim().split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`}>
        {renderInlineMarkdown(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`}>
        {bullets.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushBullets();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushBullets();
      const HeadingTag = `h${Math.min(heading[1].length + 2, 4)}` as
        | "h3"
        | "h4";
      blocks.push(
        <HeadingTag key={`h-${blocks.length}`}>
          {renderInlineMarkdown(heading[2])}
        </HeadingTag>,
      );
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      return;
    }

    flushBullets();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushBullets();

  return blocks;
}

const initialProgress: LoadProgress = {
  phase: "checking-webgpu",
  text: "Checking browser WebGPU support...",
  progress: 0,
  cached: null,
};

const phaseLabels: Record<LoadPhase, string> = {
  "checking-webgpu": "Checking WebGPU",
  idle: "Ready To Load",
  "cache-check": "Checking Cache",
  downloading: "Downloading Model",
  "loading-cached": "Loading Cached Model",
  ready: "Ready",
  generating: "Generating",
  error: "Needs Attention",
};

const DISPUTE_REASONS = [
  "Unrecognized transaction",
  "Duplicate charge",
  "Charged wrong amount",
  "Goods or services not received",
  "Refund not processed",
];

const MOCK_TRANSACTIONS: MockTransaction[] = [
  {
    id: "txn-coffee-duplicate",
    merchant: "Northstar Coffee",
    amount: "$18.42",
    amountValue: 18.42,
    date: "Aug 18, 2026",
    month: "August",
    category: "Dining",
    accountLabel: "Everyday Rewards Card ending 2048",
    sampleIssueType: "Duplicate charge",
    sampleExplanation:
      "I bought coffee once on Aug 18, but the same amount appears twice. I only authorized one purchase.",
    tags: ["coffee", "dining", "food", "card", "duplicate"],
  },
  {
    id: "txn-electronics-not-received",
    merchant: "MetroLine Electronics",
    amount: "$249.99",
    amountValue: 249.99,
    date: "Aug 21, 2026",
    month: "August",
    category: "Shopping",
    accountLabel: "Everyday Rewards Card ending 2048",
    sampleIssueType: "Goods or services not received",
    sampleExplanation:
      "The merchant charged me for headphones, but the order never arrived and the tracking page has not updated.",
    tags: ["electronics", "shopping", "headphones", "card", "online"],
  },
  {
    id: "txn-rideshare-unrecognized",
    merchant: "CityRide Share",
    amount: "$64.10",
    amountValue: 64.1,
    date: "Aug 23, 2026",
    month: "August",
    category: "Transportation",
    accountLabel: "Checking debit card ending 1182",
    sampleIssueType: "Unrecognized transaction",
    sampleExplanation:
      "I do not recognize this ride share charge and I was not traveling in that area on the transaction date.",
    tags: ["transportation", "rideshare", "travel", "debit", "cityride"],
  },
  {
    id: "txn-hotel-wrong-amount",
    merchant: "Harbor View Hotel",
    amount: "$312.00",
    amountValue: 312,
    date: "Aug 25, 2026",
    month: "August",
    category: "Travel",
    accountLabel: "Travel Card ending 7710",
    sampleIssueType: "Charged wrong amount",
    sampleExplanation:
      "My final hotel receipt shows $212.00, but the card was charged $312.00. I need help disputing the difference.",
    tags: ["hotel", "travel", "lodging", "card", "harbor"],
  },
  {
    id: "txn-fitness-refund",
    merchant: "FlexFit Studio",
    amount: "$89.00",
    amountValue: 89,
    date: "Aug 27, 2026",
    month: "August",
    category: "Fitness",
    accountLabel: "Everyday Rewards Card ending 2048",
    sampleIssueType: "Refund not processed",
    sampleExplanation:
      "The merchant confirmed a refund by email, but the credit has not appeared after more than two weeks.",
    tags: ["fitness", "gym", "studio", "refund", "recurring"],
  },
  {
    id: "txn-grocery-market",
    merchant: "Green Basket Market",
    amount: "$126.38",
    amountValue: 126.38,
    date: "Sep 03, 2026",
    month: "September",
    category: "Groceries",
    accountLabel: "Checking debit card ending 1182",
    sampleIssueType: "N/A",
    sampleExplanation:
      "This grocery transaction can be used for natural-language transaction search.",
    tags: ["groceries", "grocery", "market", "food", "debit"],
  },
  {
    id: "txn-streaming-subscription",
    merchant: "StreamWave Plus",
    amount: "$15.99",
    amountValue: 15.99,
    date: "Sep 05, 2026",
    month: "September",
    category: "Subscriptions",
    accountLabel: "Everyday Rewards Card ending 2048",
    sampleIssueType: "N/A",
    sampleExplanation:
      "This recurring entertainment subscription can be used for transaction search.",
    tags: ["subscription", "streaming", "recurring", "entertainment"],
  },
  {
    id: "txn-utility-electric",
    merchant: "Metro Electric Utility",
    amount: "$142.22",
    amountValue: 142.22,
    date: "Sep 09, 2026",
    month: "September",
    category: "Utilities",
    accountLabel: "Checking debit card ending 1182",
    sampleIssueType: "N/A",
    sampleExplanation:
      "This electric utility bill can be used for transaction search.",
    tags: ["utilities", "utility", "electric", "bill", "debit"],
  },
  {
    id: "txn-airline",
    merchant: "SkyTrail Airlines",
    amount: "$438.65",
    amountValue: 438.65,
    date: "Sep 12, 2026",
    month: "September",
    category: "Travel",
    accountLabel: "Travel Card ending 7710",
    sampleIssueType: "N/A",
    sampleExplanation:
      "This airline purchase can be used for travel spending search.",
    tags: ["travel", "airline", "flight", "card", "skytrail"],
  },
  {
    id: "txn-pharmacy",
    merchant: "CarePlus Pharmacy",
    amount: "$42.73",
    amountValue: 42.73,
    date: "Sep 14, 2026",
    month: "September",
    category: "Health",
    accountLabel: "Everyday Rewards Card ending 2048",
    sampleIssueType: "N/A",
    sampleExplanation:
      "This pharmacy transaction can be used for category search.",
    tags: ["health", "pharmacy", "medical", "card"],
  },
];

const SEARCH_SAMPLES = [
  "Show grocery spending over $100",
  "Find subscriptions I paid this year",
  "Travel charges in September",
  "Transactions over $200",
  "Utility bills paid from checking",
  "Charges that may need a dispute",
];

const VISUALIZATION_SAMPLES = [
  "Show spending by category",
  "Monthly spending trend",
  "Travel spending by month",
  "Card vs checking spending",
  "Top merchants by spend",
  "Recurring and subscription spend",
];

const blankDisputeForm: DisputeFormState = {
  disputeReason: DISPUTE_REASONS[0],
  customerExplanation: "",
  contactPreference: "Secure message",
  merchantContacted: "No",
  desiredOutcome: "Reverse the disputed charge",
};

export default function App() {
  const [progress, setProgress] = useState<LoadProgress>(initialProgress);
  const [cachePresent, setCachePresent] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<DemoTab>("prompt-lab");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState(
    MOCK_TRANSACTIONS[0].id,
  );
  const [disputeForm, setDisputeForm] = useState<DisputeFormState>({
    ...blankDisputeForm,
    disputeReason: MOCK_TRANSACTIONS[0].sampleIssueType,
  });
  const [disputeDraft, setDisputeDraft] = useState("");
  const [transactionSearchQuery, setTransactionSearchQuery] = useState(
    SEARCH_SAMPLES[0],
  );
  const [transactionSearchSummary, setTransactionSearchSummary] = useState("");
  const [transactionSearchResults, setTransactionSearchResults] = useState<
    MockTransaction[]
  >([]);
  const [visualizationQuery, setVisualizationQuery] = useState(
    VISUALIZATION_SAMPLES[0],
  );
  const [chartTitle, setChartTitle] = useState("Spending by category");
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [chartSummary, setChartSummary] = useState("");
  const [modelCallLogs, setModelCallLogs] = useState<ModelCallLog[]>([]);
  const [selectedModelCallId, setSelectedModelCallId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const webGpuAvailable = useMemo(() => isWebGpuAvailable(), []);
  const canChat = progress.phase === "ready" && !isGenerating;
  const selectedTransaction = useMemo(
    () =>
      MOCK_TRANSACTIONS.find(
        (transaction) => transaction.id === selectedTransactionId,
      ) ?? MOCK_TRANSACTIONS[0],
    [selectedTransactionId],
  );
  const selectedModelCall = useMemo(
    () =>
      modelCallLogs.find((log) => log.id === selectedModelCallId) ??
      modelCallLogs[0] ??
      null,
    [modelCallLogs, selectedModelCallId],
  );

  function startModelCall(
    source: ModelCallSource,
    metadata: WebLLMRequestMetadata,
  ) {
    const id = crypto.randomUUID();
    const log: ModelCallLog = {
      id,
      source,
      api: metadata.api,
      request: metadata.request,
      response: "",
      status: "streaming",
      createdAt: new Date().toISOString(),
    };

    setModelCallLogs((current) => [log, ...current]);
    setSelectedModelCallId(id);
    return id;
  }

  function updateModelCall(
    id: string,
    updates: Partial<Pick<ModelCallLog, "response" | "status">>,
  ) {
    setModelCallLogs((current) =>
      current.map((log) => (log.id === id ? { ...log, ...updates } : log)),
    );
  }

  function formatModelCallTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  }

  function formatRequestJson(request: ModelCallLog["request"]) {
    return JSON.stringify(request, null, 2);
  }

  useEffect(() => {
    let cancelled = false;
    if (!webGpuAvailable) {
      setProgress({
        phase: "error",
        text: "WebGPU is unavailable. Use Chrome or Edge on a compatible machine.",
        progress: 0,
        cached: null,
      });
      return;
    }

    getCacheStatus()
      .then((cached) => {
        if (!cancelled) {
          setCachePresent(cached);
          setProgress({
            phase: "idle",
            text: cached
              ? "WebGPU is available. Cached model artifacts were found; click Load Model to initialize."
              : "WebGPU is available. Click Load Model to download and cache the model.",
            progress: cached ? 0.2 : 0,
            cached,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCachePresent(false);
          setProgress({
            phase: "idle",
            text: "WebGPU is available. Cache status could not be confirmed; click Load Model to continue.",
            progress: 0,
            cached: false,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [webGpuAvailable]);

  async function handleLoadModel() {
    setError(null);
    setIsLoading(true);
    try {
      await loadBankingEngine((nextProgress) => {
        setProgress(nextProgress);
        if (nextProgress.cached !== null) {
          setCachePresent(nextProgress.cached);
        }
      });
      setCachePresent(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "WebLLM failed to initialize.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleClearCache() {
    setError(null);
    setIsLoading(true);
    try {
      await clearModelCache();
      setCachePresent(false);
      setProgress({
        phase: "cache-check",
        text: "Model cache cleared for this app origin.",
        progress: 0,
        cached: false,
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to clear cache.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResetChat() {
    await resetChat();
    setMessages([]);
    setInput("");
  }

  function updateDisputeForm<K extends keyof DisputeFormState>(
    key: K,
    value: DisputeFormState[K],
  ) {
    setDisputeForm((current) => ({ ...current, [key]: value }));
  }

  function handleSelectTransaction(transaction: MockTransaction) {
    setSelectedTransactionId(transaction.id);
    setDisputeForm({
      ...blankDisputeForm,
      disputeReason: transaction.sampleIssueType,
    });
    setDisputeDraft("");
  }

  function handleUseSampleExplanation() {
    setDisputeForm((current) => ({
      ...current,
      customerExplanation: selectedTransaction.sampleExplanation,
    }));
  }

  function handleResetDispute() {
    setSelectedTransactionId(MOCK_TRANSACTIONS[0].id);
    setDisputeForm({
      ...blankDisputeForm,
      disputeReason: MOCK_TRANSACTIONS[0].sampleIssueType,
    });
    setDisputeDraft("");
  }

  function buildDisputePrompt() {
    return [
      "Create a dispute form draft using the provided transaction and form details.",
      "",
      "Selected transaction:",
      `- Merchant: ${selectedTransaction.merchant}`,
      `- Amount: ${selectedTransaction.amount}`,
      `- Date: ${selectedTransaction.date}`,
      `- Category: ${selectedTransaction.category}`,
      `- Account/card label: ${selectedTransaction.accountLabel}`,
      "",
      "Editable dispute details:",
      `- Dispute reason selected by customer: ${disputeForm.disputeReason}`,
      `- Customer explanation: ${disputeForm.customerExplanation}`,
      `- Contact preference: ${disputeForm.contactPreference}`,
      `- Customer contacted merchant: ${disputeForm.merchantContacted}`,
      `- Desired outcome: ${disputeForm.desiredOutcome}`,
      "",
      "Output requirements:",
      "- Use markdown headings.",
      "- Be concise and form-ready.",
      "- Include a careful review note that this is a draft, not a submitted dispute.",
    ].join("\n");
  }

  async function handleGenerateDisputeDraft() {
    if (!canChat || !selectedTransaction || !disputeForm.customerExplanation.trim()) {
      return;
    }

    setError(null);
    setIsGenerating(true);
    setDisputeDraft("");
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Generating a local dispute draft on the client GPU...",
    }));

    const disputePrompt = buildDisputePrompt();
    const logId = startModelCall(
      "Dispute Form Filling",
      createDisputeDraftRequest(disputePrompt),
    );

    try {
      await streamDisputeDraft(disputePrompt, (content) => {
        setDisputeDraft(content);
        updateModelCall(logId, { response: content });
      });
      updateModelCall(logId, { status: "complete" });
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking workflow.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Dispute draft failed.";
      setError(message);
      setDisputeDraft(`Generation failed: ${message}`);
      updateModelCall(logId, {
        response: `Generation failed: ${message}`,
        status: "error",
      });
      setProgress((current) => ({ ...current, phase: "error", text: message }));
    } finally {
      setIsGenerating(false);
    }
  }

  function serializeTransactionsForModel() {
    return JSON.stringify(
      MOCK_TRANSACTIONS.map((transaction) => ({
        id: transaction.id,
        merchant: transaction.merchant,
        amount: transaction.amount,
        amountValue: transaction.amountValue,
        date: transaction.date,
        month: transaction.month,
        category: transaction.category,
        accountLabel: transaction.accountLabel,
        issueMarker: transaction.sampleIssueType,
        tags: transaction.tags,
      })),
      null,
      2,
    );
  }

  function extractJsonBlock<T>(text: string): T {
    const fencedJson =
      text.match(/```json\s*([\s\S]*?)```/i) ??
      text.match(/```\s*([\s\S]*?)```/);
    const jsonStart = text.indexOf("{");
    if (!fencedJson && jsonStart === -1) {
      throw new Error("WebLLM response did not include a JSON object.");
    }
    const jsonText = fencedJson?.[1] ?? text.slice(jsonStart);

    try {
      return JSON.parse(jsonText) as T;
    } catch {
      const repairedJson = jsonText.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      return JSON.parse(repairedJson) as T;
    }
  }

  function extractTransactionIds(text: string) {
    const validIds = new Set(
      MOCK_TRANSACTIONS.map((transaction) => transaction.id),
    );
    const matches = text.match(/txn-[a-z0-9-]+/g) ?? [];
    const uniqueIds = new Set<string>();

    matches.forEach((id) => {
      const normalizedId = id.replace(/\.id$/, "");
      if (validIds.has(normalizedId)) {
        uniqueIds.add(normalizedId);
      }
    });

    return Array.from(uniqueIds);
  }

  function findTransactionsByIds(ids: string[] = []) {
    const transactionsById = new Map(
      MOCK_TRANSACTIONS.map((transaction) => [transaction.id, transaction]),
    );

    return ids
      .map((id) => transactionsById.get(id))
      .filter((transaction): transaction is MockTransaction => Boolean(transaction));
  }

  function transactionMatchesQueryGuard(
    transaction: MockTransaction,
    query: string,
  ) {
    const normalized = query.toLowerCase();
    const searchableText = [
      transaction.merchant,
      transaction.category,
      transaction.accountLabel,
      transaction.sampleIssueType,
      transaction.month,
      ...transaction.tags,
    ]
      .join(" ")
      .toLowerCase();
    const amountMatch = normalized.match(
      /(?:over|above|greater than|more than)\s*\$?(\d+(?:\.\d+)?)/,
    );
    const minimumAmount = amountMatch ? Number(amountMatch[1]) : null;
    const categoryIntents: string[][] = [];

    if (normalized.includes("grocery") || normalized.includes("groceries")) {
      categoryIntents.push(["grocery", "groceries"]);
    }
    if (normalized.includes("travel")) {
      categoryIntents.push(["travel", "airline", "flight", "hotel", "lodging"]);
    }
    if (normalized.includes("bill") || normalized.includes("utility")) {
      categoryIntents.push(["bill", "utility", "utilities", "electric"]);
    }
    if (normalized.includes("subscription") || normalized.includes("recurring")) {
      categoryIntents.push(["subscription", "subscriptions", "recurring"]);
    }
    if (normalized.includes("card")) {
      categoryIntents.push(["card"]);
    }
    if (normalized.includes("checking")) {
      categoryIntents.push(["checking", "debit"]);
    }

    const monthNames = [
      "january",
      "february",
      "march",
      "april",
      "may",
      "june",
      "july",
      "august",
      "september",
      "october",
      "november",
      "december",
    ];
    const requestedMonth = monthNames.find((month) =>
      normalized.includes(month),
    );
    const wantsDispute =
      normalized.includes("dispute") ||
      normalized.includes("suspicious") ||
      normalized.includes("unrecognized") ||
      normalized.includes("wrong") ||
      normalized.includes("duplicate");

    if (minimumAmount !== null && transaction.amountValue <= minimumAmount) {
      return false;
    }
    if (
      requestedMonth &&
      transaction.month.toLowerCase() !== requestedMonth
    ) {
      return false;
    }
    if (wantsDispute && transaction.sampleIssueType === "N/A") {
      return false;
    }
    if (categoryIntents.length > 0) {
      return categoryIntents.some((intentTerms) =>
        intentTerms.some((term) => searchableText.includes(term)),
      );
    }

    return true;
  }

  function validateModelSelectedTransactions(ids: string[], query: string) {
    return findTransactionsByIds(ids).filter((transaction) =>
      transactionMatchesQueryGuard(transaction, query),
    );
  }

  function buildSearchSummaryMarkdown(query: string, results: MockTransaction[]) {
    return [
      "### Search interpretation",
      `WebLLM selected transaction IDs for: ${query}. The app then validated those IDs against the visible transaction dataset.`,
      "",
      "### Matching transactions",
      results.length > 0
        ? results
            .map(
              (transaction) =>
                `- ${transaction.merchant} (${transaction.category}, ${transaction.amount})`,
            )
            .join("\n")
        : "- No matching transactions were selected.",
      "",
      "### Helpful next actions",
      "- Review transaction details, download results, create a chart, or set an alert.",
    ].join("\n");
  }

  function buildVisualizationSummaryMarkdown(
    title: string,
    data: ChartDataPoint[],
  ) {
    const largestPoint = data.reduce<ChartDataPoint | null>(
      (largest, point) =>
        !largest || point.amount > largest.amount ? point : largest,
      null,
    );

    return [
      "### Chart interpretation",
      `WebLLM selected and grouped transactions for ${title}.`,
      "",
      "### Key takeaways",
      largestPoint
        ? `- ${largestPoint.label} is the largest group at $${largestPoint.amount.toFixed(2)}.`
        : "- No chart data was selected.",
      "",
      "### Suggested next actions",
      "- Compare with another time period or review transaction details.",
    ].join("\n");
  }

  function buildTransactionSearchPrompt(query: string) {
    return [
      "Perform this natural-language transaction search using the full transaction dataset below.",
      "",
      `Customer search query: ${query}`,
      "",
      "Full transaction dataset:",
      serializeTransactionsForModel(),
      "",
      "Output requirements:",
      "- Return only matching transaction IDs.",
      "- Use exact id values from the provided dataset.",
      "- Select the fewest transaction IDs that satisfy the query. Do not return unrelated IDs.",
      "- If no transactions match, return an empty matchedTransactionIds array.",
      "- Include all relevant matches, including multi-intent searches like bill payments and travel payments.",
      "- For amount queries such as over, above, more than, or greater than, compare the request amount to amountValue.",
      "- For recurring or subscription queries, use category and tags to identify matches.",
      "- Do not include explanations, markdown, bullets, calculations, or dataset repeats.",
      "- Return one JSON object and no text outside it.",
      '- Required format: {"matchedTransactionIds":["id-1","id-2"]}',
    ].join("\n");
  }

  async function handleTransactionSearch() {
    const trimmed = transactionSearchQuery.trim();
    if (!canChat || !trimmed) return;

    setTransactionSearchResults([]);
    setTransactionSearchSummary(
      "WebLLM is searching the full transaction dataset...",
    );
    setError(null);
    setIsGenerating(true);
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Searching transactions with WebLLM on the client GPU...",
    }));

    const searchPrompt = buildTransactionSearchPrompt(trimmed);
    const logId = startModelCall(
      "Transaction Search",
      createTransactionSearchRequest(searchPrompt),
    );

    let rawResponse = "";
    try {
      await streamTransactionSearchSummary(searchPrompt, (content) => {
        rawResponse = content;
        updateModelCall(logId, { response: content });
      });
      let matchedTransactionIds: string[];
      try {
        const parsed =
          extractJsonBlock<TransactionSearchModelOutput>(rawResponse);
        matchedTransactionIds = parsed.matchedTransactionIds ?? [];
      } catch {
        matchedTransactionIds = extractTransactionIds(rawResponse);
      }
      const results = validateModelSelectedTransactions(
        matchedTransactionIds,
        trimmed,
      );
      setTransactionSearchResults(results);
      setTransactionSearchSummary(buildSearchSummaryMarkdown(trimmed, results));
      updateModelCall(logId, { status: "complete" });
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking workflow.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Transaction search failed.";
      setError(message);
      setTransactionSearchSummary(
        [
          "### Unable to render structured search results",
          message,
          "",
          rawResponse
            ? "The raw WebLLM response is still available in the Model Calls tab."
            : "",
        ].join("\n"),
      );
      updateModelCall(logId, {
        response: rawResponse
          ? `${rawResponse}\n\nStructured parsing failed: ${message}`
          : `Generation failed: ${message}`,
        status: "error",
      });
      setProgress((current) => ({ ...current, phase: "error", text: message }));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleResetTransactionSearch() {
    setTransactionSearchQuery(SEARCH_SAMPLES[0]);
    setTransactionSearchResults([]);
    setTransactionSearchSummary("");
  }

  function buildVisualizationPrompt(query: string) {
    return [
      "Create transaction visualization data from the full transaction dataset below.",
      "",
      `Customer chart request: ${query}`,
      "",
      "Full transaction dataset:",
      serializeTransactionsForModel(),
      "",
      "Output requirements:",
      "- Return only chart grouping data.",
      "- Use exact id values from the provided dataset.",
      "- Select the fewest transaction IDs that satisfy the chart request. Do not return unrelated IDs.",
      "- If no transactions match, return an empty chartData array.",
      "- For recurring or subscription charts, group recurring/subscription transactions by merchant unless the customer asks for another grouping.",
      "- For travel-by-month charts, group travel transactions by month.",
      "- For category charts, group matching transactions by category.",
      "- Do not include explanations, markdown, bullets, calculations, or dataset repeats.",
      "- Return one JSON object and no text outside it.",
      '- Required format: {"chartTitle":"title","chartData":[{"label":"group","transactionIds":["id-1"]}]}',
    ].join("\n");
  }

  async function handleGenerateVisualization() {
    const trimmed = visualizationQuery.trim();
    if (!canChat || !trimmed) return;

    setChartTitle("WebLLM-generated chart");
    setChartData([]);
    setChartSummary(
      "WebLLM is selecting and grouping transactions for the chart...",
    );
    setError(null);
    setIsGenerating(true);
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Creating transaction visualization with WebLLM on the client GPU...",
    }));

    const visualizationPrompt = buildVisualizationPrompt(trimmed);
    const logId = startModelCall(
      "Transaction Visualization",
      createTransactionVisualizationRequest(visualizationPrompt),
    );

    let rawResponse = "";
    try {
      await streamTransactionVisualizationSummary(
        visualizationPrompt,
        (content) => {
          rawResponse = content;
          updateModelCall(logId, { response: content });
        },
      );
      const validIds = new Set(
        MOCK_TRANSACTIONS.map((transaction) => transaction.id),
      );
      let parsed: TransactionVisualizationModelOutput;
      try {
        parsed =
          extractJsonBlock<TransactionVisualizationModelOutput>(rawResponse);
      } catch {
        const fallbackTransactionIds = extractTransactionIds(rawResponse);
        parsed = {
          chartTitle: trimmed,
          chartData: fallbackTransactionIds.map((id) => ({
            label:
              MOCK_TRANSACTIONS.find((transaction) => transaction.id === id)
                ?.merchant ?? id,
            transactionIds: [id],
          })),
        };
      }
      const nextChartData =
        parsed.chartData
          ?.map((point) => {
            const transactionIds =
              point.transactionIds?.filter((id) => validIds.has(id)) ?? [];
            const transactions = validateModelSelectedTransactions(
              transactionIds,
              trimmed,
            );

            return {
              label: point.label?.trim() || "Other",
              amount: transactions.reduce(
                (total, transaction) => total + transaction.amountValue,
                0,
              ),
              count: transactions.length,
            };
          })
          .filter((point) => point.amount > 0 || point.count > 0) ?? [];

      setChartTitle(parsed.chartTitle?.trim() || "WebLLM-generated chart");
      setChartData(nextChartData);
      setChartSummary(
        buildVisualizationSummaryMarkdown(
          parsed.chartTitle?.trim() || "WebLLM-generated chart",
          nextChartData,
        ),
      );
      updateModelCall(logId, { status: "complete" });
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking workflow.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Visualization failed.";
      setError(message);
      setChartSummary(
        [
          "### Unable to render structured chart data",
          message,
          "",
          rawResponse
            ? "The raw WebLLM response is still available in the Model Calls tab."
            : "",
        ].join("\n"),
      );
      updateModelCall(logId, {
        response: rawResponse
          ? `${rawResponse}\n\nStructured parsing failed: ${message}`
          : `Generation failed: ${message}`,
        status: "error",
      });
      setProgress((current) => ({ ...current, phase: "error", text: message }));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleResetVisualization() {
    setVisualizationQuery(VISUALIZATION_SAMPLES[0]);
    setChartTitle("Spending by category");
    setChartData([]);
    setChartSummary("");
  }

  async function submitPrompt(promptText: string) {
    const trimmed = promptText.trim();
    if (!trimmed || !canChat) return;

    setError(null);
    setIsGenerating(true);
    setInput("");

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    };
    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Generating a local response on the client GPU...",
    }));

    const chatHistory: ChatCompletionMessageParam[] = [
      ...messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: "user", content: trimmed },
    ];
    const logId = startModelCall(
      "Banking Prompts",
      createBankingReplyRequest(chatHistory),
    );

    try {
      await streamBankingReply(chatHistory, (content) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        );
        updateModelCall(logId, { response: content });
      });
      updateModelCall(logId, { status: "complete" });

      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking prompt.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Generation failed.";
      setError(message);
      updateModelCall(logId, {
        response: `Generation failed: ${message}`,
        status: "error",
      });
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantId
            ? { ...item, content: `Generation failed: ${message}` }
            : item,
        ),
      );
      setProgress((current) => ({ ...current, phase: "error", text: message }));
    } finally {
      setIsGenerating(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(input);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="sidebar">
          <div>
            <p className="eyebrow">WebLLM</p>
            <h1>Banking Assistant</h1>
            <p className="intro">
              Runs inference in this browser with WebGPU. The first launch
              downloads model artifacts; later launches reuse browser cache.
            </p>
          </div>

          <div className="status-card">
            <div className="status-header">
              {progress.phase === "error" ? (
                <AlertTriangle aria-hidden="true" />
              ) : progress.phase === "ready" || progress.phase === "idle" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <Loader2 className="spin" aria-hidden="true" />
              )}
              <div>
                <p>{phaseLabels[progress.phase]}</p>
                <span>{progress.text}</span>
              </div>
            </div>
            <div className="progress-track" aria-label="Model load progress">
              <div
                className="progress-bar"
                style={{ width: `${Math.round(progress.progress * 100)}%` }}
              />
            </div>
          </div>

          <div className="facts">
            <Fact
              icon={<Gauge aria-hidden="true" />}
              label="Model"
              value={MODEL_FACTS.modelId}
            />
            <Fact
              icon={<Database aria-hidden="true" />}
              label="Download"
              value={MODEL_FACTS.estimatedDownload}
            />
            <Fact
              icon={<Gauge aria-hidden="true" />}
              label="VRAM"
              value={MODEL_FACTS.vramRequired}
            />
            <Fact
              icon={<ShieldCheck aria-hidden="true" />}
              label="Cache"
              value={`${MODEL_FACTS.cacheBackend} ${
                cachePresent === null
                  ? "not checked"
                  : cachePresent
                    ? "has model"
                    : "empty"
              }`}
            />
          </div>

          <div className="actions">
            <button
              className="primary"
              onClick={handleLoadModel}
              disabled={isLoading || isGenerating || !webGpuAvailable}
              title="Download or load the WebLLM model"
            >
              {isLoading ? (
                <Loader2 className="spin" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              Load Model
            </button>
            <button
              onClick={handleResetChat}
              disabled={isGenerating || messages.length === 0}
              title="Reset the in-memory chat"
            >
              <RotateCcw aria-hidden="true" />
            </button>
            <button
              onClick={handleClearCache}
              disabled={isLoading || isGenerating}
              title="Delete cached model artifacts for this app"
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>

          <a className="learn-link" href="/webllm-demo.html">
            <ExternalLink aria-hidden="true" />
            Open WebLLM presentation and GPU labs
          </a>

          {error && <p className="error">{error}</p>}
        </aside>

        <section className="demo-panel">
          <div className="demo-tabs" role="tablist" aria-label="Banking workflows">
            <button
              role="tab"
              aria-selected={activeTab === "prompt-lab"}
              aria-controls="panel-prompt-lab"
              onClick={() => setActiveTab("prompt-lab")}
            >
              <MessagesSquare aria-hidden="true" />
              Banking Prompts
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "dispute"}
              aria-controls="panel-dispute"
              onClick={() => setActiveTab("dispute")}
            >
              <FileText aria-hidden="true" />
              Dispute Form Filling
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "txn-search"}
              aria-controls="panel-txn-search"
              onClick={() => setActiveTab("txn-search")}
            >
              <Search aria-hidden="true" />
              Transaction Search
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "txn-visuals"}
              aria-controls="panel-txn-visuals"
              onClick={() => setActiveTab("txn-visuals")}
            >
              <BarChart3 aria-hidden="true" />
              Transaction Visualization
            </button>
            <button
              role="tab"
              aria-selected={activeTab === "model-calls"}
              aria-controls="panel-model-calls"
              onClick={() => setActiveTab("model-calls")}
            >
              <Code2 aria-hidden="true" />
              Model Calls
            </button>
          </div>

          <section
            className="chat-panel tab-content"
            id="panel-prompt-lab"
            role="tabpanel"
            hidden={activeTab !== "prompt-lab"}
          >
            <header className="chat-header">
              <div>
                <p className="eyebrow">Client GPU Inference</p>
                <h2>Banking prompts</h2>
              </div>
              <MessagesSquare aria-hidden="true" />
            </header>

            <div className="samples">
              {SAMPLE_PROMPTS.map((sample) => (
                <button
                  key={sample.title}
                  onClick={() => void submitPrompt(sample.prompt)}
                  disabled={!canChat}
                >
                  {sample.title}
                </button>
              ))}
            </div>

            <div className="messages" aria-live="polite">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <h3>Load the model, then try a banking prompt.</h3>
                  <p>
                    The response should stream locally from WebLLM without a
                    server round trip.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`message ${message.role}`}
                  >
                    <span>
                      {message.role === "user" ? "You" : "Assistant"}
                    </span>
                    {message.role === "assistant" && message.content ? (
                      <div className="markdown-output">
                        {renderSimpleMarkdown(message.content)}
                      </div>
                    ) : (
                      <p>{message.content || "Thinking..."}</p>
                    )}
                  </article>
                ))
              )}
            </div>

            <form className="composer" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  canChat
                    ? "Ask a banking question..."
                    : "Load the model before chatting..."
                }
                disabled={!canChat}
                rows={3}
              />
              <button type="submit" disabled={!canChat || !input.trim()}>
                Send
              </button>
            </form>
          </section>

          <section
            className="dispute-panel tab-content"
            id="panel-dispute"
            role="tabpanel"
            hidden={activeTab !== "dispute"}
          >
            <header className="chat-header">
              <div>
                <p className="eyebrow">Transaction Workflow</p>
                <h2>Dispute form filling</h2>
              </div>
              <FileText aria-hidden="true" />
            </header>

            <div className="dispute-workspace">
              <section className="transaction-list" aria-label="Transactions">
                <div className="section-heading">
                  <p className="eyebrow">Step 1</p>
                  <h3>Select a transaction</h3>
                </div>
                {MOCK_TRANSACTIONS.map((transaction) => (
                  <button
                    key={transaction.id}
                    className={`transaction-card ${
                      selectedTransaction.id === transaction.id
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => handleSelectTransaction(transaction)}
                    type="button"
                  >
                    <span>{transaction.merchant}</span>
                    <strong>{transaction.amount}</strong>
                    <small>
                      {transaction.date} · {transaction.category}
                    </small>
                    <small>{transaction.accountLabel}</small>
                    <em>{transaction.sampleIssueType}</em>
                  </button>
                ))}
              </section>

              <section className="dispute-form-card">
                <div className="section-heading">
                  <p className="eyebrow">Step 2</p>
                  <h3>Edit dispute details</h3>
                </div>

                <div className="selected-transaction">
                  <span>Selected transaction</span>
                  <p>
                    {selectedTransaction.merchant} · {selectedTransaction.amount} ·{" "}
                    {selectedTransaction.date}
                  </p>
                </div>

                <label>
                  Dispute reason
                  <select
                    value={disputeForm.disputeReason}
                    onChange={(event) =>
                      updateDisputeForm("disputeReason", event.target.value)
                    }
                  >
                    {DISPUTE_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Customer explanation
                  <textarea
                    value={disputeForm.customerExplanation}
                    onChange={(event) =>
                      updateDisputeForm(
                        "customerExplanation",
                        event.target.value,
                      )
                    }
                    placeholder="Use the suggested text or type a customer explanation..."
                    rows={5}
                  />
                </label>

                <div className="field-grid">
                  <label>
                    Contact preference
                    <select
                      value={disputeForm.contactPreference}
                      onChange={(event) =>
                        updateDisputeForm("contactPreference", event.target.value)
                      }
                    >
                      <option>Secure message</option>
                      <option>Email</option>
                      <option>Phone call</option>
                    </select>
                  </label>

                  <label>
                    Contacted merchant?
                    <select
                      value={disputeForm.merchantContacted}
                      onChange={(event) =>
                        updateDisputeForm("merchantContacted", event.target.value)
                      }
                    >
                      <option>No</option>
                      <option>Yes</option>
                      <option>Not sure</option>
                    </select>
                  </label>
                </div>

                <label>
                  Desired outcome
                  <input
                    value={disputeForm.desiredOutcome}
                    onChange={(event) =>
                      updateDisputeForm("desiredOutcome", event.target.value)
                    }
                  />
                </label>

                <div className="dispute-actions">
                  <button type="button" onClick={handleUseSampleExplanation}>
                    Use Suggested Explanation
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={
                      !canChat || !disputeForm.customerExplanation.trim()
                    }
                    onClick={() => void handleGenerateDisputeDraft()}
                  >
                    {isGenerating && activeTab === "dispute" ? (
                      <Loader2 className="spin" aria-hidden="true" />
                    ) : (
                      <FileText aria-hidden="true" />
                    )}
                    Generate Dispute Draft
                  </button>
                  <button
                    type="button"
                    onClick={handleResetDispute}
                    disabled={isGenerating}
                  >
                    Reset Draft
                  </button>
                </div>

                {!canChat && (
                  <p className="helper-text">
                    Load the model before generating the local dispute draft.
                  </p>
                )}
              </section>

              <section className="draft-panel" aria-live="polite">
                <div className="section-heading">
                  <p className="eyebrow">Step 3</p>
                  <h3>Review generated draft</h3>
                </div>
                {disputeDraft ? (
                  <div className="markdown-output">
                    {renderSimpleMarkdown(disputeDraft)}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>No draft yet.</h3>
                    <p>
                      Select a transaction, add a customer explanation,
                      then generate a local WebLLM dispute draft.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </section>

          <section
            className="search-panel tab-content"
            id="panel-txn-search"
            role="tabpanel"
            hidden={activeTab !== "txn-search"}
          >
            <header className="chat-header">
              <div>
                <p className="eyebrow">Transaction Search</p>
                <h2>Natural-language transaction search</h2>
              </div>
              <Search aria-hidden="true" />
            </header>

            <div className="search-workspace">
              <section className="search-query-card">
                <div className="section-heading">
                  <p className="eyebrow">Step 1</p>
                  <h3>Ask in plain English</h3>
                </div>
                <textarea
                  value={transactionSearchQuery}
                  onChange={(event) =>
                    setTransactionSearchQuery(event.target.value)
                  }
                  placeholder="Example: Show grocery spending over $100"
                  rows={4}
                />
                <div className="query-chips">
                  {SEARCH_SAMPLES.map((sample) => (
                    <button
                      type="button"
                      key={sample}
                      onClick={() => setTransactionSearchQuery(sample)}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <div className="dispute-actions">
                  <button
                    className="primary"
                    type="button"
                    disabled={!canChat || !transactionSearchQuery.trim()}
                    onClick={() => void handleTransactionSearch()}
                  >
                    {isGenerating && activeTab === "txn-search" ? (
                      <Loader2 className="spin" aria-hidden="true" />
                    ) : (
                      <Search aria-hidden="true" />
                    )}
                    Search Transactions
                  </button>
                  <button
                    type="button"
                    onClick={handleResetTransactionSearch}
                    disabled={isGenerating}
                  >
                    Reset Search
                  </button>
                </div>
                {!canChat && (
                  <p className="helper-text">
                    Load the model before asking WebLLM to search transactions.
                  </p>
                )}
              </section>

              <section className="search-results-card">
                <div className="section-heading">
                  <p className="eyebrow">Step 2</p>
                  <h3>WebLLM-selected matches</h3>
                </div>
                {transactionSearchResults.length > 0 ? (
                  <div className="result-list">
                    {transactionSearchResults.map((transaction) => (
                      <article key={transaction.id} className="result-card">
                        <div>
                          <strong>{transaction.merchant}</strong>
                          <span>{transaction.category}</span>
                        </div>
                        <p>{transaction.amount}</p>
                        <small>
                          {transaction.date} · {transaction.accountLabel}
                        </small>
                        {transaction.sampleIssueType !== "N/A" && (
                          <em>{transaction.sampleIssueType}</em>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>
                      {isGenerating && activeTab === "txn-search"
                        ? "WebLLM is searching."
                        : transactionSearchSummary
                        ? "No matching transactions."
                        : "No search run yet."}
                    </h3>
                    <p>
                      {isGenerating && activeTab === "txn-search"
                        ? "The model is reading the full transaction dataset and selecting matching IDs."
                        : transactionSearchSummary
                        ? "WebLLM did not return any valid transaction IDs for this query."
                        : "Pick a suggested query or write your own, then let WebLLM search the transaction list."}
                    </p>
                  </div>
                )}
              </section>

              <section className="draft-panel" aria-live="polite">
                <div className="section-heading">
                  <p className="eyebrow">Step 3</p>
                  <h3>WebLLM explanation</h3>
                </div>
                {transactionSearchSummary ? (
                  <div className="markdown-output">
                    {renderSimpleMarkdown(transactionSearchSummary)}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>No explanation yet.</h3>
                    <p>
                      The model will explain how the results match the
                      natural-language search.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </section>

          <section
            className="visualization-panel tab-content"
            id="panel-txn-visuals"
            role="tabpanel"
            hidden={activeTab !== "txn-visuals"}
          >
            <header className="chat-header">
              <div>
                <p className="eyebrow">Transaction Insights</p>
                <h2>Transaction visualization</h2>
              </div>
              <BarChart3 aria-hidden="true" />
            </header>

            <div className="visualization-workspace">
              <section className="search-query-card">
                <div className="section-heading">
                  <p className="eyebrow">Step 1</p>
                  <h3>Ask for a chart</h3>
                </div>
                <textarea
                  value={visualizationQuery}
                  onChange={(event) => setVisualizationQuery(event.target.value)}
                  placeholder="Example: Show spending by category"
                  rows={4}
                />
                <div className="query-chips">
                  {VISUALIZATION_SAMPLES.map((sample) => (
                    <button
                      type="button"
                      key={sample}
                      onClick={() => setVisualizationQuery(sample)}
                    >
                      {sample}
                    </button>
                  ))}
                </div>
                <div className="dispute-actions">
                  <button
                    className="primary"
                    type="button"
                    disabled={!canChat || !visualizationQuery.trim()}
                    onClick={() => void handleGenerateVisualization()}
                  >
                    {isGenerating && activeTab === "txn-visuals" ? (
                      <Loader2 className="spin" aria-hidden="true" />
                    ) : (
                      <BarChart3 aria-hidden="true" />
                    )}
                    Generate Chart
                  </button>
                  <button
                    type="button"
                    onClick={handleResetVisualization}
                    disabled={isGenerating}
                  >
                    Reset Chart
                  </button>
                </div>
                {!canChat && (
                  <p className="helper-text">
                    Load the model before asking WebLLM to build the chart.
                  </p>
                )}
              </section>

              <section className="chart-panel">
                <div className="section-heading">
                  <p className="eyebrow">Step 2</p>
                  <h3>
                    {chartData.length > 0
                      ? chartTitle
                      : "WebLLM-generated chart"}
                  </h3>
                </div>
                {chartData.length > 0 ? (
                  <div className="bar-chart">
                    {chartData.map((point) => {
                      const maxAmount = Math.max(
                        ...chartData.map((item) => item.amount),
                      );
                      const width =
                        maxAmount > 0
                          ? Math.max(8, (point.amount / maxAmount) * 100)
                          : 0;
                      return (
                        <div className="bar-row" key={point.label}>
                          <div className="bar-meta">
                            <strong>{point.label}</strong>
                            <span>
                              ${point.amount.toFixed(2)} · {point.count} txn
                              {point.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="bar-track">
                            <div
                              className="bar-fill"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>
                      {isGenerating && activeTab === "txn-visuals"
                        ? "WebLLM is building the chart."
                        : chartSummary
                        ? "No chart data returned."
                        : "No chart yet."}
                    </h3>
                    <p>
                      {isGenerating && activeTab === "txn-visuals"
                        ? "The model is selecting transactions and grouping them for the requested visualization."
                        : chartSummary
                        ? "WebLLM did not return any renderable chart points for this request."
                        : "Choose a suggested chart request or type your own, then let WebLLM select and group transactions."}
                    </p>
                  </div>
                )}
              </section>

              <section className="draft-panel" aria-live="polite">
                <div className="section-heading">
                  <p className="eyebrow">Step 3</p>
                  <h3>WebLLM chart explanation</h3>
                </div>
                {chartSummary ? (
                  <div className="markdown-output">
                    {renderSimpleMarkdown(chartSummary)}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>No explanation yet.</h3>
                    <p>
                      The model will explain the chart and suggest useful
                      next actions.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </section>

          <section
            className="model-calls-panel tab-content"
            id="panel-model-calls"
            role="tabpanel"
            hidden={activeTab !== "model-calls"}
          >
            <header className="chat-header">
              <div>
                <p className="eyebrow">Behind The Scenes</p>
                <h2>Model calls</h2>
              </div>
              <Code2 aria-hidden="true" />
            </header>

            <div className="model-calls-workspace">
              <section className="model-call-list">
                <div className="section-heading">
                  <p className="eyebrow">Requests</p>
                  <h3>Recent calls</h3>
                </div>
                {modelCallLogs.length > 0 ? (
                  <div className="call-items">
                    {modelCallLogs.map((log) => (
                      <button
                        key={log.id}
                        className={`call-item ${
                          selectedModelCall?.id === log.id ? "selected" : ""
                        }`}
                        onClick={() => setSelectedModelCallId(log.id)}
                        type="button"
                      >
                        <span>{log.source}</span>
                        <strong>{log.status}</strong>
                        <small>{formatModelCallTime(log.createdAt)}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state compact">
                    <h3>No model calls yet.</h3>
                    <p>
                      Run a banking prompt, dispute draft, transaction search,
                      or visualization to inspect the WebLLM request and
                      response.
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setModelCallLogs([]);
                    setSelectedModelCallId(null);
                  }}
                  disabled={modelCallLogs.length === 0 || isGenerating}
                >
                  Clear Logs
                </button>
              </section>

              <section className="model-call-detail">
                {selectedModelCall ? (
                  <>
                    <div className="model-call-summary">
                      <div>
                        <span>Source</span>
                        <p>{selectedModelCall.source}</p>
                      </div>
                      <div>
                        <span>Status</span>
                        <p>{selectedModelCall.status}</p>
                      </div>
                      <div>
                        <span>Time</span>
                        <p>{formatModelCallTime(selectedModelCall.createdAt)}</p>
                      </div>
                    </div>

                    <div className="call-code-block">
                      <span>API</span>
                      <pre>{selectedModelCall.api}</pre>
                    </div>

                    <div className="call-code-block">
                      <span>Request</span>
                      <pre>{formatRequestJson(selectedModelCall.request)}</pre>
                    </div>

                    <div className="call-code-block">
                      <span>Response</span>
                      <pre>
                        {selectedModelCall.response ||
                          (selectedModelCall.status === "streaming"
                            ? "Waiting for streamed response..."
                            : "No response captured.")}
                      </pre>
                    </div>
                  </>
                ) : (
                  <div className="empty-state compact">
                    <h3>Select a model call.</h3>
                    <p>
                      The latest request will appear here automatically when a
                      model call starts.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="fact">
      {icon}
      <div>
        <span>{label}</span>
        <p>{value}</p>
      </div>
    </div>
  );
}
