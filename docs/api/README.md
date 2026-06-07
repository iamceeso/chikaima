# API Reference

Complete REST API documentation for Olanma.

## Authentication

All endpoints except auth routes require JWT token in Authorization header.

```
Authorization: Bearer {access_token}
```

### Login

POST /api/v1/auth/login

Request:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response:
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "bearer"
}
```

### Register

POST /api/v1/auth/register

Request:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

Response:
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "created_at": "2026-06-07T12:00:00Z"
}
```

## Chat Endpoints

### List Conversations

GET /api/v1/chat/conversations

Response:
```json
[
  {
    "id": "conv-uuid",
    "title": "Project Planning",
    "model_id": "model-uuid",
    "created_at": "2026-06-07T12:00:00Z",
    "updated_at": "2026-06-07T12:05:00Z"
  }
]
```

### Create Conversation

POST /api/v1/chat/conversations

Request:
```json
{
  "title": "New Conversation",
  "model_id": "model-uuid"
}
```

Response: 201 Created with conversation object

### Delete Conversation

DELETE /api/v1/chat/conversations/{conversation_id}

Response: 204 No Content

### Stream Chat Response

POST /api/v1/chat/stream

Request:
```json
{
  "conversation_id": "conv-uuid",
  "content": "Your message here",
  "use_rag": true
}
```

Response: Server-Sent Events stream

Events:
```
event: metadata
data: {"conversation_id": "...", "user_message_id": "..."}

event: token
data: {"text": "Token text"}

event: token
data: {"text": "More tokens"}

event: done
data: {"status": "completed"}
```

## Document Endpoints

### Upload Document

POST /api/v1/documents/upload

Content-Type: multipart/form-data

Parameters:
- file: (binary) PDF, TXT, or DOCX file

Response: 201 Created
```json
{
  "id": "doc-uuid",
  "name": "document.pdf",
  "status": "pending",
  "created_at": "2026-06-07T12:00:00Z"
}
```

### List Documents

GET /api/v1/documents

Response:
```json
[
  {
    "id": "doc-uuid",
    "name": "document.pdf",
    "status": "completed",
    "summary": "Document summary...",
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Delete Document

DELETE /api/v1/documents/{document_id}

Response: 204 No Content

## Audio Endpoints

### Upload Audio

POST /api/v1/audio/upload

Content-Type: multipart/form-data

Response: 201 Created

### List Audio

GET /api/v1/audio

Response:
```json
[
  {
    "id": "audio-uuid",
    "name": "recording.mp3",
    "status": "completed",
    "transcript": "Transcribed text...",
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Delete Audio

DELETE /api/v1/audio/{audio_id}

Response: 204 No Content

## Video Endpoints

### Upload Video

POST /api/v1/video/upload

Content-Type: multipart/form-data

Response: 201 Created

### List Videos

GET /api/v1/video

Response:
```json
[
  {
    "id": "video-uuid",
    "name": "recording.mp4",
    "status": "completed",
    "summary": "Video summary...",
    "action_items": ["Item 1", "Item 2"],
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Delete Video

DELETE /api/v1/video/{video_id}

Response: 204 No Content

## Provider Endpoints

### List Providers

GET /api/v1/providers

Response:
```json
[
  {
    "id": "provider-uuid",
    "provider_type": "openai",
    "is_enabled": true,
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Add Provider

POST /api/v1/providers

Request:
```json
{
  "provider_type": "openai",
  "secret_key": "sk-..."
}
```

Response: 201 Created

### Update Provider

PUT /api/v1/providers/{provider_id}

Request:
```json
{
  "is_enabled": false
}
```

Response: 200 OK

### Delete Provider

DELETE /api/v1/providers/{provider_id}

Response: 204 No Content

## Model Endpoints

### List Models

GET /api/v1/models

Response:
```json
[
  {
    "id": "model-uuid",
    "provider_id": "provider-uuid",
    "model_key": "gpt-4",
    "name": "GPT-4",
    "is_enabled": true,
    "is_default": true,
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Update Model

PUT /api/v1/models/{model_id}

Request:
```json
{
  "is_enabled": true,
  "is_default": false
}
```

Response: 200 OK

## User Endpoints

### Get Current User

GET /api/v1/users/me

Response:
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "created_at": "2026-06-07T12:00:00Z"
}
```

### Update Profile

PUT /api/v1/users/me

Request:
```json
{
  "email": "newemail@example.com"
}
```

Response: 200 OK

### Change Password

POST /api/v1/users/change-password

Request:
```json
{
  "current_password": "oldpass123",
  "new_password": "newpass456"
}
```

Response: 200 OK

## Job Endpoints

### List Jobs

GET /api/v1/jobs

Response:
```json
[
  {
    "id": "job-uuid",
    "job_type": "document_analysis",
    "status": "completed",
    "progress": 100,
    "created_at": "2026-06-07T12:00:00Z"
  }
]
```

### Get Job Status

GET /api/v1/jobs/{job_id}

Response:
```json
{
  "id": "job-uuid",
  "status": "processing",
  "progress": 45,
  "created_at": "2026-06-07T12:00:00Z"
}
```

## Status Codes

### Success Responses

200 OK - Request successful
201 Created - Resource created
204 No Content - Successful deletion or empty response

### Client Errors

400 Bad Request - Invalid request format
401 Unauthorized - Missing or invalid authentication
403 Forbidden - Not authorized to access resource
404 Not Found - Resource not found
422 Validation Error - Invalid data

### Server Errors

500 Internal Server Error - Server error
503 Service Unavailable - Service temporarily down

## Rate Limiting

Not enforced in development. Production implementations should include:

Headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1623000000
```

## Testing

Using cURL:
```bash
# Get token
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  | jq -r '.access_token')

# List conversations
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/v1/chat/conversations
```

Using Python:
```python
import requests

token = "eyJhbGc..."
headers = {"Authorization": f"Bearer {token}"}

response = requests.get(
  "http://localhost:8000/api/v1/chat/conversations",
  headers=headers
)
conversations = response.json()
```

Using JavaScript:
```javascript
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
};

const response = await fetch(
  'http://localhost:8000/api/v1/chat/conversations',
  { headers }
);
const conversations = await response.json();
```

---

API Documentation available at: http://localhost:8000/docs
