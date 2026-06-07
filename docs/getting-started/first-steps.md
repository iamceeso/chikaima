# First Steps

Your guide to creating your first conversation and uploading documents.

## Sign In

1. Open http://localhost:3000
2. Click "Sign Up"
3. Enter email and password
4. Click "Create Account"

You're logged in! 🎉

## Create Your First Conversation

### Step 1: Select a Model

1. In the sidebar, look for "Models"
2. Click the settings icon
3. Add your first LLM provider:
   - Choose "OpenAI", "Anthropic", or other
   - Paste your API key
4. Select a model (e.g., GPT-4, Claude)

### Step 2: Start a Conversation

1. Click "New Chat" or "+"
2. Type a title (e.g., "Project Analysis")
3. Select your LLM model
4. Click "Create"

### Step 3: Send Your First Message

In the chat box, type:
```
Hello! Can you help me analyze documents?
```

Click send and watch the AI respond! 💬

## Upload Your First Document

### Step 1: Go to Library

1. Click "Library" in the sidebar
2. Click "Upload" or drag & drop files

### Step 2: Upload a Document

Supported formats:
- PDF (.pdf)
- Text (.txt)
- Word (.docx) - coming soon

Select a file and upload. The document will show as "Processing" while it extracts content.

### Step 3: Use Document in Chat

1. In your conversation
2. Look for the attachment button (📎)
3. Click and select your uploaded document
4. Ask questions about it:
   ```
   Summarize this document
   What are the main points?
   Extract action items from this document
   ```

The AI will read the document content and answer based on it! 📄

## Understanding the Interface

### Sidebar
- **New Chat**: Start a new conversation
- **Recent**: Your recent chats
- **Library**: Your uploaded documents
- **Settings**: Configure providers and models
- **Workspace**: Team collaboration

### Main Chat Area
- **Message Input**: Type your question
- **Attachment Button**: Upload or select documents
- **Send Button**: Send your message
- **Chat History**: See all messages in conversation

### Right Sidebar (Desktop)
- **Conversation Info**: Title, model, creation date
- **Documents**: List of attached documents
- **Settings**: Conversation-specific options

## Tips & Tricks

### Pro Tips

1. **Context is Key**: The more documents you provide, the better the answers
2. **Be Specific**: Ask clear, detailed questions
3. **Use Attachments**: Always attach relevant documents
4. **Review Source**: Check which documents the AI used

### Keyboard Shortcuts

- `Ctrl/Cmd + N`: New conversation
- `Ctrl/Cmd + K`: Search conversations
- `Shift + Enter`: New line in message
- `Ctrl/Cmd + Enter`: Send message

### Document Tips

- PDFs work best (automatic text extraction)
- Keep documents under 100MB
- Split large documents into chunks
- Use OCR for scanned documents

## Common Questions

**Q: How do I add more documents?**
A: Click the attachment button in any chat, then select "Add Document"

**Q: Can I use multiple LLM providers?**
A: Yes! Add multiple providers in Settings, then choose which to use per conversation

**Q: How do I share a conversation?**
A: Create a Workspace and invite collaborators (coming soon)

**Q: What happens to my documents?**
A: They're stored securely on your server. Never sent to third parties (unless you use cloud providers)

## Next Steps

Congratulations! You've completed the basics. 🚀

**Ready to explore more?**

- [Features Guide](../features/README.md) - Learn all features
- [Chat Features](../features/chat.md) - Deep dive into chat
- [Document Processing](../features/documents.md) - Advanced document handling
- [RAG Guide](../features/rag.md) - Retrieval-Augmented Generation

**Want to customize?**

- [Configuration Guide](./configuration.md) - Configure settings
- [Provider Setup](../guides/add-provider.md) - Add more LLM providers
- [Deployment Guide](../deployment/README.md) - Deploy to production

---

Have fun exploring Olanma! 🎉
