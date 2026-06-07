# Components

Detailed breakdown of all major components and their responsibilities.

## Frontend Components

### User Interface Components

Chat Window
- Message display
- Message input box
- Attachment selector
- Send button
- Loading indicators

Library/Document Browser
- File upload area
- Document list
- File preview
- Delete/manage options
- Status indicators (processing, completed, failed)

Sidebar Navigation
- New conversation button
- Recent conversations list
- Library link
- Settings link
- Workspace selector

Settings Panel
- Provider management
- Model selection
- User profile
- Workspace settings

## Backend API Components

### API Handlers (Endpoints)

Authentication Handler
- User registration
- Login with JWT
- Token refresh
- Logout
- Password reset

Chat Handler
- Create conversation
- Send message
- Stream chat response
- List conversations
- Delete conversation
- Pin/unpin conversation

Document Handler
- Upload document
- List documents
- Delete document
- Get document content
- Get transcript

Provider Handler
- List providers
- Add provider
- Update provider settings
- Delete provider
- Validate API keys

User Handler
- Get user profile
- Update profile
- Change password
- List workspaces

## Service Components

### ChatService

Responsibilities:
- Create and manage conversations
- Process incoming messages
- Integrate with LLM providers
- Handle message serialization
- Manage chat history

Key Methods:
```
create_conversation(user_id, payload)
get_conversation(conversation_id, user_id)
send_message(conversation_id, message)
stream_chat(conversation_id, message, provider)
delete_conversation(conversation_id, user_id)
```

### AuthService

Responsibilities:
- User registration
- Password hashing and verification
- JWT token generation and validation
- Token refresh logic
- Session management

Key Methods:
```
register_user(email, password)
authenticate_user(email, password)
create_tokens(user_id)
verify_token(token)
refresh_token(refresh_token)
```

### DocumentService

Responsibilities:
- Handle file uploads
- Store file metadata
- Queue document processing
- Manage document storage
- Track processing status

Key Methods:
```
upload_document(user_id, file)
get_document(document_id, user_id)
list_documents(user_id)
delete_document(document_id, user_id)
```

### EmbeddingsService

Responsibilities:
- Convert text to embeddings
- Store embeddings in vector DB
- Perform semantic search
- Manage embedding lifecycle

Key Methods:
```
embed_text(text)
embed_batch(texts)
search_similar(query, top_k)
store_embedding(doc_id, embedding)
```

### ProviderService

Responsibilities:
- Manage LLM provider credentials
- Route requests to appropriate provider
- Handle provider-specific logic
- Validate API keys
- Manage provider configuration

Key Methods:
```
add_provider(user_id, provider_type, api_key)
get_provider(provider_id)
create_provider_instance(provider)
list_available_models(provider_id)
```

## Repository Components

### UserRepository

Handles user data persistence:
- Create user
- Get user by ID
- Get user by email
- Update user
- Delete user

### ConversationRepository

Handles conversation data:
- Create conversation
- Get conversation
- List conversations for user
- Update conversation
- Delete conversation
- Mark as pinned/archived

### MessageRepository

Handles message data:
- Create message
- Get message
- List messages in conversation
- Update message
- Delete message

### DocumentRepository

Handles document metadata:
- Create document record
- Update document status
- Get document
- List documents
- Delete document

## Worker Components (Celery)

### Document Processing Worker

Tasks:
- Extract text from PDF
- Extract text from Word documents
- Generate document summary
- Update document status
- Handle extraction errors

Process:
1. Receive document_id
2. Load file from storage
3. Extract text/content
4. Generate summary
5. Store results
6. Update status to completed

### Transcription Worker

Tasks:
- Transcribe audio files
- Generate timestamps
- Store transcript
- Update audio asset status

Supported Formats:
- MP3
- WAV
- M4A
- FLAC

### Video Processing Worker

Tasks:
- Extract audio from video
- Transcribe audio
- Generate video summary
- Extract action items
- Store metadata

### Embedding Worker

Tasks:
- Generate embeddings for documents
- Batch process chunks
- Store in vector database
- Update indexing status

## Database Components

### PostgreSQL

Primary data store for:
- User accounts
- Conversations and messages
- Documents metadata
- Providers and API keys
- Workspaces and permissions
- Job status and history

### Redis

Cache and queue storage for:
- Session data
- Query results
- Chat context cache
- Celery task queue
- Rate limiting counters

### Vector Database

Stores embeddings for:
- Document chunks
- Query embeddings
- Semantic search capability

Implementation Options:
- Pgvector (PostgreSQL extension)
- Milvus (standalone)
- Weaviate (standalone)
- Pinecone (cloud)

### File Storage

Stores uploaded files:
- Documents (PDF, TXT, DOCX)
- Audio files (MP3, WAV, etc.)
- Video files (MP4, MOV, etc.)
- Thumbnails and previews

Storage Options:
- Local filesystem
- AWS S3
- Google Cloud Storage
- Azure Blob Storage

## External Components

### LLM Providers

OpenAI
- GPT-4, GPT-3.5-Turbo
- Text-Embedding-3
- Whisper (transcription)

Anthropic
- Claude 3 (Opus, Sonnet, Haiku)
- Text embeddings (coming)

Cohere
- Command models
- Embed models

HuggingFace
- Open-source models
- Inference API

### Infrastructure

Nginx
- Reverse proxy
- Load balancing
- SSL/TLS termination
- Static file serving

Docker/Kubernetes
- Container orchestration
- Service management
- Auto-scaling
- Health monitoring

---

**Next**: [Data Flow](./data-flow.md)
