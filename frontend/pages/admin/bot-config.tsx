import { useState, useEffect } from 'react';
import Head from 'next/head';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminApi, BotConfig, AvailableChannel, BotConfigResponse } from '@/lib/admin/api';
import { FiCheck, FiX, FiSave, FiSettings } from 'react-icons/fi';

export default function AdminBotConfig() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [availableChannels, setAvailableChannels] = useState<AvailableChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Active tenant (Takaro as mentioned in the plan)
  const ACTIVE_TENANT_ID = 'dcc3a375-90d8-40dd-8761-2d622936c90b';

  useEffect(() => {
    fetchBotConfig();
  }, []);

  const fetchBotConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response: BotConfigResponse = await adminApi.getBotConfig(ACTIVE_TENANT_ID);
      setConfig(response.config);
      setAvailableChannels(response.available_channels);
      setSelectedChannels(response.config?.monitored_channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bot configuration');
      console.error('Error fetching bot config:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelToggle = (channelId: string) => {
    setSelectedChannels(prev => {
      if (prev.includes(channelId)) {
        return prev.filter(id => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const response = await adminApi.updateBotConfig({
        tenant_id: ACTIVE_TENANT_ID,
        monitored_channels: selectedChannels,
      });

      setConfig(response.config);
      setSuccessMessage('Bot configuration updated successfully!');

      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bot configuration');
      console.error('Error saving bot config:', err);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    const currentChannels = config?.monitored_channels || [];
    return JSON.stringify(currentChannels.sort()) !== JSON.stringify(selectedChannels.sort());
  };

  return (
    <AdminLayout>
      <Head>
        <title>Admin - Bot Configuration</title>
      </Head>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold flex items-center">
              <FiSettings className="mr-3" />
              Bot Configuration
            </h2>
            <p className="text-base-content/70 mt-2">
              Configure which channels the Discord bot will monitor for automatic thread responses
            </p>
          </div>
          <button
            onClick={fetchBotConfig}
            className="btn btn-sm btn-ghost"
            disabled={loading}
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="alert alert-error">
            <FiX className="w-6 h-6" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            <FiCheck className="w-6 h-6" />
            <span>{successMessage}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Configuration Status */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Current Status</h3>
                <div className="stats shadow">
                  <div className="stat">
                    <div className="stat-title">Total Channels Available</div>
                    <div className="stat-value text-primary">{availableChannels.length}</div>
                    <div className="stat-desc">Text channels that can be monitored</div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Currently Monitored</div>
                    <div className="stat-value text-success">{selectedChannels.length}</div>
                    <div className="stat-desc">
                      {selectedChannels.length === 0 ? 'Bot inactive' : 'Bot will respond to new threads'}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="stat-title">Last Updated</div>
                    <div className="stat-value text-sm">
                      {config?.updated_at ? new Date(config.updated_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'Never'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Channel Selection */}
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title mb-4">Monitored Channels</h3>

                {availableChannels.length === 0 ? (
                  <div className="alert alert-warning">
                    <FiX className="w-6 h-6" />
                    <span>No text channels found. Make sure Discord sync has run for this tenant.</span>
                  </div>
                ) : (
                  <>
                    <p className="text-base-content/70 mb-4">
                      Select the channels where the bot should automatically respond to new threads.
                      The bot will wait 10 seconds after thread creation to gather context before responding.
                    </p>

                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {availableChannels.map((channel) => (
                        <label
                          key={channel.id}
                          className="flex items-center space-x-3 p-3 rounded-lg hover:bg-base-200 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            className="checkbox checkbox-primary"
                            checked={selectedChannels.includes(channel.id)}
                            onChange={() => handleChannelToggle(channel.id)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">#{channel.name}</div>
                            <div className="text-sm text-base-content/60">
                              ID: {channel.id} • Type: {channel.type}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Save Button */}
                    <div className="card-actions justify-end mt-6 pt-4 border-t">
                      <button
                        onClick={handleSave}
                        className={`btn btn-primary ${saving ? 'loading' : ''}`}
                        disabled={saving || !hasChanges()}
                      >
                        {!saving && <FiSave className="mr-2" />}
                        {saving ? 'Saving...' : 'Save Configuration'}
                      </button>
                    </div>

                    {/* Help Text */}
                    <div className="alert alert-info mt-4">
                      <div>
                        <h4 className="font-semibold">How it works:</h4>
                        <ul className="list-disc list-inside text-sm mt-2 space-y-1">
                          <li>When a new thread is created in a monitored channel, the bot detects it</li>
                          <li>The bot waits 10 seconds to collect any additional messages in the thread</li>
                          <li>After the delay, it analyzes the thread content and generates a helpful response</li>
                          <li>The response includes sources and confidence indicators</li>
                        </ul>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}