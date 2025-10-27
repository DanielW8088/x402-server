/**
 * Queue Status Component - Example Frontend Integration
 * 
 * This component demonstrates how to:
 * 1. Submit mint request to queue
 * 2. Poll for queue status
 * 3. Display queue position and estimated wait time
 * 4. Show completion status
 */

import { useState, useEffect, useCallback } from 'react';

interface QueueStats {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  oldest_pending: string | null;
  unique_payers_pending: number;
}

interface QueueItem {
  id: string;
  payer_address: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  queue_position: number;
  created_at: string;
  processed_at?: string;
  mint_tx_hash?: string;
  error_message?: string;
  payment_type: string;
}

interface QueueStatusProps {
  serverUrl: string;
  payerAddress: string;
}

export function QueueStatus({ serverUrl, payerAddress }: QueueStatusProps) {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [myRequests, setMyRequests] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch queue statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${serverUrl}/queue/status`);
      if (!response.ok) throw new Error('Failed to fetch queue stats');
      const data = await response.json();
      setStats(data.stats);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
    }
  }, [serverUrl]);

  // Fetch user's requests
  const fetchMyRequests = useCallback(async () => {
    if (!payerAddress) return;
    
    try {
      const response = await fetch(`${serverUrl}/queue/payer/${payerAddress}`);
      if (!response.ok) throw new Error('Failed to fetch user requests');
      const data = await response.json();
      setMyRequests(data.requests || []);
    } catch (err: any) {
      console.error('Failed to fetch user requests:', err);
    }
  }, [serverUrl, payerAddress]);

  // Poll for updates every 2 seconds
  useEffect(() => {
    fetchStats();
    fetchMyRequests();

    const interval = setInterval(() => {
      fetchStats();
      fetchMyRequests();
    }, 2000);

    return () => clearInterval(interval);
  }, [fetchStats, fetchMyRequests]);

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  // Calculate estimated wait time
  const estimatedWaitTime = (position: number) => {
    // Assuming 50 mints per batch, 10s interval
    const batches = Math.ceil(position / 50);
    const seconds = batches * 10;
    return seconds < 60 ? `${seconds}s` : `${Math.ceil(seconds / 60)}m`;
  };

  return (
    <div className="queue-status">
      {/* Global Queue Statistics */}
      <div className="stats-card">
        <h3>Queue Status</h3>
        {stats ? (
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-label">Pending</div>
              <div className="stat-value">{stats.pending_count}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Processing</div>
              <div className="stat-value">{stats.processing_count}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Completed</div>
              <div className="stat-value success">{stats.completed_count}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Failed</div>
              <div className="stat-value error">{stats.failed_count}</div>
            </div>
          </div>
        ) : (
          <div className="loading">Loading stats...</div>
        )}
      </div>

      {/* User's Requests */}
      {payerAddress && (
        <div className="my-requests-card">
          <h3>My Mint Requests</h3>
          
          {myRequests.length === 0 ? (
            <div className="empty-state">
              No mint requests yet
            </div>
          ) : (
            <div className="requests-list">
              {myRequests.map((request) => (
                <div 
                  key={request.id} 
                  className={`request-item ${request.status}`}
                >
                  <div className="request-header">
                    <span className={`status-badge ${request.status}`}>
                      {request.status}
                    </span>
                    <span className="request-time">
                      {formatTime(request.created_at)}
                    </span>
                  </div>

                  <div className="request-details">
                    {request.status === 'pending' && (
                      <>
                        <div className="detail">
                          <span className="detail-label">Queue Position:</span>
                          <span className="detail-value">#{request.queue_position}</span>
                        </div>
                        <div className="detail">
                          <span className="detail-label">Est. Wait:</span>
                          <span className="detail-value">
                            {estimatedWaitTime(request.queue_position)}
                          </span>
                        </div>
                      </>
                    )}

                    {request.status === 'processing' && (
                      <div className="processing-indicator">
                        Processing batch...
                      </div>
                    )}

                    {request.status === 'completed' && (
                      <>
                        <div className="detail">
                          <span className="detail-label">Completed:</span>
                          <span className="detail-value">
                            {request.processed_at && formatTime(request.processed_at)}
                          </span>
                        </div>
                        {request.mint_tx_hash && (
                          <div className="tx-hash">
                            <a 
                              href={`https://basescan.org/tx/${request.mint_tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View Transaction →
                            </a>
                          </div>
                        )}
                      </>
                    )}

                    {request.status === 'failed' && (
                      <div className="error-message">
                        {request.error_message || 'Mint failed'}
                      </div>
                    )}

                    <div className="payment-type">
                      {request.payment_type === 'gasless' && '🆓 Gasless'}
                      {request.payment_type === 'x402' && '💳 x402'}
                      {request.payment_type === 'custom' && '💰 USDC'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Example CSS (can be moved to separate file)
const styles = `
.queue-status {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.stats-card, .my-requests-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 20px;
}

.stats-card h3, .my-requests-card h3 {
  margin: 0 0 20px 0;
  font-size: 20px;
  font-weight: 600;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
}

.stat {
  text-align: center;
  padding: 16px;
  background: #f8f9fa;
  border-radius: 8px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #333;
}

.stat-value.success {
  color: #22c55e;
}

.stat-value.error {
  color: #ef4444;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.request-item {
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.request-item.pending {
  border-color: #3b82f6;
  background: #eff6ff;
}

.request-item.processing {
  border-color: #f59e0b;
  background: #fffbeb;
}

.request-item.completed {
  border-color: #22c55e;
  background: #f0fdf4;
}

.request-item.failed {
  border-color: #ef4444;
  background: #fef2f2;
}

.request-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.pending {
  background: #3b82f6;
  color: white;
}

.status-badge.processing {
  background: #f59e0b;
  color: white;
}

.status-badge.completed {
  background: #22c55e;
  color: white;
}

.status-badge.failed {
  background: #ef4444;
  color: white;
}

.request-time {
  font-size: 12px;
  color: #666;
}

.request-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.detail-label {
  color: #666;
}

.detail-value {
  font-weight: 600;
}

.tx-hash a {
  color: #3b82f6;
  text-decoration: none;
  font-size: 14px;
}

.tx-hash a:hover {
  text-decoration: underline;
}

.error-message {
  color: #ef4444;
  font-size: 14px;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.payment-type {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

.processing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #f59e0b;
}

.empty-state {
  text-align: center;
  padding: 40px;
  color: #999;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
`;

// Usage example:
/*
import { QueueStatus } from './QueueStatus';

function App() {
  const [address, setAddress] = useState<string>('');
  
  return (
    <div>
      <QueueStatus 
        serverUrl="http://localhost:4021"
        payerAddress={address}
      />
    </div>
  );
}
*/

