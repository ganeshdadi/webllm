import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
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
} from "./webllm/engine";
import { MODEL_FACTS, SAMPLE_PROMPTS } from "./webllm/config";
import type { ChatCompletionMessageParam } from "@mlc-ai/web-llm";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type DemoTab = "prompt-lab" | "dispute" | "txn-search" | "txn-visuals";

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
      "This is a sample grocery transaction for natural-language transaction search.",
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
      "This is a sample recurring entertainment subscription transaction.",
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
      "This is a sample electric utility bill transaction.",
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
      "This is a sample airline purchase for travel spending search.",
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
      "This is a sample pharmacy transaction for category search.",
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
      "Create a dispute form draft using this mock demo data only.",
      "",
      "Selected mock transaction:",
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
      "- Do not ask for real account numbers, card numbers, credentials, or sensitive personal data.",
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

    try {
      await streamDisputeDraft(buildDisputePrompt(), setDisputeDraft);
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking demo.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Dispute draft failed.";
      setError(message);
      setDisputeDraft(`Generation failed: ${message}`);
      setProgress((current) => ({ ...current, phase: "error", text: message }));
    } finally {
      setIsGenerating(false);
    }
  }

  function searchMockTransactions(query: string) {
    const normalized = query.toLowerCase();
    const words = normalized
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2);
    const amountMatch = normalized.match(/(?:over|above|greater than|more than)\s*\$?(\d+)/);
    const minimumAmount = amountMatch ? Number(amountMatch[1]) : null;
    const wantsDispute =
      normalized.includes("dispute") ||
      normalized.includes("suspicious") ||
      normalized.includes("unrecognized") ||
      normalized.includes("wrong") ||
      normalized.includes("duplicate");

    return MOCK_TRANSACTIONS.filter((transaction) => {
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

      const amountMatches =
        minimumAmount === null || transaction.amountValue > minimumAmount;
      const wordMatches =
        words.length === 0 ||
        words.some((word) => {
          if (word === "paid" || word === "show" || word === "find") {
            return false;
          }
          return searchableText.includes(word);
        });
      const disputeMatches =
        !wantsDispute || transaction.sampleIssueType !== "N/A";

      return amountMatches && wordMatches && disputeMatches;
    });
  }

  function buildTransactionSearchPrompt(results: MockTransaction[]) {
    const resultLines =
      results.length === 0
        ? "- No mock transactions matched the local filter."
        : results
            .map(
              (transaction) =>
                `- ${transaction.date}: ${transaction.merchant}, ${transaction.amount}, ${transaction.category}, ${transaction.accountLabel}, issue marker: ${transaction.sampleIssueType}`,
            )
            .join("\n");

    return [
      "Explain this mock natural-language transaction search.",
      "",
      `Customer search query: ${transactionSearchQuery}`,
      "",
      "Local mock search results:",
      resultLines,
      "",
      "Output requirements:",
      "- Explain how the query was interpreted.",
      "- Summarize the matching transactions.",
      "- Suggest helpful next actions like view details, download results, create chart, set alert, or start a dispute when relevant.",
      "- Clearly state this is mock demo data, not real account data.",
    ].join("\n");
  }

  async function handleTransactionSearch() {
    const trimmed = transactionSearchQuery.trim();
    if (!canChat || !trimmed) return;

    const results = searchMockTransactions(trimmed);
    setTransactionSearchResults(results);
    setTransactionSearchSummary("");
    setError(null);
    setIsGenerating(true);
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Explaining mock transaction search results on the client GPU...",
    }));

    try {
      await streamTransactionSearchSummary(
        buildTransactionSearchPrompt(results),
        setTransactionSearchSummary,
      );
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking demo.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Transaction search failed.";
      setError(message);
      setTransactionSearchSummary(`Generation failed: ${message}`);
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

  function aggregateTransactions(
    transactions: MockTransaction[],
    getLabel: (transaction: MockTransaction) => string,
  ) {
    const totals = new Map<string, ChartDataPoint>();
    transactions.forEach((transaction) => {
      const label = getLabel(transaction);
      const current = totals.get(label) ?? { label, amount: 0, count: 0 };
      totals.set(label, {
        label,
        amount: current.amount + transaction.amountValue,
        count: current.count + 1,
      });
    });

    return Array.from(totals.values()).sort((left, right) => {
      if (right.amount !== left.amount) return right.amount - left.amount;
      return left.label.localeCompare(right.label);
    });
  }

  function createChartFromQuery(query: string) {
    const normalized = query.toLowerCase();
    const isTravel = normalized.includes("travel");
    const isMerchant =
      normalized.includes("merchant") || normalized.includes("top");
    const isAccount =
      normalized.includes("card") ||
      normalized.includes("checking") ||
      normalized.includes("account");
    const isRecurring =
      normalized.includes("recurring") ||
      normalized.includes("subscription") ||
      normalized.includes("subscriptions");
    const isMonthly =
      normalized.includes("month") ||
      normalized.includes("monthly") ||
      normalized.includes("trend") ||
      normalized.includes("quarter") ||
      normalized.includes("year");

    let scopedTransactions = MOCK_TRANSACTIONS;
    let title = "Spending by category";
    let data = aggregateTransactions(scopedTransactions, (transaction) =>
      transaction.category,
    );

    if (isRecurring) {
      scopedTransactions = MOCK_TRANSACTIONS.filter((transaction) =>
        transaction.tags.some((tag) =>
          ["recurring", "subscription", "subscriptions"].includes(tag),
        ),
      );
      title = "Recurring and subscription spend";
      data = aggregateTransactions(
        scopedTransactions,
        (transaction) => transaction.merchant,
      );
    } else if (isTravel && isMonthly) {
      scopedTransactions = MOCK_TRANSACTIONS.filter(
        (transaction) => transaction.category === "Travel",
      );
      title = "Travel spending by month";
      data = aggregateTransactions(
        scopedTransactions,
        (transaction) => transaction.month,
      );
    } else if (isMerchant) {
      title = "Top merchants by spend";
      data = aggregateTransactions(
        scopedTransactions,
        (transaction) => transaction.merchant,
      ).slice(0, 6);
    } else if (isAccount) {
      title = "Spending by account/card";
      data = aggregateTransactions(
        scopedTransactions,
        (transaction) => transaction.accountLabel,
      );
    } else if (isMonthly) {
      title = "Monthly spending trend";
      data = aggregateTransactions(
        scopedTransactions,
        (transaction) => transaction.month,
      );
    }

    return { title, data };
  }

  function buildVisualizationPrompt(title: string, data: ChartDataPoint[]) {
    const total = data.reduce((sum, point) => sum + point.amount, 0);
    const dataLines =
      data.length === 0
        ? "- No mock transactions matched the chart request."
        : data
            .map(
              (point) =>
                `- ${point.label}: $${point.amount.toFixed(2)} across ${point.count} transaction(s)`,
            )
            .join("\n");

    return [
      "Explain this mock transaction visualization.",
      "",
      `Customer chart request: ${visualizationQuery}`,
      `Generated chart: ${title}`,
      `Total represented spend: $${total.toFixed(2)}`,
      "",
      "Mock aggregated chart data:",
      dataLines,
      "",
      "Output requirements:",
      "- Explain what the chart shows in plain language.",
      "- Mention the largest category, merchant, month, or account when visible.",
      "- Suggest useful next actions such as compare prior month, create alert, review merchant details, or export chart.",
      "- Clearly state this is mock demo data, not real account data.",
    ].join("\n");
  }

  async function handleGenerateVisualization() {
    const trimmed = visualizationQuery.trim();
    if (!canChat || !trimmed) return;

    const nextChart = createChartFromQuery(trimmed);
    setChartTitle(nextChart.title);
    setChartData(nextChart.data);
    setChartSummary("");
    setError(null);
    setIsGenerating(true);
    setProgress((current) => ({
      ...current,
      phase: "generating",
      text: "Explaining mock transaction visualization on the client GPU...",
    }));

    try {
      await streamTransactionVisualizationSummary(
        buildVisualizationPrompt(nextChart.title, nextChart.data),
        setChartSummary,
      );
      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking demo.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Visualization failed.";
      setError(message);
      setChartSummary(`Generation failed: ${message}`);
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

    try {
      const chatHistory: ChatCompletionMessageParam[] = [
        ...messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: "user", content: trimmed },
      ];

      await streamBankingReply(chatHistory, (content) => {
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId ? { ...message, content } : message,
          ),
        );
      });

      setProgress((current) => ({
        ...current,
        phase: "ready",
        text: "Ready for the next banking demo prompt.",
      }));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Generation failed.";
      setError(message);
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
            <p className="eyebrow">WebLLM POC</p>
            <h1>Local Banking Assistant</h1>
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

          <p className="note">
            Demo only. Do not enter real customer, account, card, credential, or
            confidential bank data.
          </p>

          <a className="learn-link" href="/webllm-demo.html">
            <ExternalLink aria-hidden="true" />
            Open WebLLM presentation and GPU demos
          </a>

          {error && <p className="error">{error}</p>}
        </aside>

        <section className="demo-panel">
          <div className="demo-tabs" role="tablist" aria-label="Banking demos">
            <button
              role="tab"
              aria-selected={activeTab === "prompt-lab"}
              aria-controls="panel-prompt-lab"
              onClick={() => setActiveTab("prompt-lab")}
            >
              <MessagesSquare aria-hidden="true" />
              Banking Prompt Lab
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
                <h2>Banking prompt lab</h2>
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
                  <h3>Load the model, then try a sample banking prompt.</h3>
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
                    <p>{message.content || "Thinking..."}</p>
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
                    ? "Ask a banking demo question..."
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
                <p className="eyebrow">Mock Data Only</p>
                <h2>Dispute form filling</h2>
              </div>
              <FileText aria-hidden="true" />
            </header>

            <div className="dispute-disclaimer">
              Demo only. Do not enter real customer, account, card, or dispute
              data. Final submission would happen through a bank-controlled
              dispute workflow.
            </div>

            <div className="dispute-workspace">
              <section className="transaction-list" aria-label="Mock transactions">
                <div className="section-heading">
                  <p className="eyebrow">Step 1</p>
                  <h3>Select a mock transaction</h3>
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
                    placeholder="Use sample text or type a mock customer explanation..."
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
                    Use Sample Explanation
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
                  <pre>{disputeDraft}</pre>
                ) : (
                  <div className="empty-state compact">
                    <h3>No draft yet.</h3>
                    <p>
                      Select a mock transaction, add a customer explanation,
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
                <p className="eyebrow">Mock Transaction Data</p>
                <h2>Natural-language transaction search</h2>
              </div>
              <Search aria-hidden="true" />
            </header>

            <div className="dispute-disclaimer">
              Demo only. Searches run against mock transactions shown in this
              page. No real account, card, or customer transaction data is used.
            </div>

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
                    Search Mock Transactions
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
                    Load the model before asking WebLLM to explain the results.
                  </p>
                )}
              </section>

              <section className="search-results-card">
                <div className="section-heading">
                  <p className="eyebrow">Step 2</p>
                  <h3>Local mock matches</h3>
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
                    <h3>No search run yet.</h3>
                    <p>
                      Pick a sample query or write your own, then search the
                      mock transaction list.
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
                  <pre>{transactionSearchSummary}</pre>
                ) : (
                  <div className="empty-state compact">
                    <h3>No explanation yet.</h3>
                    <p>
                      The model will explain how the mock results match the
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
                <p className="eyebrow">Mock Transaction Data</p>
                <h2>Transaction visualization</h2>
              </div>
              <BarChart3 aria-hidden="true" />
            </header>

            <div className="dispute-disclaimer">
              Demo only. Charts are generated from mock transactions in this
              browser. No real account, card, or customer transaction data is
              used.
            </div>

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
                    Load the model before asking WebLLM to explain the chart.
                  </p>
                )}
              </section>

              <section className="chart-panel">
                <div className="section-heading">
                  <p className="eyebrow">Step 2</p>
                  <h3>{chartData.length > 0 ? chartTitle : "Local chart"}</h3>
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
                    <h3>No chart yet.</h3>
                    <p>
                      Choose a sample chart request or type your own, then
                      generate a local mock visualization.
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
                  <pre>{chartSummary}</pre>
                ) : (
                  <div className="empty-state compact">
                    <h3>No explanation yet.</h3>
                    <p>
                      The model will explain the mock chart and suggest useful
                      next actions.
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
