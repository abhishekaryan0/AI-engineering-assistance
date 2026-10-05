# AI Agentic Energy Backend

A powerful, agentic AI backend designed for high-performance engineering analysis, document processing, and intelligent decision making. Built with Node.js, TypeScript, and modern AI models (OpenAI, Gemini).

## 🚀 Features

- **Agentic Core**: Intelligent router that decides whether to chat, research (RAG), analyze files, or take action.
- **Multimodal Vision**: Automatically processes PDFs, Images, and specialized charts/logs (Well Logs, Seismic Graphs) using **Gemini 2.0 Flash**.
- **RAG (Retrieval Augmented Generation)**: Vector search integration for long-term memory and document retrieval.
- **Cost Tracking**: Granular cost tracking for every request (Vision + Agent + Completion) with detailed logging.
- **File Cleanup**: Robust automated cleanup of temporary files to prevent disk exhaustion.
- **Optimized Performance**:
  - **GPT-4o-mini** for chat and decision making (Low cost, high speed).
  - **Gemini 2.0 Flash** for massive context vision processing.

## 🛠️ Installation

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd ai-agentic-energy
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    Create a `.env` file in the root directory:
    ```env
    PORT=3000
    NODE_ENV=development
    
    # Auth
    JWT_SECRET="your-super-secret-key"

    # AI Models (Optimized)
    OPENROUTER_API_KEY="your-openrouter-key"
    AI_MODEL_NAME="openai/gpt-4o-mini"
    AI_MODEL_DECISION="openai/gpt-4o-mini"
    AI_MODEL_VISION="google/gemini-2.0-flash-001"
    AI_MODEL_EMBEDDING="openai/text-embedding-3-small"

    # Database
    DATABASE_URL="postgresql://user:pass@localhost:5432/db_name"

    # AWS S3 (for file storage)
    AWS_ACCESS_KEY_ID="your-access-key"
    AWS_SECRET_ACCESS_KEY="your-secret-key"
    AWS_REGION="us-east-1"
    AWS_BUCKET_NAME="your-bucket-name"
    ```

4.  **Build**:
    ```bash
    npm run build
    ```

5.  **Start Server**:
    ```bash
    npm start
    ```

## 🧪 Testing

The project uses **Jest** for testing.

```bash
# Run tests
npm test
```

## 📡 API Endpoints

### `POST /api/chat`
Main interaction endpoint.
- **Body**: `{ "message": "Analyze this file...", "sessionId": "..." }`
- **Response**:
    ```json
    {
      "response": "Markdown formatted answer...",
      "usage": {
        "prompt_tokens": 150,
        "completion_tokens": 50,
        "total_tokens": 200,
        "total_cost": 0.000450
      }
    }
    ```

## 🏗️ Architecture

- **`src/services/agent`**: Core logic for decision making (Router, Prompts).
- **`src/services/handlers`**: Specialized handlers for PDF, Image, spreadsheets.
- **`src/services/llm`**: Centralized LLM service with error handling and retry logic.
- **`src/services/rag`**: Vector database interactions.



## install prisma first time (if prisma folder not avaialble):
-- npx prisma generate //This will create the table and enable the extension in your database.
1 npx prisma init
2 npx prisma db push or npx prisma db pull
3 npx prisma generate



3 npx prisma generate


## 📚 Glossary Management

The O&G Glossary is stored in `src/modules/glossary/data/og_glossary.json`.

### How to Add/Update Terms
1.  Open `src/modules/glossary/data/og_glossary.json`.
2.  Add a new block to the array:
    ```json
    {
      "term": "New Term",
      "definition": "Description of the term.",
      "related": "Related Term 1, Related Term 2",
      "source": "manual"
    }
    ```
3.  **Apply Changes**:
    *   **For Fast Search (Memory)**: Simply **restart the server**.
    *   **For Fast Search (Memory)**: Simply **restart the server**.