# WebLLM Banking Assistant

A browser-based banking assistant that runs a compact language model locally with WebLLM and WebGPU. The app demonstrates client-side inference for banking education, customer communication, transaction workflows, and visual transaction insights.

## Functionality

- **Banking Prompts**: Ask banking questions and get locally generated responses in the browser.
- **Dispute Form Filling**: Select a transaction, add dispute details, and generate a structured draft.
- **Transaction Explanation**: Select one transaction and generate a customer-friendly explanation from a small context payload.
- **Complaint Intake**: Turn a customer complaint into a structured associate review summary.
- **Transaction Search**: Ask WebLLM to select matching transactions from the full sample dataset and explain the results.
- **Transaction Visualization**: Ask WebLLM to select, group, and describe transaction chart data from the full sample dataset.
- **Model Calls**: Inspect each WebLLM request and response, including the transaction dataset sent to the model.
- **WebLLM Learning Page**: Review WebLLM, WebGPU, IndexedDB, caching, and banking use-case concepts at `/webllm-demo.html`.
- **Simple Markdown Rendering**: Assistant responses render headings, bullets, paragraphs, and bold text as HTML.

## Tech Stack

- React
- TypeScript
- Vite
- WebLLM
- WebGPU
- IndexedDB cache backend

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Sample Banking Prompts

- Explain the difference between available balance and current balance in simple customer-friendly language.
- Draft a polite response to a customer asking why an ACH transfer is still pending.
- Summarize the steps a customer should take if they see an unfamiliar card transaction.
- Explain why an overdraft fee might appear on a checking account.
- Rewrite this message in a warmer tone: "Your payment was declined due to insufficient funds."
- Create a short FAQ answer explaining what pending transactions are.
- Draft a support reply for a customer asking how to avoid monthly maintenance fees.
- Explain the difference between a debit card dispute and a credit card dispute.
- Create a checklist for opening a new checking account.
- Summarize a bank policy into three plain-language bullet points.
- Draft an alert message for a customer whose recurring subscription increased.
- Explain what a minimum payment means on a credit card statement.
- Write a customer-friendly explanation of why a deposited check may be on hold.
- Create a branch associate script for explaining CD early withdrawal penalties.
- Turn this internal note into a customer-facing response: "ACH return code R01 indicates insufficient funds."

## Suggested Demo Flow

1. Start with an explanation prompt, such as available balance versus current balance.
2. Try a customer communication prompt, such as rewriting a declined payment message.
3. Use a structured prompt, such as creating a checklist or summarizing a policy.
4. Use dispute form filling, transaction explanation, and complaint intake for the strongest small-context demos.
5. Keep transaction search and visualization as exploratory examples, then open Model Calls to inspect the request payload and response behind each workflow.

## Notes

The first model load downloads WebLLM model artifacts into browser storage. Later visits can reuse the local cache for faster startup.
