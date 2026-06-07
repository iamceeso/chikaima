# Data Flow

How data moves through the system in key scenarios.

## Chat Message Flow

### Step 1: User Sends Message

User Types Message
  │
  ├─ Validate message length (1-5000 chars)
  ├─ Validate conversation access
  │
  └─→ POST /api/v1/chat/stream
       │
       ├─ Body: {
       │   conversation_id: "conv-123",
       │   content: "Analyze this",
       │   metadata: { attachments: [...] }
       │ }
       │
       └─→ Backend Receives


### Step 2: Backend Processes

Backend API
  │
  ├─ Authenticate JWT token
  ├─ Load conversation from DB
  ├─ Verify user owns conversation
  │
  └─→ Create Message Record
       │
       ├─ message_id = UUID
       ├─ role = "user"
       ├─ content = message text
       ├─ meta = { attachments: [...] }
       │
       └─→ Save to PostgreSQL
            │
            └─→ Message created


### Step 3: Serialize Messages with Context

Fetch Previous Messages
  │
  ├─ Load all messages for conversation
  ├─ Order by created_at
  │
  └─→ Process Each Message
       │
       ├─ Check for attachments in meta
       │  │
       │  ├─ If PDF:
       │  │  └─ Extract text (first 5 pages)
       │  │     └─ Limit to 10K chars
       │  │
       │  ├─ If Audio:
       │  │  └─ Get transcript from AudioAsset
       │  │
       │  └─ If Video:
       │     └─ Get summary from VideoAsset
       │
       └─→ Append to message content
            │
            └─→ Serialized Messages Ready


### Step 4: Add RAG Context (if enabled)

If use_rag = true:
  │
  ├─ Get user's query: "Analyze this"
  │
  ├─ Convert to embedding
  │  └─ Using text-embedding-3-small
  │
  ├─ Search vector database
  │  └─ Find similar document chunks
  │     └─ Top 5 results with score > 0.7
  │
  ├─ Retrieve full document text
  │
  └─→ Add to system prompt
       │
       └─→ Context Added


### Step 5: Call LLM Provider

Prepare LLM Request
  │
  ├─ Model: GPT-4
  ├─ Messages: [system, previous, current]
  ├─ Temperature: 0.7
  ├─ Max tokens: 2048
  │
  └─→ Stream to OpenAI API
       │
       ├─ Connection established
       │
       └─→ Tokens Stream In
            │
            token: "The"
            token: " analysis"
            token: " shows"
            ...


### Step 6: Stream Tokens to Client

Backend Streams (SSE)
  │
  ├─ event: metadata
  │  data: { user_message_id: "msg-123", ... }
  │
  ├─ event: token
  │  data: { text: "The" }
  │
  ├─ event: token
  │  data: { text: " analysis" }
  │
  ├─ event: token (repeated)
  │  data: { text: "..." }
  │
  └─ event: done
     data: { status: "completed" }
          │
          └─→ Client Receives (Real-Time)


### Step 7: Client Updates UI

Frontend (React)
  │
  ├─ Parse SSE events
  ├─ Update message state
  ├─ Re-render chat window
  │  │
  │  └─ Display tokens as they arrive
  │
  ├─ On "done" event:
  │  └─ Mark message complete
  │     └─ Enable input
  │
  └─→ User Sees Response


### Step 8: Save Response

Backend Saves Assistant Message
  │
  ├─ Full response assembled
  │
  ├─ Create Message Record
  │  │
  │  ├─ message_id = UUID
  │  ├─ role = "assistant"
  │  ├─ content = full response
  │  ├─ meta = { rag_context: [...] }
  │  │
  │  └─→ Save to PostgreSQL
  │
  ├─ Update conversation
  │  └─ updated_at = now
  │
  └─→ Complete


## Document Upload Flow

User Selects File
  │
  ├─ File: report.pdf (2.3 MB)
  │
  └─→ POST /api/v1/documents/upload
      │
      │ Multipart form-data:
      │ - file: binary PDF data
      │

