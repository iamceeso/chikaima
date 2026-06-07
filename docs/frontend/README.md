# Frontend Development

Complete guide to frontend development with React and Next.js.

## Table of Contents

- Project Structure
- Component Patterns
- State Management
- Data Fetching
- Styling
- Forms
- Testing
- Performance

## Project Structure

```
frontend/
├── app/
│   ├── (app)/                    # Protected routes
│   │   ├── workspace/
│   │   │   ├── page.tsx          # Chat interface
│   │   │   ├── layout.tsx
│   │   │   └── components/
│   │   ├── library/              # Document library
│   │   │   ├── page.tsx
│   │   │   └── components/
│   │   ├── settings/             # User settings
│   │   └── layout.tsx            # App layout
│   ├── (auth)/                   # Auth routes
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Home page
├── components/
│   ├── ui/                       # Shadcn/ui components
│   │   ├── Button.tsx
│   │   ├── Dialog.tsx
│   │   ├── Card.tsx
│   │   └── ...
│   ├── Chat/                     # Chat domain components
│   │   ├── ChatWindow.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageInput.tsx
│   │   └── ConversationSidebar.tsx
│   ├── Library/                  # Library domain
│   │   ├── DocumentList.tsx
│   │   ├── UploadArea.tsx
│   │   └── DocumentPreview.tsx
│   └── Common/                   # Shared components
│       ├── Header.tsx
│       ├── Sidebar.tsx
│       └── Loading.tsx
├── hooks/                        # Custom React hooks
│   ├── useChat.ts               # Chat logic
│   ├── useAuth.ts               # Auth logic
│   ├── useDocuments.ts          # Document logic
│   └── useApi.ts                # API utilities
├── lib/
│   ├── api.ts                   # API client
│   ├── utils.ts                 # Utilities
│   └── validation.ts            # Zod schemas
├── store/                        # Zustand stores
│   ├── auth.ts                  # Auth state
│   ├── chat.ts                  # Chat state
│   └── ui.ts                    # UI state
├── styles/
│   ├── globals.css              # Global styles
│   └── tailwind.config.ts       # Tailwind config
├── types/
│   ├── api.ts                   # API types
│   ├── domain.ts                # Domain types
│   └── ui.ts                    # UI types
└── package.json
```

## Component Patterns

### Page Component

```typescript
// app/workspace/page.tsx
import { ChatWindow } from '@/components/Chat/ChatWindow';
import { useAuth } from '@/hooks/useAuth';
import { redirect } from 'next/navigation';

export default function WorkspacePage() {
  const { user } = useAuth();
  
  if (!user) {
    redirect('/login');
  }
  
  return (
    <div className="flex h-screen">
      <ChatWindow />
    </div>
  );
}
```

### UI Component

```typescript
// components/ui/Button.tsx
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = 'font-medium transition-colors rounded';
  const variantStyles = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    ghost: 'bg-transparent hover:bg-gray-100',
  };
  const sizeStyles = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]}`}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? 'Loading...' : children}
    </button>
  );
}
```

### Domain Component

```typescript
// components/Chat/ChatWindow.tsx
import { useChat } from '@/hooks/useChat';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function ChatWindow() {
  const { messages, sendMessage, isLoading } = useChat();

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
      <div className="border-t p-4">
        <MessageInput
          onSend={sendMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
```

## State Management with Zustand

### Create a Store

```typescript
// store/chat.ts
import { create } from 'zustand';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatStore {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  isLoading: false,
  error: null,
  
  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  
  clearMessages: () => set({ messages: [] }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
}));
```

### Use a Store

```typescript
import { useChatStore } from '@/store/chat';

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} className="mb-4">
          {msg.content}
        </div>
      ))}
    </div>
  );
}
```

## Data Fetching with React Query

### API Client

```typescript
// lib/api.ts
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

// Add auth token to requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const api = {
  chat: {
    stream: (payload: any) =>
      fetch(`/api/v1/chat/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
  },
  documents: {
    upload: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post('/documents/upload', formData);
    },
    list: () => apiClient.get('/documents'),
  },
};
```

### Query Hook

```typescript
// hooks/useDocuments.ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDocuments() {
  return useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await api.documents.list();
      return response.data;
    },
  });
}
```

### Usage

```typescript
export function DocumentList() {
  const { data: documents, isLoading, error } = useDocuments();
  
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  
  return (
    <div>
      {documents?.map((doc) => (
        <div key={doc.id}>{doc.name}</div>
      ))}
    </div>
  );
}
```

## Styling with Tailwind CSS

### Configuration

```typescript
// tailwind.config.ts
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        secondary: '#8B5CF6',
      },
      spacing: {
        '128': '32rem',
      },
    },
  },
  plugins: [],
};
```

### Common Patterns

```typescript
// Responsive layout
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

// Flexbox centering
<div className="flex items-center justify-center h-screen">

// Dark mode
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">

// Hover effects
<button className="hover:bg-blue-700 transition-colors">

// Typography
<h1 className="text-3xl font-bold">
```

## Forms with React Hook Form

```typescript
// components/Chat/MessageInput.tsx
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const messageSchema = z.object({
  content: z.string().min(1).max(5000),
});

type MessageInput = z.infer<typeof messageSchema>;

export function MessageInput({ onSend }: { onSend: (msg: string) => void }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<MessageInput>({
    resolver: zodResolver(messageSchema),
  });

  const onSubmit = (data: MessageInput) => {
    onSend(data.content);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
      <input
        {...register('content')}
        placeholder="Type your message..."
        className="flex-1 border rounded px-3 py-2"
      />
      {errors.content && (
        <span className="text-red-500">{errors.content.message}</span>
      )}
      <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">
        Send
      </button>
    </form>
  );
}
```

## Testing

### Component Test

```typescript
// __tests__/Button.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onClick handler', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    screen.getByText('Click').click();
    expect(handleClick).toHaveBeenCalled();
  });
});
```

## Performance Tips

1. Use React.memo for expensive components
2. Code split with dynamic imports
3. Lazy load images with Image component
4. Optimize bundle size with tree shaking
5. Use production build for testing
6. Monitor Core Web Vitals

---

See specific guides: Components, State Management, Data Fetching, Forms, Testing, Styling
