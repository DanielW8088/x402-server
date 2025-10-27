# Frontend Queue Integration Example

This directory contains example React components for integrating the queue system into your frontend.

## Components

### QueueStatus.tsx

A complete React component that displays:
- Global queue statistics (pending, processing, completed, failed)
- User's mint requests with status
- Real-time updates via polling
- Estimated wait times
- Transaction links

## Usage

### 1. Install Dependencies

```bash
npm install react
```

### 2. Import Component

```typescript
import { QueueStatus } from './QueueStatus';

function App() {
  const [address, setAddress] = useState<string>('0x...');
  
  return (
    <div>
      <QueueStatus 
        serverUrl="http://localhost:4021"
        payerAddress={address}
      />
    </div>
  );
}
```

### 3. Submit Mint Request

```typescript
async function submitMint(payer: string) {
  const response = await fetch('http://localhost:4021/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payer })
  });
  
  const data = await response.json();
  
  console.log('Queue ID:', data.queueId);
  console.log('Position:', data.queuePosition);
  console.log('Estimated wait:', data.estimatedWaitSeconds, 'seconds');
  
  return data;
}
```

### 4. Poll Specific Queue Item

```typescript
async function checkQueueItem(queueId: string) {
  const response = await fetch(`http://localhost:4021/queue/item/${queueId}`);
  const data = await response.json();
  
  console.log('Status:', data.status);
  console.log('Queue position:', data.queue_position);
  
  if (data.status === 'completed') {
    console.log('Mint TX:', data.mint_tx_hash);
  }
  
  return data;
}
```

## Features

### Real-time Updates

The component polls the server every 2 seconds to fetch:
- Global queue statistics
- User's request status

### Status States

- **Pending** - Waiting in queue
  - Shows queue position
  - Shows estimated wait time
  
- **Processing** - Currently being minted in a batch
  - Shows processing indicator
  
- **Completed** - Successfully minted
  - Shows transaction hash
  - Shows completion time
  - Link to block explorer
  
- **Failed** - Mint failed
  - Shows error message
  - Can be retried (manual)

### Payment Type Indicators

- 🆓 Gasless (EIP-3009)
- 💳 x402 Protocol
- 💰 Custom USDC Payment

## Styling

The component includes inline styles. You can:
1. Extract to a separate CSS file
2. Use CSS modules
3. Convert to Tailwind classes
4. Use CSS-in-JS (styled-components, emotion)

## Advanced Integration

### With wagmi/viem

```typescript
import { useAccount } from 'wagmi';
import { QueueStatus } from './QueueStatus';

function MintPage() {
  const { address } = useAccount();
  
  return (
    <QueueStatus 
      serverUrl={process.env.NEXT_PUBLIC_MINT_SERVER}
      payerAddress={address || ''}
    />
  );
}
```

### With Notifications

```typescript
import { toast } from 'react-hot-toast';

function watchQueueItem(queueId: string) {
  const interval = setInterval(async () => {
    const item = await fetch(`/queue/item/${queueId}`).then(r => r.json());
    
    if (item.status === 'completed') {
      clearInterval(interval);
      toast.success('Tokens minted successfully!', {
        action: {
          label: 'View TX',
          onClick: () => window.open(`https://basescan.org/tx/${item.mint_tx_hash}`)
        }
      });
    } else if (item.status === 'failed') {
      clearInterval(interval);
      toast.error(`Mint failed: ${item.error_message}`);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}
```

### Batch Progress Bar

```typescript
function QueueProgress({ position }: { position: number }) {
  const batchSize = 50;
  const batchNumber = Math.ceil(position / batchSize);
  const positionInBatch = position % batchSize || batchSize;
  
  return (
    <div>
      <div>Batch #{batchNumber}</div>
      <div>Position in batch: {positionInBatch}/{batchSize}</div>
      <progress value={positionInBatch} max={batchSize} />
    </div>
  );
}
```

## API Reference

### GET /queue/status

Returns global queue statistics.

### GET /queue/payer/:address

Returns all requests for a specific payer address.

### GET /queue/item/:queueId

Returns detailed status for a specific queue item.

### POST /mint

Adds a new mint request to the queue.

## Best Practices

1. **Polling Frequency** - Use 2-3 second intervals to balance UX and server load
2. **Error Handling** - Always handle network errors gracefully
3. **Loading States** - Show loading indicators while fetching
4. **Caching** - Consider caching completed requests
5. **Cleanup** - Clear intervals when component unmounts

## Performance Optimization

```typescript
// Use React Query for better caching and state management
import { useQuery } from '@tanstack/react-query';

function useQueueStats() {
  return useQuery({
    queryKey: ['queueStats'],
    queryFn: async () => {
      const res = await fetch('/queue/status');
      return res.json();
    },
    refetchInterval: 2000, // Auto-refetch every 2s
  });
}
```

## Testing

```typescript
import { render, waitFor } from '@testing-library/react';
import { QueueStatus } from './QueueStatus';

test('displays queue statistics', async () => {
  const { getByText } = render(
    <QueueStatus 
      serverUrl="http://localhost:4021"
      payerAddress="0x123..."
    />
  );
  
  await waitFor(() => {
    expect(getByText(/Pending/i)).toBeInTheDocument();
  });
});
```