Backend Receives Upload
  │
  ├─ Validate file type
  │  └─ Allowed: .pdf, .txt, .docx
  │
  ├─ Check file size
  │  └─ Max: 500 MB (configurable)
  │
  ├─ Generate unique filename
  │  └─ storage/{user_id}/{uuid}-report.pdf
  │
  ├─ Save to disk/S3
  │
  ├─ Create Document record
  │  │
  │  ├─ document_id = UUID
  │  ├─ user_id = current_user_id
  │  ├─ name = "report.pdf"
  │  ├─ file_path = "storage/..."
  │  ├─ status = "pending"
  │  │
  │  └─→ Save to PostgreSQL
  │
  ├─ Return 201 Created with document_id
  │
  └─→ Frontend Receives
      │
      └─ Display document as "Processing..."


Background Processing (Celery)

Celery Worker Receives Task
  │
  ├─ Task ID: process_document
  ├─ Parameters: document_id, file_path
  │
  └─→ Load Document from DB
      │
      ├─ file_path = "storage/user-1/abc123-report.pdf"
      │
      ├─ Open file from storage
      │
      ├─ Extract Text using PyPDF2
      │  │
      │  └─ For each page (max 5):
      │     └─ extract_text()
      │
      ├─ Generate Summary
      │  │
      │  └─ Use LLM to summarize first 2000 chars
      │
      ├─ Store Results
      │  │
      │  ├─ Update Document record:
      │  │  ├─ status = "completed"
      │  │  ├─ summary = "This document..."
      │  │  ├─ extracted_text = "..."
      │  │
      │  └─→ Save to PostgreSQL
      │
      ├─ Queue Embedding Task
      │
      └─→ Complete


Frontend Updates (Polling)

Frontend Polls Status
  │
  ├─ Every 2 seconds:
  │  └─ GET /api/v1/documents/{doc_id}
  │
  ├─ Response: status = "completed"
  │
  ├─ Update UI
  │  └─ Document now ready to use
  │
  └─→ User Can Reference Document


## RAG Query Flow

User Asks Question
  │
  ├─ "Summarize the key findings"
  │
  └─→ Backend Processes


Generate Query Embedding
  │
  ├─ Text: "Summarize the key findings"
  │
  ├─ Call Embeddings API
  │  └─ OpenAI text-embedding-3-small
  │
  ├─ Result: [0.12, -0.45, 0.89, ...]
  │  └─ 1536 dimensional vector
  │
  └─→ Embedding Ready


Vector Database Search
  │
  ├─ Query embedding: [0.12, -0.45, ...]
  │
  ├─ Search pgvector/Milvus
  │  │
  │  ├─ Calculate similarity scores
  │  │  └─ Cosine similarity to all chunks
  │  │
  │  └─ Return top 5 results:
  │     ├─ Chunk 1: score 0.92 (match!)
  │     ├─ Chunk 2: score 0.88 (match!)
  │     ├─ Chunk 3: score 0.85 (match!)
  │     ├─ Chunk 4: score 0.82 (match)
  │     └─ Chunk 5: score 0.78 (match)
  │
  └─→ Top Documents Found


Retrieve Full Content
  │
  ├─ For each top result:
  │  │
  │  ├─ Load Document from DB
  │  │
  │  ├─ Get chunk text:
  │  │  └─ "The findings show..."
  │  │
  │  └─ Add to context
  │
  └─→ RAG Context Ready


Augment LLM Request
  │
  ├─ System Prompt:
  │  "You are an AI analyst. Use the provided context..."
  │
  ├─ Context:
  │  "From analysis of documents:
  │   - Chunk 1: The findings show..."
  │   - Chunk 2: Key metrics indicate..."
  │   - ..."
  │
  ├─ User Question:
  │  "Summarize the key findings"
  │
  └─→ Send to LLM
      │
      └─→ LLM Generates Response
          │
          └─→ "Based on the documents, the key findings are..."


---

**Next**: [Technology Stack](./tech-stack.md)
